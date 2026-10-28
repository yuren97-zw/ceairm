create table if not exists maintenance_work_locations(
  id text primary key,
  name text not null unique,
  status text not null default 'active',
  created_at text not null,
  updated_at text not null
);
alter table maintenance_flights add column if not exists location_id text;
alter table maintenance_flights add column if not exists location_name_snapshot text;
insert into maintenance_work_locations(id,name,status,created_at,updated_at)
values ('maintenance-location-qingdao','青岛','active',current_timestamp::text,current_timestamp::text)
on conflict(id) do nothing;
insert into maintenance_work_locations(id,name,status,created_at,updated_at)
values ('maintenance-location-yanji','延吉','active',current_timestamp::text,current_timestamp::text)
on conflict(id) do nothing;
insert into maintenance_work_locations(id,name,status,created_at,updated_at)
values ('maintenance-location-shenyang','沈阳','active',current_timestamp::text,current_timestamp::text)
on conflict(id) do nothing;
