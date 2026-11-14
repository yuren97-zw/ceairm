import fs from 'node:fs';
import crypto from 'node:crypto';
import {plannedShift,stamp} from './attendance-rules.mjs';
import {FIXED_ORGANIZATIONS} from './personnel-access.mjs';
const failure=(m,status=400)=>Object.assign(Error(m),{status});
// 交接待办权威校验：展示/执行前确认用户仍是当前接收人且整单待接收（供 action-task 注册表调用）。
export function handoverTaskCanAct(db,user,task){
 if(!db||!user?.id||!task?.source_id)return false;
 return !!db.prepare("select 1 from handover h join handover_recipient r on r.handover_id=h.id and r.user_id=? where h.id=? and h.status='pending'").get(user.id,task.source_id);
}
const parse=(s,f=null)=>{try{return JSON.parse(s);}catch{return f;}};
export const HANDOVER_STATUSES=['draft','pending','accepted'];
export const HANDOVER_BASELINE_STATUSES=['inferred','confirmed'];
export const HANDOVER_CYCLE=['白班','夜班','休息','休息'];
// 四个固定班组来自人员模块固定组织（一组～四组）；干部组与特殊班组不参与四班循环。
export const HANDOVER_TEAMS=FIXED_ORGANIZATIONS.filter(o=>o.type==='administrative_team'&&/^TEAM-LINE-[1-4]$/.test(o.code)).map(o=>({id:o.code,name:o.name}));
const BJ=8*3600000;
const bjDate=ts=>new Date(ts+BJ).toISOString().slice(0,10);
const bjHour=ts=>Math.floor(((ts+BJ)%86400000)/3600000);
const addDays=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
// 班序推断使用排班计划（is_rest + 计划打卡点），不使用打卡结果；24小时班在四班循环中按夜班口径归并。
function scheduleCategory(rows){
 const rest=rows.some(r=>r.is_rest==='Y');
 if(rest)return '休息';
 const points=rows.filter(r=>r.is_rest!=='Y'&&stamp(r.plan_check_time)).map(r=>({type:r.check_type,planned:stamp(r.plan_check_time)}));
 if(!points.length)return null;
 const shift=plannedShift(points);
 return shift?'24小时班'===shift?'夜班':shift:null;
}
export function createHandoverService({db,clock=Date.now,audit=()=>{},hasRbac=null,actionTask=null}={}){
 if(!db)throw failure('缺少数据库连接');
 db.exec(fs.readFileSync(new URL('./migrations/035_team_handover.sql',import.meta.url),'utf8'));
 const now=()=>new Date(clock()).toISOString();
 const requirePermission=(user,code)=>{if(!hasRbac||!hasRbac(user,code))throw failure('没有执行该操作的权限',403);};
 function teamMembers(teamId){
  return db.prepare("select p.id as personId,p.name,p.position_code as positionCode,u.id as userId from personnel p left join users u on u.person_id=p.id where p.administrative_team_id=? and coalesce(p.data_status,'active')<>'deleted' and p.employment_status not in ('离职','停职') order by p.employee_no").all(teamId);
 }
 function personOf(user){
  if(!user?.id)return null;
  return db.prepare('select p.id as personId,p.name,p.administrative_team_id as teamId,p.position_code as positionCode from users u join personnel p on p.id=u.person_id where u.id=?').get(user.id)||null;
 }
 function accountOfPerson(personId){
  if(!personId)return null;
  const row=db.prepare("select u.id as userId,p.name from users u join personnel p on p.id=u.person_id where u.person_id=? and u.status='active' order by u.id limit 1").get(personId);
  return row?{userId:row.userId,user_name:row.name}:null;
 }
 function dayCategory(personId,date){
  const cache=db.prepare('select schedules_json from attendance_schedule_cache where person_id=? and work_date=? and invalidated_at is null').get(personId,date);
  if(cache){const category=scheduleCategory(parse(cache.schedules_json,[]));if(category)return category;}
  const day=db.prepare('select input_json from attendance_days where person_id=? and work_date=?').get(personId,date);
  if(!day)return null;
  const input=parse(day.input_json,{});
  if(input.scheduleConflict)return null;
  if(input.rest)return '休息';
  const shift=plannedShift(input.points||[]);
  return shift?'24小时班'===shift?'夜班':shift:null;
 }
 function teamDayCategory(teamId,date){
  const counts={白班:0,夜班:0,休息:0};
  for(const member of teamMembers(teamId)){const category=dayCategory(member.personId,date);if(category in counts)counts[category]++;}
  const ordered=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  if(!ordered[0][1]||(ordered[1][1]&&ordered[1][1]===ordered[0][1]))return null;
  return {category:ordered[0][0],votes:ordered[0][1]};
 }
 // 拟合：以窗口内最近一个有观察的日子为锚点日，尝试四个相位；白/夜观察日唯一确定相位。
 function inferTeam(teamId){
  const today=bjDate(clock());
  const observed=[];
  for(let i=7;i>=0;i--){const date=addDays(today,-i);const obs=teamDayCategory(teamId,date);if(obs)observed.push({date,category:obs.category,votes:obs.votes});}
  const evidence={window:{from:observed[0]?.date||null,to:today},sampleDays:observed.length,source:'attendance_schedule_cache/attendance_days',mismatchDates:[]};
  if(observed.length<4||!observed.some(d=>d.category!=='休息'))return {insufficient:true,evidence,reason:'排班观察不足四天或缺少白/夜班记录，无法推断班序'};
  const anchor=observed[observed.length-1];
  let best=null;
  for(let phase=0;phase<4;phase++){
   const mismatches=observed.filter(d=>HANDOVER_CYCLE[((phase+dayDiff(d.date,anchor.date))%4+4)%4]!==d.category).map(d=>`${d.date}:${d.category}`);
   if(!best||mismatches.length<best.mismatches.length)best={phase,mismatches};
  }
  if(!best||best.mismatches.length>2)return {insufficient:true,evidence:{...evidence,attempts:best?best.mismatches.length:null},reason:'班序拟合不一致（疑似调班或数据缺口），需要人工核对'};
  return {insufficient:false,teamId,anchorDate:anchor.date,anchorPhase:best.phase,evidence:{...evidence,mismatchDates:best.mismatches}};
 }
 const upsertBaseline=(row,status)=>{
  db.prepare('insert into handover_shift_baseline(team_id,team_name,cycle_json,anchor_date,anchor_phase,evidence_json,status,updated_at) values(?,?,?,?,?,?,?,?) on conflict(team_id) do update set anchor_date=excluded.anchor_date,anchor_phase=excluded.anchor_phase,evidence_json=excluded.evidence_json,status=excluded.status,updated_at=excluded.updated_at,version=handover_shift_baseline.version+1').run(row.teamId,row.teamName,JSON.stringify(HANDOVER_CYCLE),row.anchorDate,row.anchorPhase,JSON.stringify(row.evidence),status,now());
 };
 function ensureBaseline(){
  const existing=new Set(db.prepare('select team_id from handover_shift_baseline').all().map(r=>r.team_id));
  for(const team of HANDOVER_TEAMS){
   if(existing.has(team.id))continue;
   const inferred=inferTeam(team.id);
   if(!inferred.insufficient)upsertBaseline({...inferred,teamName:team.name},'inferred');
  }
  return db.prepare('select * from handover_shift_baseline').all();
 }
 const phaseOf=(row,date)=>((Number(row.anchor_phase)+dayDiff(date,row.anchor_date))%4+4)%4;
 const teamName=teamId=>HANDOVER_TEAMS.find(t=>t.id===teamId)?.name||teamId;
 function recommendRecipients(rows,toTeam){
  const row=toTeam&&rows.find(r=>r.team_id===toTeam.id);
  if(row?.leader_person_id){const account=accountOfPerson(row.leader_person_id);if(account)return {recipients:[account],basis:'baseline_leader'};}
  const leaders=toTeam?teamMembers(toTeam.id).filter(m=>m.positionCode==='班组长').map(m=>accountOfPerson(m.personId)).filter(Boolean):[];
  if(leaders.length)return {recipients:leaders,basis:'position_fallback'};
  return {recipients:[],basis:'none'};
 }
 function shiftContext(user){
  const rows=ensureBaseline();
  const today=bjDate(clock()),yesterday=addDays(today,-1),hour=bjHour(clock());
  // 交接窗口跟随最近的交接时刻：08:00 夜→白、20:00 白→夜，以 02:00/14:00 为分界。
  const nightToDay=hour>=2&&hour<14;
  const fromCategory=nightToDay?'夜班':'白班',toCategory=nightToDay?'白班':'夜班';
  const fromGrade=nightToDay?yesterday:today;
  const at=(date,category)=>HANDOVER_TEAMS.map(team=>({team,row:rows.find(r=>r.team_id===team.id)})).filter(({row})=>row&&HANDOVER_CYCLE[phaseOf(row,date)]===category).map(({team,row})=>({id:team.id,name:team.name,phase:phaseOf(row,date),category:HANDOVER_CYCLE[phaseOf(row,date)],basis:row.status}));
  const fromTeams=at(fromGrade,fromCategory),toTeams=at(today,toCategory);
  const person=personOf(user);
  const toTeam=toTeams.length===1?toTeams[0]:null;
  const recommendation=recommendRecipients(rows,toTeam);
  return {now:now(),user:person?{personId:person.personId,name:person.name,teamId:person.teamId,teamName:teamName(person.teamId)}:null,
   fromTeam:fromTeams.length===1?fromTeams[0]:null,fromTeamCandidates:fromTeams,toTeam,toTeamCandidates:toTeams,
   recipients:recommendation.recipients,recipientBasis:recommendation.basis,
   needsConfirmation:rows.some(r=>r.status!=='confirmed'),
   needsSetup:!fromTeams.length||!toTeams.length||!rows.length,
   setupHint:!rows.length?'暂无班序基准：请管理员核对排班并确认基准':`班序基准缺少${HANDOVER_TEAMS.filter(t=>!rows.some(r=>r.team_id===t.id)).map(t=>t.name).join('、')||'无'}，或当日相位无法唯一确定`};
 }
 function baselineOverview(user){
  requirePermission(user,'handover.baseline.manage');
  const rows=ensureBaseline();
  const today=bjDate(clock());
  const teams=HANDOVER_TEAMS.map(team=>{
   const row=rows.find(r=>r.team_id===team.id);
   return {teamId:team.id,teamName:team.name,row:row?{...row,evidence:parse(row.evidence_json,{}),cycle:parse(row.cycle_json,HANDOVER_CYCLE)}:null,
    upcoming:[0,1,2,3].map(i=>({date:addDays(today,i),phase:row?HANDOVER_CYCLE[phaseOf(row,addDays(today,i))]:null}))};
  });
  return {teams,generatedAt:now()};
 }
 function confirmBaseline(user,payload){
  requirePermission(user,'handover.baseline.manage');
  const teams=Array.isArray(payload?.teams)?payload.teams:[];
  if(!teams.length)throw failure('请提交至少一个班组的基准');
  db.exec('begin immediate');
  try{
   for(const entry of teams){
    const team=HANDOVER_TEAMS.find(t=>t.id===entry.teamId);
    if(!team)throw failure('未知班组：'+entry.teamId);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.anchorDate||'')))throw failure('基准日期无效');
    const phase=Number(entry.anchorPhase);
    if(!Number.isInteger(phase)||phase<0||phase>3)throw failure('基准相位无效');
    let leader=null;
    if(entry.leaderPersonId){
     const member=teamMembers(team.id).find(m=>m.personId===entry.leaderPersonId);
     if(!member)throw failure('班组长不属于该班组：'+team.name);
     leader=member;
    }
    db.prepare('insert into handover_shift_baseline(team_id,team_name,cycle_json,anchor_date,anchor_phase,leader_person_id,leader_name,evidence_json,status,confirmed_by,confirmed_at,version,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,1,?) on conflict(team_id) do update set anchor_date=excluded.anchor_date,anchor_phase=excluded.anchor_phase,leader_person_id=excluded.leader_person_id,leader_name=excluded.leader_name,evidence_json=excluded.evidence_json,status=excluded.status,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at,version=handover_shift_baseline.version+1')
     .run(team.id,team.name,JSON.stringify(HANDOVER_CYCLE),entry.anchorDate,phase,leader?leader.personId:null,leader?leader.name:null,JSON.stringify({source:'manual_confirm',...(entry.evidence||{})}),'confirmed',user.id,now(),now());
   }
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_baseline_confirm','handover','shift-baseline',JSON.stringify({teams:teams.map(t=>t.teamId)}));
  return {ok:true,rows:db.prepare('select * from handover_shift_baseline').all()};
 }
 // —— 交接单状态机（阶段 3）：草稿→待接收→已接收；待接收修改全留痕；确认原子锁定。——
 const validateTeam=(teamId,{allowEmpty=false}={})=>{
  const value=String(teamId||'').trim();
  if(!value){if(allowEmpty)return null;throw failure('请选择接班班组');}
  const team=HANDOVER_TEAMS.find(t=>t.id===value);
  if(!team)throw failure('未知班组：'+value);
  return {id:team.id,name:team.name};
 };
 const resolveRecipients=list=>{
  const ids=[...new Set((Array.isArray(list)?list:[]).map(v=>String(v?.userId||v||'').trim()).filter(Boolean))];
  if(!ids.length)return [];
  const marks=ids.map(()=>'?').join(',');
  const rows=db.prepare(`select u.id as userId,p.name as userName from users u join personnel p on p.id=u.person_id where u.id in (${marks}) and u.status='active' and coalesce(p.data_status,'active')<>'deleted'`).all(...ids);
  const found=new Map(rows.map(r=>[r.userId,r]));
  const missing=ids.filter(id=>!found.has(id));
  if(missing.length)throw failure('接收人账号无效或已停用：'+missing.join('、'));
  return ids.map(id=>found.get(id));
 };
 const flightSnapshot=flightId=>{
  const row=db.prepare('select id,date,aircraft_no,flight_no,work_kind,stand,planned_arrival,status,archived_at from maintenance_flights where id=?').get(String(flightId||'').trim());
  if(!row)throw failure('维修机会不存在：'+flightId);
  return {id:row.id,date:row.date,aircraftNo:row.aircraft_no,flightNo:row.flight_no,workKind:row.work_kind,stand:row.stand,plannedArrival:row.planned_arrival,status:row.status,archived:!!row.archived_at};
 };
 function writeChanges(handoverId,version,user,entries){
  for(const entry of entries)db.prepare('insert into handover_change_log(id,handover_id,version,entity_type,entity_id,action,old_value_json,new_value_json,changed_by,changed_by_name,changed_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(uid('hdoc'),handoverId,version,entry.entityType,entry.entityId||null,entry.action,entry.old===undefined?null:JSON.stringify(entry.old),entry.new===undefined?null:JSON.stringify(entry.new),user.id,user.name||'',now());
 }
 const loadHandover=id=>{const row=db.prepare('select * from handover where id=?').get(String(id||''));if(!row)throw failure('交接单不存在',404);return row;};
 const handoverTaskTitle=handover=>`班组交接：${handover.from_team_name||''} → ${handover.to_team_name||'—'}（${handover.created_by_name||''}）`;
 const upsertRecipientTasks=(handoverId,userIds)=>{
  if(!actionTask)return;
  const handover=db.prepare('select * from handover where id=?').get(handoverId);if(!handover)return;
  for(const userId of new Set(userIds))try{actionTask.upsert({sourceModule:'handover',sourceType:'confirm',sourceId:handoverId,assigneeUserId:userId,title:handoverTaskTitle(handover)});}catch{/* 待办索引失败不阻塞业务主流程，幂等 upsert 会在下次变更重试 */}
 };
 const canEditHandover=(user,handover)=>{
  if(user?.id===handover.created_by)return true;
  return hasRbac?.(user,'handover.create')&&personOf(user)?.teamId===handover.from_team_id;
 };
 function canSeeHandover(user,handover){
  if(!user?.id)return false;
  if(hasRbac?.(user,'handover.history.all'))return true;
  if(handover.created_by===user.id)return true;
  if(db.prepare('select 1 from handover_recipient where handover_id=? and user_id=?').get(handover.id,user.id))return true;
  return personOf(user)?.teamId===handover.from_team_id;
 }
 // 机会与接收人同步：以提交的完整名单为目标态做增删；取消勾选为逻辑删除，文字与引用全部留痕可查。
 function syncOpportunities(handoverId,user,items,track){
  const changes=[],incoming=[];
  for(const item of Array.isArray(items)?items:[]){
   const flightId=String(item?.flightId||item?.maintenanceFlightId||'').trim();
   if(!flightId)continue;
   if(incoming.some(r=>r.flightId===flightId))continue;
   const snapshot=flightSnapshot(flightId);
   incoming.push({flightId,note:String(item?.note??item?.handoverNote??'').trim(),snapshot});
  }
  const existing=db.prepare('select * from handover_opportunity where handover_id=? order by display_order,id').all(handoverId);
  const activeByFlight=new Map(existing.filter(r=>!r.removed_at).map(r=>[r.maintenance_flight_id,r]));
  const anyByFlight=new Map(existing.map(r=>[r.maintenance_flight_id,r]));
  incoming.forEach((item,index)=>{
   const active=activeByFlight.get(item.flightId);
   if(active){
    if((active.handover_note||'')!==item.note){
     if(track)changes.push({entityType:'opportunity_note',entityId:active.id,action:'update',old:{text:active.handover_note||''},new:{text:item.note},flightId:item.flightId});
     db.prepare('update handover_opportunity set handover_note=? where id=?').run(item.note,active.id);
    }
    return;
   }
   const removed=anyByFlight.get(item.flightId);
   if(removed){
    db.prepare('update handover_opportunity set removed_at=null,removed_by=null,handover_note=?,display_order=?,snapshot_json=? where id=?').run(item.note,index,JSON.stringify(item.snapshot),removed.id);
    if(track)changes.push({entityType:'opportunity',entityId:removed.id,action:'add',old:null,new:{flightId:item.flightId,note:item.note,snapshot:item.snapshot,readded:true}});
    return;
   }
   const id=uid('hdoop');
   db.prepare('insert into handover_opportunity(id,handover_id,maintenance_flight_id,handover_note,display_order,snapshot_json,created_by,created_at) values(?,?,?,?,?,?,?,?)').run(id,handoverId,item.flightId,item.note,index,JSON.stringify(item.snapshot),user.id,now());
   if(track)changes.push({entityType:'opportunity',entityId:id,action:'add',old:null,new:{flightId:item.flightId,note:item.note,snapshot:item.snapshot}});
  });
  const incomingSet=new Set(incoming.map(r=>r.flightId));
  for(const row of existing.filter(r=>!r.removed_at&&!incomingSet.has(r.maintenance_flight_id))){
   db.prepare('update handover_opportunity set removed_at=?,removed_by=? where id=?').run(now(),user.id,row.id);
   if(track)changes.push({entityType:'opportunity',entityId:row.id,action:'remove',old:{flightId:row.maintenance_flight_id,note:row.handover_note||'',snapshot:parse(row.snapshot_json,{})},new:null});
  }
  return changes;
 }
 function syncRecipients(handoverId,user,items,track){
  const changes=[];
  const target=resolveRecipients(items);
  const existing=db.prepare('select user_id,user_name from handover_recipient where handover_id=?').all(handoverId);
  const existingIds=new Set(existing.map(r=>r.user_id)),targetIds=new Set(target.map(r=>r.userId));
  for(const row of existing.filter(r=>!targetIds.has(r.user_id))){
   db.prepare('delete from handover_recipient where handover_id=? and user_id=?').run(handoverId,row.user_id);
   if(track)changes.push({entityType:'recipient',entityId:row.user_id,action:'remove',old:{userId:row.user_id,userName:row.user_name},new:null});
  }
  for(const row of target.filter(r=>!existingIds.has(r.userId))){
   db.prepare('insert into handover_recipient(handover_id,user_id,user_name,added_by,added_at) values(?,?,?,?,?)').run(handoverId,row.userId,row.userName,user.id,now());
   if(track)changes.push({entityType:'recipient',entityId:row.userId,action:'add',old:null,new:{userId:row.userId,userName:row.userName}});
  }
  return changes;
 }
 function create(user,payload){
  requirePermission(user,'handover.create');
  const person=personOf(user);
  if(!person?.teamId)throw failure('当前账号未关联班组人员，无法发起交接',409);
  const toTeam=validateTeam(payload?.toTeamId,{allowEmpty:true});
  const recipients=resolveRecipients(payload?.recipients);
  const id=uid('hdo');
  db.exec('begin immediate');
  try{
   db.prepare('insert into handover(id,status,created_by,created_by_name,created_at,from_team_id,from_team_name,to_team_id,to_team_name,other_items,version,updated_at) values(?,?,?,?,?,?,?,?,?,?,1,?)').run(id,'draft',user.id,person.name||'',now(),person.teamId,teamName(person.teamId),toTeam?.id||null,toTeam?.name||null,String(payload?.otherItems||''),now());
   syncOpportunities(id,user,payload?.opportunities,false);
   syncRecipients(id,user,payload?.recipients,false);
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_create','handover',id,JSON.stringify({fromTeam:person.teamId,toTeam:toTeam?.id||null}));
  return detail(user,id);
 }
 function update(user,id,payload){
  const handover=loadHandover(id);
  if(handover.status==='accepted')throw failure('交接单已接收锁定，任何字段不可修改',409);
  if(handover.status==='draft'){if(!canEditHandover(user,handover))throw failure('只有交班班组可以编辑草稿',403);}
  else if(!canEditHandover(user,handover))throw failure('只有交班班组可以修改待接收交接单',403);
  const expectedVersion=Number(payload?.expectedVersion);
  if(!Number.isInteger(expectedVersion)||expectedVersion!==handover.version)throw failure('交接单已被他人修改，请刷新后重试',409);
  const track=handover.status==='pending';
  db.exec('begin immediate');
  try{
   const changes=[],newVersion=handover.version+1;
   if(payload?.toTeamId!==undefined){
    const toTeam=validateTeam(payload.toTeamId,{allowEmpty:!track});
    if((toTeam?.id||null)!==(handover.to_team_id||null)){
     if(track)changes.push({entityType:'to_team',action:'update',old:{teamId:handover.to_team_id,teamName:handover.to_team_name},new:{teamId:toTeam?.id||null,teamName:toTeam?.name||null}});
     db.prepare('update handover set to_team_id=?,to_team_name=? where id=?').run(toTeam?.id||null,toTeam?.name||null,id);
    }
   }
   if(payload?.otherItems!==undefined&&String(payload.otherItems||'')!==(handover.other_items||'')){
    if(track)changes.push({entityType:'other_items',action:'update',old:{text:handover.other_items||''},new:{text:String(payload.otherItems||'')}});
    db.prepare('update handover set other_items=? where id=?').run(String(payload.otherItems||''),id);
   }
   if(payload?.recipients!==undefined)changes.push(...syncRecipients(id,user,payload.recipients,track));
   if(payload?.opportunities!==undefined)changes.push(...syncOpportunities(id,user,payload.opportunities,track));
   const changed=db.prepare("update handover set version=?,updated_at=? where id=? and version=? and status<>'accepted'").run(newVersion,now(),id,handover.version);
   if(!Number(changed.changes))throw failure('交接单状态已变化，请刷新后重试',409);
   if(track&&changes.length)writeChanges(id,newVersion,user,changes);
   if(track&&actionTask){
    for(const change of changes){
     if(change.entityType!=='recipient')continue;
     if(change.action==='add')upsertRecipientTasks(id,[change.entityId]);
     if(change.action==='remove')try{actionTask.closeOne(id,change.entityId,'invalidated');}catch{/* 同上，不阻塞 */}
    }
    if(changes.length)try{actionTask.touchRecipients(db.prepare('select user_id from handover_recipient where handover_id=?').all(id).map(r=>r.user_id));}catch{}
   }
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  return detail(user,id);
 }
 function submit(user,id,payload={}){
  const handover=loadHandover(id);
  if(handover.status!=='draft')throw failure('仅草稿可以提交',409);
  if(!canEditHandover(user,handover))throw failure('只有交班班组可以提交交接单',403);
  const expectedVersion=Number(payload?.expectedVersion);
  if(Number.isInteger(expectedVersion)&&expectedVersion!==handover.version)throw failure('交接单已被他人修改，请刷新后重试',409);
  if(!handover.to_team_id)throw failure('请先选择接班班组');
  const recipients=db.prepare('select user_id from handover_recipient where handover_id=?').all(id);
  if(!recipients.length)throw failure('请至少选择一名有效接收人');
  const opportunities=Number(db.prepare('select count(*) c from handover_opportunity where handover_id=? and removed_at is null').get(id).c);
  if(!opportunities&&!String(handover.other_items||'').trim())throw failure('请至少勾选一个维修机会或填写其他交接事项');
  const changed=db.prepare("update handover set status='pending',submitted_at=?,version=version+1,updated_at=? where id=? and status='draft'").run(now(),now(),id);
  if(!Number(changed.changes))throw failure('交接单状态已变化，请刷新后重试',409);
  upsertRecipientTasks(id,recipients.map(r=>r.user_id));
  audit(user,'handover_submit','handover',id,JSON.stringify({recipients:recipients.length,opportunities}));
  return detail(user,id);
 }
 function confirm(user,id){
  requirePermission(user,'handover.view');
  const handover=loadHandover(id);
  const recipient=db.prepare('select user_name from handover_recipient where handover_id=? and user_id=?').get(id,user.id);
  if(!recipient)throw failure('只有当前接收人可以确认交接',403);
  db.exec('begin immediate');
  try{
   const changed=db.prepare("update handover set status='accepted',confirmed_by=?,confirmed_by_name=?,confirmed_at=?,version=version+1,updated_at=? where id=? and status='pending'").run(user.id,recipient.user_name,now(),now(),id);
   if(!Number(changed.changes))throw failure('交接单已被确认或状态已变化',409);
   if(actionTask)try{actionTask.close(id,'completed',{sourceModule:'handover',sourceType:'confirm'});}catch{/* 待办终结失败不阻塞确认主流程 */}
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_confirm','handover',id,JSON.stringify({confirmedBy:user.id}));
  return detail(user,id);
 }
 const listRow=h=>({id:h.id,status:h.status,fromTeamId:h.from_team_id,fromTeamName:h.from_team_name,toTeamId:h.to_team_id,toTeamName:h.to_team_name,otherItems:h.other_items,createdBy:h.created_by,createdByName:h.created_by_name,createdAt:h.created_at,submittedAt:h.submitted_at,confirmedBy:h.confirmed_by,confirmedByName:h.confirmed_by_name,confirmedAt:h.confirmed_at,opportunityCount:Number(db.prepare('select count(*) c from handover_opportunity where handover_id=? and removed_at is null').get(h.id).c),recipientCount:Number(db.prepare('select count(*) c from handover_recipient where handover_id=?').get(h.id).c)});
 function list(user,filters={}){
  requirePermission(user,'handover.view');
  const scope=String(filters.scope||'mine');
  if(scope==='pending')return {items:db.prepare("select h.* from handover h join handover_recipient r on r.handover_id=h.id and r.user_id=? where h.status='pending' order by coalesce(h.submitted_at,h.created_at) desc limit 100").all(user.id).map(listRow)};
  if(scope==='drafts')return {items:db.prepare("select * from handover where created_by=? and status='draft' order by created_at desc limit 100").all(user.id).map(listRow)};
  if(scope==='all'){
   requirePermission(user,'handover.history.all');
   const clauses=[],args=[];
   if(filters.teamId){clauses.push('(h.from_team_id=? or h.to_team_id=?)');args.push(filters.teamId,filters.teamId);}
   if(filters.from){clauses.push('coalesce(h.submitted_at,h.created_at)>=?');args.push(filters.from);}
   if(filters.to){clauses.push('coalesce(h.submitted_at,h.created_at)<=?');args.push(filters.to);}
   const where=clauses.length?'where '+clauses.join(' and '):'';
   return {items:db.prepare(`select h.* from handover h ${where} order by coalesce(h.submitted_at,h.created_at) desc limit 200`).all(...args).map(listRow)};
  }
  return {items:db.prepare("select distinct h.* from handover h left join handover_recipient r on r.handover_id=h.id and r.user_id=? where h.created_by=? or r.user_id=? order by coalesce(h.submitted_at,h.created_at) desc limit 100").all(user.id,user.id,user.id).map(listRow)};
 }
 function detail(user,id){
  const handover=loadHandover(id);
  if(!canSeeHandover(user,handover))throw failure('没有查看该交接单的权限',403);
  const recipients=db.prepare('select user_id,user_name,added_by,added_at from handover_recipient where handover_id=? order by added_at').all(id);
  const opportunities=db.prepare('select * from handover_opportunity where handover_id=? order by display_order,id').all(id).map(r=>({id:r.id,flightId:r.maintenance_flight_id,note:r.handover_note,snapshot:parse(r.snapshot_json,{}),displayOrder:r.display_order,removedAt:r.removed_at,removedBy:r.removed_by}));
  const changes=db.prepare('select * from handover_change_log where handover_id=? order by version desc,id desc limit 500').all(id).map(r=>({id:r.id,version:r.version,entityType:r.entity_type,entityId:r.entity_id,action:r.action,old:parse(r.old_value_json),new:parse(r.new_value_json),changedBy:r.changed_by,changedByName:r.changed_by_name,changedAt:r.changed_at}));
  return {handover:{...listRow(handover),version:handover.version},recipients,opportunities,changes};
 }
 // 交接单维修机会候选：读维修管控现存机会（未完成优先，可切换全部），只读不改维修模块。
 function maintenanceOptions(user,filters={}){
  requirePermission(user,'handover.create');
  const scope=String(filters.scope||'unfinished'),date=String(filters.date||'').trim();
  const clauses=['1=1'],args=[];
  if(scope!=='all')clauses.push('f.archived_at is null');
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)){clauses.push('f.date=?');args.push(date);}
  const rows=db.prepare(`select f.id,f.date,f.aircraft_no,f.flight_no,f.work_kind,f.stand,f.planned_arrival,f.status,f.archived_at,(select count(*) from maintenance_subtasks s where s.flight_id=f.id) as subtaskCount from maintenance_flights f where ${clauses.join(' and ')} order by f.date desc,f.id desc limit 200`).all(...args);
  return {items:rows.map(r=>({id:r.id,date:r.date,aircraftNo:r.aircraft_no,flightNo:r.flight_no,workKind:r.work_kind,stand:r.stand,plannedArrival:r.planned_arrival,status:r.status,archived:!!r.archived_at,subtaskCount:Number(r.subtaskCount)}))};
 }
 // 接收人候选：在职账号花名册（交接场景需要跨班组选人，不走人员数据范围过滤）；推荐=接班班组固定班组长，缺失时按职位兜底。
 function recipientOptions(user,filters={}){
  requirePermission(user,'handover.create');
  const rows=ensureBaseline();
  const items=db.prepare("select u.id as userId,p.id as personId,p.name,p.position_code as position,t.name as teamName from users u join personnel p on p.id=u.person_id left join organization_units t on t.id=p.administrative_team_id where u.status='active' and coalesce(p.data_status,'active')<>'deleted' and p.employment_status not in ('离职','停职') order by p.employee_no limit 500").all();
  const team=String(filters.teamId||'').trim()?validateTeam(filters.teamId,{allowEmpty:false}):null;
  const recommendation=recommendRecipients(rows,team);
  return {items,recommended:recommendation.recipients,recipientBasis:recommendation.basis};
 }
 return {now,STATUSES:HANDOVER_STATUSES,BASELINE_STATUSES:HANDOVER_BASELINE_STATUSES,shiftContext,baselineOverview,confirmBaseline,inferTeam:(teamId)=>inferTeam(teamId),teamMembers,create,update,submit,confirm,list,detail,maintenanceOptions,recipientOptions,canSeeHandover,loadHandover};
}
