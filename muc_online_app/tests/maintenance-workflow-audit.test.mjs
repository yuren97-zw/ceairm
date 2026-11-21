import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readMaintenanceModuleIdentity} from '../maintenance-module-instances.mjs';
import {createMaintenanceExtensionModules} from '../maintenance-extension-modules.mjs';
import {MAINTENANCE_WORKFLOW_TASKS_SCHEMA} from '../maintenance-workflow-tasks.mjs';
import {createMaintenanceWorkflowActions} from '../maintenance-workflow-actions.mjs';
import {resolveMaintenanceWorkflowTemplate} from '../maintenance-workflow-templates.mjs';
import {readMaintenanceWorkflowAudit} from '../maintenance-workflow-audit.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("pragma foreign_keys=on;create table maintenance_flights(id text primary key,status text,archived_at text);insert into maintenance_flights values('flight','已派工',null);create table personnel(id text primary key,name text,employee_no text);insert into personnel values('person-manager','Private Manager','10000000'),('person-worker','First worker','10000001'),('person-other','Second worker','10000002')");db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);db.exec(MAINTENANCE_WORKFLOW_TASKS_SCHEMA);
 const transaction=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}};
 const identity=createMaintenanceModuleInstances({db,opportunityId:'flight',actorId:'manager',stamp:'t'}),module=createMaintenanceExtensionModules({db,transaction,readIdentity:readMaintenanceModuleIdentity,authorize:()=>true,audit:()=>{},clock:()=> 't'}).register('flight',{moduleTypeCode:'extension_workflow_simulation',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'audit',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Explicit simulation'},{}).module;
 const qualify=accountId=>({accountId,personId:'person-'+accountId,permissions:['maintenance.view','maintenance.workflow.view',accountId==='manager'?'maintenance.workflow.manage':'maintenance.workflow.submit'],scopes:[{module:'maintenance',scopeType:accountId==='manager'?'all':'self',scopeId:''}]});
 const service=createMaintenanceWorkflowActions({db,transaction,authorize:qualify,qualifyAssignee:qualify,resolveTemplate:(code,version,{module})=>resolveMaintenanceWorkflowTemplate(code,version,module,true),audit:()=>{},clock:()=> 't'}),created=service.create(module.moduleInstanceId,{clientId:'audit-create',expectedRuleSnapshot:identity.ruleSnapshotSha256,templateCode:'nonsettlement_simulation',templateVersion:1,assignments:[{taskKey:'feedback',accountId:'worker'}],reason:'secret-manager-basis'},'manager'),taskId=db.prepare('select id from maintenance_workflow_tasks').get().id;
 const request=(clientId,revision)=>({clientId,expectedRevision:revision,taskId,expectedTaskRevision:revision});
 const read=(actor='manager',query={},manage=actor==='manager')=>readMaintenanceWorkflowAudit({db,workflow:db.prepare('select * from maintenance_workflow_instances').get(),module,ruleSnapshot:identity.ruleSnapshotSha256,actor:qualify(actor),manage},query);
 return {db,service,workflowId:created.workflowId,taskId,request,read};
}
test('audit gives managers recorded basis and current personnel labels while participant history omits others and private payloads',t=>{
 const f=fixture(t);f.service.claim(f.workflowId,f.request('audit-claim',1),'worker');f.service.submit(f.workflowId,{...f.request('audit-submit',2),result:{type:'CHECK_RESULT',outcome:'FAIL',note:'private-feedback-note'}},'worker');
 const manager=f.read(),worker=f.read('worker');assert.equal(manager.sourceIntegrity,'VERIFIED');assert.equal(manager.events.length,3);assert.equal(manager.events[0].reason,'secret-manager-basis');assert.equal(manager.events[0].actor.person.name,'Private Manager');assert.equal(manager.events[0].actor.nameSource,'CURRENT_PERSONNEL');assert.equal(worker.events.length,3);assert.equal(worker.events[0].actor.label,'流程管理');
 for(const forbidden of ['Private Manager','secret-manager-basis','private-feedback-note','qualification_json','permissionSnapshot','request_hash','workflow.manage','person-manager'])assert.equal(JSON.stringify(worker).includes(forbidden),false,forbidden);
 assert.equal(JSON.stringify(manager).includes('private-feedback-note'),false);assert.throws(()=>f.read('other'),{status:404});assert.equal(f.read('worker',{},true).manage,false);
});
test('current task ownership hides earlier assignee activity and all management reasons from a new recipient',t=>{
 const f=fixture(t);f.service.claim(f.workflowId,f.request('audit-claim',1),'worker');f.service.reassign(f.workflowId,{...f.request('audit-transfer',2),accountId:'other',reason:'confidential-transfer-basis'},'manager');assert.throws(()=>f.read('worker'),{status:404});
 const other=f.read('other');assert.deepEqual(other.events.map(event=>event.eventType),['REASSIGN']);assert.equal(other.events[0].changes[0].stateBefore,null);assert.equal(other.events[0].changes[0].stateAfter,'ASSIGNED');assert.equal(JSON.stringify(other).includes('First worker'),false);assert.equal(JSON.stringify(other).includes('confidential-transfer-basis'),false);
 f.service.cancel(f.workflowId,{clientId:'audit-cancel',expectedRevision:3,reason:'private-cancel-basis'},'manager');assert.deepEqual(f.read('other').events.map(event=>event.eventType),['REASSIGN','CANCEL']);assert.equal(f.read('manager').events.length,4);
});
test('history pagination binds workflow revision and current visibility; reads never alter source records',t=>{
 const f=fixture(t),first=f.read('worker',{limit:1});assert.equal(first.nextCursor,null);f.service.claim(f.workflowId,f.request('audit-claim',1),'worker');const page=f.read('worker',{limit:1});assert.ok(page.nextCursor);const next=f.read('worker',{limit:1,cursor:page.nextCursor});assert.equal(next.events[0].eventType,'CLAIM');assert.equal(next.nextCursor,null);assert.throws(()=>f.read('manager',{cursor:page.nextCursor}),{status:409});
 f.service.submit(f.workflowId,{...f.request('audit-submit',2),result:{type:'CHECK_RESULT',outcome:'PASS'}},'worker');assert.throws(()=>f.read('worker',{cursor:page.nextCursor}),{status:409});assert.throws(()=>f.read('worker',{limit:0}),{status:409});
 const before=JSON.stringify(f.db.prepare('select * from maintenance_workflow_events order by id').all());f.read('worker');f.read('manager');assert.equal(JSON.stringify(f.db.prepare('select * from maintenance_workflow_events order by id').all()),before);
});
test('damaged history remains observable to a qualified manager without projecting raw malformed data',t=>{
 const f=fixture(t);f.db.exec("update maintenance_workflow_events set detail_json='not-json'");const manager=f.read();assert.equal(manager.sourceIntegrity,'UNVERIFIED');assert.equal(manager.events[0].eventType,'UNAVAILABLE');assert.equal(manager.events[0].verified,false);assert.equal(JSON.stringify(manager).includes('not-json'),false);assert.deepEqual(f.read('worker').events,[]);
});
