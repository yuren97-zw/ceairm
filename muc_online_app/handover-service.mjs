import fs from 'node:fs';
import crypto from 'node:crypto';
import {plannedShift,stamp} from './attendance-rules.mjs';
import {FIXED_ORGANIZATIONS} from './personnel-access.mjs';
const failure=(m,status=400)=>Object.assign(Error(m),{status});
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
 return {now,STATUSES:HANDOVER_STATUSES,BASELINE_STATUSES:HANDOVER_BASELINE_STATUSES,shiftContext,baselineOverview,confirmBaseline,inferTeam:(teamId)=>inferTeam(teamId),teamMembers};
}
