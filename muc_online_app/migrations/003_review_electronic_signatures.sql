alter table maintenance_flights add column if not exists routine_electronic_signed integer;
alter table maintenance_flights add column if not exists nonroutine_electronic_signed integer;
