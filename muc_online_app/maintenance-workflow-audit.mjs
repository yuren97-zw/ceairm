import {createHash} from 'node:crypto';
import {readMaintenanceWorkflowCompletion} from './maintenance-workflow-results.mjs';
const actions=new Set(['CREATE','CLAIM','SUBMIT','REASSIGN','CANCEL']);
const taskStates=new Set(['ASSIGNED','CLAIMED','SUBMITTED','CANCELLED']);
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
const invalid=()=>{throw Object.assign(Error('办理历史已变化或查询参数无效，请重新读取'),{status:409});};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const own=(seat,actor)=>seat?.accountId===actor.accountId&&seat?.personId===actor.personId;
// The host supplies a current authorized identity, never a role flag from input.
// No raw request, result note, qualification, scope or request hash is projected.
export function readMaintenanceWorkflowAudit({db,workflow,module,ruleSnapshot,actor,manage},{cursor='',limit=20}={}){
 if(!actor?.accountId||!actor.personId||!actor.permissions?.includes('maintenance.workflow.view'))throw Object.assign(Error('当前人员没有流程历史权限'),{status:403});
 const manager=Boolean(manage&&actor.permissions.includes('maintenance.workflow.manage')&&actor.scopes?.some(scope=>scope.module==='maintenance'&&scope.scopeType==='all'));
 const tasks=db.prepare('select id,task_key,title,account_id,person_id from maintenance_workflow_tasks where workflow_id=?').all(workflow.id),byId=new Map(tasks.map(task=>[task.id,task])),owned=new Set(tasks.filter(task=>task.account_id===actor.accountId&&task.person_id===actor.personId).map(task=>task.id));
 if(!manager&&!owned.size)throw Object.assign(Error('未找到可访问的流程'),{status:404});
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||typeof cursor!=='string'||cursor.length>1024)invalid();
 const visibility=hash([workflow.id,actor.accountId,actor.personId,manager]),revision=Number(workflow.revision);let offset=0;
 if(cursor){const value=parse(Buffer.from(cursor,'base64url').toString());if(!value||Object.keys(value).some(key=>!['revision','visibility','offset'].includes(key))||value.revision!==revision||value.visibility!==visibility||!Number.isSafeInteger(value.offset)||value.offset<0)invalid();offset=value.offset;}
 const completion=readMaintenanceWorkflowCompletion(db,module,ruleSnapshot),events=db.prepare('select * from maintenance_workflow_events where workflow_id=?').all(workflow.id).map(event=>({...event,detail:parse(event.detail_json),response:parse(event.response_json)})).sort((a,b)=>(Number.isSafeInteger(a.response?.revision)?a.response.revision:Number.MAX_SAFE_INTEGER)-(Number.isSafeInteger(b.response?.revision)?b.response.revision:Number.MAX_SAFE_INTEGER)||a.id.localeCompare(b.id));
 const names=new Map();
 const person=id=>{if(typeof id!=='string'||!id||id.length>2000)return null;if(!names.has(id))names.set(id,db.prepare('select name,employee_no as employeeNo from personnel where id=?').get(id)||null);return names.get(id);};
 const projected=[];
 for(const event of events){
  const detail=event.detail,response=event.response,valid=detail&&detail.id===event.id&&detail.workflowId===workflow.id&&detail.moduleInstanceId===module.moduleInstanceId&&detail.opportunityId===module.opportunityId&&detail.action===event.event_type&&actions.has(event.event_type)&&Array.isArray(detail.after?.tasks)&&response?.workflowId===workflow.id&&Number.isSafeInteger(response.revision)&&response.revision>0;
  if(!valid){if(manager)projected.push({eventId:event.id,eventType:'UNAVAILABLE',occurredAt:event.created_at,revision:null,verified:false,actor:null,reason:null,changes:[]});continue;}
  let changes=detail.after.tasks.filter(item=>item&&typeof item==='object'&&byId.has(item.taskId));
  if(!manager){
   changes=changes.filter(item=>owned.has(item.taskId)&&own(item,actor));
   if(['CLAIM','SUBMIT'].includes(event.event_type)){
    if(event.actor_id!==actor.accountId||detail.actor?.personId!==actor.personId)continue;
   }else if(!['CREATE','REASSIGN','CANCEL'].includes(event.event_type))continue;
   if(!changes.length)continue;
  }
  const workflowBefore=event.event_type==='CANCEL'?detail.before?.tasks:[],qualification=parse(event.qualification_json),actorBound=qualification?.accountId===event.actor_id&&detail.actor?.accountId===event.actor_id&&typeof detail.actor?.personId==='string'&&qualification.personId===detail.actor.personId;
  projected.push({eventId:event.id,eventType:event.event_type,occurredAt:event.created_at,revision:response.revision,verified:completion.available,
   actor:manager?{accountId:event.actor_id,personId:actorBound?detail.actor.personId:null,person:actorBound?person(detail.actor.personId):null,nameSource:actorBound?'CURRENT_PERSONNEL':'UNAVAILABLE'}:{label:event.actor_id===actor.accountId&&detail.actor?.personId===actor.personId?'本人':'流程管理'},
   reason:manager&&typeof detail.reason==='string'?detail.reason:null,
   changes:changes.map(after=>{const before=event.event_type==='CREATE'?null:event.event_type==='CANCEL'?Array.isArray(workflowBefore)?workflowBefore.find(item=>item?.taskId===after.taskId):null:detail.before;return {taskId:after.taskId,title:byId.get(after.taskId).title,stateBefore:taskStates.has(before?.state)&&(manager||own(before,actor))?before.state:null,stateAfter:taskStates.has(after.state)?after.state:null,...(manager?{fromAssignee:person(before?.personId),toAssignee:person(after.personId)}:{})};})});
 }
 if(offset>projected.length)invalid();const page=projected.slice(offset,offset+limit),next=offset+page.length;
 return {workflowId:workflow.id,workflowRevision:revision,visibility,manage:manager,simulationOnly:true,sourceIntegrity:completion.available?'VERIFIED':'UNVERIFIED',events:page,nextCursor:next<projected.length?Buffer.from(JSON.stringify({revision,visibility,offset:next})).toString('base64url'):null};
}
