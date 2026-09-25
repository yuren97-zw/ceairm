-- PostgreSQL fresh-target schema for normalized personId/module-scope data.
-- Existing populated legacy targets MUST first use the application's reviewed migration.
do $$
begin
  if not exists(select 1 from information_schema.columns where table_schema=current_schema() and table_name='rbac_user_scopes' and column_name='module') then
    if exists(select 1 from rbac_user_scopes) then
      raise exception 'Populated legacy scopes require reviewed application migration first';
    end if;
    alter table rbac_user_scopes rename to rbac_user_scopes_legacy_identity_v3;
    create table rbac_user_scopes_v3(id text primary key,user_id text not null,module text not null,scope_type text not null,scope_id text not null default '',valid_from text,valid_to text,created_at text not null,updated_at text not null,unique(user_id,module,scope_type,scope_id));
    alter table rbac_user_scopes_v3 rename to rbac_user_scopes;
  end if;
end $$;
alter table record_recipients add column if not exists person_id text;
create index if not exists record_recipients_person_idx on record_recipients(person_id);
create table if not exists personnel_identity_migrations(table_name text not null,legacy_identity text not null,person_id text not null,migrated_at text not null,primary key(table_name,legacy_identity));
create table if not exists personnel_organization_history(id text primary key,person_id text not null,department_id text,home_team_id text,workshop_id text,changed_at text not null);

create table if not exists maintenance_flights(
  id text primary key,
  date text,
  flight_no text,
  aircraft_no text,
  aircraft_type text,
  stand text,
  planned_arrival text,
  planned_departure text,
  work_type text,
  card_no text,
  card_name text,
  work_kind text,
  standard_hours real default 0,
  priority text,
  status text not null default '未派工',
  remark text,
  source text,
  created_by text,
  updated_by text,
  created_at text not null,
  updated_at text not null
);

create table if not exists maintenance_subtasks(
  id text primary key,
  flight_id text not null,
  card_no text,
  title text not null,
  content text,
  category text,
  standard_hours real default 0,
  priority text,
  status text not null default '未派工',
  remark text,
  created_by text,
  updated_by text,
  created_at text not null,
  updated_at text not null
);

create table if not exists maintenance_assignments(
  id text primary key,
  owner_type text not null,
  owner_id text not null,
  flight_id text,
  person_id text not null,
  user_name text not null,
  team text,
  role text not null,
  is_lead integer default 0,
  status text not null default '已派工',
  feedback text,
  assigned_by text,
  assigned_at text,
  received_at text,
  started_at text,
  completed_at text,
  submitted_at text,
  modified_at text,
  confirmed_at text
);

create table if not exists maintenance_feedback(
  id text primary key,
  assignment_id text not null,
  owner_type text not null,
  owner_id text not null,
  person_id text not null,
  role text,
  content text,
  created_at text not null,
  updated_at text not null
);

create table if not exists maintenance_hour_rules(
  id text primary key,
  rule_type text not null,
  name text not null,
  value real not null,
  created_at text not null,
  updated_at text not null,
  unique(rule_type, name)
);

create table if not exists maintenance_hour_results(
  id text primary key,
  owner_type text not null,
  owner_id text not null,
  flight_id text,
  assignment_id text not null,
  person_id text not null,
  user_name text not null,
  team text,
  role text,
  source text,
  hours real not null default 0,
  adjusted_hours real,
  status text not null default '待复核',
  confirmed_by text,
  confirmed_at text,
  created_at text not null,
  updated_at text not null,
  unique(owner_type, owner_id, assignment_id)
);

create table if not exists maintenance_sortie_results(
  id text primary key,
  owner_type text not null,
  owner_id text not null,
  flight_id text,
  assignment_id text not null,
  person_id text not null,
  user_name text not null,
  team text,
  role text not null default '放行',
  source text,
  sorties integer not null default 1,
  status text not null default '待复核',
  confirmed_by text,
  confirmed_at text,
  created_at text not null,
  updated_at text not null,
  unique(owner_type, owner_id, assignment_id)
);

create table if not exists maintenance_work_reports(
  flight_id text primary key,
  status text not null default '草稿',
  feedback text,
  reported_by text,
  reported_by_name text,
  reported_at text,
  finalized_by text,
  finalized_by_name text,
  finalized_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists maintenance_work_report_entries(
  flight_id text not null,
  role text not null,
  person_id text not null,
  user_name text not null,
  team text,
  created_at text not null,
  updated_at text not null,
  primary key(flight_id, role, person_id)
);

create table if not exists maintenance_report_batches(
  id text primary key,
  flight_id text not null,
  report_type text not null,
  status text not null default '未提报',
  feedback text,
  version integer not null default 0,
  submitted_by text,
  submitted_by_name text,
  submitted_at text,
  created_at text not null,
  updated_at text not null,
  unique(flight_id, report_type)
);

create table if not exists maintenance_report_entries(
  id text primary key,
  batch_id text not null,
  flight_id text not null,
  owner_type text not null,
  owner_id text not null,
  role text not null,
  person_id text not null,
  user_name text not null,
  team text,
  standard_hours real default 0,
  source text,
  created_at text not null,
  updated_at text not null,
  unique(batch_id, owner_type, owner_id, role, person_id)
);

create table if not exists maintenance_report_drafts(
  id text primary key,
  flight_id text not null,
  report_type text not null,
  payload_json text not null default '{}',
  version integer not null default 1,
  updated_by text,
  updated_by_name text,
  created_at text not null,
  updated_at text not null,
  unique(flight_id, report_type)
);

create table if not exists maintenance_sync_state(
  id integer primary key,
  version integer not null default 0,
  updated_at text not null
);

create table if not exists maintenance_logs(
  id text primary key,
  owner_type text,
  owner_id text,
  flight_id text,
  user_id text,
  user_name text,
  action text not null,
  detail text,
  created_at text not null
);
alter table maintenance_flights add column if not exists report_finalized_by text;
alter table maintenance_flights add column if not exists report_finalized_by_name text;
alter table maintenance_flights add column if not exists report_finalized_at text;
alter table maintenance_flights add column if not exists archived_at text;
