alter table users add column if not exists person_id text;
alter table users add column if not exists credential_version integer default 1;
alter table users add column if not exists must_change_password integer default 0;
alter table users add column if not exists last_login_at text;
alter table sessions add column if not exists credential_version integer default 1;

create table if not exists personnel(
  id text primary key, employee_no text unique not null check(employee_no ~ '^[0-9]{8}$'), name text not null, gender text, age integer,
  demand_unit text, department text, home_team text, is_instructor integer default 0, position_code text,
  actual_grade text, highest_education text, english_level text, entry_channel text,
  employment_status text not null default '在职', dispatch_flag text, source_batch_id text,
  data_status text not null default 'active', created_at text not null, updated_at text not null
);

alter table personnel add column if not exists department_id text;
alter table personnel add column if not exists home_team_id text;
alter table personnel add column if not exists workshop_id text;
alter table personnel add column if not exists work_category text default '维修';
alter table personnel add column if not exists deleted_at text not null default '';
alter table personnel add column if not exists deleted_by text not null default '';
alter table personnel add column if not exists delete_reason text not null default '';

create table if not exists organization_units(
  id text primary key, code text unique, name text not null, unit_type text not null,
  parent_id text, status text not null default 'active', created_at text not null, updated_at text not null
);

create table if not exists personnel_licenses(
  id text primary key, person_id text not null, employee_no text not null, license_no text, license_type text,
  license_english_level text, issued_at text, renewed_at text, validity_years text, expires_at text,
  is_valid text, remark text, source_created_by text, source_created_at text, source_updated_by text,
  source_updated_at text, source_batch_id text, created_at text not null, updated_at text not null,
  unique(person_id,license_no,license_type)
);
alter table personnel_licenses add column if not exists data_status text default 'active';

create table if not exists capability_catalog(
  id text primary key, project_code text unique not null, project_name text not null,
  authorization_type text, authorization_unit text, status text not null default 'active',
  created_at text not null, updated_at text not null
);

create table if not exists personnel_authorizations(
  id text primary key, person_id text not null, employee_no text not null, project_code text not null,
  project_name text, authorization_type text, authorization_unit text, application_unit text,
  meets_requirements text, license_no text, certificate_no text, authorized_by text, authorized_at text,
  authorization_expires_at text, training_expires_at text, authorization_status text,
  authorization_remark text, evaluation_remark text, source_batch_id text,
  created_at text not null, updated_at text not null,
  unique(person_id,project_code,authorization_type,authorization_unit,certificate_no)
);
alter table personnel_authorizations add column if not exists data_status text default 'active';

create table if not exists course_catalog(
  id text primary key, course_code text not null, course_name text not null, course_version text not null default '',
  course_nature text, status text not null default 'active', created_at text not null, updated_at text not null,
  unique(course_code,course_version)
);

create table if not exists personnel_training_records(
  id text primary key, person_id text not null, employee_no text not null, course_code text not null,
  course_name text, course_version text not null default '', course_nature text, started_at text not null default '',
  completed_at text, training_result text, certificate_no text, issuer text, issuing_unit text, issued_at text,
  attendance_status text, qualification_status text, data_source text, class_no text not null default '',
  source_batch_id text, created_at text not null, updated_at text not null,
  unique(person_id,course_code,course_version,class_no,started_at)
);
alter table personnel_training_records add column if not exists data_status text default 'active';

create table if not exists personnel_import_batches(
  id text primary key, import_type text not null, file_name text, file_hash text,
  status text not null default 'pending', rows_json text not null, summary_json text not null,
  created_by text, created_by_name text, confirmed_by text, confirmed_at text,
  created_at text not null, updated_at text not null
);

create table if not exists personnel_import_issues(
  id text primary key, batch_id text not null, row_number integer, issue_type text not null,
  severity text not null default 'error', employee_no text, detail text,
  status text not null default 'open', resolution text, created_at text not null, updated_at text not null
);

create table if not exists personnel_change_logs(
  id text primary key, person_id text not null, field_name text not null, field_label text,
  old_value text, new_value text, source_type text not null default 'manual', source_batch_id text,
  reason text, operator_id text, operator_name text, created_at text not null
);

create table if not exists personnel_field_overrides(
  person_id text not null, field_name text not null, field_value text, reason text,
  updated_by text, updated_at text not null, primary key(person_id,field_name)
);

create table if not exists master_data_dictionary_values(
  id text primary key, category text not null, code text not null default '', value text not null,
  status text not null default 'active', source_batch_id text, created_at text not null, updated_at text not null,
  unique(category,code,value)
);

create table if not exists rbac_roles(
  id text primary key, code text unique not null, name text not null, description text,
  system_role integer not null default 0, status text not null default 'active',
  created_at text not null, updated_at text not null
);

create table if not exists rbac_permissions(
  id text primary key, code text unique not null, name text not null, module text not null,
  created_at text not null, updated_at text not null
);

create table if not exists rbac_role_permissions(
  role_id text not null, permission_id text not null, primary key(role_id,permission_id)
);

create table if not exists rbac_user_roles(
  user_id text not null, role_id text not null, created_at text not null, primary key(user_id,role_id)
);

create table if not exists rbac_user_scopes(
  id text primary key, user_id text not null, scope_type text not null, scope_id text not null default '',
  valid_from text, valid_to text, created_at text not null, updated_at text not null,
  unique(user_id,scope_type,scope_id)
);

create index if not exists personnel_department_idx on personnel(department);
create index if not exists personnel_home_team_idx on personnel(home_team);
create index if not exists personnel_employment_idx on personnel(employment_status);
create index if not exists personnel_license_person_idx on personnel_licenses(person_id);
create index if not exists personnel_authorization_person_idx on personnel_authorizations(person_id);
create index if not exists idx_personnel_authorizations_project_code on personnel_authorizations(project_code);
create index if not exists personnel_training_person_idx on personnel_training_records(person_id);
create index if not exists personnel_changes_person_idx on personnel_change_logs(person_id,created_at);
