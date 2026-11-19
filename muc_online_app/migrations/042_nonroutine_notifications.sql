create table if not exists maintenance_nonroutine_review_notifications(
  id text primary key,
  outbox_id text not null unique references maintenance_nonroutine_review_outbox(id),
  case_id text not null references maintenance_nonroutine_review_cases(id),
  recipient_account_id text not null,
  event_type text not null,
  payload_json text not null,
  created_at text not null,
  read_at text
);
create index if not exists maintenance_nonroutine_notification_recipient on maintenance_nonroutine_review_notifications(recipient_account_id,created_at,id);