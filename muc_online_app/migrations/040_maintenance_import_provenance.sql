-- Technical import provenance. No report, assignment or effective hours are created.
create table if not exists maintenance_subtask_import_batches(
  id text primary key,
  created_by text not null,
  filename text not null,
  file_sha256 text not null,
  sheet_name text not null,
  revision integer not null default 1,
  status text not null default 'PREVIEW',
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_subtask_import_rows(
  batch_id text not null references maintenance_subtask_import_batches(id),
  row_number integer not null,
  original_json text not null,
  preview_json text not null,
  decision_json text not null default '{}',
  receipt_json text,
  updated_at text not null,
  primary key(batch_id,row_number)
);
create table if not exists maintenance_nonroutine_import_sources(
  fingerprint text primary key,
  flight_id text not null,
  client_id text not null,
  subtask_id text,
  first_batch_id text not null,
  row_number integer not null,
  original_json text not null,
  standard_snapshot_json text,
  state text not null check(state in ('ACTIVE','DELETED','SUBMITTED')),
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  unique(flight_id,client_id),
  foreign key(first_batch_id,row_number) references maintenance_subtask_import_rows(batch_id,row_number)
);
create index if not exists maintenance_import_batch_owner on maintenance_subtask_import_batches(created_by,created_at);
create index if not exists maintenance_import_source_flight on maintenance_nonroutine_import_sources(flight_id,state);
create table if not exists maintenance_subtask_import_attempts(
  batch_id text not null references maintenance_subtask_import_batches(id),
  request_id text not null,
  payload_digest text not null,
  result_json text not null,
  created_at text not null,
  primary key(batch_id,request_id)
);
