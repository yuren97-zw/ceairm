import fs from 'node:fs';
import crypto from 'node:crypto';
import {FIXED_ORGANIZATIONS} from './personnel-access.mjs';
const failure=(m,status=400)=>Object.assign(Error(m),{status});
const parse=(s,f=null)=>{try{return JSON.parse(s);}catch{return f;}};
// 交接待办权威校验：展示/执行前确认用户仍是当前接收人且整单待接收（供 action-task 注册表调用）。
export function handoverTaskCanAct(db,user,task){
 if(!db||!user?.id||!task?.source_id)return false;
 return !!db.prepare("select 1 from handover h join handover_recipient r on r.handover_id=h.id and r.user_id=? where h.id=? and h.status='pending'").get(user.id,task.source_id);
}
export const HANDOVER_STATUSES=['draft','pending','accepted'];
export const HANDOVER_BASELINE_STATUSES=['inferred','confirmed'];
export const HANDOVER_CYCLE=['白班','夜班','休息','休息'];
// 固定轮转序列（业务规则，2026-11-15 业务方确认）：槽位成对（白,夜），8 槽=4 天一循环。
// 四组白-二组夜-一组白-四组夜-三组白-一组夜-二组白-三组夜；锚点：2026-11-15 白班=四组。
export const HANDOVER_ROTATION=['TEAM-LINE-4','TEAM-LINE-2','TEAM-LINE-1','TEAM-LINE-4','TEAM-LINE-3','TEAM-LINE-1','TEAM-LINE-2','TEAM-LINE-3'];
export const HANDOVER_ROTATION_ANCHOR={date:'2026-11-15',slot:0};
// 四个固定班组来自人员模块固定组织（一组～四组）；干部组与特殊班组不参与四班循环。
export const HANDOVER_TEAMS=FIXED_ORGANIZATIONS.filter(o=>o.type==='administrative_team'&&/^TEAM-LINE-[1-4]$/.test(o.code)).map(o=>({id:o.code,name:o.name}));
const BJ=8*3600000;
const bjDate=ts=>new Date(ts+BJ).toISOString().slice(0,10);
const bjHour=ts=>Math.floor(((ts+BJ)%86400000)/3600000);
const addDays=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const dayDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
const uid=prefix=>`${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}`;
export function createHandoverService({db,clock=Date.now,audit=()=>{},hasRbac=null,actionTask=null}={}){
 if(!db)throw failure('缺少数据库连接');
 db.exec(fs.readFileSync(new URL('./migrations/035_team_handover.sql',import.meta.url),'utf8'));
 const now=()=>new Date(clock()).toISOString();
 const requirePermission=(user,code)=>{if(!hasRbac||!hasRbac(user,code))throw failure('没有执行该操作的权限',403);};
 const teamName=teamId=>{
  if(!teamId)return '';
  const fixed=HANDOVER_TEAMS.find(t=>t.id===teamId)?.name;
  if(fixed)return fixed;
  return db.prepare('select name from organization_units where id=? or code=?').get(teamId,teamId)?.name||teamId;
 };
 // 班组校验：接受固定代码或组织表行 id（personnel.administrative_team_id 存行 id）。
 const validateTeam=(teamId,{allowEmpty=false,label='接班班组'}={})=>{
  const value=String(teamId||'').trim();
  if(!value){if(allowEmpty)return null;throw failure(`请选择${label}`);}
  const fixed=HANDOVER_TEAMS.find(t=>t.id===value);
  if(fixed)return {id:fixed.id,name:fixed.name};
  const row=db.prepare('select code,name from organization_units where id=?').get(value);
  const team=row&&HANDOVER_TEAMS.find(t=>t.id===row.code);
  if(!team)throw failure('未知班组：'+(row?.name||value));
  return {id:team.id,name:team.name};
 };
 function teamMembers(teamId){
  const code=validateTeam(teamId).id;
  return db.prepare("select p.id as personId,p.name,p.position_code as positionCode,u.id as userId from personnel p left join users u on u.person_id=p.id where p.administrative_team_id in (select id from organization_units where code=?) and coalesce(p.data_status,'active')<>'deleted' and p.employment_status not in ('离职','停职') order by p.employee_no").all(code);
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
 const flightSnapshot=flightId=>{
  const row=db.prepare('select f.id,f.date,f.aircraft_no,f.flight_no,f.aircraft_type,f.work_kind,f.stand,f.planned_arrival,f.planned_departure,f.departure_flight_no,f.status,f.archived_at,l.name as locationName from maintenance_flights f left join maintenance_work_locations l on l.id=f.location_id where f.id=?').get(String(flightId||'').trim());
  if(!row)throw failure('维修机会不存在：'+flightId);
  return {id:row.id,date:row.date,aircraftNo:row.aircraft_no,flightNo:row.flight_no,aircraftType:row.aircraft_type,workKind:row.work_kind,stand:row.stand,plannedArrival:row.planned_arrival,plannedDeparture:row.planned_departure,departureFlightNo:row.departure_flight_no,locationName:row.locationName||'青岛',status:row.status,archived:!!row.archived_at};
 };
 // 派工树只读装配：与维修管控执行页同口径（机会级人员 + 非例行及其人员、报工说明），交接模块不写维修数据。
 const flightTree=flightIds=>{
  const tree=new Map(flightIds.map(id=>[id,{assignments:[],subtasks:[]}]));
  if(!flightIds.length)return tree;
  const marks=flightIds.map(()=>'?').join(',');
  for(const row of db.prepare(`select a.owner_id,a.role,a.user_name from maintenance_assignments a where a.owner_type='flight' and a.owner_id in (${marks}) order by a.assigned_at,a.id`).all(...flightIds)){
   const entry=tree.get(row.owner_id);if(entry)entry.assignments.push({role:row.role,userName:row.user_name});
  }
  const subtaskIds=[],byId=new Map();
  for(const row of db.prepare(`select s.id,s.flight_id,s.title,s.category,s.content,s.standard_hours,s.status from maintenance_subtasks s where s.flight_id in (${marks}) order by s.created_at,s.id`).all(...flightIds)){
   const entry=tree.get(row.flight_id);if(!entry)continue;
   const sub={id:row.id,title:row.title,category:row.category,content:row.content,standardHours:row.standard_hours,status:row.status,assignments:[]};
   entry.subtasks.push(sub);byId.set(row.id,sub);subtaskIds.push(row.id);
  }
  if(subtaskIds.length){
   const sMarks=subtaskIds.map(()=>'?').join(',');
   for(const row of db.prepare(`select a.owner_id,a.role,a.user_name from maintenance_assignments a where a.owner_type='subtask' and a.owner_id in (${sMarks}) order by a.assigned_at,a.id`).all(...subtaskIds)){
    const sub=byId.get(row.owner_id);if(sub)sub.assignments.push({role:row.role,userName:row.user_name});
   }
  }
  return tree;
 };
 const flightView=(row,entry)=>{
  const base={id:row.id,date:row.date,aircraftNo:row.aircraft_no,flightNo:row.flight_no,aircraftType:row.aircraft_type,workKind:row.work_kind,stand:row.stand,plannedArrival:row.planned_arrival,plannedDeparture:row.planned_departure,departureFlightNo:row.departure_flight_no,locationName:row.locationName||'青岛',status:row.status,archived:!!row.archived_at,remark:row.remark||''};
  return entry?{...base,assignments:entry.assignments||[],subtasks:entry.subtasks||[]}:base;
 };
 const upsertBaseline=row=>{
  db.prepare('insert into handover_shift_baseline(team_id,team_name,cycle_json,anchor_date,anchor_phase,evidence_json,status,updated_at) values(?,?,?,?,?,?,?,?) on conflict(team_id) do update set anchor_date=excluded.anchor_date,anchor_phase=excluded.anchor_phase,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at,version=handover_shift_baseline.version+1').run(row.teamId,row.teamName,JSON.stringify(HANDOVER_CYCLE),row.anchorDate,row.anchorPhase,JSON.stringify(row.evidence),'confirmed',now());
 };
 // 基准来自固定轮转规则：锚点日（2026-11-15 白班=四组）推出每个班组“白班日”相位 0，其余日期按 4 天循环。
 function ensureBaseline(){
  const existing=new Set(db.prepare('select team_id from handover_shift_baseline').all().map(r=>r.team_id));
  for(const team of HANDOVER_TEAMS){
   if(existing.has(team.id))continue;
   const slot=HANDOVER_ROTATION.findIndex((code,index)=>code===team.id&&index%2===0);
   const anchorDate=addDays(HANDOVER_ROTATION_ANCHOR.date,(slot-HANDOVER_ROTATION_ANCHOR.slot)/2);
   upsertBaseline({teamId:team.id,teamName:team.name,anchorDate,anchorPhase:0,evidence:{source:'固定轮转规则',rule:HANDOVER_ROTATION.map((code,index)=>teamName(code)+(index%2===0?'白':'夜')).join('-'),anchor:`${HANDOVER_ROTATION_ANCHOR.date} 白班=${teamName(HANDOVER_ROTATION[HANDOVER_ROTATION_ANCHOR.slot])}`}});
  }
  return db.prepare('select * from handover_shift_baseline').all();
 }
 const phaseOf=(row,date)=>((Number(row.anchor_phase)+dayDiff(date,row.anchor_date))%4+4)%4;
 function recommendRecipients(rows,toTeam){
  if(!toTeam)return {recipients:[],basis:'none'};
  const leaders=teamMembers(toTeam.id).filter(m=>m.positionCode==='班组长').map(m=>accountOfPerson(m.personId)).filter(Boolean);
  if(leaders.length)return {recipients:leaders,basis:'team_leader_position'};
  return {recipients:[],basis:'none'};
 }
 function shiftContext(user){
  const rows=ensureBaseline();
  const today=bjDate(clock()),yesterday=addDays(today,-1),hour=bjHour(clock());
  const person=personOf(user);
  const fromResolved=person?.teamId?validateTeam(person.teamId,{allowEmpty:true}):null;
  const rowOf=teamId=>rows.find(r=>r.team_id===teamId);
  const at=(date,category)=>HANDOVER_TEAMS.map(team=>({team,row:rows.find(r=>r.team_id===team.id)})).filter(({row})=>row&&HANDOVER_CYCLE[phaseOf(row,date)]===category).map(({team,row})=>({id:team.id,name:team.name,phase:phaseOf(row,date),category:HANDOVER_CYCLE[phaseOf(row,date)],basis:row.status}));
  // 接班推算：交班班组今日白班→同槽夜班；昨日夜班（今晨交）→今日白班；休班则按最近交接时刻窗口取当日白/夜对。
  let toCandidates=[];
  const fromPhase=fromResolved?phaseOf(rowOf(fromResolved.id),today):null;
  if(fromPhase===0)toCandidates=at(today,'夜班');
  else if(fromResolved&&phaseOf(rowOf(fromResolved.id),yesterday)===1)toCandidates=at(today,'白班');
  else toCandidates=hour>=2&&hour<14?at(today,'白班'):at(today,'夜班');
  const fromTeam=fromResolved?{id:fromResolved.id,name:fromResolved.name}:null;
  const toTeam=toCandidates.length===1?toCandidates[0]:null;
  const recommendation=recommendRecipients(rows,toTeam);
  return {now:now(),user:person?{personId:person.personId,name:person.name,teamId:person.teamId,teamName:teamName(person.teamId)}:null,
   fromTeam,toTeamCandidates:toCandidates,toTeam,
   recipients:recommendation.recipients,recipientBasis:recommendation.basis,
   needsConfirmation:rows.some(r=>r.status!=='confirmed'),
   needsSetup:!toCandidates.length||!rows.length,
   setupHint:!rows.length?'暂无班序基准：请管理员核对排班并确认基准':'接班班组无法唯一确定，请手动选择'};
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
 // —— 交接单状态机：草稿→待接收→已接收；待接收修改全留痕；确认原子锁定。——
 const loadHandover=id=>{const row=db.prepare('select * from handover where id=?').get(String(id||''));if(!row)throw failure('交接单不存在',404);return row;};
 const canEditHandover=(user,handover)=>{
  if(user?.id===handover.created_by)return true;
  return !!hasRbac?.(user,'handover.create')&&personOf(user)?.teamId&&validateTeam(personOf(user).teamId,{allowEmpty:true})?.id===validateTeam(handover.from_team_id,{allowEmpty:true})?.id;
 };
 function canSeeHandover(user,handover){
  if(!user?.id)return false;
  if(hasRbac?.(user,'handover.history.all'))return true;
  if(handover.created_by===user.id)return true;
  if(db.prepare('select 1 from handover_recipient where handover_id=? and user_id=?').get(handover.id,user.id))return true;
  const person=personOf(user);
  return !!person?.teamId&&validateTeam(person.teamId,{allowEmpty:true})?.id===validateTeam(handover.from_team_id,{allowEmpty:true})?.id;
 }
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
     if(track)changes.push({entityType:'opportunity_note',entityId:active.id,action:'update',old:{text:active.handover_note||''},new:{text:item.note}});
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
 const handoverTaskTitle=handover=>`班组交接：${handover.from_team_name||''} → ${handover.to_team_name||'—'}（${handover.created_by_name||''}）`;
 const upsertRecipientTasks=(handoverId,userIds)=>{
  if(!actionTask)return;
  const handover=db.prepare('select * from handover where id=?').get(handoverId);if(!handover)return;
  for(const userId of new Set(userIds))try{actionTask.upsert({sourceModule:'handover',sourceType:'confirm',sourceId:handoverId,assigneeUserId:userId,title:handoverTaskTitle(handover)});}catch{/* 待办索引失败不阻塞业务主流程 */}
 };
 function create(user,payload){
  requirePermission(user,'handover.create');
  const person=personOf(user);
  // 交班班组：默认提交人所在班组，可下拉修改（接受组织行 id 或固定代码）。
  const fromTeam=validateTeam(payload?.fromTeamId||person?.teamId,{label:'交班班组'});
  const toTeam=validateTeam(payload?.toTeamId,{allowEmpty:true});
  const recipients=resolveRecipients(payload?.recipients);
  const id=uid('hdo');
  db.exec('begin immediate');
  try{
   db.prepare('insert into handover(id,status,created_by,created_by_name,created_at,from_team_id,from_team_name,to_team_id,to_team_name,other_items,version,updated_at) values(?,?,?,?,?,?,?,?,?,?,1,?)').run(id,'draft',user.id,person?.name||'',now(),fromTeam.id,fromTeam.name,toTeam?.id||null,toTeam?.name||null,String(payload?.otherItems||''),now());
   syncOpportunities(id,user,payload?.opportunities,false);
   syncRecipients(id,user,payload?.recipients,false);
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_create','handover',id,JSON.stringify({fromTeam:fromTeam.id,toTeam:toTeam?.id||null}));
  return detail(user,id);
 }
 function update(user,id,payload){
  const handover=loadHandover(id);
  // 业务规则（2026-11-15）：提交后即锁定，仅草稿可修改；不再支持待接收阶段变更。
  if(handover.status!=='draft')throw failure('交接单已提交，不可修改',409);
  if(!canEditHandover(user,handover))throw failure('只有交班班组可以修改交接单',403);
  const expectedVersion=Number(payload?.expectedVersion);
  if(!Number.isInteger(expectedVersion)||expectedVersion!==handover.version)throw failure('交接单已被他人修改，请刷新后重试',409);
  db.exec('begin immediate');
  try{
   const newVersion=handover.version+1;
   if(payload?.fromTeamId!==undefined){
    const fromTeam=validateTeam(payload.fromTeamId);
    if(fromTeam.id!==handover.from_team_id)db.prepare('update handover set from_team_id=?,from_team_name=? where id=?').run(fromTeam.id,fromTeam.name,id);
   }
   if(payload?.toTeamId!==undefined){
    const toTeam=validateTeam(payload.toTeamId,{allowEmpty:true});
    db.prepare('update handover set to_team_id=?,to_team_name=? where id=?').run(toTeam?.id||null,toTeam?.name||null,id);
   }
   if(payload?.otherItems!==undefined)db.prepare('update handover set other_items=? where id=?').run(String(payload.otherItems||''),id);
   if(payload?.recipients!==undefined)syncRecipients(id,user,payload.recipients,false);
   if(payload?.opportunities!==undefined)syncOpportunities(id,user,payload.opportunities,false);
   const changed=db.prepare("update handover set version=?,updated_at=? where id=? and version=? and status='draft'").run(newVersion,now(),id,handover.version);
   if(!Number(changed.changes))throw failure('交接单状态已变化，请刷新后重试',409);
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  return detail(user,id);
 }
 function deleteDraft(user,id){
  const handover=loadHandover(id);
  if(handover.status!=='draft')throw failure('仅草稿可以删除',409);
  if(handover.created_by!==user.id&&!canEditHandover(user,handover))throw failure('只有交班班组可以删除草稿',403);
  db.exec('begin immediate');
  try{
   db.prepare('delete from handover_opportunity where handover_id=?').run(id);
   db.prepare('delete from handover_recipient where handover_id=?').run(id);
   db.prepare('delete from handover_change_log where handover_id=?').run(id);
   db.prepare('delete from handover where id=?').run(id);
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_delete_draft','handover',id,JSON.stringify({}));
  return {ok:true};
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
   if(actionTask)try{actionTask.close(id,'completed',{sourceModule:'handover',sourceType:'confirm'});}catch{/* 不阻塞 */}
   db.exec('commit');
  }catch(error){db.exec('rollback');throw error;}
  audit(user,'handover_confirm','handover',id,JSON.stringify({confirmedBy:user.id}));
  return detail(user,id);
 }
 const listRow=h=>({id:h.id,status:h.status,fromTeamId:h.from_team_id,fromTeamName:h.from_team_name,toTeamId:h.to_team_id,toTeamName:h.to_team_name,otherItems:h.other_items,createdBy:h.created_by,createdByName:h.created_by_name,createdAt:h.created_at,submittedAt:h.submitted_at,confirmedBy:h.confirmed_by,confirmedByName:h.confirmed_by_name,confirmedAt:h.confirmed_at,opportunityCount:Number(db.prepare('select count(*) c from handover_opportunity where handover_id=? and removed_at is null').get(h.id).c),recipientCount:Number(db.prepare('select count(*) c from handover_recipient where handover_id=?').get(h.id).c)});
 // 历史筛选：日期/班组/机号/关键词（其他事项、交接说明、机号、交班人、接收人、确认人）——mine 与 all 共用。
 const historyClauses=(filters,clauses,args)=>{
  if(filters.teamId){clauses.push('(h.from_team_id=? or h.to_team_id=?)');args.push(filters.teamId,filters.teamId);}
  if(filters.from){clauses.push('coalesce(h.submitted_at,h.created_at)>=?');args.push(filters.from.length===10?new Date(filters.from+'T00:00:00+08:00').toISOString():filters.from);}
  if(filters.to){clauses.push('coalesce(h.submitted_at,h.created_at)<=?');args.push(filters.to.length===10?new Date(filters.to+'T23:59:59.999+08:00').toISOString():filters.to);}
  if(filters.aircraft){clauses.push('exists(select 1 from handover_opportunity o join maintenance_flights f on f.id=o.maintenance_flight_id where o.handover_id=h.id and f.aircraft_no like ?)');args.push(`%${filters.aircraft}%`);}
  if(filters.q){
   const like=`%${filters.q}%`;
   clauses.push('(h.other_items like ? or h.created_by_name like ? or h.confirmed_by_name like ? or exists(select 1 from handover_opportunity o where o.handover_id=h.id and (o.handover_note like ? or exists(select 1 from maintenance_flights f where f.id=o.maintenance_flight_id and f.aircraft_no like ?))) or exists(select 1 from handover_recipient r where r.handover_id=h.id and r.user_name like ?))');
   args.push(like,like,like,like,like,like);
  }
 };
 const matchedAircraftOf=(handoverId,filters)=>{
  if(!filters.aircraft&&!filters.q)return null;
  return db.prepare('select f.aircraft_no from handover_opportunity o join maintenance_flights f on f.id=o.maintenance_flight_id where o.handover_id=? and (f.aircraft_no like ? or o.handover_note like ?) limit 1').get(handoverId,`%${filters.aircraft||filters.q}%`,`%${filters.q}%`)?.aircraft_no||null;
 };
 function list(user,filters={}){
  requirePermission(user,'handover.view');
  const scope=String(filters.scope||'mine');
  if(scope==='pending')return {items:db.prepare("select h.* from handover h join handover_recipient r on r.handover_id=h.id and r.user_id=? where h.status='pending' order by coalesce(h.submitted_at,h.created_at) desc limit 100").all(user.id).map(listRow)};
  if(scope==='drafts')return {items:db.prepare("select * from handover where created_by=? and status='draft' order by created_at desc limit 100").all(user.id).map(listRow)};
  const clauses=[],args=[];
  if(scope==='all')requirePermission(user,'handover.history.all');
  else{clauses.push('(h.created_by=? or exists(select 1 from handover_recipient r where r.handover_id=h.id and r.user_id=?))');args.push(user.id,user.id);}
  historyClauses(filters,clauses,args);
  const where=clauses.length?'where '+clauses.join(' and '):'';
  const limit=scope==='all'?200:100;
  return {items:db.prepare(`select h.* from handover h ${where} order by coalesce(h.submitted_at,h.created_at) desc limit ${limit}`).all(...args).map(row=>{const item=listRow(row);const aircraft=matchedAircraftOf(row.id,filters);if(aircraft)item.matchedAircraft=aircraft;return item;})};
 }
 function detail(user,id){
  const handover=loadHandover(id);
  if(!canSeeHandover(user,handover))throw failure('没有查看该交接单的权限',403);
  const recipients=db.prepare('select user_id,user_name,added_by,added_at from handover_recipient where handover_id=? order by added_at').all(id);
  const oppRows=db.prepare('select * from handover_opportunity where handover_id=? order by display_order,id').all(id);
  const oppTree=flightTree(oppRows.map(r=>r.maintenance_flight_id));
  const liveMark=oppRows.map(()=>'?').join(',')||"''";
  const liveRows=oppRows.length?new Map(db.prepare(`select f.id,f.date,f.aircraft_no,f.flight_no,f.aircraft_type,f.work_kind,f.stand,f.planned_arrival,f.planned_departure,f.departure_flight_no,f.status,f.remark,f.archived_at,l.name as locationName from maintenance_flights f left join maintenance_work_locations l on l.id=f.location_id where f.id in (${liveMark})`).all(...oppRows.map(r=>r.maintenance_flight_id)).map(r=>[r.id,r])):new Map();
  const opportunities=oppRows.map(r=>{
   const liveRow=liveRows.get(r.maintenance_flight_id);
   const live=liveRow?flightView(liveRow,oppTree.get(r.maintenance_flight_id)):null;
   const liveStatus=live?(live.archived?'已确认（归档）':live.status):'（机会已不存在）';
   return {id:r.id,flightId:r.maintenance_flight_id,note:r.handover_note,snapshot:parse(r.snapshot_json,{}),displayOrder:r.display_order,removedAt:r.removed_at,removedBy:r.removed_by,live,liveStatus};
  });
  const changes=db.prepare('select * from handover_change_log where handover_id=? order by version desc,id desc limit 500').all(id).map(r=>({id:r.id,version:r.version,entityType:r.entity_type,entityId:r.entity_id,action:r.action,old:parse(r.old_value_json),new:parse(r.new_value_json),changedBy:r.changed_by,changedByName:r.changed_by_name,changedAt:r.changed_at}));
  return {handover:{...listRow(handover),version:handover.version},recipients,opportunities,changes};
 }
 // 完整交接单装配（权限由调用方把关）：机会附「导出时状态」，历史原文与当前维修状态分列。
 function handoverFull(id,generatedAt){
  const handover=loadHandover(id);
  const recipients=db.prepare('select user_id,user_name,added_by,added_at from handover_recipient where handover_id=? order by added_at').all(id);
  const oppRows=db.prepare('select * from handover_opportunity where handover_id=? order by display_order,id').all(id);
  const oppTree=flightTree(oppRows.map(r=>r.maintenance_flight_id));
  const liveMark=oppRows.map(()=>'?').join(',')||"''";
  const liveRows=oppRows.length?new Map(db.prepare(`select f.id,f.date,f.aircraft_no,f.flight_no,f.aircraft_type,f.work_kind,f.stand,f.planned_arrival,f.planned_departure,f.departure_flight_no,f.status,f.remark,f.archived_at,l.name as locationName from maintenance_flights f left join maintenance_work_locations l on l.id=f.location_id where f.id in (${liveMark})`).all(...oppRows.map(r=>r.maintenance_flight_id)).map(r=>[r.id,r])):new Map();
  const opportunities=oppRows.map(r=>{
   const liveRow=liveRows.get(r.maintenance_flight_id);
   const live=liveRow?flightView(liveRow,oppTree.get(r.maintenance_flight_id)):null;
   return {id:r.id,flightId:r.maintenance_flight_id,note:r.handover_note,snapshot:parse(r.snapshot_json,{}),removedAt:r.removed_at,removedBy:r.removed_by,liveStatus:live?(live.archived?'已确认（归档）':live.status):'（机会已不存在）'};
  });
  const changes=db.prepare('select * from handover_change_log where handover_id=? order by version,id limit 1000').all(id).map(r=>({id:r.id,version:r.version,entityType:r.entity_type,entityId:r.entity_id,action:r.action,old:parse(r.old_value_json),new:parse(r.new_value_json),changedBy:r.changed_by,changedByName:r.changed_by_name,changedAt:r.changed_at}));
  return {handover:{...listRow(handover),version:handover.version},recipients,opportunities,changes,generatedAt};
 }
 function historyFilterMatch(handover,filters){
  if(!handover)return false;
  const at=handover.submitted_at||handover.created_at;
  if(filters.from&&at<(filters.from.length===10?new Date(filters.from+'T00:00:00+08:00').toISOString():filters.from))return false;
  if(filters.to&&at>(filters.to.length===10?new Date(filters.to+'T23:59:59.999+08:00').toISOString():filters.to))return false;
  if(filters.teamId&&handover.from_team_id!==filters.teamId&&handover.to_team_id!==filters.teamId)return false;
  if(filters.aircraft&&!db.prepare('select 1 from handover_opportunity o join maintenance_flights f on f.id=o.maintenance_flight_id where o.handover_id=? and f.aircraft_no like ?').get(handover.id,`%${filters.aircraft}%`))return false;
  if(filters.q&&!((handover.other_items||'').includes(filters.q)||db.prepare('select 1 from handover_opportunity o where o.handover_id=? and o.handover_note like ?').get(handover.id,`%${filters.q}%`)))return false;
  return true;
 }
 function exportData(user,filters={}){
  requirePermission(user,'handover.export');
  const ids=String(filters.id||'').trim()?[String(filters.id).trim()]:db.prepare("select id from handover order by coalesce(submitted_at,created_at) desc limit 200").all().map(r=>r.id).filter(id=>historyFilterMatch(db.prepare('select * from handover where id=?').get(id),filters));
  const generatedAt=now();
  return {generatedAt,handovers:ids.map(id=>handoverFull(id,generatedAt))};
 }
 // 交接单维修机会候选：按进港时间排序（先后按日期），未完成优先，可切换全部；只读不改维修模块。
 function maintenanceOptions(user,filters={}){
  requirePermission(user,'handover.create');
  const scope=String(filters.scope||'unfinished'),date=String(filters.date||'').trim();
  const clauses=['1=1'],args=[];
  if(scope!=='all')clauses.push('f.archived_at is null');
  if(/^\d{4}-\d{2}-\d{2}$/.test(date)){clauses.push('f.date=?');args.push(date);}
  const rows=db.prepare(`select f.id,f.date,f.aircraft_no,f.flight_no,f.aircraft_type,f.work_kind,f.stand,f.planned_arrival,f.planned_departure,f.departure_flight_no,f.status,f.remark,f.archived_at,l.name as locationName from maintenance_flights f left join maintenance_work_locations l on l.id=f.location_id where ${clauses.join(' and ')} order by f.date asc,f.planned_arrival asc,f.id asc limit 200`).all(...args);
  const tree=flightTree(rows.map(r=>r.id));
  return {items:rows.map(r=>flightView(r,tree.get(r.id)))};
 }
 // 接收人候选：按班组长职位过滤（业务规则），推荐=接班班组内的班组长。
 function recipientOptions(user,filters={}){
  requirePermission(user,'handover.create');
  const items=db.prepare("select u.id as userId,p.id as personId,p.name,p.position_code as position,t.name as teamName from users u join personnel p on p.id=u.person_id left join organization_units t on t.id=p.administrative_team_id where u.status='active' and coalesce(p.data_status,'active')<>'deleted' and p.employment_status not in ('离职','停职') and p.position_code='班组长' order by t.name,p.employee_no").all();
  const team=String(filters.teamId||'').trim()?validateTeam(filters.teamId,{allowEmpty:false}):null;
  const recommended=team?items.filter(i=>i.teamName===team.name).map(i=>({userId:i.userId,user_name:i.name})):[];
  return {items,recommended,recipientBasis:recommended.length?'team_leader_position':'none'};
 }
 return {now,STATUSES:HANDOVER_STATUSES,BASELINE_STATUSES:HANDOVER_BASELINE_STATUSES,shiftContext,baselineOverview,confirmBaseline,teamMembers,create,update,submit,confirm,deleteDraft,list,detail,exportData,maintenanceOptions,recipientOptions,canSeeHandover,loadHandover};
}
