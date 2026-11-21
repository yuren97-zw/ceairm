-- Core report identities and frozen rule metadata; original services own status and results.
create table if not exists maintenance_module_definitions(
 module_code text not null,module_version integer not null check(module_version>0),
 definition_json text not null,content_sha256 text not null,created_at text not null,
 primary key(module_code,module_version)
);
create table if not exists maintenance_gate_rule_versions(
 id text primary key,rules_json text not null,content_sha256 text not null,created_at text not null
);
create table if not exists maintenance_opportunity_rule_snapshots(
 opportunity_key text primary key,opportunity_id text unique references maintenance_flights(id) on delete set null,
 gate_rule_version text not null references maintenance_gate_rule_versions(id),
 snapshot_json text not null,content_sha256 text not null,created_by text not null,created_at text not null
);
create table if not exists maintenance_module_instances(
 id text primary key,opportunity_key text not null references maintenance_opportunity_rule_snapshots(opportunity_key),
 opportunity_id text references maintenance_flights(id) on delete set null,
 module_code text not null,module_version integer not null,instance_key text not null,
 gate_rule_version text not null references maintenance_gate_rule_versions(id),created_at text not null,
 foreign key(module_code,module_version) references maintenance_module_definitions(module_code,module_version),
 unique(opportunity_key,module_code,module_version,instance_key)
);
create index if not exists maintenance_module_instances_opportunity on maintenance_module_instances(opportunity_id);
