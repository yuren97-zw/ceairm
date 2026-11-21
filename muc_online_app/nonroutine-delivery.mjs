import crypto from 'node:crypto';
import {writeNonroutineRoleResults} from './nonroutine-role-results.mjs';
export const NONROUTINE_ADJUSTMENTS_SCHEMA=`create table if not exists maintenance_nonroutine_hour_adjustments(
  id text primary key,
  channel_id text not null references maintenance_nonroutine_review_channels(id),
  case_id text not null references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null,
  owner_type text not null check(owner_type='subtask'),
  owner_id text not null,
  flight_id text not null,
  assignment_id text not null,
  person_id text not null,
  user_name text not null,
  team text,
  role text not null,
  source text not null check(source='审核补记'),
  hours real not null check(hours>=0),
  adjusted_hours real check(adjusted_hours is null),
  status text not null check(status='已确认'),
  confirmed_by text not null,
  confirmed_at text not null,
  created_at text not null,
  updated_at text not null,
  unique(case_id,approved_revision,person_id,role)
);
create index if not exists maintenance_nonroutine_adjustment_flight on maintenance_nonroutine_hour_adjustments(flight_id,person_id);
drop view if exists maintenance_effective_hour_results;
create view maintenance_effective_hour_results as
  select id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_hour_results
  union all
  select id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_nonroutine_hour_adjustments;
`;
// Runs inside the finalization service's existing maintenance transaction.
// Calculator allocation identities must never be persisted as original assignments.
// A person can have a different number of verified accounting roles while their
// actual participation records stay intact. Confirmed adjustments retain the real
// source assignment plus a distinct approved person/role identity. Normal result
// parents group the real assignment's total; role children supply the read view.
export function projectRecognitionAllocations(assignments,participants){
  if(!Array.isArray(assignments)||!Array.isArray(participants)||!assignments.length)return null;
  assignments=assignments.map(row=>({...row,person_id:row.person_id||row.personId,user_name:row.user_name||row.userName,assigned_at:row.assigned_at||row.assignedAt}));
  const groups=new Map(),allowed=['主做','检验','辅助'];
  for(const row of assignments){if(!row?.id||!row.person_id)return null;if(!groups.has(row.person_id))groups.set(row.person_id,[]);groups.get(row.person_id).push(row);}
  const seen=new Set(),people=new Set();
  for(const person of participants){const key=JSON.stringify([person?.personId,person?.role]);if(!groups.has(person?.personId)||!allowed.includes(person?.role)||seen.has(key))return null;seen.add(key);people.add(person.personId);}
  if(people.size!==groups.size)return null;
  const sameSize=mapRecognitionAssignments(assignments,participants);
  if(sameSize)return sameSize.map(row=>({...row,sourceAssignmentId:row.id}));
  return [...participants].sort((a,b)=>a.personId.localeCompare(b.personId)||allowed.indexOf(a.role)-allowed.indexOf(b.role)).map(person=>{
    const rows=[...groups.get(person.personId)].sort((a,b)=>String(a.assigned_at||'').localeCompare(String(b.assigned_at||''))||String(a.id).localeCompare(String(b.id)));
    const source=rows.find(row=>row.role===person.role)||rows[0];
    const digest=crypto.createHash('sha256').update(JSON.stringify([rows.map(row=>row.id).sort(),person.personId,person.role])).digest('hex');
    return {...source,id:`nrpreview_${digest}`,role:person.role,sourceAssignmentId:source.id};
  });
}
export function mapRecognitionAssignments(assignments,participants){
  const personId=row=>row.person_id || row.personId || row.person?.id;
  const byPerson=new Map();
  for(const row of assignments){const id=personId(row);if(!byPerson.has(id))byPerson.set(id,[]);byPerson.get(id).push(row);}
  const desired=new Map();
  for(const person of participants){if(!desired.has(person.personId))desired.set(person.personId,[]);desired.get(person.personId).push(person.role);}
  if(byPerson.size!==desired.size)return null;
  const mapped=new Map();
  for(const [id,rows] of byPerson){
    const roles=desired.get(id);
    if(!roles || roles.length!==rows.length || new Set(roles).size!==roles.length)return null;
    const remaining=new Set(roles),unmatched=[];
    for(const row of [...rows].sort((a,b)=>String(a.id).localeCompare(String(b.id)))){
      if(remaining.has(row.role)){mapped.set(row,{...row,role:row.role});remaining.delete(row.role);}else unmatched.push(row);
    }
    const order=['主做','检验','辅助'];
    const replacements=[...remaining].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
    unmatched.forEach((row,index)=>mapped.set(row,{...row,role:replacements[index]}));
  }
  return assignments.map(row=>mapped.get(row));
}
export function deliverNonroutineRecognition({db,item,final,channel,flight,subtask,period,allocate,clock,randomId,readParticipants}) {
  const attention=(code,extra={})=>({state:'NEEDS_ATTENTION',detail:{code,period:period.month,periodRevision:Number(period.revision),flightStatus:flight.status,...extra}});
  if(period.state!=='OPEN')return attention(period.state==='CLOSED'?'PERIOD_CLOSED_CROSS_PERIOD_REQUIRED':'PERIOD_STATUS_UNKNOWN');
  if(!['已提报','待复核','已确认'].includes(flight.status))return attention('SOURCE_FACTS_UNAVAILABLE');
  const actualAssignments=readParticipants ? readParticipants() : db.prepare("select * from maintenance_assignments where owner_type='subtask' and owner_id=? order by assigned_at,id").all(subtask.id);
  const participants=JSON.parse(final.participants_json),original=JSON.parse(item.participants_json);
  const personIds=people=>[...new Set(people.map(person=>person.personId))].sort().join('|');
  const actual=actualAssignments.map(row=>({personId:row.person_id,role:row.role}));
  const assignments=projectRecognitionAllocations(actualAssignments,participants);
  if(!assignments?.length || personIds(actual)!==personIds(original) || actualAssignments.some(row=>row.status!==flight.status))return attention('PARTICIPANTS_REQUIRE_VERIFICATION');
  if(db.prepare("select 1 from maintenance_hour_results where owner_type='subtask' and owner_id=? limit 1").get(subtask.id))return attention('EXISTING_RESULT_REQUIRES_RECONCILIATION');
  if(db.prepare('select 1 from maintenance_nonroutine_hour_adjustments where case_id=? limit 1').get(item.id))return attention('EXISTING_RESULT_REQUIRES_RECONCILIATION');
  const decision=JSON.parse(final.decision_json),policy=JSON.parse(final.policy_json);
  const calculated=allocate({...subtask,_nonroutineEstimateBase:decision.recognizedHours,_nonroutinePolicy:policy},assignments);
  if(assignments.some(row=>!calculated.has(row.id) || !Number.isFinite(calculated.get(row.id)) || calculated.get(row.id)<0) ||
      Math.round([...calculated.values()].reduce((sum,value)=>sum+value,0)*100)!==Math.round(decision.recognizedHours*100))return attention('ALLOCATION_INPUTS_UNRESOLVED');
  const stamp=clock(),resultIds=[];
  if(flight.status==='已确认'){
    const insert=db.prepare(`insert into maintenance_nonroutine_hour_adjustments(id,channel_id,case_id,approved_revision,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
      values(?,?,?,?,'subtask',?,?,?,?,?,?,?,'审核补记',?,null,'已确认',?,?,?,?)`);
    for(const row of assignments){const id=randomId('nradj');insert.run(id,channel.id,item.id,final.approved_revision,subtask.id,flight.id,row.sourceAssignmentId||row.id,row.person_id,row.user_name,row.team || '',row.role,calculated.get(row.id),final.finalized_by,stamp,stamp,stamp);resultIds.push(id);}
  }else if(assignments.some(row=>row.sourceAssignmentId!==row.id)){
    resultIds.push(...writeNonroutineRoleResults({db,caseId:item.id,approvedRevision:final.approved_revision,owner:subtask,flightId:flight.id,assignments,calculated,status:flight.status,clock,randomId,readParticipants}));
  }else{
  const insert=db.prepare(`insert into maintenance_hour_results(id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at)
    values(?,'subtask',?,?,?,?,?,?,?,'非例行审核认定',?,null,?,'','',?,?)`);
  for(const row of assignments){const id=randomId('mtnh');insert.run(id,subtask.id,flight.id,row.id,row.person_id,row.user_name,row.team || '',row.role,calculated.get(row.id),flight.status,stamp,stamp);resultIds.push(id);}
  }
  db.prepare('update maintenance_nonroutine_assessments set effective_hours=? where subtask_id=? and review_case_id=? and effective_hours is null')
    .run(decision.recognizedHours,subtask.id,item.id);
  return {state:flight.status==='已确认'?'ADJUSTED_CLOSED':'MERGED_CLOSED',detail:{code:flight.status==='已确认'?'CONFIRMED_ADJUSTMENT_POSTED':'CURRENT_STAGE_POSTED',period:period.month,periodRevision:Number(period.revision),resultStatus:flight.status,resultIds,approvedRevision:Number(final.approved_revision),channelId:channel.id}};
}
