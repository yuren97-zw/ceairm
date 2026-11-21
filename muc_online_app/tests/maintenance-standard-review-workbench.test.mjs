import assert from 'node:assert/strict';
import test from 'node:test';
import {createReviewWorkbench,renderReviewWorkbench} from '../public/nonroutine-review-workbench.mjs';
import {initialStandardFinalDraft} from '../public/maintenance-standard-finalization-view.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const review={id:'standard-case',purpose:'STANDARD',state:'SEALED',revision:3,submittedCount:12,application:{title:'<新标准>',category:'单项工作',chapter:'29',workScope:'新范围',requestedHours:0},source:{standardId:'std',versionId:'v2',baseVersionId:'v1',requestReason:'修订依据',aircraft:{aircraftCodes:['A320'],genericAircraft:false},baseDefinition:{version:1,category:'单项工作',chapter:'29',title:'原标准',workScope:'原范围',standardHours:1,aircraftCodes:['A320'],genericAircraft:false}},capabilities:{readAllOpinions:true,finalize:true,finalizationView:true},opinions:[{personId:'other',accountId:'other',hours:9,basis:'PRIVATE-OTHER-CANARY'}],seats:[],suggestions:[]};
function harness(t,api,options={}){
  const previous=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
  const handlers=new Map(),status={textContent:''},fieldset={disabled:false};
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener(){}};
  const controller=createReviewWorkbench({root,api,escapeHtml:escape,accountId:'finalizer',purpose:'STANDARD',initialReviewId:review.id,...options});
  t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=previous;});
  return {root,status,controller,input:(name,value)=>handlers.get('input')({target:{name,value,checked:value===true}}),click:attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset:{nrOpen:review.id,nrNotificationOpen:'std-notice',nrNotificationRead:'std-notice'}})}}),submit:form=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector===form,querySelector:()=>fieldset}})};
}
test('standard view includes source and old version comparison, explicit blank hours and no work or publish controls',()=>{
  const html=renderReviewWorkbench({review,purpose:'STANDARD',finalDraft:initialStandardFinalDraft(review)},escape);
  assert.match(html,/&lt;新标准>/);assert.match(html,/修订依据/);assert.match(html,/原范围/);assert.match(html,/A320/);assert.match(html,/name="final_recognizedHours"[^>]*value=""/);
  assert.match(html,/PRIVATE-OTHER-CANARY/);assert.ok(!/data-nr-final-preview|data-nr-sync|data-nr-notifications|finalRole|final_participantsVerified|data-sm-action="publish"/.test(html));
  const member={...review,state:'FINALIZED',capabilities:{finalizationView:true},opinions:[]};
  const publicHtml=renderReviewWorkbench({review:member,purpose:'STANDARD',finalization:{decision:{...review.application,recognizedHours:0},admissionDecision:'INCLUDE',published:false}},escape);
  assert.match(publicHtml,/标准认定已锁定，尚未发布/);assert.ok(!publicHtml.includes('PRIVATE-OTHER-CANARY'));assert.ok(!publicHtml.includes('授权审议区'));
});
test('standard finalization retries identical five fields after successful post and failed read without roles or work API calls',async t=>{
  const requests=[];let committed=false,readFail=false,failOnce=true;
  const finalization={decision:{category:'单项工作',chapter:'29',title:'<新标准>',workScope:'新范围',recognizedHours:0},admissionDecision:'PENDING',published:false};
  const h=harness(t,async(path,options)=>{
    requests.push({path,...(options?{body:structuredClone(options.body)}:{})});assert.ok(path.startsWith('/maintenance/standard-reviews'));
    if(options){committed=true;readFail=failOnce;failOnce=false;return {finalization};}
    if(path.endsWith('/finalization'))return {finalization:committed?finalization:null};
    if(path.endsWith('/standard-case')){if(readFail){readFail=false;throw new Error('认定后详情暂时失败');}return {review:committed?{...review,state:'FINALIZED',capabilities:{readAllOpinions:true,finalizationView:true}}:review};}
    return {items:[],nextCursor:null};
  });await new Promise(resolve=>setImmediate(resolve));
  assert.match(h.root.innerHTML,/新范围/);await h.submit('[data-nr-finalize]');assert.equal(requests.filter(item=>item.body).length,0);
  h.input('final_recognizedHours','0');h.input('final_admissionDecision','PENDING');h.input('finalRoleSet_0_0',true);h.input('final_participantsVerified',true);
  await h.submit('[data-nr-finalize]');assert.match(h.status.textContent,/终审输入已保留/);assert.equal(h.controller.hasUnsaved(),true);
  const before=requests.length;await h.controller.refresh();await h.click('data-nr-notifications');await h.click('data-nr-notification-open');await h.click('data-nr-final-preview');await h.click('data-nr-sync');assert.equal(requests.length,before+1);assert.deepEqual(requests.at(-1),{path:'/maintenance/standard-reviews/standard-case'});
  await h.submit('[data-nr-finalize]');const posts=requests.filter(item=>item.body);assert.deepEqual(posts[0],posts[1]);assert.deepEqual(Object.keys(posts[0].body).sort(),['revision','decision','reason','admissionDecision'].sort());assert.equal(posts[0].body.decision.recognizedHours,'0');
  assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/标准认定已锁定，尚未发布/);assert.ok(!h.root.innerHTML.includes('data-nr-finalize'));assert.ok(!JSON.stringify(posts).includes('participants'));
});
test('assigned standard member opinion, suggestions and private history all stay in the standard namespace',async t=>{
  const paths=[],member={...review,state:'IN_REVIEW',capabilities:{submitOpinion:true},opinions:[]};
  const h=harness(t,async(path,options)=>{paths.push(path);if(options)return {review:member};if(path.includes('opinion-history'))return {history:{entries:[{revision:1,hours:0,basis:'MY-HISTORY'}],nextBeforeRevision:null}};if(path.endsWith('/standard-case'))return {review:member};return {items:[],nextCursor:null};});
  await new Promise(resolve=>setImmediate(resolve));h.input('hours','0');h.input('basis','本人意见');await h.submit('[data-nr-opinion]');
  h.input('suggestionValue','名称修订');h.input('suggestionReason','术语');h.input('privacyAcknowledged',true);await h.submit('[data-nr-suggestion]');await h.click('data-nr-history');
  assert.ok(paths.some(path=>path.endsWith('/opinion')));assert.ok(paths.some(path=>path.endsWith('/suggestions')));assert.match(h.root.innerHTML,/MY-HISTORY/);assert.ok(paths.every(path=>path.startsWith('/maintenance/standard-reviews')));assert.ok(!h.root.innerHTML.includes('PRIVATE-OTHER-CANARY'));
});
test('failed initial standard detail can retry and rejects a work source without showing it',async t=>{
  let fails=true,wrong=false;const h=harness(t,async path=>{if(path.endsWith('/standard-case')){if(fails)throw new Error('临时读取失败');return {review:wrong?{...review,purpose:'WORK',application:{...review.application,title:'WRONG-WORK-CANARY'}}:review};}return {items:[],nextCursor:null};});
  await new Promise(resolve=>setImmediate(resolve));assert.match(h.status.textContent,/临时读取失败/);fails=false;wrong=true;await h.controller.refresh();assert.match(h.status.textContent,/来源类型不匹配/);assert.ok(!h.root.innerHTML.includes('WRONG-WORK-CANARY'));wrong=false;await h.controller.refresh();assert.match(h.root.innerHTML,/新范围/);
});

test('enabled standard inbox uses only standard notification and case endpoints while preserving unsent opinions',async t=>{
  const requests=[],notice={id:'std-notice',caseId:review.id,eventType:'ASSIGNED',createdAt:'time',readAt:null,payload:{title:'新增标准评议任务',hours:99,basis:'PRIVATE-NOTICE-CANARY'}};
  const member={...review,state:'IN_REVIEW',capabilities:{submitOpinion:true},opinions:[]};let failRead=true;
  const h=harness(t,async(path,options)=>{requests.push({path,options});
    if(path.endsWith('/read')){if(failRead)throw new Error('临时已读失败');return {readAt:'read-time'};}
    if(path.endsWith('/standard-review-notifications'))return {notifications:[structuredClone(notice)]};
    if(path.endsWith('/standard-case'))return {review:member};return {items:[],nextCursor:null};
  },{notificationsEnabled:true});await new Promise(resolve=>setImmediate(resolve));
  h.input('basis','UNSENT-PRIVATE-OPINION');await h.click('data-nr-notifications');assert.match(h.root.innerHTML,/新增标准评议任务/);assert.match(h.root.innerHTML,/UNSENT-PRIVATE-OPINION/);assert.ok(!h.root.innerHTML.includes('PRIVATE-NOTICE-CANARY'));assert.ok(!h.root.innerHTML.includes('99'));
  const before=requests.length;await h.click('data-nr-notification-open');assert.equal(requests.length,before);
  await h.click('data-nr-notification-read');assert.match(h.status.textContent,/临时已读失败/);assert.match(h.root.innerHTML,/UNSENT-PRIVATE-OPINION/);assert.equal(h.controller.hasUnsaved(),true);
  failRead=false;await h.click('data-nr-notification-read');assert.match(h.root.innerHTML,/已读/);assert.match(h.root.innerHTML,/UNSENT-PRIVATE-OPINION/);
  globalThis.confirm=()=>true;await h.click('data-nr-notification-open');assert.equal(h.controller.hasUnsaved(),false);assert.ok(requests.every(item=>item.path.startsWith('/maintenance/standard-')));assert.ok(requests.filter(item=>item.options).every(item=>item.path.endsWith('/read')));
});
