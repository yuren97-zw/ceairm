-- Accounting roles retain real assignment lineage; parent results remain the stage authority.
create table if not exists maintenance_nonroutine_role_results(
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
  select id,owner_type,owner_id,flight_id,assignment_id,person_id,user_name,team,role,source,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_nonroutine_hour_adjustments;
