create table if not exists users(
  id text primary key,
  username text unique not null,
  name text not null,
  role text not null,
  salt text not null,
  password_hash text not null,
  permissions text not null,
  allowed_tabs text not null,
  department text,
  team text,
  status text default 'active',
  created_at text not null,
  updated_at text not null
);

create table if not exists people(
  id text primary key,
  name text not null,
  department text,
  team text,
  created_at text not null,
  updated_at text not null
);

create table if not exists records(
  id text primary key,
  date text not null,
  publisher text not null,
  category text not null,
  title text not null,
  summary text,
  original text not null,
  source_set text,
  created_by text,
  updated_by text,
  created_at text not null,
  updated_at text not null,
  deadline text,
  priority text default '普通',
  publish_status text default '已发布',
  publisher_id text,
  imported_read integer default 0
);

create table if not exists record_recipients(
  record_id text not null,
  user_id text not null,
  name text not null,
  department text,
  team text,
  primary key(record_id, user_id)
);

create table if not exists read_receipts(
  record_id text not null,
  user_id text not null,
  read_at text,
  is_overdue integer default 0,
  remind_count integer default 0,
  last_reminded_at text,
  primary key(record_id, user_id)
);

create table if not exists fixed_projects(
  id text primary key,
  ata text not null,
  title text not null,
  content_html text,
  references_text text,
  created_by text,
  updated_by text,
  created_at text not null,
  updated_at text not null
);

create table if not exists attachments(
  id text primary key,
  owner_type text not null,
  owner_id text not null,
  name text not null,
  type text,
  size integer,
  storage text,
  path text,
  created_by text,
  created_at text not null
);

create table if not exists favorites(
  user_id text not null,
  record_id text not null,
  created_at text not null,
  primary key(user_id, record_id)
);

create table if not exists settings(
  key text primary key,
  value text not null,
  updated_at text not null
);

create table if not exists audit_logs(
  id text primary key,
  user_id text,
  user_name text,
  action text,
  target_type text,
  target_id text,
  detail text,
  created_at text not null
);

create table if not exists audit(
  id text primary key,
  user_id text,
  user_name text,
  action text,
  target_type text,
  target_id text,
  detail text,
  created_at text not null
);

create table if not exists sessions(
  id text primary key,
  user_id text not null,
  created_at text not null,
  expires_at text not null
);

alter table users add column if not exists function_category text default '维修';

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
  updated_at text not null,
  report_finalized_by text,
  report_finalized_by_name text,
  report_finalized_at text,
  archived_at text
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
  user_id text not null,
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
  user_id text not null,
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
  user_id text not null,
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
  user_id text not null,
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
  user_id text not null,
  user_name text not null,
  team text,
  created_at text not null,
  updated_at text not null,
  primary key(flight_id, role, user_id)
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
  user_id text not null,
  user_name text not null,
  team text,
  standard_hours real default 0,
  source text,
  created_at text not null,
  updated_at text not null,
  unique(batch_id, owner_type, owner_id, role, user_id)
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

create table if not exists schema_migrations(
  version text primary key,
  applied_at text not null
);

create index if not exists idx_maintenance_flights_date on maintenance_flights(date);
create index if not exists idx_maintenance_flights_status on maintenance_flights(status);
create index if not exists idx_maintenance_subtasks_flight on maintenance_subtasks(flight_id);
create index if not exists idx_maintenance_assignments_flight on maintenance_assignments(flight_id);
create index if not exists idx_maintenance_assignments_user on maintenance_assignments(user_id);
create index if not exists idx_maintenance_hour_results_flight on maintenance_hour_results(flight_id);
create index if not exists idx_maintenance_hour_results_user on maintenance_hour_results(user_id);
create index if not exists idx_maintenance_sortie_results_flight on maintenance_sortie_results(flight_id);
create index if not exists idx_maintenance_logs_flight on maintenance_logs(flight_id);
