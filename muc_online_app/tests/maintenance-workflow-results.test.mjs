import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readMaintenanceModuleIdentity,readPersistedMaintenanceReportModules} from '../maintenance-module-instances.mjs';
import {createMaintenanceExtensionModules} from '../maintenance-extension-modules.mjs';
import {MAINTENANCE_WORKFLOW_TASKS_SCHEMA} from '../maintenance-workflow-tasks.mjs';
import {createMaintenanceWorkflowActions} from '../maintenance-workflow-actions.mjs';
import {resolveMaintenanceWorkflowTemplate} from '../maintenance-workflow-templates.mjs';
import {readMaintenanceWorkflowCompletion} from '../maintenance-workflow-results.mjs';
import {evaluateMaintenanceTransition} from '../maintenance-opportunity-modules.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("pragma foreign_keys=on;create table maintenance_flights(id text primary key,status text,archived_at text);insert into maintenance_flights values('flight','已派工',null)");db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);db.exec(MAINTENANCE_WORKFLOW_TASKS_SCHEMA);
 const transaction=fn=>{db.exec('begin immediate');try{const value=fn();db.exec('commit');return value;}catch(error){db.exec('rollback');throw error;}};
 const identity=createMaintenanceModuleInstances({db,opportunityId:'flight',actorId:'manager',stamp:'t'}),registry=createMaintenanceExtensionModules({db,transaction,readIdentity:readMaintenanceModuleIdentity,authorize:()=>true,audit:()=>{},clock:()=> 't'}),input={moduleTypeCode:'extension_workflow_simulation',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'simulation',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Explicit simulation fixture'};
 const module=registry.register('flight',input,{}).module;let active=true;
 const qualified=accountId=>active?{accountId,personId:'person-'+accountId,permissions:['maintenance.view','maintenance.workflow.view',accountId==='manager'?'maintenance.workflow.manage':'maintenance.workflow.submit'],scopes:[{module:'maintenance',scopeType:accountId==='manager'?'all':'self',scopeId:''}]}:null;
 const actions=createMaintenanceWorkflowActions({db,transaction,authorize:user=>qualified(user),qualifyAssignee:qualified,resolveTemplate:(code,version,{module})=>resolveMaintenanceWorkflowTemplate(code,version,module,true),audit:()=>{},clock:()=> 't'});
 const create=()=>actions.create(module.moduleInstanceId,{clientId:'fixture-create',expectedRuleSnapshot:identity.ruleSnapshotSha256,templateCode:'nonsettlement_simulation',templateVersion:1,assignments:[{taskKey:'feedback',accountId:'worker'}],reason:'Explicit simulation fixture'},'manager');
 const request=(workflow,clientId,revision)=>({clientId,expectedRevision:revision,taskId:db.prepare('select id from maintenance_workflow_tasks where workflow_id=?').get(workflow.workflowId).id,expectedTaskRevision:revision});
 const submit=()=>{const workflow=create();actions.claim(workflow.workflowId,request(workflow,'fixture-claim',1),'worker');const body={...request(workflow,'fixture-submit',2),result:{type:'CHECK_RESULT',outcome:'FAIL',note:'Private finding'}};actions.submit(workflow.workflowId,body,'worker');return {workflow,body};};
 const read=()=>readMaintenanceWorkflowCompletion(db,module,identity.ruleSnapshotSha256);
 return {db,identity,module,actions,registry,input,create,request,submit,read,revoke:()=>active=false};
}
test('only an audited real submission establishes completion; abnormal feedback never becomes unsubmitted',t=>{
 const f=fixture(t);assert.deepEqual(f.read(),{available:true,complete:false,state:'NOT_STARTED',resultSource:null,error:null});const {workflow}=f.submit(),fact=f.read();assert.equal(fact.available,true);assert.equal(fact.complete,true);assert.deepEqual(fact.resultSource,{type:'CHECK_RESULT',sourceId:workflow.workflowId,sourceVersion:3});assert.equal(JSON.stringify(fact).includes('Private finding'),false);assert.equal(JSON.stringify(fact).includes('person-worker'),false);
 const modules=readPersistedMaintenanceReportModules(f.db,'flight',{batches:{},hasRoutine:false,hasFormalNonroutine:false,hasNonroutineDraft:false}),projected=modules.find(item=>item.moduleInstanceId===f.module.moduleInstanceId);assert.equal(projected.moduleBusinessState,'SUBMITTED');assert.equal(projected.countsAsFormalReportSubmission,false);assert.equal(projected.requiredBeforePendingReview,false);assert.equal(projected.requiredBeforeConfirmation,false);assert.equal(evaluateMaintenanceTransition({modules,currentStatus:'已派工',hasAssignments:true},'RECONCILE').targetStatus,'已派工');assert.equal(f.db.prepare('select status from maintenance_flights').get().status,'已派工');assert.equal(readMaintenanceModuleIdentity(f.db,'flight').ruleSnapshotSha256,f.identity.ruleSnapshotSha256);
});
test('later authority changes do not erase qualified historical completion facts',t=>{const f=fixture(t),{workflow,body}=f.submit();f.revoke();assert.equal(f.read().complete,true);assert.throws(()=>f.actions.submit(workflow.workflowId,body,'worker'),{status:403});});
test('state-only completion and missing audit history cannot publish a result reference',t=>{
 const f=fixture(t),w=f.create();f.db.prepare("update maintenance_workflow_instances set state='COMPLETED' where id=?").run(w.workflowId);assert.equal(f.read().error,'WORKFLOW_SOURCE_INVALID');f.db.prepare("update maintenance_workflow_instances set state='OPEN' where id=?").run(w.workflowId);assert.equal(f.read().state,'OPEN');f.db.exec('delete from maintenance_workflow_events');assert.equal(f.read().resultSource,null);assert.equal(f.read().available,false);
});
test('tampered results, zero financial fields, request hashes, ownership and template bytes are rejected',t=>{
 const f=fixture(t);f.submit();const task=f.db.prepare('select * from maintenance_workflow_tasks').get(),event=f.db.prepare("select * from maintenance_workflow_events where event_type='SUBMIT'").get();
 for(const value of [{type:'HOUR',outcome:'FAIL'},{type:'CHECK_RESULT',outcome:'PASS',note:'Private finding'},{type:'CHECK_RESULT',outcome:'FAIL',note:'Private finding',hours:0}]){f.db.prepare('update maintenance_workflow_tasks set result_json=?').run(JSON.stringify(value));assert.equal(f.read().error,'WORKFLOW_SOURCE_INVALID');}f.db.prepare('update maintenance_workflow_tasks set result_json=?').run(task.result_json);assert.equal(f.read().complete,true);
 f.db.prepare('update maintenance_workflow_events set request_hash=? where id=?').run('forged',event.id);assert.equal(f.read().complete,false);f.db.prepare('update maintenance_workflow_events set request_hash=? where id=?').run(event.request_hash,event.id);
 f.db.exec("update maintenance_workflow_tasks set account_id='foreign'");assert.equal(f.read().complete,false);f.db.prepare('update maintenance_workflow_tasks set account_id=?').run(task.account_id);
 f.db.exec("update maintenance_workflow_instances set template_sha256='forged'");assert.equal(f.read().available,false);
});
test('cancellation is observable but does not manufacture completion or a zero-valued result',t=>{
 const f=fixture(t),workflow=f.create();f.actions.cancel(workflow.workflowId,{clientId:'fixture-cancel',expectedRevision:1,reason:'Explicit cancellation'},'manager');assert.equal(f.read().available,true);assert.equal(f.read().state,'CANCELLED');assert.equal(f.read().complete,false);assert.equal(f.read().resultSource,null);
});
test('source references cannot be moved to another registered module instance',t=>{
 const f=fixture(t);f.submit();const other=f.registry.register('flight',{...f.input,instanceKey:'other'},{}).module;f.db.prepare('update maintenance_workflow_instances set module_instance_id=?').run(other.moduleInstanceId);assert.equal(f.read().state,'NOT_STARTED');assert.equal(readMaintenanceWorkflowCompletion(f.db,other,f.identity.ruleSnapshotSha256).error,'WORKFLOW_SOURCE_INVALID');
});
