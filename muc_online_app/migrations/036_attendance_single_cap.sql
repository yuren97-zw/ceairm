-- Nullable preserves historical unlimited accumulation policies.
alter table attendance_monthly_exchange_rules add column if not exists single_cap_seconds integer check(single_cap_seconds>0);
