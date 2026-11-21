import {createHash} from 'node:crypto';
export const NONROUTINE_CORRECTIONS_SCHEMA = `-- Independent approvals and signed deltas; never reopen a review sync channel.
create table if not exists maintenance_nonroutine_corrections(
 id text primary key,subtask_id text not null references maintenance_subtasks(id),flight_id text not null references maintenance_flights(id),
 correction_number integer not null check(correction_number>0),
 source_kind text not null check(source_kind in ('REVIEW','STANDARD')),source_id text not null,source_version text not null,source_digest text not null,
 source_snapshot_json text not null,before_json text not null,target_json text not null,policy_json text not null,
 target_hours real not null check(target_hours>=0),
 work_month text not null,handling_month text,statistical_month text not null,
 approved_by text not null,approval_qualification_json text not null,reason text not null,client_id text not null,request_hash text not null,
 state text not null check(state in ('APPROVED_PENDING_PERIOD','POSTED')),created_at text not null,posted_at text,
 unique(subtask_id,correction_number),unique(approved_by,client_id),check(statistical_month=work_month),
 check((state='POSTED' and handling_month is not null and posted_at is not null) or (state='APPROVED_PENDING_PERIOD' and posted_at is null))
);
create unique index if not exists maintenance_nonroutine_correction_pending on maintenance_nonroutine_corrections(subtask_id) where state='APPROVED_PENDING_PERIOD';
create table if not exists maintenance_nonroutine_correction_period_authorizations(
 id text primary key,correction_id text not null references maintenance_nonroutine_corrections(id),revision integer not null check(revision>0),
 source_month text not null,target_month text not null,source_revision integer not null,target_revision integer not null,
 actor_id text not null,qualification_json text not null,reason text not null,snapshot_json text not null,created_at text not null,
 unique(correction_id,revision),check(source_month<>target_month)
);
create table if not exists maintenance_nonroutine_correction_deltas(
 id text primary key,correction_id text not null references maintenance_nonroutine_corrections(id),
 assignment_id text not null,person_id text not null,user_name text not null,team text,role text not null check(role in ('主做','检验','辅助')),
 hours real not null check(hours<>0),before_hours real not null check(before_hours>=0),target_hours real not null check(target_hours>=0),
 correction_of_json text not null,created_at text not null,unique(correction_id,person_id,role),
 check(abs(target_hours-before_hours-hours)<0.0000001)
);
drop view if exists maintenance_effective_hour_results;
create view maintenance_effective_hour_results as
  select h.id,h.owner_type,h.owner_id,h.flight_id,h.assignment_id,h.person_id,h.user_name,h.team,h.role,h.source,h.hours,h.adjusted_hours,h.status,h.confirmed_by,h.confirmed_at,h.created_at,h.updated_at
    from maintenance_hour_results h where not exists(select 1 from maintenance_nonroutine_role_results r where r.result_id=h.id)
  union all
  select r.id,h.owner_type,h.owner_id,h.flight_id,r.source_assignment_id as assignment_id,r.person_id,h.user_name,h.team,r.role,h.source,r.hours,null as adjusted_hours,h.status,h.confirmed_by,h.confirmed_at,r.created_at,h.updated_at
    from maintenance_nonroutine_role_results r join maintenance_hour_results h on h.id=r.result_id
  union all
  select id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_nonroutine_hour_adjustments
  union all
  select d.id,'subtask' as owner_type,c.subtask_id as owner_id,c.flight_id,d.assignment_id,d.person_id,d.user_name,d.team,d.role,
    '授权更正' as source,d.hours,null as adjusted_hours,'已确认' as status,c.approved_by as confirmed_by,c.posted_at as confirmed_at,d.created_at,d.created_at as updated_at
    from maintenance_nonroutine_correction_deltas d join maintenance_nonroutine_corrections c on c.id=d.correction_id where c.state='POSTED';
`;
const fail=message=>{throw Object.assign(new Error(message),{status:409});};
const cents=value=>{
 if(typeof value!=='number'||!Number.isFinite(value)||!Number.isSafeInteger(Math.round(value*100))||Math.abs(value*100-Math.round(value*100))>1e-6)fail('原来源或目标结果不是有效的整分工时');
 return Math.round(value*100);
};
const key=row=>JSON.stringify([row.person_id,row.role]);
const allowedRoles=new Set(['主做','检验','辅助']);

// Both inputs are server-owned result projections. Target rows must come from
// the original allocator, not per-person amounts supplied by a client.
export function planNonroutineCorrection({sourceRows,targetRows,subtaskId,flightId}){
 if(!subtaskId||!flightId||!Array.isArray(sourceRows)||!sourceRows.length||!Array.isArray(targetRows)||!targetRows.length)fail('更正缺少原已入账来源或合法分配结果');
 const current=new Map(),metadata=new Map(),identities=new Set(),sourceIds=new Set();
 for(const row of sourceRows){
  if(!row.id||sourceIds.has(row.id)||row.owner_type!=='subtask'||row.owner_id!==subtaskId||row.flight_id!==flightId||row.status!=='已确认'||!row.person_id||!row.assignment_id||!allowedRoles.has(row.role))fail('更正来源重复、范围不一致或未正式确认');
  sourceIds.add(row.id);identities.add(row.person_id);
  const amount=cents(row.adjusted_hours??row.hours);
  if(amount<0&&row.source!=='授权更正')fail('普通原工时不能是负数');
  const id=key(row),entry=current.get(id)||{cents:0,ids:[]};entry.cents+=amount;entry.ids.push(row.id);current.set(id,entry);
  if(!metadata.has(id)||row.source!=='授权更正')metadata.set(id,row);
 }
 for(const entry of current.values())if(entry.cents<0)fail('原角色净额为负，请先对账');
 const desired=new Map(),targetPeople=new Set();
 for(const row of targetRows){
  if(!row.person_id||!identities.has(row.person_id)||!allowedRoles.has(row.role)||!sourceRows.some(source=>source.assignment_id===row.assignment_id&&source.person_id===row.person_id))fail('目标分配不能增加人员或伪造派工来源');
  const id=key(row);if(desired.has(id))fail('目标分配存在重复人员角色');
  const amount=cents(row.hours);if(amount<0)fail('目标认定工时不能为负数');
  desired.set(id,amount);targetPeople.add(row.person_id);metadata.set(id,row);
 }
 if(targetPeople.size!==identities.size)fail('目标分配不能遗漏原参与人');
 const deltas=[];
 for(const id of [...new Set([...current.keys(),...desired.keys()])].sort()){
  const before=current.get(id)?.cents||0,target=desired.get(id)||0,delta=target-before,row=metadata.get(id);
  if(delta)deltas.push({assignmentId:row.assignment_id,personId:row.person_id,userName:row.user_name,team:row.team||'',role:row.role,hours:delta/100,beforeHours:before/100,targetHours:target/100,correctionOf:[...(current.get(id)?.ids||sourceRows.filter(source=>source.person_id===row.person_id).map(source=>source.id))].sort()});
 }
 if(!deltas.length)fail('目标净额与已入账结果相同，无需更正');
 const beforeTotal=[...current.values()].reduce((sum,row)=>sum+row.cents,0),targetTotal=[...desired.values()].reduce((sum,value)=>sum+value,0);
 if(targetTotal>1000000)fail('目标总认定工时超过允许范围');
 const result={subtaskId,flightId,beforeHours:beforeTotal/100,targetHours:targetTotal/100,deltaHours:(targetTotal-beforeTotal)/100,deltas};
 return {...result,token:createHash('sha256').update(JSON.stringify({result,sourceRows:[...sourceRows].sort((a,b)=>a.id.localeCompare(b.id))})).digest('hex')};
}
