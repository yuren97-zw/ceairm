create index if not exists idx_records_status_date_updated
  on records(publish_status, date desc, updated_at desc);
create index if not exists idx_record_recipients_user_record
  on record_recipients(user_id, record_id);
create index if not exists idx_read_receipts_user_record
  on read_receipts(user_id, record_id);
create index if not exists idx_attachments_owner_created
  on attachments(owner_type, owner_id, created_at);

create index if not exists idx_maintenance_flights_date_status_arrival
  on maintenance_flights(date desc, status, planned_arrival desc, created_at desc);
create index if not exists idx_maintenance_flights_kind_date
  on maintenance_flights(work_kind, date desc);
create index if not exists idx_maintenance_subtasks_flight_created
  on maintenance_subtasks(flight_id, created_at);
create index if not exists idx_maintenance_assignments_flight_status_user
  on maintenance_assignments(flight_id, status, user_id);
create index if not exists idx_maintenance_assignments_owner_user
  on maintenance_assignments(owner_type, owner_id, user_id, role);
create index if not exists idx_maintenance_report_batches_flight_type_status
  on maintenance_report_batches(flight_id, report_type, status);
create index if not exists idx_maintenance_report_entries_flight_batch
  on maintenance_report_entries(flight_id, batch_id);
create index if not exists idx_maintenance_report_drafts_flight_type
  on maintenance_report_drafts(flight_id, report_type);
create index if not exists idx_maintenance_hours_flight_user_status
  on maintenance_hour_results(flight_id, user_id, status);
create index if not exists idx_maintenance_hours_owner_assignment
  on maintenance_hour_results(owner_type, owner_id, assignment_id);
create index if not exists idx_maintenance_sorties_flight_user_status
  on maintenance_sortie_results(flight_id, user_id, status);
create index if not exists idx_maintenance_logs_flight_created
  on maintenance_logs(flight_id, created_at desc);
