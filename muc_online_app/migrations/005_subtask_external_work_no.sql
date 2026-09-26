alter table maintenance_subtasks add column if not exists external_work_no text;

create unique index if not exists idx_maintenance_subtasks_flight_external_work_no
  on maintenance_subtasks(flight_id, external_work_no)
  where external_work_no is not null and trim(external_work_no) <> '';
