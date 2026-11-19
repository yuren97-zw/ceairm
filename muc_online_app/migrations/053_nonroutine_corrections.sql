-- Independent approvals and signed deltas; never reopen a review sync channel.
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
