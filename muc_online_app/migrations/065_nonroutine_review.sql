create table if not exists maintenance_nonroutine_review_cases(
  id text primary key,
  flight_id text not null,
  subtask_id text not null,
  report_batch_id text not null,
  application_revision integer not null,
  application_json text not null,
  participants_json text not null,
  policy_json text,
  applicant_account_id text not null,
  state text not null check(state in ('PENDING_ACCEPTANCE','IN_REVIEW','SEALED','FINALIZED','CANCELLED')),
  revision integer not null default 1,
  finalizer_account_id text,
  accepted_at text,
  sealed_at text,
  created_at text not null,
  updated_at text not null,
  unique(subtask_id,report_batch_id,application_revision)
);
create table if not exists maintenance_nonroutine_review_seats(
  id text primary key,
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  qualification_json text not null,
  assigned_by text not null,
  assigned_at text not null,
  unique(case_id,person_id),
  unique(case_id,account_id),
  unique(case_id,person_id,account_id)
);
create table if not exists maintenance_nonroutine_review_opinions(
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  hours real not null check(hours>=0),
  basis text not null,
  revision integer not null,
  qualification_json text not null,
  submitted_at text not null,
  updated_at text not null,
  primary key(case_id,person_id),
  foreign key(case_id,person_id,account_id) references maintenance_nonroutine_review_seats(case_id,person_id,account_id)
);
create table if not exists maintenance_nonroutine_review_opinion_history(
  id text primary key,
  case_id text not null,
  person_id text not null,
  account_id text not null,
  revision integer not null,
  opinion_json text not null,
  created_at text not null,
  unique(case_id,person_id,revision)
);
create table if not exists maintenance_nonroutine_review_events(
  id text primary key,
  case_id text not null,
  actor_id text not null,
  event_type text not null,
  detail_json text not null,
  created_at text not null
);
create table if not exists maintenance_nonroutine_review_outbox(
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
create index if not exists maintenance_nonroutine_review_flight on maintenance_nonroutine_review_cases(flight_id,state);
create index if not exists maintenance_nonroutine_review_recipient on maintenance_nonroutine_review_seats(account_id,case_id);
create index if not exists maintenance_nonroutine_review_due on maintenance_nonroutine_review_outbox(state,due_at);
