import test from 'node:test';
import assert from 'node:assert/strict';
import {createMaintenanceResultDispatcher} from '../maintenance-result-dispatch.mjs';
import {MAINTENANCE_REPORT_DEFINITIONS} from '../maintenance-opportunity-modules.mjs';
test('fixed dispatch preserves original hour categories and release count service without invoking other domains',()=>{
 const calls=[],names=['ROUTINE_HOUR','NONROUTINE_HOUR','RELEASE_COUNT','CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT'];
 const dispatcher=createMaintenanceResultDispatcher(Object.fromEntries(names.map(name=>[name,(module,payload,user)=>{calls.push({name,module,payload,user});return 'original-service-result';}])));
 for(const definition of MAINTENANCE_REPORT_DEFINITIONS){const module={...definition,opportunityId:'flight',moduleInstanceId:JSON.stringify(['flight',definition.moduleTypeCode,definition.moduleVersion])},payload={originalBody:true},user={id:'actor'};assert.equal(dispatcher.submit(module,payload,user),'original-service-result');assert.equal(calls.at(-1).name,definition.resultType==='HOUR'?definition.category+'_HOUR':'RELEASE_COUNT');assert.equal(calls.at(-1).payload,payload);assert.equal(calls.at(-1).user,user);assert.throws(()=>dispatcher.submit({...module,resultType:'CHECK_RESULT'},payload,user),{status:409});assert.throws(()=>dispatcher.submit({...module,moduleInstanceId:'foreign'},payload,user),{status:409});}
 assert.deepEqual(calls.map(call=>call.name),['RELEASE_COUNT','ROUTINE_HOUR','NONROUTINE_HOUR']);
});
test('extension result types cannot select a financial service or unapproved gates',()=>{
 const calls=[],names=['ROUTINE_HOUR','NONROUTINE_HOUR','RELEASE_COUNT','CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT'],dispatcher=createMaintenanceResultDispatcher(Object.fromEntries(names.map(name=>[name,()=>calls.push(name)])));
 const module={opportunityId:'flight',moduleInstanceId:'persisted-extension',moduleTypeCode:'extension_fixture',moduleVersion:1,resultType:'CHECK_RESULT',countsAsFormalReportSubmission:false,requiredBeforePendingReview:false,requiredBeforeConfirmation:false};
 for(const type of names.slice(3)){dispatcher.submit({...module,resultType:type},{result:{type}},{});}
 for(const type of ['HOUR','RELEASE_COUNT'])assert.throws(()=>dispatcher.submit({...module,resultType:type},{result:{type}},{}),{status:409});
 assert.throws(()=>dispatcher.submit(module,{result:{type:'HOUR'}},{}),{status:409});assert.throws(()=>dispatcher.submit({...module,requiredBeforeConfirmation:true},{result:{type:'CHECK_RESULT'}},{}),{status:409});assert.deepEqual(calls,names.slice(3));
});
