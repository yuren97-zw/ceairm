create table if not exists maintenance_hour_periods(
  month text primary key,
  responsible_account_id text not null,
  responsible_person_id text not null,
  state text not null check(state in ('UNKNOWN','OPEN','CLOSED')),
  revision integer not null,
  confirmed_by text,
  confirmed_at text,
  updated_at text not null
);
create table if not exists maintenance_hour_period_history(
  id text primary key,
  month text not null references maintenance_hour_periods(month),
  revision integer not null,
  action text not null check(action in ('ASSIGNED','CONFIRMED')),
  actor_id text not null,
  reason text not null,
  snapshot_json text not null,
  qualification_json text not null,
  created_at text not null,
  unique(month,revision)
);