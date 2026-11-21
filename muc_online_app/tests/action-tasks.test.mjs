import test from 'node:test';import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';import {createOffsetRegister} from '../attendance-offset-register.mjs';import {createActionTaskService} from '../action-task-service.mjs';
test('task index isolates users, deduplicates and checks source authority; read is not completion',()=>{
 const db=new DatabaseSync(':memory:');createOffsetRegister({db});let authorized=true;
 const service=createActionTaskService({db,canAct:()=>authorized});
 const item={sourceModule:'attendance',sourceType:'offset_approval',sourceId:'one',assigneeUserId:'leader',title:'审批'};
 service.upsert(item);service.upsert(item);assert.equal(service.count({id:'leader'}).count,1);assert.equal(service.count({id:'other'}).count,0);
 assert.equal(service.list({id:'leader'}).items.length,1);assert.equal(service.count({id:'leader'}).count,1);
 authorized=false;assert.equal(service.count({id:'leader'}).count,0);authorized=true;
 service.close('one');assert.equal(service.count({id:'leader'}).count,0);service.upsert(item);assert.equal(service.count({id:'leader'}).count,0);
 assert.throws(()=>service.count({}),{status:401});db.close();
});

test('future registered source uses the same task contract without creating a handover workflow',()=>{
 const db=new DatabaseSync(':memory:');createOffsetRegister({db});const service=createActionTaskService({db,canAct:()=>true,sources:{'test:confirm':{action:'confirm',module:'test',routeAction:'confirm'}}});
 service.upsert({sourceModule:'test',sourceType:'confirm',sourceId:'fixture',assigneeUserId:'user',title:'未来来源适配测试'});assert.equal(service.count({id:'user'}).count,1);assert.equal(service.list({id:'user'}).items[0].target.action,'confirm');service.close('fixture','completed',{sourceModule:'test',sourceType:'confirm'});assert.equal(service.count({id:'user'}).count,0);db.close();
});
