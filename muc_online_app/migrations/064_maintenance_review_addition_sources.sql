-- Immutable provenance, intentionally retained when mutable work is removed.
create table if not exists maintenance_review_addition_sources(
 flight_id text not null,
 client_id text not null,
 subtask_id text not null unique,
 source_kind text not null check(source_kind in ('REVIEW_ADDITION','ARCHIVE_ADDITION')),
 anonymous integer not null check(anonymous in (0,1)),
 payload_sha256 text not null check(length(payload_sha256)=64),
 snapshot_json text not null,
 created_by text not null,
 created_at text not null,
 primary key(flight_id,client_id)
);
