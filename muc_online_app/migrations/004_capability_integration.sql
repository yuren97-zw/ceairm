-- Formal personnel/capability integration.  Personnel is the sole identity source.
create table if not exists capability_meta(
  id integer primary key,
  revision integer not null,
  fingerprint text not null,
  master_revision integer not null default 0,
  source_marker text not null default 'center-master-v1'
);
alter table capability_meta add column if not exists master_revision integer not null default 0;
alter table capability_meta add column if not exists source_marker text not null default '';
insert into capability_meta(id,revision,fingerprint,master_revision,source_marker)
values(1,0,'',0,'center-master-v1') on conflict(id) do nothing;
create table if not exists capability_current_states(
  person_id text primary key references personnel(id) on delete restrict,
  status text not null check(status in ('ON_DUTY','DEPLOYED','TRAINING','OTHER')),
  working_group text check(working_group is null or working_group in ('一组','二组','三组','四组')),
  workspace text not null,
  administrative_group text check(administrative_group is null or administrative_group in ('一组','二组','三组','四组')),
  sort_index integer not null check(sort_index>=0),record_id text,updated_at text not null
);
create table if not exists capability_supports(
  id text primary key,person_id text not null references personnel(id) on delete restrict,workspace text not null,
  source_group text,target_group text,started_at text not null,ended_at text
);
create unique index if not exists capability_one_active_support on capability_supports(person_id) where ended_at is null;
create table if not exists capability_deployment_locations(
  id text primary key,workspace text not null,name text not null,status text not null check(status in ('active','inactive')),
  created_by text,created_at text not null,updated_by text,updated_at text not null,unique(workspace,name)
);
create index if not exists capability_deployment_locations_workspace_idx on capability_deployment_locations(workspace,status,name);
create table if not exists capability_status_records(
  id text primary key,person_id text not null references personnel(id) on delete restrict,workspace text not null,
  kind text not null check(kind in ('DEPLOYED','TRAINING','OTHER')),label text not null,start_date text,end_date text,
  phase text not null check(phase in ('PLANNED','ACTIVE','ENDED','CANCELLED')),remark text,created_at text not null,updated_at text not null,
  replaces_record_id text references capability_status_records(id) on delete restrict,
  deployment_location_id text references capability_deployment_locations(id) on delete restrict,
  data_status text not null default 'active' check(data_status in ('active','deleted')),
  deleted_at text,deleted_by text,deletion_reason text
);
alter table capability_status_records add column if not exists replaces_record_id text references capability_status_records(id) on delete restrict;
alter table capability_status_records add column if not exists deployment_location_id text references capability_deployment_locations(id) on delete restrict;
alter table capability_status_records add column if not exists data_status text not null default 'active';
alter table capability_status_records add column if not exists deleted_at text;
alter table capability_status_records add column if not exists deleted_by text;
alter table capability_status_records add column if not exists deletion_reason text;
drop index if exists capability_one_active_status;
create unique index capability_one_active_status on capability_status_records(person_id) where phase='ACTIVE' and data_status='active';
drop index if exists capability_one_replacement;
create unique index capability_one_replacement on capability_status_records(replaces_record_id) where replaces_record_id is not null and data_status='active';
create index if not exists capability_status_person_idx on capability_status_records(person_id,phase);
create table if not exists capability_history(
  id text primary key,person_id text references personnel(id) on delete restrict,workspace text not null,type text not null,
  actor_id text,occurred_at text not null,payload text not null
);
create index if not exists capability_history_workspace_idx on capability_history(workspace,occurred_at);
create table if not exists capability_scenarios(
  id text primary key,workspace text not null,name text not null,base_revision integer not null,payload text not null,created_by text,updated_at text not null
);
create table if not exists capability_configuration(workspace text primary key,payload text not null);
create table if not exists capability_events(id text primary key,revision integer not null,type text not null,occurred_at text not null);
create table if not exists capability_commands(id text primary key,actor_id text not null,request_hash text not null,response text not null);
