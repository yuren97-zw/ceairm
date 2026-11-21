-- Only changes actually observed by the original rules API are recorded.
create table if not exists maintenance_rule_change_history(
 id text primary key,revision integer not null unique check(revision>0),
 before_json text not null,after_json text not null,
 before_sha256 text not null check(length(before_sha256)=64),after_sha256 text not null check(length(after_sha256)=64),
 continuity text not null check(continuity in ('FIRST_OBSERVATION','CONTIGUOUS','UNJOURNALED_GAP')),
 write_mode text not null check(write_mode in ('VERSIONED','LEGACY_UNVERSIONED')),
 actor_id text not null,qualification_json text not null,reason text,created_at text not null
);
