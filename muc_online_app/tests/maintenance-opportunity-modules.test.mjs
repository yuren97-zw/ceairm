import assert from 'node:assert/strict';
import test from 'node:test';
import {readMaintenanceReportModules,evaluateMaintenanceTransition,coordinateMaintenanceTransition,MAINTENANCE_GATE_VERSION} from '../maintenance-opportunity-modules.mjs';
const make=({release=false,routine=false,nonroutine=false,hasRoutine=true,hasFormalNonroutine=false,hasNonroutineDraft=false}={})=>readMaintenanceReportModules('opportunity',{
 hasRoutine,hasFormalNonroutine,hasNonroutineDraft,
 batches:Object.fromEntries(Object.entries({release,routine,nonroutine}).map(([type,submitted])=>[type,{id:type,version:1,status:submitted?'已提报':'未提报'}]))
});
const snapshot=modules=>({currentStatus:'已提报',finalized:false,modules,hasNonroutineDraft:false,hasFormalNonroutine:false,workKind:'短停',releaseReporterAuthorized:true});
const booleans=[false,true];
test('enabled coordinator returns the frozen decision and refuses divergent original status or permission without fallback',()=>{
 const base={...snapshot(make({release:true,routine:true})),currentStatus:'已派工',hasAssignments:true,preserveConfirmed:true,allConfirmed:false};
 const reconciled=coordinateMaintenanceTransition(base,'RECONCILE','已提报');assert.equal(reconciled.targetStatus,'已提报');
 assert.equal(coordinateMaintenanceTransition(base,'FINALIZE_REPORT',true).targetStatus,'待复核');
 assert.equal(coordinateMaintenanceTransition({...base,releaseReporterAuthorized:false},'FINALIZE_REPORT',false).allowed,false);
 for(const [action,expected] of [['RECONCILE','已确认'],['FINALIZE_REPORT',false]])assert.throws(()=>coordinateMaintenanceTransition(base,action,expected),{status:409,code:'MAINTENANCE_COORDINATOR_MISMATCH'});
 assert.throws(()=>coordinateMaintenanceTransition({...base,modules:base.modules.map((module,index)=>index?module:{...module,gateRuleVersion:'unapproved'})},'RECONCILE','已提报'),TypeError);
});
test('coordinator reconciles all five states with original preserve, assignment and finalization precedence',()=>{
 for(const currentStatus of ['未派工','已派工','已提报','待复核','已确认'])for(const preserveConfirmed of booleans)for(const hasAssignments of booleans)for(const finalized of booleans)for(const allConfirmed of booleans)for(const submitted of booleans){
  const modules=make({release:submitted});
  const expected=preserveConfirmed&&currentStatus==='已确认'?'已确认':!hasAssignments?'未派工':finalized?(allConfirmed?'已确认':'待复核'):submitted?'已提报':'已派工';
  const result=evaluateMaintenanceTransition({currentStatus,preserveConfirmed,hasAssignments,finalized,allConfirmed,modules},'RECONCILE');
  assert.equal(result.targetStatus,expected);assert.equal(result.predicates.length,5);assert.ok(result.predicates.every(row=>!row.required));assert.deepEqual(result.blockers,[]);
 }
});
test('core report completeness and pure routine exclusions agree across every batch and applicability combination',()=>{
 for(const release of booleans)for(const routine of booleans)for(const nonroutine of booleans)for(const hasRoutine of booleans)for(const hasFormalNonroutine of booleans)for(const hasNonroutineDraft of booleans)for(const finalized of booleans)for(const workKind of ['短停','航后','三方航后','航后/航前']){
  const input={release,routine,nonroutine,hasRoutine,hasFormalNonroutine,hasNonroutineDraft};
  const base={...snapshot(make(input)),hasFormalNonroutine,hasNonroutineDraft,finalized,workKind};
  const ready=release&&(!hasRoutine||routine)&&(!(hasFormalNonroutine||hasNonroutineDraft)||nonroutine&&!hasNonroutineDraft);
  assert.equal(evaluateMaintenanceTransition(base,'FINALIZE_REPORT').allowed,!finalized&&!hasNonroutineDraft&&ready);
  assert.equal(evaluateMaintenanceTransition(base,'AUTO_FINALIZE_ROUTINE').allowed,!finalized&&!hasNonroutineDraft&&!hasFormalNonroutine&&workKind==='短停'&&ready);
 }
});
test('final application requires every original locked release check and explains each refusal without person data',()=>{
 const complete={...snapshot(make({release:true,routine:true})),releaseSelectionMatches:true,releasePersonActive:true,releaseAssignmentExists:true,releaseAssignmentMatches:true};
 const fields=['releaseSelectionMatches','releasePersonActive','releaseAssignmentExists','releaseAssignmentMatches'];
 assert.equal(evaluateMaintenanceTransition(complete,'APPLY_FINALIZE_REPORT').allowed,true);
 for(let mask=0;mask<16;mask++){
  const state={...complete};fields.forEach((key,index)=>state[key]=Boolean(mask&(1<<index)));
  const decision=evaluateMaintenanceTransition(state,'APPLY_FINALIZE_REPORT');
  assert.equal(decision.allowed,mask===15);assert.equal(decision.blockers.length,4-fields.filter(key=>state[key]).length);
  assert.ok(decision.predicates.every(row=>typeof row.satisfied==='boolean'&&!('personId' in row)));
 }
 const missing={...complete};delete missing.releasePersonActive;assert.equal(evaluateMaintenanceTransition(missing,'APPLY_FINALIZE_REPORT').allowed,false);
});
test('unapproved extension facts cannot advance reporting or acquire a new blocking gate',()=>{
 const modules=make();const extension={opportunityId:'opportunity',moduleInstanceId:'check',moduleTypeCode:'test_check',moduleVersion:1,gateRuleVersion:MAINTENANCE_GATE_VERSION,resultType:'CHECK_RESULT',moduleBusinessState:'COMPLETED',countsAsFormalReportSubmission:false,requiredBeforePendingReview:false};
 const initial={...snapshot([...modules,extension]),currentStatus:'已派工',hasAssignments:true};
 assert.equal(evaluateMaintenanceTransition(initial,'RECONCILE').targetStatus,'已派工');
 for(const field of ['countsAsFormalReportSubmission','requiredBeforePendingReview','requiredBeforeConfirmation'])assert.throws(()=>evaluateMaintenanceTransition({...initial,modules:[...modules,{...extension,[field]:true}]},'RECONCILE'),/Unapproved/);
});
test('cross-opportunity, duplicate, unsupported versions, waived core and missing core contracts are rejected',()=>{
 const modules=make({release:true,routine:true});
 const malformed=[modules.slice(1),[...modules,modules[0]],modules.map((row,i)=>i?row:{...row,opportunityId:'other'}),modules.map((row,i)=>i?row:{...row,moduleVersion:2}),modules.map((row,i)=>i?row:{...row,gateRuleVersion:'future'}),modules.map((row,i)=>i?row:{...row,applicability:'WAIVED'}),modules.map((row,i)=>i?row:{...row,resultType:'HOUR'}),modules.map((row,i)=>i?row:{...row,countsAsFormalReportSubmission:false})];
 for(const rows of malformed)assert.throws(()=>evaluateMaintenanceTransition(snapshot(rows),'FINALIZE_REPORT'),TypeError);
});

test('review confirmation requires explicit signatures, task completion and the original archive guard',()=>{
 const base={...snapshot(make()),editingConfirmed:false,routineSignatureChosen:true,nonroutineSignatureChosen:true,reviewBlockers:[]};
 for(const editingConfirmed of booleans)for(const routineSignatureChosen of booleans)for(const nonroutineSignatureChosen of booleans)for(const blocked of booleans){
  const decision=evaluateMaintenanceTransition({...base,editingConfirmed,routineSignatureChosen,nonroutineSignatureChosen,reviewBlockers:blocked?['incomplete']:[]},'CONFIRM_REVIEW');
  assert.equal(decision.allowed,!editingConfirmed&&routineSignatureChosen&&nonroutineSignatureChosen&&!blocked);
 }
 for(const field of ['editingConfirmed','routineSignatureChosen','nonroutineSignatureChosen','reviewBlockers']){const missing={...base};delete missing[field];assert.equal(evaluateMaintenanceTransition(missing,'CONFIRM_REVIEW').allowed,false);}
});


test('extension check references cannot smuggle zero hours through the transition boundary',()=>{
 const extension={opportunityId:'opportunity',moduleInstanceId:'check-result',moduleTypeCode:'test_check',moduleVersion:1,gateRuleVersion:MAINTENANCE_GATE_VERSION,resultType:'CHECK_RESULT',moduleBusinessState:'COMPLETED',countsAsFormalReportSubmission:false,requiredBeforePendingReview:false,resultSource:{type:'CHECK_RESULT',sourceId:'actual-check',sourceVersion:1}};
 const input={...snapshot([...make(),extension]),currentStatus:'已派工',hasAssignments:true};assert.equal(evaluateMaintenanceTransition(input,'RECONCILE').targetStatus,'已派工');
 assert.throws(()=>evaluateMaintenanceTransition({...input,modules:[...make(),{...extension,resultSource:{...extension.resultSource,hours:0}}]},'RECONCILE'),TypeError);
});
