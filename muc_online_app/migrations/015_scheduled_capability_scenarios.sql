alter table capability_scenarios add column if not exists effective_at text;
alter table capability_scenarios add column if not exists schedule_status text not null default 'saved';
alter table capability_scenarios add column if not exists baseline_payload text;
alter table capability_scenarios add column if not exists conflict_payload text;
alter table capability_scenarios add column if not exists applied_at text;
create index if not exists capability_scenarios_due_idx on capability_scenarios(schedule_status,effective_at);
