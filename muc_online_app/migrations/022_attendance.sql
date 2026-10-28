create table if not exists attendance_people(user_id text primary key,person_id text unique,employee_no text,name text,department text,team text,department_ids text not null,identity_issue text,seen_at text not null);
create table if not exists attendance_days(person_id text not null,work_date text not null,input_json text not null,result_json text not null,source_hash text not null,updated_at text not null,run_id text not null,primary key(person_id,work_date));
create table if not exists attendance_changes(id text primary key,person_id text not null,work_date text not null,before_json text,after_json text not null,changed_at text not null,run_id text not null);
create table if not exists attendance_runs(id text primary key,from_date text not null,to_date text not null,status text not null,actor_id text,scope_json text,created_at text not null,updated_at text not null,error text,attempts integer not null default 0,next_at text);
create table if not exists attendance_batches(id text primary key,run_id text not null,from_date text not null,to_date text not null,users_json text not null,payload_json text,status text not null,attempts integer not null default 0,next_at text not null,error text);
create table if not exists attendance_tasks(id text primary key,run_id text not null,batch_id text not null,person_id text not null,user_id text not null,work_date text not null,status text not null,attempts integer not null default 0,next_at text not null,error text,updated_at text,unique(run_id,person_id,work_date));
create table if not exists attendance_approvals(id text primary key,run_id text not null,detail_json text,status text not null,fetched_at text not null);
create table if not exists attendance_leases(id text primary key,owner text not null,expires_at text not null);
create table if not exists attendance_api_usage(month text primary key,request_count integer not null default 0);
create index if not exists attendance_task_pending on attendance_tasks(status,next_at);
create index if not exists attendance_task_person on attendance_tasks(person_id,work_date);
create index if not exists attendance_change_person on attendance_changes(person_id,work_date);

create index if not exists attendance_batch_run on attendance_batches(run_id,status);
