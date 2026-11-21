import {validateMaintenanceWorkflowTemplate as template} from './maintenance-workflow-contract.mjs';
export {readMaintenanceWorkflowTemplate} from './maintenance-workflow-contract.mjs';
import {readMaintenanceWorkflowTemplate} from './maintenance-workflow-contract.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {readMaintenanceModuleIdentity} from './maintenance-module-instances.mjs';

const kinds=new Set(['CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT']);
const fail=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const hash=value=>createHash('sha256').update(value).digest('hex');
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
 return value;
}
const json=value=>JSON.stringify(canonical(value));
const seatFact=task=>({taskId:task.id,taskKey:task.task_key,state:task.state,accountId:task.account_id,personId:task.person_id,qualification:JSON.parse(task.qualification_json),revision:Number(task.revision)});
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
function qualification(value){
 if(!value||!text(value.accountId)||!text(value.personId))fail('Current workflow qualification required',403);
 return value;
}
// No templates or authority are inferred. The host supplies an approved template
// resolver and current role/scope/person checks; every callback runs inside its
// original database transaction. This service is not a public business workflow.
export function createMaintenanceWorkflowActions({db,transaction,authorize,qualifyAssignee,resolveTemplate,audit,clock,id=()=>randomUUID()}){
 if([transaction,authorize,qualifyAssignee,resolveTemplate,audit,clock,id].some(fn=>typeof fn!=='function'))throw TypeError('Missing workflow authority');
 function context(moduleId){
  const row=db.prepare('select * from maintenance_module_instances where id=?').get(moduleId);
  const flight=row&&db.prepare('select * from maintenance_flights where id=?').get(row.opportunity_id);
  if(!flight)fail('Workflow module unavailable',404);
  const identity=readMaintenanceModuleIdentity(db,flight.id),module=identity?.extensions.find(item=>item.moduleInstanceId===moduleId);
  if(!module||!kinds.has(module.resultType))fail('Workflow requires a persisted non-settlement module');
  return {flight,identity,module};
 }
 function run(action,target,payload,user){return transaction(()=>{
  const workflow=action==='CREATE'?null:db.prepare('select * from maintenance_workflow_instances where id=?').get(target);
  if(action!=='CREATE'&&!workflow)fail('Workflow unavailable',404);
  const ctx=context(workflow?.module_instance_id||target);
  const task=payload?.taskId&&workflow?db.prepare('select * from maintenance_workflow_tasks where workflow_id=? and id=?').get(workflow.id,payload.taskId):null;
  const actor=qualification(authorize(user,{...ctx,action,workflow,task}));
  const fields=action==='CREATE'?['clientId','expectedRuleSnapshot','templateCode','templateVersion','assignments','reason']:action==='CANCEL'?['clientId','expectedRevision','reason']:action==='REASSIGN'?['clientId','expectedRevision','taskId','expectedTaskRevision','accountId','reason']:['clientId','expectedRevision','taskId','expectedTaskRevision',...(action==='SUBMIT'?['result']:[])];
  if(!keys(payload,fields)||typeof payload.clientId!=='string'||!/^[-a-zA-Z0-9_]{8,128}$/.test(payload.clientId))fail('Invalid workflow request');
  if(['CLAIM','SUBMIT'].includes(action)&&(!task||actor.accountId!==task.account_id||actor.personId!==task.person_id))fail('Task belongs to another current person',403);
  const requestHash=hash(json({action,target,payload}));
  const prior=db.prepare('select * from maintenance_workflow_events where actor_id=? and client_id=?').get(actor.accountId,payload.clientId);
  if(prior){if(prior.request_hash!==requestHash)fail('Workflow request key reused with different content');return {...JSON.parse(prior.response_json),replayed:true};}
  if(ctx.flight.status==='已确认'||ctx.flight.archived_at)fail('Confirmed opportunity workflow is locked');
  const stamp=clock();let current=workflow,taskAfter=null,before=null;
  if(action==='CREATE'){
   if(payload.expectedRuleSnapshot!==ctx.identity.ruleSnapshotSha256)fail('Opportunity rule snapshot changed');
   if(!text(payload.reason))fail('Workflow creation reason required');
   const frozen=template(resolveTemplate(payload.templateCode,payload.templateVersion,ctx));
   if(frozen.code!==payload.templateCode||frozen.version!==payload.templateVersion||frozen.resultType!==ctx.module.resultType)fail('Approved template does not match module');
   if(!Array.isArray(payload.assignments)||payload.assignments.length!==frozen.tasks.length||payload.assignments.some(item=>!keys(item,['taskKey','accountId']))||new Set(payload.assignments.map(item=>item.taskKey)).size!==frozen.tasks.length)fail('Explicit assignment required for every template task');
   if(db.prepare('select id from maintenance_workflow_instances where module_instance_id=?').get(target))fail('Module workflow already exists');
   const assignments=frozen.tasks.map(item=>{
    const assignment=payload.assignments.find(value=>value.taskKey===item.key);
    if(!assignment)fail('Template task assignment missing');
    const seat=qualification(qualifyAssignee(assignment.accountId,{...ctx,template:frozen,task:item}));
    if(seat.accountId!==assignment.accountId)fail('Assignee identity mismatch',403);
    return {item,seat};
   });
   const workflowId=id(),frozenJson=json(frozen);
   db.prepare("insert into maintenance_workflow_instances(id,module_instance_id,template_code,template_version,template_json,template_sha256,result_type,state,revision,created_by,created_at,updated_at) values(?,?,?,?,?,?,?,'OPEN',1,?,?,?)").run(workflowId,target,frozen.code,frozen.version,frozenJson,hash(frozenJson),frozen.resultType,actor.accountId,stamp,stamp);
   for(const {item,seat} of assignments)db.prepare("insert into maintenance_workflow_tasks(id,workflow_id,task_key,title,account_id,person_id,qualification_json,state,revision,created_at,updated_at) values(?,?,?,?,?,?,?,'ASSIGNED',1,?,?)").run(id(),workflowId,item.key,item.title,seat.accountId,seat.personId,json(seat),stamp,stamp);
   current=db.prepare('select * from maintenance_workflow_instances where id=?').get(workflowId);
  }else{
   if(workflow.state!=='OPEN'||!Number.isSafeInteger(payload.expectedRevision)||payload.expectedRevision!==Number(workflow.revision))fail('Workflow revision or state changed');
   const frozen=readMaintenanceWorkflowTemplate(workflow,ctx.module.resultType);
   if(action==='CANCEL'){
    if(!text(payload.reason))fail('Cancellation reason required');
    before={state:workflow.state,revision:Number(workflow.revision),tasks:db.prepare('select * from maintenance_workflow_tasks where workflow_id=? order by id').all(workflow.id).map(seatFact)};
    db.prepare("update maintenance_workflow_tasks set state='CANCELLED',revision=revision+1,updated_at=? where workflow_id=? and state in ('ASSIGNED','CLAIMED')").run(stamp,workflow.id);
   }else{
    if(!task||!Number.isSafeInteger(payload.expectedTaskRevision)||Number(task.revision)!==payload.expectedTaskRevision||!frozen.tasks.some(item=>item.key===task.task_key))fail('Workflow task revision changed or unavailable');
    before=seatFact(task);
    if(action==='REASSIGN'){
     if(!['ASSIGNED','CLAIMED'].includes(task.state)||!text(payload.reason))fail('Only unsubmitted tasks can be reassigned with a reason');
     const seat=qualification(qualifyAssignee(payload.accountId,{...ctx,template:frozen,task}));
     if(seat.accountId!==payload.accountId)fail('Assignee identity mismatch',403);
     db.prepare("update maintenance_workflow_tasks set account_id=?,person_id=?,qualification_json=?,state='ASSIGNED',revision=revision+1,updated_at=? where id=?").run(seat.accountId,seat.personId,json(seat),stamp,task.id);
    }else{
     if(actor.accountId!==task.account_id||actor.personId!==task.person_id)fail('Task belongs to another current person',403);
     if(action==='CLAIM'){
      if(task.state!=='ASSIGNED')fail('Task cannot be claimed');
      db.prepare("update maintenance_workflow_tasks set state='CLAIMED',revision=revision+1,updated_at=? where id=?").run(stamp,task.id);
     }else if(action==='SUBMIT'){
      const result=payload.result;
      if(task.state!=='CLAIMED'||!keys(result,['type','outcome','note'])||result.type!==frozen.resultType||!frozen.outcomes.includes(result.outcome)||(result.note!==undefined&&(typeof result.note!=='string'||result.note.length>10000)))fail('Invalid typed workflow task result');
      db.prepare("update maintenance_workflow_tasks set state='SUBMITTED',result_json=?,submitted_at=?,revision=revision+1,updated_at=? where id=?").run(json(result),stamp,stamp,task.id);
     }else fail('Unsupported workflow action');
    }
    taskAfter=db.prepare('select * from maintenance_workflow_tasks where id=?').get(task.id);
   }
   const unfinished=db.prepare("select count(*) n from maintenance_workflow_tasks where workflow_id=? and state<>'SUBMITTED'").get(workflow.id).n;
   const state=action==='CANCEL'?'CANCELLED':Number(unfinished)===0?'COMPLETED':'OPEN';
   const changed=db.prepare('update maintenance_workflow_instances set state=?,revision=revision+1,updated_at=? where id=? and revision=?').run(state,stamp,workflow.id,workflow.revision);
   if(Number(changed.changes)!==1)fail('Concurrent workflow change');
   current=db.prepare('select * from maintenance_workflow_instances where id=?').get(workflow.id);
  }
  const response={workflowId:current.id,state:current.state,revision:Number(current.revision),...(taskAfter?{taskId:taskAfter.id,taskState:taskAfter.state,taskRevision:Number(taskAfter.revision)}:{}),replayed:false};
  const seats=action==='CREATE'||action==='CANCEL'?db.prepare('select * from maintenance_workflow_tasks where workflow_id=? order by id').all(current.id).map(seatFact):[seatFact(taskAfter)];
  const event={id:id(),action,opportunityId:ctx.flight.id,moduleInstanceId:ctx.module.moduleInstanceId,workflowId:current.id,taskId:taskAfter?.id||null,actor,ruleSnapshot:ctx.identity.ruleSnapshotSha256,templateSha256:current.template_sha256,before,after:{...response,tasks:seats},reason:payload.reason||null};
  db.prepare('insert into maintenance_workflow_events(id,workflow_id,task_id,event_type,actor_id,qualification_json,client_id,request_hash,response_json,detail_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(event.id,current.id,event.taskId,action,actor.accountId,json(actor),payload.clientId,requestHash,json(response),json(event),stamp);
  audit(user,event);
  return response;
 });}
 return {
  create:(moduleId,payload,user)=>run('CREATE',moduleId,payload,user),
  claim:(workflowId,payload,user)=>run('CLAIM',workflowId,payload,user),
  submit:(workflowId,payload,user)=>run('SUBMIT',workflowId,payload,user),
  reassign:(workflowId,payload,user)=>run('REASSIGN',workflowId,payload,user),
  cancel:(workflowId,payload,user)=>run('CANCEL',workflowId,payload,user)
 };
}
