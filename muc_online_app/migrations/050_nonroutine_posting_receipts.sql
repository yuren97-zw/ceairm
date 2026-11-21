create table if not exists maintenance_nonroutine_posting_receipts(
  channel_id text primary key references maintenance_nonroutine_review_channels(id),
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null,
  task_id text references maintenance_nonroutine_cross_period_tasks(id),
  task_revision integer,
  work_month text not null,
  handling_month text not null,
  statistical_month text not null,
  policy text not null check(policy='ORIGINAL_WORK_MONTH'),
  period_snapshot_json text not null,
  created_at text not null,
  check(statistical_month=work_month)
);