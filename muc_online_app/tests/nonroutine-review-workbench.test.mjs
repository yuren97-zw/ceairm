import assert from 'node:assert/strict';
import test from 'node:test';
import {renderReviewWorkbench,createReviewWorkbench} from '../public/nonroutine-review-workbench.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const review={id:'case',state:'IN_REVIEW',submittedCount:1,application:{title:'<检查>',category:'单项工作',chapter:'29',workScope:'左侧',requestedHours:2},
  capabilities:{submitOpinion:true},opinions:[{accountId:'me',hours:0,basis:'OWN',revision:1},{accountId:'other',hours:99,basis:'FOREIGN-PRIVATE-CANARY'}],suggestions:[],suggestionNotice:'建议中禁止填写工时'};
test('cancellation form is explicit and retries the same request after a lost successful response',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const handlers=new Map(),node={textContent:'',disabled:false},root={innerHTML:'',querySelector:()=>node,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
 const current={...review,revision:7,capabilities:{cancel:true}},bodies=[];let cancelled=false;
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path,options){
  if(options){bodies.push(structuredClone(options.body));cancelled=true;if(bodies.length===1)throw Error('response lost');return {cancellation:{replayed:true}};}
  return path.endsWith('/case')?{review:cancelled?{...current,state:'CANCELLED',capabilities:{}}:current}:{items:[],nextCursor:null};
 }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
 await new Promise(resolve=>setImmediate(resolve));assert.match(root.innerHTML,/data-nr-cancel/);
 const event={preventDefault(){},target:{matches:selector=>selector==='[data-nr-cancel]'}};
 await handlers.get('submit')(event);assert.equal(bodies.length,0);
 handlers.get('input')({target:{name:'cancelReason',value:'保留原工作，取消本轮评议'}});handlers.get('input')({target:{name:'cancelConfirmed',checked:true}});assert.equal(controller.hasUnsaved(),true);
 await handlers.get('submit')(event);assert.equal(bodies.length,1);assert.match(root.innerHTML,/response lost/);assert.match(root.innerHTML,/readonly/);assert.equal(controller.hasUnsaved(),true);
 handlers.get('input')({target:{name:'cancelReason',value:'must not replace an uncertain request'}});
 await handlers.get('submit')(event);assert.deepEqual(bodies[1],bodies[0]);assert.equal(bodies[0].revision,7);assert.equal(bodies[0].reason,'保留原工作，取消本轮评议');assert.ok(bodies[0].clientId);
 assert.match(root.innerHTML,/已取消/);assert.doesNotMatch(root.innerHTML,/data-nr-cancel/);assert.equal(controller.hasUnsaved(),false);
 const standard=renderReviewWorkbench({purpose:'STANDARD',review:current},escape);assert.doesNotMatch(standard,/data-nr-cancel/);
});
test('workbench renders own zero and fields safely without projecting other opinions',()=>{
  const html=renderReviewWorkbench({review,accountId:'me',hours:0,basis:'OWN'},escape);
  assert.match(html,/&lt;检查>/);assert.match(html,/value="0"/);assert.match(html,/OWN/);assert.ok(!html.includes('FOREIGN-PRIVATE-CANARY'));
  assert.match(html,/font-size:16px/);assert.match(html,/min="0"/);
  const sealed=renderReviewWorkbench({review:{...review,state:'SEALED',capabilities:{submitOpinion:false}},accountId:'me'},escape);
  assert.match(sealed,/<fieldset disabled>/);
});
test('cancelled history access denial clears already rendered private opinions and case details',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const node={textContent:''},root={innerHTML:'',querySelector:()=>node,addEventListener(){},removeEventListener(){}};
 const history={...review,state:'CANCELLED',capabilities:{readAllOpinions:true,finalizationView:true},statistics:{trimmedMean:2,median:2},opinions:[{personId:'p',accountId:'me',hours:2,basis:'PRIVATE-CANCELLED-HISTORY'}]};
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path){if(path.endsWith('/finalization'))throw Object.assign(Error('permission changed'),{status:403});return path.endsWith('/case')?{review:history}:{items:[{id:'case',title:'PRIVATE-CASE-TITLE',category:'单项工作',chapter:'29',submittedCount:12,state:'CANCELLED'}],nextCursor:null};}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(root.innerHTML,/PRIVATE-CANCELLED-HISTORY|PRIVATE-CASE-TITLE/);assert.match(root.innerHTML,/已清除/);assert.equal(controller.hasUnsaved(),false);
});
test('bounded successful finalization response clears private history when general view permission remains',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const node={textContent:''},root={innerHTML:'',querySelector:()=>node,addEventListener(){},removeEventListener(){}};
 const history={...review,state:'CANCELLED',capabilities:{readAllOpinions:true,finalizationView:true},statistics:{trimmedMean:2,median:2},opinions:[{personId:'p',accountId:'me',hours:2,basis:'PRIVATE-BOUNDED-HISTORY'}]};
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path){if(path.endsWith('/finalization'))return {finalization:{canReadPrivate:false,decision:{recognizedHours:2},channel:{state:'CANCELLED_CLOSED'}}};return path.endsWith('/case')?{review:history}:{items:[],nextCursor:null};}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));assert.doesNotMatch(root.innerHTML,/PRIVATE-BOUNDED-HISTORY/);assert.match(root.innerHTML,/事项内容已清除/);assert.equal(controller.hasUnsaved(),false);
});
test('dirty review refresh rechecks access and clears withdrawn private opinions without submitting drafts',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const handlers=new Map(),node={textContent:''},root={innerHTML:'',querySelector:()=>node,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
 const privileged={...review,capabilities:{submitOpinion:true,readAllOpinions:true},opinions:[{accountId:'me',hours:0,basis:'OWN',revision:1},{accountId:'other',hours:99,basis:'WITHDRAWN-PRIVATE-OPINION'}]},bounded={...privileged,capabilities:{submitOpinion:true,readAllOpinions:false},opinions:privileged.opinions.slice(0,1)};let withdrawn=false,reads=0,writes=0;
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path,options){if(options){writes++;throw Error('No draft should be submitted by refresh');}if(path.endsWith('/case')){reads++;return {review:withdrawn?bounded:privileged};}return {items:[],nextCursor:null};}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));assert.match(root.innerHTML,/WITHDRAWN-PRIVATE-OPINION/);handlers.get('input')({target:{name:'basis',value:'UNSUBMITTED-PRIVATE-DRAFT'}});assert.equal(controller.hasUnsaved(),true);const before=reads;withdrawn=true;await controller.refresh();assert.equal(reads,before+1);assert.equal(writes,0);assert.doesNotMatch(root.innerHTML,/WITHDRAWN-PRIVATE-OPINION|UNSUBMITTED-PRIVATE-DRAFT/);assert.match(root.innerHTML,/事项内容已清除/);assert.equal(controller.hasUnsaved(),false);
});

test('dirty access recheck preserves the original draft on unchanged authority and transient failure but clears denied scope',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const handlers=new Map(),node={textContent:'',disabled:false},root={innerHTML:'',querySelector:()=>node,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};let failure=null,reads=0,posted=null;
 const current={...review,capabilities:{submitOpinion:true,readAllOpinions:true}},controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path,options){if(options){posted=options.body;return {review:current};}if(path.endsWith('/case')){reads++;if(failure)throw Object.assign(Error('access recheck failed'),{status:failure});return {review:current};}return {items:[],nextCursor:null};}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));handlers.get('input')({target:{name:'hours',value:'4.5'}});handlers.get('input')({target:{name:'basis',value:'KEEP-ORIGINAL-DRAFT'}});const before=reads;await controller.refresh();assert.equal(reads,before+1);assert.equal(controller.hasUnsaved(),true);assert.equal(posted,null);failure=500;await controller.refresh();assert.equal(controller.hasUnsaved(),true);assert.equal(posted,null);assert.match(node.textContent,/失败|保留/);failure=null;await handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-nr-opinion]',querySelector:()=>node}});assert.equal(posted.hours,'4.5');assert.equal(posted.basis,'KEEP-ORIGINAL-DRAFT');handlers.get('input')({target:{name:'basis',value:'CLEAR-ON-SCOPE-DENIAL'}});failure=404;await controller.refresh();assert.equal(controller.hasUnsaved(),false);assert.match(root.innerHTML,/事项内容已清除/);
});

test('refresh received during an in-flight private read is rechecked after completion and cannot strand stale private drafts',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};const handlers=new Map(),node={textContent:''},root={innerHTML:'',querySelector:()=>node,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
 const privileged={...review,state:'SEALED',submittedCount:12,sourceParticipants:[{personId:'worker',role:'主做'}],capabilities:{readAllOpinions:true,finalizationView:true,finalize:true},opinions:[{accountId:'other',personId:'other',hours:2,basis:'QUEUED-PRIVATE-CANARY'}]},bounded={...privileged,capabilities:{readAllOpinions:false,finalizationView:false,finalize:false},opinions:[]};let withdrawn=false,reads=0,writes=0,release;
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path,options){if(options){writes++;throw Error('No automatic write');}if(path.endsWith('/finalization'))return new Promise(resolve=>{release=resolve;});if(path.endsWith('/case')){reads++;return {review:withdrawn?bounded:privileged};}return {items:[],nextCursor:null};}});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));assert.equal(typeof release,'function');assert.equal(controller.isBusy(),true);assert.match(root.innerHTML,/QUEUED-PRIVATE-CANARY/);handlers.get('input')({target:{name:'final_reason',value:'QUEUED-UNSUBMITTED-REASON'}});assert.equal(controller.hasUnsaved(),true);withdrawn=true;await controller.refresh();assert.equal(reads,1);release({finalization:null});for(let i=0;i<4;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(reads,2);assert.equal(controller.isBusy(),false);assert.equal(writes,0);assert.equal(controller.hasUnsaved(),false);assert.doesNotMatch(root.innerHTML,/QUEUED-PRIVATE-CANARY|QUEUED-UNSUBMITTED-REASON/);assert.match(root.innerHTML,/事项内容已清除/);
});

test('cancellation access denial clears the previous private detail and pending reason',async t=>{
 const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
 const handlers=new Map(),node={textContent:'',disabled:false},root={innerHTML:'',querySelector:()=>node,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
 const current={...review,revision:1,application:{...review.application,title:'PRIVATE-CANCEL-TITLE'},capabilities:{cancel:true}};
 const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',initialReviewId:'case',async api(path,options){if(options)throw Object.assign(Error('denied'),{status:403});return path.endsWith('/case')?{review:current}:{items:[],nextCursor:null};}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});await new Promise(resolve=>setImmediate(resolve));
 handlers.get('input')({target:{name:'cancelReason',value:'PRIVATE-CANCEL-REASON'}});handlers.get('input')({target:{name:'cancelConfirmed',checked:true}});
 await handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-nr-cancel]'}});
 assert.doesNotMatch(root.innerHTML,/PRIVATE-CANCEL|data-nr-cancel/);assert.match(root.innerHTML,/事项内容已清除/);assert.equal(controller.hasUnsaved(),false);
});
test('dirty opinions survive refresh and failed submission; successful server response seals the displayed case',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  let reads=0,fail=true,lastBody;
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',async api(path,options){
    if(options){lastBody=options.body;if(fail)throw new Error('意见版本已更新');return {review:{...review,state:'SEALED',capabilities:{submitOpinion:false},opinions:[{accountId:'me',hours:2.5,basis:'NEW',revision:2}]}};}
    reads++;return path.endsWith('/case')?{review}:{items:[{id:'case',title:'检查',category:'单项工作',chapter:'29',submittedCount:1,state:'IN_REVIEW'}],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const button={hasAttribute:attribute=>attribute==='data-nr-open',dataset:{nrOpen:'case'}};
  await handlers.get('click')({target:{closest:()=>button}});
  handlers.get('input')({target:{name:'hours',value:'2.5'}});handlers.get('input')({target:{name:'basis',value:'NEW'}});
  const before=reads;await controller.refresh();assert.equal(reads,before+1);assert.equal(controller.hasUnsaved(),true);
  const event={preventDefault(){},target:{matches:selector=>selector==='[data-nr-opinion]',querySelector:()=>fieldset}};
  await handlers.get('submit')(event);assert.equal(controller.hasUnsaved(),true);assert.equal(fieldset.disabled,false);assert.match(status.textContent,/输入已保留/);
  assert.deepEqual(lastBody,{revision:1,hours:'2.5',basis:'NEW'});
  fail=false;await handlers.get('submit')(event);assert.equal(controller.hasUnsaved(),false);assert.match(root.innerHTML,/<fieldset disabled>/);assert.match(root.innerHTML,/NEW/);
});

test('acceptance requires twelve manually selected people and an explicit finalizer and preserves failed choices',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const pending={...review,state:'PENDING_ACCEPTANCE',revision:1,opinions:[],capabilities:{assign:true,submitOpinion:false}};
  const members=Array.from({length:12},(_,index)=>({accountId:`a-${index}`,personId:`p-${index}`,name:`人员${index}`,employeeNo:`no-${index}`}));
  let fail=true,lastBody,posts=0;
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'boss',async api(path,options){
    if(options){posts++;lastBody=options.body;if(fail)throw new Error('资格已变化');return {review:{...pending,state:'IN_REVIEW',revision:2,capabilities:{assign:false,submitOpinion:false}}};}
    if(path.includes('/candidates'))return {items:path.includes('role=opinion')?members:[{accountId:'final',personId:'pf',name:'终审人',employeeNo:'no-final'}],truncated:false};
    return path.endsWith('/case')?{review:pending}:{items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const click=async attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset:{nrOpen:'case'}})}});
  await click('data-nr-open');await click('data-nr-candidates');
  assert.match(root.innerHTML,/已选 0\/12/);assert.ok(!root.innerHTML.includes(' checked'));
  const event={preventDefault(){},target:{matches:selector=>selector==='[data-nr-accept]',querySelector:()=>fieldset}};
  await handlers.get('submit')(event);assert.equal(posts,0);
  for(const member of members)handlers.get('input')({target:{name:'nominee',value:member.accountId,checked:true}});
  await handlers.get('submit')(event);assert.equal(posts,0);
  handlers.get('input')({target:{name:'finalizer',value:'final'}});
  await handlers.get('submit')(event);assert.equal(posts,1);assert.equal(controller.hasUnsaved(),true);assert.equal(fieldset.disabled,false);assert.match(status.textContent,/选择已保留/);
  assert.deepEqual(lastBody,{revision:1,accountIds:members.map(person=>person.accountId),finalizerAccountId:'final'});
  fail=false;await handlers.get('submit')(event);assert.equal(controller.hasUnsaved(),false);assert.ok(!root.innerHTML.includes('data-nr-accept'));
});

test('public suggestion retry never copies private opinion and each form preserves the other unsaved draft, including history paging',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const requests=[],historyPaths=[];let failSuggestion=true;
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',async api(path,options){
    if(options){requests.push({path,body:structuredClone(options.body)});
      if(path.endsWith('/suggestions')){if(failSuggestion){failSuggestion=false;throw new Error('响应丢失');}return {review:{...review,suggestions:[{field:'title',originalValue:'检查',proposedValue:'正式名称',reason:'术语统一',personId:'me',createdAt:'t'}]}};}
      return {review:{...review,opinions:[{accountId:'me',hours:3.2,basis:'PRIVATE-DRAFT',revision:2}]}};
    }
    if(path.includes('/opinion-history')){historyPaths.push(path);return {history:{entries:[{revision:path.includes('?')?1:2,hours:2,basis:'OWN-HISTORY'}],nextBeforeRevision:path.includes('?')?null:2}};}
    return path.endsWith('/case')?{review}:{items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const click=async attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset:{nrOpen:'case'}})}});
  const input=(name,value)=>handlers.get('input')({target:{name,value,checked:value===true}});
  const submit=async form=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector===form,querySelector:()=>fieldset}});
  await click('data-nr-open');input('hours','3.2');input('basis','PRIVATE-DRAFT');
  input('suggestionValue','正式名称');input('suggestionReason','术语统一');
  await submit('[data-nr-suggestion]');assert.equal(requests.length,0);
  input('privacyAcknowledged',true);await submit('[data-nr-suggestion]');
  assert.match(status.textContent,/均已保留/);assert.equal(controller.hasUnsaved(),true);
  await submit('[data-nr-suggestion]');
  assert.deepEqual(requests[0].body,requests[1].body);
  assert.deepEqual(Object.keys(requests[1].body).sort(),['clientId','field','privacyAcknowledged','proposedValue','reason'].sort());
  assert.ok(!JSON.stringify(requests[1].body).includes('PRIVATE-DRAFT'));assert.match(root.innerHTML,/PRIVATE-DRAFT/);
  assert.equal(controller.hasUnsaved(),true);
  input('suggestionField','chapter');input('suggestionValue','29-10');input('suggestionReason','核对章节');input('privacyAcknowledged',true);
  await submit('[data-nr-opinion]');assert.match(root.innerHTML,/29-10/);assert.match(root.innerHTML,/核对章节/);assert.equal(controller.hasUnsaved(),true);
  await click('data-nr-history');assert.match(root.innerHTML,/data-nr-history-more/);
  await click('data-nr-history-more');assert.match(historyPaths[1],/beforeRevision=2/);assert.ok(historyPaths.every(path=>!path.includes('personId')));
  assert.match(root.innerHTML,/版本 2/);assert.match(root.innerHTML,/版本 1/);assert.match(root.innerHTML,/29-10/);
});

test('seat replacement excludes submitted seats and preserves other drafts and original acceptance time',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const assigned={...review,revision:2,acceptedAt:'2026-11-09T00:00:00Z',capabilities:{submitOpinion:true,replaceSeat:true},seats:[{personId:'p-old',accountId:'old',personName:'原人员',submitted:false},{personId:'p-done',accountId:'done',personName:'已提交人员',submitted:true}]};
  let fail=true,lastBody,posts=0;
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',async api(path,options){
    if(options){posts++;lastBody=options.body;if(fail)throw new Error('版本冲突');return {review:{...assigned,revision:3,seats:[{personId:'p-new',accountId:'new',personName:'新人员',submitted:false},assigned.seats[1]]}};}
    if(path.includes('/candidates'))return {items:[{accountId:'new',personId:'p-new',name:'新人员',employeeNo:'00000001'}],truncated:false};
    return path.endsWith('/case')?{review:assigned}:{items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const click=async attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset:{nrOpen:'case'}})}});
  const input=(name,value)=>handlers.get('input')({target:{name,value}});
  const submit=()=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-nr-replace]',querySelector:()=>fieldset}});
  await click('data-nr-open');await click('data-nr-candidates');
  const form=root.innerHTML.slice(root.innerHTML.indexOf('<form data-nr-replace'),root.innerHTML.indexOf('<form data-nr-opinion'));
  assert.ok(!form.includes('value="p-done"'));assert.ok(form.includes('value="p-old"'));assert.ok(!form.includes('value="new" selected'));
  await submit();assert.equal(posts,0);
  input('basis','PRIVATE-UNSAVED');input('suggestionValue','PUBLIC-UNSAVED');input('replacePersonId','p-old');input('replacementAccountId','new');input('replaceReason','原人员无法参加');
  await submit();assert.equal(posts,1);assert.match(status.textContent,/其他草稿已保留/);assert.equal(fieldset.disabled,false);
  assert.deepEqual(lastBody,{revision:2,personId:'p-old',accountId:'new',reason:'原人员无法参加'});
  fail=false;await submit();assert.match(root.innerHTML,/PRIVATE-UNSAVED/);assert.match(root.innerHTML,/PUBLIC-UNSAVED/);
  assert.match(root.innerHTML,/2026-11-09T00:00:00Z/);assert.equal(controller.hasUnsaved(),true);
});

test('finalizer explicitly enters zero and verified roles, retains failed input and then sees immutable pending recognition',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const sealed={...review,state:'SEALED',revision:3,capabilities:{readAllOpinions:true,finalizationView:true,finalize:true},sourceParticipants:[{personId:'worker',role:'主做'}],statistics:{trimmedMean:6.5,median:6.5}};
  let fail=true,done=false,lastBody,posts=0;
  const finalization={decision:{...sealed.application,recognizedHours:0},channel:{state:'NEEDS_ATTENTION'}};
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'finalizer',async api(path,options){
    if(options){posts++;lastBody=structuredClone(options.body);if(fail)throw new Error('响应丢失');done=true;return {finalization};}
    if(path.endsWith('/finalization'))return {finalization:done?finalization:null};
    return path.endsWith('/case')?{review:done?{...sealed,state:'FINALIZED',capabilities:{readAllOpinions:true,finalizationView:true,sync:true}}:sealed}:{items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  await handlers.get('click')({target:{closest:()=>({hasAttribute:attr=>attr==='data-nr-open',dataset:{nrOpen:'case'}})}});
  const submit=()=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-nr-finalize]',querySelector:()=>fieldset}});
  await submit();assert.equal(posts,0);
  const input=(name,value)=>handlers.get('input')({target:{name,value,checked:value===true}});
  input('final_recognizedHours','0');input('final_participantsVerified',true);input('final_admissionDecision','EXCLUDE');input('final_reason','现场核对零认定');input('finalRoleSet_0_0',false);input('finalRoleSet_0_1',true);input('finalRoleSet_0_2',true);input('final_roleVerificationReason','实际核对角色');
  await submit();assert.equal(posts,0);input('final_participantsVerified',true);
  await controller.refresh();assert.equal(controller.hasUnsaved(),true);
  await submit();assert.equal(posts,1);assert.match(status.textContent,/终审输入已保留/);assert.equal(fieldset.disabled,false);
  assert.equal(lastBody.decision.recognizedHours,'0');assert.deepEqual(lastBody.participants,[{personId:'worker',role:'检验'},{personId:'worker',role:'辅助'}]);assert.equal(lastBody.statistics,undefined);
  fail=false;await submit();assert.equal(controller.hasUnsaved(),false);assert.match(root.innerHTML,/已认定，待处理/);assert.ok(!root.innerHTML.includes('data-nr-finalize'));
});

test('late preview cannot replace edited input and failed secondary detail load never leaves a different case on screen',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};
  const handlers=new Map(),status={textContent:''};let resolvePreview;
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const sealed={...review,application:{...review.application,title:'新终审事项'},state:'SEALED',revision:3,sourceParticipants:[{personId:'worker',role:'主做'}],capabilities:{readAllOpinions:true,finalizationView:true,finalize:true}};
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'finalizer',async api(path,options){
    if(options)return new Promise(resolve=>{resolvePreview=resolve;});
    if(path.endsWith('/finalization'))throw new Error('终审详情读取失败');
    return path.endsWith('/case')?{review:sealed}:{items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const click=attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset:{nrOpen:'case'}})}});
  await click('data-nr-open');assert.match(root.innerHTML,/新终审事项/);assert.match(status.textContent,/读取失败/);
  const input=(name,value)=>handlers.get('input')({target:{name,value,checked:value===true}});
  input('final_recognizedHours','2');input('final_participantsVerified',true);input('final_admissionDecision','PENDING');
  const pending=click('data-nr-final-preview');input('final_recognizedHours','3');
  resolvePreview({preview:{policyToken:'STALE-PREVIEW-CANARY',policy:{strategy:'EQUAL',version:'STALE-PREVIEW-CANARY'},differences:[],allocation:{available:false,reason:'old'}}});
  await pending;assert.match(status.textContent,/预览期间输入已变化/);assert.ok(!root.innerHTML.includes('STALE-PREVIEW-CANARY'));assert.equal(controller.hasUnsaved(),true);
});
