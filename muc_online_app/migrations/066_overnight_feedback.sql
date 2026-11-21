-- V10.1 §19.4.5 / P0-57: one overnight-check FACT linked to many opportunities via a relation
-- table (no duplicated/conflicting check copies). Sample module only: CHECK_RESULT contract,
-- never writes hours or sorties; mounting on production opportunities needs explicit authority.
create table if not exists maintenance_overnight_facts(
  id text primary key,
  client_id text not null unique,
  checked_at text not null,
  station text not null,
  summary text not null,
  evidence_ref text,
  applicability_basis text not null,
  inspector_account_id text not null,
  created_by text not null,
  created_at text not null
);
create table if not exists maintenance_overnight_fact_opportunities(
  fact_id text not null references maintenance_overnight_facts(id),
  opportunity_id text not null,
  linked_by text not null,
  created_at text not null,
  primary key(fact_id,opportunity_id)
);
create index if not exists maintenance_overnight_fact_opportunity on maintenance_overnight_fact_opportunities(opportunity_id);
