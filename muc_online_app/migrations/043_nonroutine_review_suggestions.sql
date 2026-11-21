create table if not exists maintenance_nonroutine_review_suggestions(
  id text primary key,
  case_id text not null references maintenance_nonroutine_review_cases(id),
  person_id text not null,
  account_id text not null,
  client_id text not null,
  field text not null check(field in ('category','chapter','title','workScope')),
  original_value text not null,
  proposed_value text not null,
  reason text not null,
  created_at text not null,
  unique(case_id,account_id,client_id)
);
create index if not exists maintenance_nonroutine_review_suggestion_case on maintenance_nonroutine_review_suggestions(case_id,created_at,id);
