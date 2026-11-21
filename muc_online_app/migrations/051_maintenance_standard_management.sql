-- Standard management audit only; published definitions and historical work remain intact.
create table if not exists maintenance_standard_management_events(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null references maintenance_standard_versions(id),
  revision integer not null,
  action text not null check(action in ('CREATED','UPDATED','WITHDRAWN','DISABLED','VERSION_DRAFT')),
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(actor_id,client_id),
  unique(standard_id,revision)
);
create index if not exists maintenance_standard_management_history on maintenance_standard_management_events(standard_id,revision);
