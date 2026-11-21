-- Independent standard-version review; no opportunity, report or hour-ledger source.
create table if not exists maintenance_standard_review_cases(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null unique references maintenance_standard_versions(id),
  base_version_id text references maintenance_standard_versions(id),
  source_revision integer not null,
  application_json text not null,
  aircraft_json text not null,
  applicant_account_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  state text not null check(state in ('PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED','CANCELLED')),
  revision integer not null default 1,
  finalizer_account_id text,
  accepted_at text,
  sealed_at text,
  created_at text not null,
  updated_at text not null,
  unique(applicant_account_id,client_id)
);
create table if not exists maintenance_standard_review_seats(
  id text primary key,
  case_id text not null references maintenance_standard_review_cases(id),
  person_id text not null,
  account_id text not null,
  qualification_json text not null,
  assigned_by text not null,
  assigned_at text not null,
  unique(case_id,person_id),
  unique(case_id,account_id),
  unique(case_id,person_id,account_id)
);
create table if not exists maintenance_standard_review_opinions(
  case_id text not null references maintenance_standard_review_cases(id),
  person_id text not null,
  account_id text not null,
  hours real not null check(hours>=0),
  basis text not null,
  revision integer not null,
  qualification_json text not null,
  submitted_at text not null,
  updated_at text not null,
  primary key(case_id,person_id),
  foreign key(case_id,person_id,account_id) references maintenance_standard_review_seats(case_id,person_id,account_id)
);
create table if not exists maintenance_standard_review_opinion_history(
  id text primary key,
  case_id text not null,
  person_id text not null,
  account_id text not null,
  revision integer not null,
  opinion_json text not null,
  created_at text not null,
  unique(case_id,person_id,revision)
);
create table if not exists maintenance_standard_review_events(
  id text primary key,
  case_id text not null,
  actor_id text not null,
  event_type text not null,
  detail_json text not null,
  created_at text not null
);
create table if not exists maintenance_standard_review_outbox(
  id text primary key,
  case_id text not null,
  event_type text not null,
  recipient_account_id text not null,
  due_at text not null,
  state text not null default 'PENDING',
  generation integer not null default 1,
  created_at text not null,
  unique(case_id,event_type,recipient_account_id,generation)
);

create index if not exists maintenance_standard_review_recipient on maintenance_standard_review_seats(account_id,case_id);
create index if not exists maintenance_standard_review_due on maintenance_standard_review_outbox(state,due_at);
create table if not exists maintenance_standard_review_suggestions(
  id text primary key,
  case_id text not null references maintenance_standard_review_cases(id),
  person_id text not null,
  account_id text not null,
  client_id text not null,
  field text not null check(field in ('category','chapter','title','workScope')),
  original_value text not null,
  proposed_value text not null,
  reason text not null,
  created_at text not null,
  unique(case_id,account_id,client_id)
);
create index if not exists maintenance_standard_review_suggestion_case on maintenance_standard_review_suggestions(case_id,created_at,id);

create table if not exists maintenance_standard_review_finals(
  id text primary key,
  case_id text not null unique references maintenance_standard_review_cases(id),
  version_id text not null unique references maintenance_standard_versions(id),
  input_digest text not null,
  decision_json text not null,
  aircraft_json text not null,
  opinion_versions_json text not null,
  statistics_json text not null,
  admission_decision text not null check(admission_decision in ('PENDING','INCLUDE','EXCLUDE')),
  reason text not null,
  finalized_by text not null,
  created_at text not null
);
