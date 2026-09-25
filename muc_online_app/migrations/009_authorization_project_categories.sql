alter table capability_catalog add column if not exists project_category text not null default '';
alter table capability_catalog add column if not exists category_source text not null default '';
alter table capability_catalog add column if not exists category_updated_by text not null default '';
alter table capability_catalog add column if not exists category_updated_at text not null default '';
alter table capability_catalog add column if not exists third_party_company text not null default '';

create index if not exists idx_capability_catalog_category on capability_catalog(project_category);
create index if not exists idx_capability_catalog_third_party_company on capability_catalog(third_party_company);
