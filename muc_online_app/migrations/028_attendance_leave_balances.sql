create table if not exists attendance_leave_snapshots(person_id text not null,leave_code text not null,type_name text not null,quotas_json text not null,records_json text not null,synced_at text not null,primary key(person_id,leave_code));
create table if not exists attendance_leave_queue(person_id text primary key,generation integer not null,verified_generation integer not null default 0,first_dirty_at text not null,due_at text not null,source text not null,status text not null,error text,attempts integer not null default 0,updated_at text not null);
create index if not exists attendance_leave_due on attendance_leave_queue(status,due_at);
create table if not exists attendance_leave_event_marks(event_id text primary key,marked_at text not null);
