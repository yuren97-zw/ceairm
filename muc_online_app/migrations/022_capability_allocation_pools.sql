-- Independent work placement; never change personnel/administrative organization.
alter table capability_current_states add column if not exists allocation_pool text
  check(allocation_pool is null or allocation_pool in ('SPECIAL','WAITING'));
update capability_current_states set allocation_pool=case when person_id in
  (select p.id from personnel p join organization_units g on g.id=p.personnel_group_id
   where g.code='GROUP-LINE-SPECIAL') then 'SPECIAL' else 'WAITING' end
where allocation_pool is null;
