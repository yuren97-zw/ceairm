create table if not exists maintenance_nonroutine_review_finals(
  id text primary key,
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null check(approved_revision=1),
  input_digest text not null,
  decision_json text not null,
  participants_json text not null,
  policy_json text not null,
  opinion_versions_json text not null,
  statistics_json text not null,
  reason text not null,
  role_verification_reason text not null,
  admission_decision text not null check(admission_decision in ('INCLUDE','EXCLUDE','PENDING')),
  finalized_by text not null,
  created_at text not null
);
create table if not exists maintenance_nonroutine_review_sync_attempts(
  id text primary key,
  channel_id text not null references maintenance_nonroutine_review_channels(id),
  actor_id text not null,
  outcome text not null,
  detail_json text not null,
  created_at text not null
);
