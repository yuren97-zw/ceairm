-- Additive tables: no changes to existing data or task columns. SQLite / PostgreSQL.
create table if not exists attendance_sync_state(id text primary key,value_json text not null,updated_at text not null);
create table if not exists attendance_run_meta(run_id text primary key,source text not null,priority integer not null,targets_json text);
create table if not exists attendance_events(id text primary key,topic text not null,payload_json text not null,received_at text not null,status text not null,error text);
create table if not exists attendance_refresh(person_id text not null,work_date text not null,generation integer not null default 0,verified_generation integer not null default -1,verified_at text,first_dirty_at text,due_at text,error text,primary key(person_id,work_date));
create table if not exists attendance_task_marks(task_id text primary key,generation integer not null,started_at text not null);
create table if not exists attendance_approval_cache(id text primary key,detail_json text,status text not null,fetched_at text not null,invalidated_at text);
create table if not exists attendance_api_counts(month text not null,source text not null,endpoint text not null,request_count integer not null default 0,retry_count integer not null default 0,primary key(month,source,endpoint));
create index if not exists attendance_event_pending on attendance_events(status,received_at);
create index if not exists attendance_refresh_due on attendance_refresh(due_at);
create table if not exists attendance_task_links(run_id text not null,task_id text not null,primary key(run_id,task_id));
create table if not exists attendance_schedule_cache(person_id text not null,work_date text not null,schedules_json text not null,verified_at text not null,invalidated_at text,primary key(person_id,work_date));
-- Adopt proven legacy successful people-days without re-querying DingTalk.
-- Run creation precedes every legacy batch read, so it is a conservative verification time.
insert into attendance_refresh(person_id,work_date,generation,verified_generation,verified_at)
select d.person_id,d.work_date,0,0,r.created_at from attendance_days d join attendance_runs r on r.id=d.run_id
where exists(select 1 from attendance_tasks t where t.run_id=d.run_id and t.person_id=d.person_id and t.work_date=d.work_date and t.status='done')
on conflict(person_id,work_date) do nothing;
create table if not exists attendance_event_targets(event_id text not null,person_id text not null,work_date text not null,generation integer not null,source_read_at text,applied_at text,primary key(event_id,person_id,work_date));
create index if not exists attendance_event_target_pending on attendance_event_targets(person_id,work_date,applied_at);
create index if not exists attendance_event_received on attendance_events(received_at);
