create table if not exists attendance_month_close_state (
 id integer primary key check(id=1), active_month text not null
);
insert into attendance_month_close_state(id,active_month) values(1,'') on conflict(id) do nothing;

create table if not exists attendance_month_closes (
 source_month text primary key, usage_month text not null unique, rule_id text,
 status text not null, run_id text, attempt integer not null default 0,
 retry_at text, error text, updated_at text not null
);

create table if not exists attendance_month_close_days (
 person_id text not null, work_date text not null, seconds integer,
 unresolved_reason text, primary key(person_id,work_date)
);

create table if not exists attendance_month_close_totals (
 person_id text not null, usage_month text not null, entitled integer not null check(entitled>=0),
 pending_days integer not null check(pending_days>=0),
 primary key(person_id,usage_month)
);
