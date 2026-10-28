insert into maintenance_work_locations(id,name,status,created_at,updated_at)
values ('maintenance-location-qingdao','青岛','active',current_timestamp::text,current_timestamp::text)
on conflict(id) do nothing;

update maintenance_flights
set location_id='maintenance-location-qingdao', location_name_snapshot='青岛'
where location_id is null or trim(location_id)='';
