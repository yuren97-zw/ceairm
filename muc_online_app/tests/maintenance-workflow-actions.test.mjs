import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readMaintenanceModuleIdentity} from '../maintenance-module-instances.mjs';
import {createMaintenanceExtensionModules} from '../maintenance-extension-modules.mjs';
import {MAINTENANCE_WORKFLOW_TASKS_SCHEMA} from '../maintenance-workflow-tasks.mjs';
import {createMaintenanceWorkflowActions} from '../maintenance-workflow-actions.mjs';

function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec("pragma foreign_keys=on;create table maintenance_flights(id text primary key,status text,archived_at text);insert into maintenance_flights values('flight','已派工',null);create table audit(id text primary key,detail text)");
 db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);db.exec(MAINTENANCE_WORKFLOW_TASKS_SCHEMA);
 const transaction=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
 const identity=createMaintenanceModuleInstances({db,opportunityId:'flight',actorId:'manager',stamp:'t'});
 const registration=createMaintenanceExtensionModules({db,transaction,readIdentity:readMaintenanceModuleIdentity,authorize:()=>true,audit:()=>{},clock:()=> 't'}).register('flight',{moduleTypeCode:'extension_check',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'inspection',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Isolated test contract'},{});
 const active=new Map([['manager','pm'],['worker','pw'],['second','ps']]);
 let broken=false,resolves=0;
 const approved={code:'test_only',version:1,resultType:'CHECK_RESULT',tasks:[{key:'first',title:'First'},{key:'second',title:'Second'}],outcomes:['PASS','FAIL']};
 const service=createMaintenanceWorkflowActions({db,transaction,clock:()=> 't',resolveTemplate(code,version){resolves++;assert.equal(code,approved.code);assert.equal(version,approved.version);return approved;},qualifyAssignee(accountId){const personId=active.get(accountId);return personId?{accountId,personId}:null;},authorize(user,{action}){if(!active.has(user)||(['CREATE','REASSIGN','CANCEL'].includes(action)&&user!=='manager'))return null;return {accountId:user,personId:active.get(user),scope:'test-only'};},audit(_user,event){if(broken)throw Error('audit failed');db.prepare('insert into audit values(?,?)').run(event.id,JSON.stringify(event));}});
 const payload={clientId:'create-001',expectedRuleSnapshot:identity.ruleSnapshotSha256,templateCode:'test_only',templateVersion:1,assignments:[{taskKey:'first',accountId:'worker'},{taskKey:'second',accountId:'second'}],reason:'Explicit test workflow'};
 const create=()=>service.create(registration.module.moduleInstanceId,payload,'manager');
 const task=key=>db.prepare('select * from maintenance_workflow_tasks where task_key=?').get(key);
 const request=(key,clientId,extra={})=>({clientId,expectedRevision:Number(db.prepare('select revision from maintenance_workflow_instances').get().revision),taskId:task(key).id,expectedTaskRevision:Number(task(key).revision),...extra});
 const fingerprint=()=>JSON.stringify(['maintenance_workflow_instances','maintenance_workflow_tasks','maintenance_workflow_events','audit'].map(table=>db.prepare(`select * from ${table} order by id`).all()));
 return {db,service,payload,create,task,request,fingerprint,active,approved,moduleId:registration.module.moduleInstanceId,resolves:()=>resolves,breakAudit:()=>broken=true};
}

test('workflow claims and submits frozen typed findings without advancing the original opportunity',t=>{
 const f=fixture(t),created=f.create();assert.equal(created.state,'OPEN');
 f.service.claim(created.workflowId,f.request('first','claim-001'),'worker');
 // A newly published template must not change this in-flight workflow.
 f.approved.outcomes=['PASS'];
 const first=f.service.submit(created.workflowId,f.request('first','submit-01',{result:{type:'CHECK_RESULT',outcome:'FAIL',note:'Finding retained'}}),'worker');
 assert.equal(first.taskState,'SUBMITTED');assert.equal(first.state,'OPEN');assert.equal(JSON.parse(f.task('first').result_json).outcome,'FAIL');
 f.service.claim(created.workflowId,f.request('second','claim-002'),'second');
 const lastRequest=f.request('second','submit-02',{result:{type:'CHECK_RESULT',outcome:'PASS'}});
 const last=f.service.submit(created.workflowId,lastRequest,'second');assert.equal(last.state,'COMPLETED');
 assert.equal(f.service.submit(created.workflowId,lastRequest,'second').replayed,true);assert.equal(f.resolves(),1);
 assert.equal(f.db.prepare('select status from maintenance_flights').get().status,'已派工');
 assert.equal(f.db.prepare("select count(*) n from sqlite_master where name like '%ledger%'").get().n,0);
});
test('exact retries are stable, changed request keys conflict and revoked authority cannot replay',t=>{
 const f=fixture(t),created=f.create(),before=f.fingerprint();
 assert.equal(f.create().workflowId,created.workflowId);assert.equal(f.create().replayed,true);assert.equal(f.fingerprint(),before);
 assert.throws(()=>f.service.create(f.moduleId,{...f.payload,reason:'different'},'manager'),{status:409});
 f.active.delete('manager');assert.throws(()=>f.create(),{status:403});assert.equal(f.fingerprint(),before);
});
test('creation rejects stale identity, invalid assignment, foreign module and financial fields atomically',t=>{
 const f=fixture(t),before=f.fingerprint();
 for(const change of [{expectedRuleSnapshot:'stale'},{hours:0},{clientId:undefined},{assignments:[]},{assignments:[{taskKey:'first',accountId:'missing'},{taskKey:'second',accountId:'second'}]}])assert.throws(()=>f.service.create(f.moduleId,{...f.payload,...change},'manager'));
 assert.throws(()=>f.service.create('unknown',f.payload,'manager'),{status:404});
 assert.equal(f.fingerprint(),before);
});
test('task ownership, current person binding and optimistic revisions guard all changes',t=>{
 const f=fixture(t),created=f.create(),request=f.request('first','claim-001'),before=f.fingerprint();
 assert.throws(()=>f.service.claim(created.workflowId,request,'second'),{status:403});
 f.active.set('worker','new-person');assert.throws(()=>f.service.claim(created.workflowId,request,'worker'),{status:403});f.active.set('worker','pw');
 assert.throws(()=>f.service.claim(created.workflowId,{...request,expectedTaskRevision:0},'worker'),{status:409});
 assert.equal(f.fingerprint(),before);f.service.claim(created.workflowId,request,'worker');
 assert.throws(()=>f.service.claim(created.workflowId,{...request,clientId:'claim-003'},'worker'),{status:409});
 f.active.delete('worker');assert.throws(()=>f.service.claim(created.workflowId,request,'worker'),{status:403});
});
test('reassignment retains history, requires a new claim and prevents prior assignee submission',t=>{
 const f=fixture(t),created=f.create();f.service.claim(created.workflowId,f.request('first','claim-001'),'worker');
 f.service.reassign(created.workflowId,f.request('first','change-01',{accountId:'second',reason:'Explicit transfer'}),'manager');
 assert.equal(f.task('first').state,'ASSIGNED');assert.equal(f.task('first').person_id,'ps');
 const request=f.request('first','submit-01',{result:{type:'CHECK_RESULT',outcome:'PASS'}});
 assert.throws(()=>f.service.submit(created.workflowId,request,'worker'),{status:403});assert.throws(()=>f.service.submit(created.workflowId,request,'second'),{status:409});
 const event=JSON.parse(f.db.prepare("select detail_json from maintenance_workflow_events where event_type='REASSIGN'").get().detail_json);assert.equal(event.before.accountId,'worker');
 f.service.claim(created.workflowId,f.request('first','claim-002'),'second');f.service.submit(created.workflowId,f.request('first','submit-02',{result:{type:'CHECK_RESULT',outcome:'FAIL'}}),'second');
 assert.throws(()=>f.service.reassign(created.workflowId,f.request('first','change-02',{accountId:'worker',reason:'Cannot erase'}),'manager'),{status:409});
});
test('result whitelist rejects zero financial payloads and incorrect result types without mutations',t=>{
 const f=fixture(t),created=f.create();f.service.claim(created.workflowId,f.request('first','claim-001'),'worker');const before=f.fingerprint();
 for(const result of [{type:'HOUR',outcome:'PASS'},{type:'CHECK_RESULT',outcome:'UNKNOWN'},{type:'CHECK_RESULT',outcome:'PASS',hours:0},{type:'CHECK_RESULT',outcome:'PASS',ledgerEntryId:'forged'}])assert.throws(()=>f.service.submit(created.workflowId,f.request('first','submit-01',{result}),'worker'),{status:409});
 assert.equal(f.fingerprint(),before);
});
test('cancellation preserves submitted findings and closes only remaining work',t=>{
 const f=fixture(t),created=f.create();f.service.claim(created.workflowId,f.request('first','claim-001'),'worker');f.service.submit(created.workflowId,f.request('first','submit-01',{result:{type:'CHECK_RESULT',outcome:'FAIL'}}),'worker');
 const submitted={...f.task('first')};const request={clientId:'cancel-01',expectedRevision:3,reason:'Explicit cancellation'};
 assert.equal(f.service.cancel(created.workflowId,request,'manager').state,'CANCELLED');assert.deepEqual({...f.task('first')},submitted);assert.equal(f.task('second').state,'CANCELLED');
 assert.equal(f.service.cancel(created.workflowId,request,'manager').replayed,true);
 assert.throws(()=>f.service.claim(created.workflowId,f.request('second','claim-002'),'second'),{status:409});
});
test('audit failure rolls back creation and later task changes with their event receipts',t=>{
 const f=fixture(t),before=f.fingerprint();f.breakAudit();assert.throws(()=>f.create(),/audit failed/);assert.equal(f.fingerprint(),before);
 const other=fixture(t),created=other.create(),after=other.fingerprint();other.breakAudit();assert.throws(()=>other.service.claim(created.workflowId,other.request('first','claim-001'),'worker'),/audit failed/);assert.equal(other.fingerprint(),after);
});
test('confirmed opportunities and tampered template snapshots cannot accept new actions',t=>{
 const f=fixture(t),created=f.create();f.db.exec("update maintenance_flights set status='已确认'");assert.throws(()=>f.service.claim(created.workflowId,f.request('first','claim-001'),'worker'),{status:409});
 assert.equal(f.create().replayed,true);f.db.exec("update maintenance_flights set status='已派工';update maintenance_workflow_instances set template_sha256='tampered'");
 assert.throws(()=>f.service.claim(created.workflowId,f.request('first','claim-001'),'worker'),{status:409});
});
