-- Typed work recognition source; no synthetic standard review or hour writes.
create table if not exists maintenance_standard_work_sources(
  version_id text primary key references maintenance_standard_versions(id),
  standard_id text not null references maintenance_standards(id),
  work_final_id text not null unique references maintenance_nonroutine_review_finals(id),
  work_case_id text not null unique references maintenance_nonroutine_review_cases(id),
  final_digest text not null,
  aircraft_json text not null,
  created_by text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  created_at text not null,
  unique(created_by,client_id)
);
create table if not exists maintenance_standard_work_admissions(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null references maintenance_standard_versions(id),
  final_id text not null references maintenance_nonroutine_review_finals(id),
  sequence integer not null check(sequence>0),
  standard_revision integer not null,
  source_digest text not null,
  decision text not null check(decision in ('INCLUDE','EXCLUDE','PENDING')),
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(version_id,sequence),
  unique(actor_id,client_id)
);
create index if not exists maintenance_standard_work_admission_history on maintenance_standard_work_admissions(version_id,sequence);
create table if not exists maintenance_standard_work_publications(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null unique references maintenance_standard_versions(id),
  final_id text not null references maintenance_nonroutine_review_finals(id),
  admission_id text not null unique references maintenance_standard_work_admissions(id),
  standard_revision integer not null,
  source_digest text not null,
  effective_at text not null,
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(actor_id,client_id)
);
