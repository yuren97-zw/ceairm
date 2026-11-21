-- Workflow facts remain separate from opportunity status and settlement ledgers.
create table if not exists maintenance_workflow_instances(
 id text primary key,
 module_instance_id text not null unique references maintenance_module_instances(id),
 template_code text not null,template_version integer not null check(template_version>0),
 template_json text not null,template_sha256 text not null,
 result_type text not null check(result_type in ('CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT')),
 state text not null check(state in ('OPEN','COMPLETED','CANCELLED')),
 revision integer not null check(revision>0),created_by text not null,created_at text not null,updated_at text not null
);
create table if not exists maintenance_workflow_tasks(
 id text primary key,workflow_id text not null references maintenance_workflow_instances(id),
 task_key text not null,title text not null,
 account_id text not null,person_id text not null,qualification_json text not null,
 state text not null check(state in ('ASSIGNED','CLAIMED','SUBMITTED','CANCELLED')),
 revision integer not null check(revision>0),result_json text,submitted_at text,
 created_at text not null,updated_at text not null,
 unique(workflow_id,task_key),unique(workflow_id,id),
 check((state='SUBMITTED' and result_json is not null and submitted_at is not null) or (state<>'SUBMITTED' and result_json is null and submitted_at is null))
);
create index if not exists maintenance_workflow_tasks_account on maintenance_workflow_tasks(account_id,state,id);
create table if not exists maintenance_workflow_events(
 id text primary key,workflow_id text not null references maintenance_workflow_instances(id),task_id text,
 event_type text not null,actor_id text not null,qualification_json text not null,
 client_id text not null check(length(client_id)>=8 and length(client_id)<=128),
 request_hash text not null,response_json text not null,detail_json text not null,created_at text not null,
 unique(actor_id,client_id),
 foreign key(workflow_id,task_id) references maintenance_workflow_tasks(workflow_id,id)
);
create index if not exists maintenance_workflow_events_workflow on maintenance_workflow_events(workflow_id,created_at,id);
