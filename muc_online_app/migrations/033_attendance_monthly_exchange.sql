-- Global monthly exchange policy versions; previous ledgers and requests remain intact.
create table if not exists attendance_monthly_exchange_rules(id text primary key,source_month text not null,threshold_seconds integer not null check(threshold_seconds>0),unit_count integer not null check(unit_count>0),monthly_cap integer not null check(monthly_cap>=0),created_by text not null,created_at text not null);
create index if not exists attendance_monthly_exchange_effective on attendance_monthly_exchange_rules(source_month,created_at,id);
