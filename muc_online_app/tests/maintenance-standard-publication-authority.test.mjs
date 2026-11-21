import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {standardPublicationAuthorized,standardPublicationApplicability} from '../maintenance-standard-publication-authority.mjs';
import {RBAC_ROLE_DEFINITIONS,RBAC_PERMISSION_DEPENDENCIES,permissionDependencyErrors} from '../rbac-policy.mjs';
test('publishing is separately granted and never follows draft management, finalization or system-wide implicit permission',t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec(`create table users(id text,person_id text,status text);create table personnel(id text,data_status text,employment_status text);create table rbac_user_roles(user_id text,role_id text);create table rbac_roles(id text,code text,status text);create table rbac_role_permissions(role_id text,permission_id text);create table rbac_permissions(id text,code text);
    insert into users values('actor','person','active');insert into personnel values('person','active','在职');insert into rbac_roles values('super','system_admin','active'),('publisher','addon_maintenance_standard_publisher','active');insert into rbac_permissions values('publish','maintenance.standard.publish');insert into rbac_role_permissions values('super','publish'),('publisher','publish');insert into rbac_user_roles values('actor','super');`);
  let full=true;const user={id:'actor',personId:'person',status:'active'},authorized=()=>standardPublicationAuthorized({db,hasAll:()=>full},user);assert.equal(authorized(),false);db.exec("insert into rbac_user_roles values('actor','publisher')");assert.equal(authorized(),true);
  full=false;assert.equal(authorized(),false);full=true;db.exec("update rbac_roles set status='inactive' where id='publisher'");assert.equal(authorized(),false);db.exec("update rbac_roles set status='active' where id='publisher'");
  db.exec("update personnel set employment_status='停职'");assert.equal(authorized(),false);db.exec("update personnel set employment_status='在职'");user.personId='other';assert.equal(authorized(),false);user.personId='person';db.exec("delete from rbac_role_permissions where role_id='publisher'");assert.equal(authorized(),false);
  assert.ok(RBAC_ROLE_DEFINITIONS.addon_maintenance_standard_publisher.includes('maintenance.standard.publish'));for(const code of ['worker','manager','dispatcher','addon_maintenance_standard_manager','addon_nonroutine_review_finalizer'])assert.ok(!RBAC_ROLE_DEFINITIONS[code].includes('maintenance.standard.publish'));
  assert.deepEqual(permissionDependencyErrors(RBAC_ROLE_DEFINITIONS.addon_maintenance_standard_publisher),[]);assert.deepEqual(RBAC_PERMISSION_DEPENDENCIES['maintenance.standard.publish'],['maintenance.view','maintenance.standard.view']);
});
test('publication aircraft check uses current exact registered codes, refuses aliases/disabled/ambiguous scope and captures dictionary version',()=>{
  const aircraft={aircraftCodes:['A320'],genericAircraft:false},config={version:2,groups:[{id:'airbus',codes:['A320','A321'],enabled:true}]};
  const check=standardPublicationApplicability(aircraft,config);assert.equal(check.ready,true);assert.equal(check.reference,'maintenance_aircraft_hours_v1:2');assert.deepEqual(check.groups,[{code:'A320',groupId:'airbus'}]);assert.equal(check.genericAircraft,false);
  for(const candidate of [{aircraftCodes:['A319'],genericAircraft:false},{aircraftCodes:['a320'],genericAircraft:false},{aircraftCodes:['A320','A320'],genericAircraft:false}])assert.equal(standardPublicationApplicability(candidate,config).ready,false);
  for(const altered of [{version:0,groups:config.groups},{...config,groups:[{...config.groups[0],enabled:false}]},{...config,groups:[...config.groups,{id:'duplicate',codes:['A320']}]}])assert.equal(standardPublicationApplicability(aircraft,altered).ready,false);
});

test('generic scope is eligible only as an explicit separately approved scope',()=>{const result=standardPublicationApplicability({aircraftCodes:[],genericAircraft:true},null);assert.equal(result.ready,true);assert.equal(result.requiresExplicitGenericApproval,true);assert.equal(standardPublicationApplicability({aircraftCodes:['A320'],genericAircraft:true},null).ready,false);});
