-- Original manual draft source identity; saving creates no formal work or hours.
create table if not exists maintenance_nonroutine_manual_sources(
  fingerprint text primary key,
  flight_id text not null,
  client_id text not null,
  state text not null check(state in ('ACTIVE','SUBMITTED','DELETED')),
  standard_snapshot_json text,
  subtask_id text unique,
  created_at text not null,
  updated_at text not null,
  unique(flight_id,client_id)
);
create index if not exists maintenance_manual_source_flight on maintenance_nonroutine_manual_sources(flight_id,state);
