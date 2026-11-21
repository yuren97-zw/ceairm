export const NONROUTINE_ROLE_RESULTS_SCHEMA=`create table if not exists maintenance_nonroutine_role_results(
  id text primary key,
  result_id text not null references maintenance_hour_results(id) on delete cascade,
  case_id text not null references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null,
  source_assignment_id text not null,
  person_id text not null,
  role text not null check(role in ('主做','检验','辅助')),
  hours real not null check(hours>=0),
  source_json text not null,
  created_at text not null,
  unique(case_id,approved_revision,person_id,role)
);
create index if not exists maintenance_nonroutine_role_result_parent on maintenance_nonroutine_role_results(result_id);
drop view if exists maintenance_effective_hour_results;
create view maintenance_effective_hour_results as
  select h.id,h.owner_type,h.owner_id,h.flight_id,h.assignment_id,h.person_id,h.user_name,h.team,h.role,h.source,h.hours,h.adjusted_hours,h.status,h.confirmed_by,h.confirmed_at,h.created_at,h.updated_at
    from maintenance_hour_results h where not exists(select 1 from maintenance_nonroutine_role_results r where r.result_id=h.id)
  union all
  select r.id,h.owner_type,h.owner_id,h.flight_id,r.source_assignment_id as assignment_id,r.person_id,h.user_name,h.team,r.role,h.source,r.hours,null as adjusted_hours,h.status,h.confirmed_by,h.confirmed_at,r.created_at,h.updated_at
    from maintenance_nonroutine_role_results r join maintenance_hour_results h on h.id=r.result_id
  union all
  select id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_nonroutine_hour_adjustments;`;

// Parent rows preserve the existing one-result-per-real-assignment contract.
// The effective view substitutes child accounting roles, so totals count once.
export function writeNonroutineRoleResults({db,caseId,approvedRevision,owner,flightId,assignments,calculated,status,confirmedBy='',clock,randomId,existing=new Map(),readParticipants}){
  const fail=message=>Object.assign(new Error(message),{status:409});
  const groups=new Map(),actualParticipants=readParticipants ? readParticipants() : null;
  for(const row of assignments){
    const sourceId=row.sourceAssignmentId||row.id;
    const actual=actualParticipants ? actualParticipants.find(item=>item.id===sourceId && item.owner_type==='subtask' && item.owner_id===owner.id) : db.prepare("select * from maintenance_assignments where id=? and owner_type='subtask' and owner_id=?").get(sourceId,owner.id);
    const amount=calculated.get(row.id);
    if(!actual||actual.person_id!==row.person_id||!Number.isFinite(amount)||amount<0)throw fail('核算角色缺少真实同人参与来源或有效小时');
    if(!groups.has(sourceId))groups.set(sourceId,{actual,rows:[]});groups.get(sourceId).rows.push({...row,amount});
  }
  const stamp=clock(),ids=[];
  for(const [sourceId,{actual,rows}] of groups){
    const state=typeof status==='function'?status(actual):status;if(!['已提报','待复核','已确认'].includes(state))throw fail('原派工尚未达到可记录工时的状态');
    const current=db.prepare("select * from maintenance_hour_results where owner_type='subtask' and owner_id=? and assignment_id=?").get(owner.id,sourceId);
    const previous=current||existing.get(sourceId),id=previous?.id||randomId('mtnh');
    if(current)db.prepare('delete from maintenance_nonroutine_role_results where result_id=?').run(id);
    const hours=Math.round(rows.reduce((sum,row)=>sum+Math.round(row.amount*100),0))/100,confirmed=state==='已确认';
    db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
      values(?,'subtask',?,?,?,?,?,?,?,'非例行审核认定',?,null,?,?,?,?,?)
      on conflict(owner_type,owner_id,assignment_id) do update set hours=excluded.hours,adjusted_hours=null,status=excluded.status,confirmed_by=excluded.confirmed_by,confirmed_at=excluded.confirmed_at,updated_at=excluded.updated_at`)
      .run(id,owner.id,flightId,sourceId,actual.person_id,actual.user_name,actual.team||'',actual.role,hours,state,confirmed?confirmedBy:'',confirmed?stamp:'',previous?.created_at||stamp,stamp);
    for(const row of rows){const childId=randomId('nrrole');db.prepare(`insert into maintenance_nonroutine_role_results(id,result_id,case_id,approved_revision,source_assignment_id,person_id,role,hours,source_json,created_at) values(?,?,?,?,?,?,?,?,?,?)`)
      .run(childId,id,caseId,approvedRevision,sourceId,actual.person_id,row.role,row.amount,JSON.stringify(actual),stamp);ids.push(childId);}
  }
  return ids;
}
