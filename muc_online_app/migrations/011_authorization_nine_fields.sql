-- PostgreSQL structural parity. Existing authorization data must be explicitly
-- backed up/reset through the application migration, never silently discarded here.
do $$
declare constraint_row record;
begin
 if exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='personnel_authorizations' and column_name='certificate_no') then
  if exists(select 1 from personnel_authorizations) then
   raise exception 'Back up and run the explicit authorization-only reset before applying this schema migration';
  end if;
  for constraint_row in select conname from pg_constraint where conrelid='personnel_authorizations'::regclass and contype='u' loop
   execute format('alter table personnel_authorizations drop constraint %I',constraint_row.conname);
  end loop;
 end if;
end $$;
alter table personnel_authorizations drop column if exists application_unit;
alter table personnel_authorizations drop column if exists meets_requirements;
alter table personnel_authorizations drop column if exists license_no;
alter table personnel_authorizations drop column if exists certificate_no;
alter table personnel_authorizations drop column if exists authorized_by;
alter table personnel_authorizations drop column if exists training_expires_at;
alter table personnel_authorizations drop column if exists authorization_remark;
alter table personnel_authorizations drop column if exists evaluation_remark;
alter table personnel_authorizations alter column authorization_type set not null;
alter table personnel_authorizations alter column authorization_unit set not null;
alter table personnel_authorizations alter column authorization_status set not null;
create unique index if not exists authorization_person_project_type_unit on personnel_authorizations(person_id,project_code,authorization_type,authorization_unit);
create table if not exists personnel_authorization_versions(person_id text primary key,revision integer not null default 0);
