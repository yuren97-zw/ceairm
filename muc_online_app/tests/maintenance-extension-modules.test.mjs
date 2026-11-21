import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readMaintenanceModuleIdentity,readPersistedMaintenanceReportModules} from '../maintenance-module-instances.mjs';
import {createMaintenanceExtensionModules} from '../maintenance-extension-modules.mjs';
import {evaluateMaintenanceTransition} from '../maintenance-opportunity-modules.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("pragma foreign_keys=on;create table maintenance_flights(id text primary key,status text,archived_at text);insert into maintenance_flights values('opportunity','已派工',null),('legacy','已派工',null)");db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);
 const identity=createMaintenanceModuleInstances({db,opportunityId:'opportunity',actorId:'creator',stamp:'t'});let broken=false;const events=[];
 const service=createMaintenanceExtensionModules({db,readIdentity:readMaintenanceModuleIdentity,authorize:user=>user?.allowed===true,clock:()=> 't',audit(_user,event){if(broken)throw Error('audit failure');events.push(event);},transaction(fn){db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}}});
 const payload={moduleTypeCode:'extension_check',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'first',expectedRuleSnapshot:identity.ruleSnapshotSha256,reason:'Explicit internal non-settlement registration'};
 return {db,service,payload,identity,user:{allowed:true},events,fail:()=>broken=true};
}
test('registered non-settlement instances coexist with frozen core identities without advancing opportunity status',t=>{
 const f=fixture(t),result=f.service.register('opportunity',f.payload,f.user);assert.equal(result.module.resultType,'CHECK_RESULT');assert.equal(result.module.completionAvailable,false);assert.equal(result.module.resultSource,null);assert.equal(f.events.length,1);
 const identity=readMaintenanceModuleIdentity(f.db,'opportunity');assert.equal(identity.instances.length,4);assert.equal(identity.ruleSnapshotSha256,f.identity.ruleSnapshotSha256);assert.equal(identity.extensions.length,1);
 const modules=readPersistedMaintenanceReportModules(f.db,'opportunity',{batches:{},hasRoutine:false,hasFormalNonroutine:false,hasNonroutineDraft:false});assert.equal(modules.length,4);assert.equal(evaluateMaintenanceTransition({modules,currentStatus:'已派工',hasAssignments:true},'RECONCILE').targetStatus,'已派工');
 assert.equal(f.service.register('opportunity',f.payload,f.user).replayed,true);assert.equal(f.events.length,1);
 assert.notEqual(f.service.register('opportunity',{...f.payload,instanceKey:'second'},f.user).module.moduleInstanceId,result.module.moduleInstanceId);
});
test('authority, snapshot, immutable version and financial payload guards precede writes',t=>{
 const f=fixture(t);assert.throws(()=>f.service.register('opportunity',f.payload,{}),{status:403});assert.throws(()=>f.service.register('legacy',f.payload,f.user),{status:409});assert.throws(()=>f.service.register('opportunity',{...f.payload,expectedRuleSnapshot:'stale'},f.user),{status:409});
 for(const change of [{resultType:'HOUR'},{hours:0},{requiredBeforeConfirmation:true},{moduleTypeCode:'release_report'}])assert.throws(()=>f.service.register('opportunity',{...f.payload,...change},f.user),{status:409});
 f.service.register('opportunity',f.payload,f.user);assert.throws(()=>f.service.register('opportunity',{...f.payload,resultType:'APPROVAL_RESULT'},f.user),{status:409});
 f.db.exec("update maintenance_flights set status='已确认'");assert.throws(()=>f.service.register('opportunity',{...f.payload,instanceKey:'new'},f.user),{status:409});assert.equal(f.service.register('opportunity',f.payload,f.user).replayed,true);
});
test('failed audit rolls back both definition and instance and does not create or backfill other opportunities',t=>{
 const f=fixture(t);f.fail();assert.throws(()=>f.service.register('opportunity',f.payload,f.user),/audit failure/);assert.equal(f.db.prepare('select count(*) n from maintenance_module_instances').get().n,3);assert.equal(f.db.prepare('select count(*) n from maintenance_module_definitions').get().n,3);assert.equal(readMaintenanceModuleIdentity(f.db,'legacy'),null);
});
