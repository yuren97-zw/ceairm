-- Existing relationships retain their dates; their original overlap rule was one day.
alter table capability_status_records add column if not exists handover_days integer not null default 1
  check(handover_days between 1 and 3);
