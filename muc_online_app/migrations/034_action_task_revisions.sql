-- Per-recipient invalidation counters; updated with the task transaction.
create table if not exists action_task_revisions(user_id text primary key,version integer not null default 0);
