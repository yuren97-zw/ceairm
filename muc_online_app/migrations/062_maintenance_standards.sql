-- V10.1 standard-library foundation. Existing work and hour results are untouched.
create table if not exists maintenance_standards(
  id text primary key,
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','DISABLED')),
  revision integer not null default 1,
  created_by text not null,
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_standard_versions(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version integer not null check(version > 0),
  category text not null,
  chapter text not null,
  title text not null,
  work_scope text not null,
  standard_hours real not null check(standard_hours >= 0),
  aircraft_codes_json text not null,
  generic_aircraft integer not null default 0 check(generic_aircraft in (0,1)),
  status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','WITHDRAWN')),
  admission_decision text not null default 'PENDING' check(admission_decision in ('PENDING','INCLUDE','EXCLUDE')),
  effective_at text,
  published_by text,
  published_at text,
  review_final_id text,
  created_at text not null,
  unique(standard_id,version)
);
create index if not exists maintenance_standard_versions_lookup
  on maintenance_standard_versions(standard_id,status,version);
