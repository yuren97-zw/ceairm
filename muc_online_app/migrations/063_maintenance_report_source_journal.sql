-- Observed persisted report sources only; no historical backfill.

create table if not exists maintenance_report_source_journal(
 id text primary key,batch_id text not null,batch_version integer not null check(batch_version>0),
 flight_id text not null,report_type text not null check(report_type in ('routine','release','nonroutine')),
 snapshot_json text not null,snapshot_sha256 text not null check(length(snapshot_sha256)=64),
 observation_mode text not null check(observation_mode in ('AT_WRITE','FIRST_OBSERVATION')),
 actor_id text not null,qualification_json text not null,reason text not null,observed_at text not null,
 unique(batch_id,batch_version)
);
