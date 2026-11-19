-- V10.1 §5.8 (P0-37): versioned "current effective reference" auto-refresh audit.
-- Original submission snapshots (batches/entries) and confirmed/settled results are never modified;
-- this table records every automatic refresh of the unconfirmed current-effective standard reference.
create table if not exists maintenance_standard_effective_refreshes(
  id text primary key,
  subtask_id text not null,
  flight_id text not null,
  standard_id text not null,
  from_version integer not null,
  to_version integer not null,
  from_hours real not null,
  to_hours real not null,
  changed_fields_json text not null,
  operator_id text not null,
  reason text not null,
  created_at text not null,
  unique(subtask_id, to_version)
);
create index if not exists maintenance_standard_effective_refresh_flight on maintenance_standard_effective_refreshes(flight_id,created_at);
