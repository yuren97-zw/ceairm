-- Standard maintenance intake only; no opportunity, review, publication or hours.
create table if not exists maintenance_standard_import_batches(
 id text primary key,created_by text not null,filename text not null,file_sha256 text not null,sheet_name text not null,
 revision integer not null default 1,created_at text not null,updated_at text not null
);
create table if not exists maintenance_standard_import_rows(
 batch_id text not null references maintenance_standard_import_batches(id),row_number integer not null,
 original_json text not null,source_key text not null,primary key(batch_id,row_number)
);
create table if not exists maintenance_standard_import_sources(
 source_key text primary key,batch_id text not null,row_number integer not null,
 standard_id text not null references maintenance_standards(id),version_id text not null references maintenance_standard_versions(id),
 action text not null check(action in ('CREATE_DRAFT','UPDATE_DRAFT')),actor_id text not null,reason text not null,distinct_reason text not null,
 snapshot_json text not null,created_at text not null,
 foreign key(batch_id,row_number) references maintenance_standard_import_rows(batch_id,row_number)
);
create table if not exists maintenance_standard_import_attempts(
 batch_id text not null references maintenance_standard_import_batches(id),request_id text not null,request_hash text not null,request_json text not null,
 result_json text not null,created_at text not null,primary key(batch_id,request_id)
);
