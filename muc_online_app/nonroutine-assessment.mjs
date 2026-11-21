// A submitted source and its one-time delivery channel, not a second hours ledger.
export const NONROUTINE_ASSESSMENT_SCHEMA = `create table if not exists maintenance_nonroutine_assessments(
  subtask_id text primary key,
  flight_id text not null,
  report_batch_id text not null,
  source_kind text not null check(source_kind in ('STANDARD','REVIEW')),
  source_fingerprint text not null unique,
  application_json text not null,
  participants_json text not null,
  policy_json text not null,
  standard_json text,
  review_case_id text unique references maintenance_nonroutine_review_cases(id),
  effective_hours real check(effective_hours>=0),
  created_at text not null,
  check((source_kind='STANDARD' and standard_json is not null and review_case_id is null and effective_hours is not null)
    or (source_kind='REVIEW' and review_case_id is not null))
);
create table if not exists maintenance_nonroutine_review_channels(
  id text primary key,
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  subtask_id text not null unique,
  state text not null check(state in ('WAITING_REVIEW','APPROVED_PENDING_SYNC','MERGED_CLOSED','ADJUSTED_CLOSED','CANCELLED_CLOSED','NEEDS_ATTENTION')),
  approved_revision integer,
  created_at text not null,
  updated_at text not null
);
create index if not exists maintenance_nonroutine_assessment_flight on maintenance_nonroutine_assessments(flight_id);
`;
