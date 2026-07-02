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
