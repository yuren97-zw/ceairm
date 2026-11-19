import {createHash} from 'node:crypto';
const kinds=new Set(['CHECK_RESULT','APPROVAL_RESULT','TASK_OUTCOME','NO_SETTLEMENT_RESULT']);
const fail=message=>{throw Object.assign(Error(message),{status:409});};
const hash=value=>createHash('sha256').update(value).digest('hex');
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=2000;
const keys=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>allowed.includes(key));
export function validateMaintenanceWorkflowTemplate(value){
 if(!keys(value,['code','version','resultType','tasks','outcomes'])||typeof value.code!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(value.code)||!Number.isSafeInteger(value.version)||value.version<1||!kinds.has(value.resultType)||!Array.isArray(value.tasks)||value.tasks.length<1||value.tasks.length>100||!Array.isArray(value.outcomes)||value.outcomes.length<1||value.outcomes.length>50||value.outcomes.some(outcome=>!text(outcome)))fail('Invalid trusted workflow template');
 if(new Set(value.outcomes).size!==value.outcomes.length||new Set(value.tasks.map(task=>task?.key)).size!==value.tasks.length||value.tasks.some(task=>!keys(task,['key','title'])||typeof task.key!=='string'||!/^[-a-zA-Z0-9_]{1,100}$/.test(task.key)||!text(task.title)))fail('Invalid trusted workflow tasks');
 return value;
}
export function readMaintenanceWorkflowTemplate(workflow,resultType){
 let frozen;try{frozen=validateMaintenanceWorkflowTemplate(JSON.parse(workflow.template_json));}catch{fail('Frozen workflow template invalid');}
 if(hash(workflow.template_json)!==workflow.template_sha256||frozen.code!==workflow.template_code||frozen.version!==Number(workflow.template_version)||frozen.resultType!==workflow.result_type||frozen.resultType!==resultType)fail('Frozen workflow template mismatch');
 return frozen;
}

