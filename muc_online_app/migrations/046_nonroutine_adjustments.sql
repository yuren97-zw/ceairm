create table if not exists maintenance_nonroutine_hour_adjustments(
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
