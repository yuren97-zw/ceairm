create table if not exists maintenance_nonroutine_cross_period_tasks(
  id text primary key,
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  channel_id text not null unique references maintenance_nonroutine_review_channels(id),
  approved_revision integer not null,
  source_month text not null,
  source_period_json text not null,
  state text not null check(state in ('PENDING_AUTHORIZATION','AUTHORIZED','RESOLVED_SOURCE_REOPENED','COMPLETED')),
  revision integer not null,
  target_month text,
  authorized_by text,
  source_revision integer,
  target_revision integer,
  created_at text not null,
  updated_at text not null
);
create table if not exists maintenance_nonroutine_cross_period_history(
  id text primary key,
  task_id text not null references maintenance_nonroutine_cross_period_tasks(id),
  revision integer not null,
  actor_id text not null,
  reason text not null,
  authorization_json text not null,
  created_at text not null,
  unique(task_id,revision)
);