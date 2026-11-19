import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkflowWorkbench,renderWorkflowWorkbench,renderWorkflowHistory} from '../public/maintenance-workflow-workbench.mjs';
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const record={workflowId:'workflow',revision:2,state:'OPEN',templateVersion:1,resultType:'CHECK_RESULT',simulationOnly:true,opportunity:{flightNo:'<Flight>'},tasks:[{taskId:'task',title:'<Feedback>',accountId:'worker',state:'CLAIMED',revision:2,assignee:{name:'<Worker>'}}]};
async function harness(t,handler,{manager=false,discard=false}={}){
 const events=new Map(),calls=[],status={textContent:''};let confirmation=discard;
 const root={innerHTML:'',querySelector:()=>status,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const controller=createWorkflowWorkbench({root,accountId:'worker',escapeHtml:esc,newId:()=> 'request-stable-001',confirmDiscard:()=>confirmation,async api(path,options){calls.push({path,options});if(path.endsWith('/workflow-capabilities'))return {enabled:true,simulationEnabled:true,view:true,submit:true,manage:manager};if(path.startsWith('/maintenance/workflow-tasks?'))return {tasks:[{taskId:'task',workflowId:'workflow',title:'Feedback',state:'CLAIMED'}],nextCursor:'next'};if(path.startsWith('/maintenance/workflow-modules?'))return {modules:[{moduleInstanceId:'module',instanceKey:'unused',opportunityId:'flight',ruleSnapshotSha256:'snapshot',opportunity:{flightNo:'Flight'},workflowId:null}],nextCursor:'next-module'};if(path.startsWith('/maintenance/workflow-assignees?'))return {candidates:[{accountId:'worker',name:'Worker',employeeNo:'100'}]};if(path.endsWith('/workflow-templates'))return {templates:[{code:'server-template',version:7,resultType:'CHECK_RESULT',tasks:[{key:'server-task'}]}]};return handler(path,options);}});
 t.after(()=>controller.destroy());await tick();
 const click=(action,id)=>events.get('click')({target:{closest:()=>({dataset:{wfAction:action,id}})}});
 const input=(name,value,task)=>events.get('input')({target:{name,value,dataset:{task}}});
 const submit=(action,id)=>events.get('submit')({preventDefault(){},target:{closest:()=>({dataset:{wfForm:action,id}})}});
 return {root,calls,status,controller,click,input,submit,allowDiscard:()=>confirmation=true};
}
test('workflow rendering escapes private content and offers only own permitted task actions',()=>{
 const state={caps:{enabled:true,simulationEnabled:true,view:true,submit:true},filter:'PENDING',record};const html=renderWorkflowWorkbench(state,esc,'worker');assert.ok(html.includes('&lt;Feedback>'));assert.ok(html.includes('&lt;Worker>'));assert.ok(!html.includes('<Feedback>'));assert.ok(html.includes('data-wf-form="submit"'));assert.ok(!html.includes('data-wf-form="reassign"'));assert.ok(!renderWorkflowWorkbench(state,esc,'other').includes('data-wf-form="submit"'));
 assert.ok(!renderWorkflowWorkbench({...state,record:{...record,locked:true}},esc,'worker').includes('data-wf-form="submit"'));
});
test('failed workflow submission freezes exact request and retries without replacing its key or result',async t=>{
 let attempts=0;const f=await harness(t,async(path,options)=>{if(options){if(++attempts===1)throw Error('offline');return {workflowId:'workflow',revision:3};}return attempts>1?{...record,state:'COMPLETED',revision:3,tasks:[{...record.tasks[0],state:'SUBMITTED',revision:3,result:{type:'CHECK_RESULT',outcome:'FAIL'}}]}:structuredClone(record);});
 await f.click('open','workflow');f.input('outcome','FAIL','task');f.input('note','Private finding','task');await f.submit('submit','task');
 assert.equal(f.controller.hasUnsaved(),true);const first=f.calls.find(call=>call.options);f.input('note','Must not replace in-flight request','task');await f.click('retry');const writes=f.calls.filter(call=>call.options);assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);assert.equal(first.options.body.result.note,'Private finding');assert.equal(f.controller.hasUnsaved(),false);assert.ok(f.root.innerHTML.includes('已提交'));
});
test('dirty selection and refresh require explicit discard; stale pagination cannot mix filters',async t=>{
 const f=await harness(t,()=>structuredClone(record));await f.click('open','workflow');f.input('note','Unsent','task');const count=f.calls.length;await f.click('open','other');await f.controller.refresh();assert.equal(f.calls.length,count);assert.equal(f.controller.hasUnsaved(),true);
 f.input('filter','ALL');await f.click('more-tasks');assert.equal(f.calls.length,count);assert.ok(f.status.textContent.includes('筛选'));f.allowDiscard();await f.controller.refresh();assert.equal(f.controller.hasUnsaved(),false);
});
test('permission loss clears private task, pending body and input fields',async t=>{
 const f=await harness(t,(path,options)=>{if(options)throw Object.assign(Error('permission revoked'),{status:403});return structuredClone(record);});await f.click('open','workflow');f.input('outcome','FAIL','task');f.input('note','Secret finding','task');await f.submit('submit','task');assert.equal(f.controller.hasUnsaved(),false);assert.ok(!f.root.innerHTML.includes('Secret finding'));assert.ok(!f.root.innerHTML.includes('&lt;Worker>'));assert.ok(!f.root.innerHTML.includes('重试原操作'));
});
test('successful commit with failed follow-up read cannot be resubmitted as a new action',async t=>{
 let saved=false;const f=await harness(t,(path,options)=>{if(options){saved=true;return {workflowId:'workflow',revision:3};}if(saved)throw Error('read offline');return structuredClone(record);});await f.click('open','workflow');f.input('outcome','PASS','task');await f.submit('submit','task');assert.equal(f.controller.hasUnsaved(),false);assert.ok(f.root.innerHTML.includes('操作已保存'));await f.submit('submit','task');assert.equal(f.calls.filter(call=>call.options).length,1);
});
test('create uses server template version and task key; never accepts an implicit assignee or reason',async t=>{
 const f=await harness(t,(path,options)=>options?{workflowId:'workflow',revision:1}:structuredClone(record),{manager:true});await f.click('module','module');await f.submit('create');assert.equal(f.calls.some(call=>call.options),false);f.input('createAssignee','worker');f.input('createReason','Explicit reason');await f.submit('create');const write=f.calls.find(call=>call.options);assert.equal(write.options.body.templateCode,'server-template');assert.equal(write.options.body.templateVersion,7);assert.equal(write.options.body.assignments[0].taskKey,'server-task');assert.equal(write.options.body.expectedRuleSnapshot,'snapshot');
});
test('destroyed workbench ignores late private responses after account changes',async t=>{
 let resolve;const f=await harness(t,()=>new Promise(done=>resolve=done));const opening=f.click('open','workflow');f.controller.destroy();resolve(structuredClone(record));await opening;assert.equal(f.root.innerHTML,'');
});
test('known loss of management scope removes old private detail even if the next read is offline',async t=>{
 let revoked=false;const events=new Map(),root={innerHTML:'',querySelector:()=>null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
 const controller=createWorkflowWorkbench({root,accountId:'manager',escapeHtml:esc,async api(path){
  if(path.endsWith('workflow-capabilities'))return {enabled:true,simulationEnabled:true,view:true,manage:!revoked};
  if(path.startsWith('/maintenance/workflow-tasks?')){if(revoked)throw Error('offline after capability check');return {tasks:[]};}
  if(path.includes('workflow-templates'))return {templates:[]};if(path.includes('workflow-modules'))return {modules:[]};if(path.includes('workflow-assignees'))return {candidates:[]};
  return {...structuredClone(record),manage:true,tasks:[{...record.tasks[0],assignee:{name:'Private manager detail'}}]};
 }});t.after(()=>controller.destroy());await tick();await events.get('click')({target:{closest:()=>({dataset:{wfAction:'open',id:'workflow'}})}});assert.ok(root.innerHTML.includes('Private manager detail'));revoked=true;await controller.refresh();assert.ok(!root.innerHTML.includes('Private manager detail'));assert.ok(!root.innerHTML.includes('data-wf-form="reassign"'));
});
test('history view escapes management basis and shows an explicit unverified source warning',()=>{
 const html=renderWorkflowHistory({manage:true,sourceIntegrity:'UNVERIFIED',events:[{eventType:'CREATE',occurredAt:'not-a-date',revision:1,verified:false,actor:{person:{name:'<Actor>'}},reason:'<Basis>',changes:[]}]},esc);assert.ok(html.includes('&lt;Actor>'));assert.ok(html.includes('&lt;Basis>'));assert.ok(!html.includes('<Actor>'));assert.ok(html.includes('历史来源待核对'));assert.ok(html.includes('时间待核对'));
 const blocked=renderWorkflowWorkbench({caps:{enabled:true,simulationEnabled:true,view:true,manage:true,submit:true},record:{...record,completion:{error:'WORKFLOW_SOURCE_INVALID'}}},esc,'worker');assert.ok(!blocked.includes('data-wf-form="submit"'));assert.ok(!blocked.includes('data-wf-form="reassign"'));assert.ok(blocked.includes('data-wf-action="history"'));
});
test('history pagination clears cached rows when revision or visibility changes',async t=>{
 let page=0;const f=await harness(t,path=>{if(path.includes('/audit'))return {workflowId:'workflow',workflowRevision:2,visibility:++page===1?'first':'changed',manage:false,sourceIntegrity:'VERIFIED',events:[{eventId:String(page),eventType:'CLAIM',occurredAt:'t',revision:page,verified:true,actor:{label:'本人'},reason:null,changes:[{title:'Cached historical label',stateAfter:'CLAIMED'}]}],nextCursor:'next'};return structuredClone(record);});await f.click('history','workflow');assert.ok(f.root.innerHTML.includes('Cached historical label'));await f.click('more-history');assert.ok(!f.root.innerHTML.includes('Cached historical label'));assert.ok(f.root.innerHTML.includes('历史已变化'));
});
test('read-only history retains an unsent draft on the same workflow and clears it on permission loss',async t=>{
 let revoked=false;const f=await harness(t,path=>{if(path.includes('/audit')){if(revoked)throw Object.assign(Error('no history permission'),{status:403});return {workflowId:'workflow',workflowRevision:2,visibility:'same',manage:false,sourceIntegrity:'VERIFIED',events:[],nextCursor:null};}return structuredClone(record);});await f.click('open','workflow');f.input('note','Unsent feedback','task');await f.click('history','workflow');assert.equal(f.controller.hasUnsaved(),true);assert.ok(f.root.innerHTML.includes('Unsent feedback'));revoked=true;await f.click('history','workflow');assert.equal(f.controller.hasUnsaved(),false);assert.ok(!f.root.innerHTML.includes('Unsent feedback'));
});
