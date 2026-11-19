import {createHash} from 'node:crypto';
import {readMaintenanceWorkflowTemplate} from './maintenance-workflow-contract.mjs';
import {resolveMaintenanceWorkflowTemplate} from './maintenance-workflow-templates.mjs';
import {maintenanceModuleResultReference} from './maintenance-module-results.mjs';

const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const json=value=>JSON.stringify(canonical(value));
const hash=value=>createHash('sha256').update(value).digest('hex');
const requireFact=condition=>{if(!condition)throw Error('Invalid workflow result source');};
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const same=(a,b)=>json(a)===json(b);
const seat=task=>({taskId:task.id,taskKey:task.task_key,state:task.state,accountId:task.account_id,personId:task.person_id,qualification:JSON.parse(task.qualification_json),revision:Number(task.revision)});
export const supportsMaintenanceWorkflowResult=module=>module?.moduleTypeCode==='extension_workflow_simulation'&&module.moduleVersion===1&&module.resultType==='CHECK_RESULT';

// Only immutable submission facts establish completion. This reader deliberately
// does not requalify historical submitters against today's employment or roles.
// It exposes no task identities, notes, qualification snapshots or financial rows.
export function readMaintenanceWorkflowCompletion(db,module,ruleSnapshot){
 if(!supportsMaintenanceWorkflowResult(module))return {available:false,complete:false,state:null,resultSource:null,error:null};
 try{
  const workflow=db.prepare('select * from maintenance_workflow_instances where module_instance_id=?').get(module.moduleInstanceId);
  if(!workflow)return {available:true,complete:false,state:'NOT_STARTED',resultSource:null,error:null};
  const frozen=readMaintenanceWorkflowTemplate(workflow,module.resultType),approved=resolveMaintenanceWorkflowTemplate(frozen.code,frozen.version,module,true);
  requireFact(same(frozen,approved)&&positive(workflow.revision)&&['OPEN','COMPLETED','CANCELLED'].includes(workflow.state));
  const tasks=db.prepare('select * from maintenance_workflow_tasks where workflow_id=? order by id').all(workflow.id),byId=new Map(tasks.map(task=>[task.id,task]));
  requireFact(tasks.length===frozen.tasks.length&&new Set(tasks.map(task=>task.task_key)).size===tasks.length);
  for(const task of tasks)requireFact(frozen.tasks.some(item=>item.key===task.task_key&&item.title===task.title)&&positive(task.revision));
  const events=db.prepare('select * from maintenance_workflow_events where workflow_id=?').all(workflow.id).map(event=>({...event,response:JSON.parse(event.response_json),detail:JSON.parse(event.detail_json),qualification:JSON.parse(event.qualification_json)})).sort((a,b)=>Number(a.response.revision)-Number(b.response.revision));
  requireFact(events.length===Number(workflow.revision));
  let state='OPEN',revision=0;const seats=new Map(),updated=new Map(),submitted=new Map();
  for(const event of events){
   const {response,detail,qualification}=event,action=event.event_type,next=detail.after?.tasks;
   requireFact(state==='OPEN'&&detail.id===event.id&&detail.action===action&&detail.workflowId===workflow.id&&detail.opportunityId===module.opportunityId&&detail.moduleInstanceId===module.moduleInstanceId&&detail.templateSha256===workflow.template_sha256&&detail.ruleSnapshot===ruleSnapshot&&detail.actor?.accountId===event.actor_id&&same(detail.actor,qualification)&&qualification.personId&&Array.isArray(qualification.permissions)&&qualification.permissions.includes('maintenance.view')&&qualification.permissions.includes('maintenance.workflow.view'));
   requireFact(response.workflowId===workflow.id&&response.revision===revision+1&&response.replayed===false&&Array.isArray(next)&&next.length>0&&detail.after.revision===response.revision);
   const {tasks:ignored,...detailResponse}=detail.after;requireFact(same(detailResponse,response));
   const actorPermission=['CREATE','REASSIGN','CANCEL'].includes(action)?'maintenance.workflow.manage':'maintenance.workflow.submit';
   requireFact(qualification.permissions.includes(actorPermission)&&Array.isArray(qualification.scopes)&&qualification.scopes.some(scope=>scope.module==='maintenance'));
   if(['CREATE','REASSIGN','CANCEL'].includes(action))requireFact(qualification.scopes.some(scope=>scope.module==='maintenance'&&scope.scopeType==='all')&&typeof detail.reason==='string'&&detail.reason.trim());
   let payload={clientId:event.client_id,expectedRevision:revision};
   if(action==='CREATE'){
    requireFact(revision===0&&detail.before===null&&!event.task_id&&!detail.taskId&&workflow.created_by===event.actor_id&&event.created_at===workflow.created_at&&next.length===tasks.length);
    for(const item of next){const task=byId.get(item.taskId);requireFact(task&&task.task_key===item.taskKey&&item.state==='ASSIGNED'&&item.revision===1&&item.accountId&&item.personId&&item.qualification?.accountId===item.accountId&&item.qualification?.personId===item.personId&&task.created_at===event.created_at);seats.set(item.taskId,item);updated.set(item.taskId,event.created_at);}
    // The sole approved simulation has one explicit task; no assignment order is inferred.
    requireFact(seats.size===tasks.length&&tasks.length===1);
    payload={clientId:event.client_id,expectedRuleSnapshot:ruleSnapshot,templateCode:frozen.code,templateVersion:frozen.version,assignments:next.map(item=>({taskKey:item.taskKey,accountId:item.accountId})),reason:detail.reason};
   }else if(action==='CANCEL'){
    requireFact(!event.task_id&&!detail.taskId&&detail.before?.state===state&&detail.before.revision===revision&&same([...detail.before.tasks].sort((a,b)=>a.taskId.localeCompare(b.taskId)),[...seats.values()].sort((a,b)=>a.taskId.localeCompare(b.taskId)))&&next.length===seats.size);
    for(const item of next){const before=seats.get(item.taskId);requireFact(before);const expected=before.state==='SUBMITTED'?before:{...before,state:'CANCELLED',revision:before.revision+1};requireFact(same(item,expected));seats.set(item.taskId,item);if(before.state!=='SUBMITTED')updated.set(item.taskId,event.created_at);}
    state='CANCELLED';payload.reason=detail.reason;
   }else{
    const before=seats.get(event.task_id),after=next[0],task=byId.get(event.task_id);
    requireFact(revision>0&&next.length===1&&before&&task&&same(detail.before,before)&&detail.taskId===event.task_id&&response.taskId===event.task_id&&after.taskId===event.task_id&&after.taskKey===before.taskKey&&after.revision===before.revision+1&&response.taskRevision===after.revision&&response.taskState===after.state);
    payload.taskId=event.task_id;payload.expectedTaskRevision=before.revision;
    if(action==='REASSIGN'){
     requireFact(['ASSIGNED','CLAIMED'].includes(before.state)&&after.state==='ASSIGNED'&&after.accountId&&after.personId&&after.qualification?.accountId===after.accountId&&after.qualification?.personId===after.personId);
     payload.accountId=after.accountId;payload.reason=detail.reason;
    }else{
     requireFact(qualification.accountId===before.accountId&&qualification.personId===before.personId&&same({...before,state:after.state,revision:after.revision},after));
     if(action==='CLAIM')requireFact(before.state==='ASSIGNED'&&after.state==='CLAIMED');
     else if(action==='SUBMIT'){
      const result=JSON.parse(task.result_json);
      requireFact(before.state==='CLAIMED'&&after.state==='SUBMITTED'&&result&&typeof result==='object'&&!Array.isArray(result)&&Object.keys(result).every(key=>['type','outcome','note'].includes(key))&&result.type===frozen.resultType&&frozen.outcomes.includes(result.outcome)&&(result.note===undefined||typeof result.note==='string'&&result.note.length<=10000)&&task.submitted_at===event.created_at);
      payload.result=result;submitted.set(task.id,event.created_at);
     }else requireFact(false);
    }
    seats.set(event.task_id,after);updated.set(event.task_id,event.created_at);
    state=[...seats.values()].every(item=>item.state==='SUBMITTED')?'COMPLETED':'OPEN';
   }
   requireFact(response.state===state&&event.request_hash===hash(json({action,target:action==='CREATE'?module.moduleInstanceId:workflow.id,payload})));
   revision++;
  }
  requireFact(revision===Number(workflow.revision)&&state===workflow.state&&events.at(-1).created_at===workflow.updated_at);
  for(const task of tasks){requireFact(same(seat(task),seats.get(task.id))&&task.updated_at===updated.get(task.id));if(task.state==='SUBMITTED')requireFact(submitted.get(task.id)===task.submitted_at);else requireFact(task.result_json===null&&task.submitted_at===null);}
  const complete=state==='COMPLETED';
  return {available:true,complete,state,resultSource:complete?maintenanceModuleResultReference(module,{type:module.resultType,sourceId:workflow.id,sourceVersion:revision}):null,error:null};
 }catch{return {available:false,complete:false,state:null,resultSource:null,error:'WORKFLOW_SOURCE_INVALID'};}
}

export function projectMaintenanceWorkflowCompletion(db,module,ruleSnapshot){
 if(!supportsMaintenanceWorkflowResult(module))return module;
 const fact=readMaintenanceWorkflowCompletion(db,module,ruleSnapshot);
 return {...module,completionAvailable:fact.available,moduleBusinessState:fact.complete?'SUBMITTED':fact.state==='CANCELLED'?'CANCELLED':'PENDING',resultSource:fact.resultSource,workflowState:fact.state,completionError:fact.error,simulationOnly:true};
}
