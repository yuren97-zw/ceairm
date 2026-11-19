-- Keep shared-draft revisions monotonic across deletion, submission and recreation.
create table if not exists maintenance_report_draft_versions(
  flight_id text not null,
  report_type text not null,
  version integer not null check(version > 0),
  primary key(flight_id,report_type)
);
insert into maintenance_report_draft_versions(flight_id,report_type,version)
  select flight_id,report_type,version from maintenance_report_drafts where report_type='nonroutine'
  on conflict(flight_id,report_type) do update set version=
    case when excluded.version>maintenance_report_draft_versions.version then excluded.version else maintenance_report_draft_versions.version end;
