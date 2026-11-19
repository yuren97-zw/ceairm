import assert from 'node:assert/strict';
import test from 'node:test';
import {renderStandardManagement,createStandardManagementWorkbench} from '../public/maintenance-standard-management-workbench.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const version={id:'v1',version:1,status:'DRAFT',admission_decision:'PENDING',category:'单项工作',chapter:'29',title:'<检查>',work_scope:'左侧',standard_hours:0,aircraftCodes:['A320'],generic_aircraft:0,capabilities:{update:true,withdraw:true,disable:false,revise:false}};
const result={standard:{id:'s1',status:'DRAFT',revision:1},versions:[version],history:[]};
test('management view shows immutable versions and pending admission without exposing a publication control',()=>{
  const html=renderStandardManagement({result,mode:'create'},escape);assert.match(html,/&lt;检查>/);assert.match(html,/0 小时/);assert.match(html,/准入待定/);assert.match(html,/value="" required/);assert.ok(!html.includes('data-sm-action="disable"'));
  assert.ok(!html.includes('data-sm-action="publish"'));assert.match(html,/当前页面仅建立修订草稿/);
  const pub=renderStandardManagement({result:{...result,standard:{...result.standard,status:'PUBLISHED'},versions:[{...version,status:'PUBLISHED',capabilities:{disable:true,revise:true}}]}},escape);
  assert.ok(!pub.includes('data-sm-action="update"'));assert.match(pub,/data-sm-action="revise"/);
});
function harness(t,api,options={}){
  const previous=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
  const handlers=new Map(),status={textContent:''},root={innerHTML:'',querySelector:()=>status,addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener(){}};
  const controller=createStandardManagementWorkbench({root,api,escapeHtml:escape,...options});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=previous;});
  return {root,status,controller,input:(name,value)=>handlers.get('input')({target:{name,value}}),click:(attr,dataset={})=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset})}}),submit:()=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-sm-save]'}})};
}
test('create requires explicit zero and applicability, retries with the same client id and does not submit publication fields',async t=>{
  const calls=[];let fail=true;
  const h=harness(t,async(path,options)=>{calls.push({path,options});if(options){if(fail)throw new Error('响应丢失');return structuredClone(result);}return {items:[],nextCursor:null};});
  await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-create');
  for(const [name,value] of Object.entries({category:'单项工作',chapter:'29',title:'检查',workScope:'左侧',codes:'A320',applicability:'EXACT'}))h.input(`standard_${name}`,value);h.input('standardReason','新增依据');
  await h.submit();assert.equal(calls.filter(item=>item.options).length,0);
  h.input('standard_standardHours','0');await h.submit();assert.match(h.root.innerHTML,/响应丢失/);assert.equal(h.controller.hasUnsaved(),true);
  const before=calls.length;await h.controller.refresh();await h.click('data-sm-create');assert.equal(calls.length,before);assert.match(h.root.innerHTML,/新增依据/);
  fail=false;await h.submit();const posts=calls.filter(item=>item.options);assert.deepEqual(posts[0],posts[1]);
  assert.deepEqual(Object.keys(posts[1].options.body).sort(),['reason','definition','clientId'].sort());assert.equal(posts[1].options.body.definition.standardHours,'0');assert.equal(posts[1].options.body.definition.genericAircraft,false);
  assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/未发布草稿已保存/);
});
test('edit binds version and revision, failed explicit refresh retains drafts, withdrawal is an explicit reasoned action',async t=>{
  const calls=[];let detailFail=false;
  const h=harness(t,async(path,options)=>{calls.push({path,options});if(options)return {...result,standard:{...result.standard,status:'DISABLED',revision:2},versions:[{...version,status:'WITHDRAWN',capabilities:{}}]};if(path.includes('?'))return {items:[],nextCursor:null};if(detailFail)throw new Error('读取版本失败');return structuredClone(result);});
  await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});await h.click('data-sm-action',{smAction:'update',smVersion:'v1'});
  h.input('standard_workScope','新范围');h.input('standardReason','修改依据');globalThis.confirm=()=>true;detailFail=true;await h.click('data-sm-query');assert.match(h.root.innerHTML,/新范围/);assert.equal(h.controller.hasUnsaved(),true);
  detailFail=false;await h.click('data-sm-action',{smAction:'withdraw',smVersion:'v1'});await h.submit();assert.equal(calls.filter(item=>item.options).length,0);
  h.input('standardReason','明确撤回');await h.submit();const post=calls.filter(item=>item.options).at(-1);assert.equal(post.path,'/maintenance/standard-management/s1/withdraw');assert.equal(post.options.body.revision,1);assert.equal(post.options.body.versionId,'v1');assert.equal(post.options.body.reason,'明确撤回');assert.equal(post.options.body.definition,undefined);
  assert.match(h.root.innerHTML,/未发布草稿已撤回/);assert.equal(h.controller.hasUnsaved(),false);
});

test('review request binds source revision and keeps original idempotency key if the post succeeds but detail reload fails',async t=>{
  const calls=[];let committed=false,detailFail=true;
  const available={...result,versions:[{...version,capabilities:{requestReview:true}}]};
  const locked={...result,standard:{...result.standard,revision:2},versions:[{...version,reviewCaseId:'standard-case',capabilities:{viewReview:true}}]};
  const h=harness(t,async(path,options)=>{calls.push({path,options:structuredClone(options)});if(options){committed=true;return {review:{id:'standard-case'},replayed:false};}if(path.includes('?'))return {items:[],nextCursor:null};if(committed&&detailFail)throw new Error('申请后读取失败');return structuredClone(committed?locked:available);});
  await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});await h.click('data-sm-action',{smAction:'requestReview',smVersion:'v1'});
  assert.match(h.root.innerHTML,/提交标准评议申请/);assert.ok(!h.root.innerHTML.includes('name="standard_standardHours"'));
  await h.submit();assert.equal(calls.filter(item=>item.options).length,0);h.input('standardReason','申请依据');await h.submit();assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/申请后读取失败/);assert.match(h.root.innerHTML,/申请依据/);
  detailFail=false;await h.submit();const posts=calls.filter(item=>item.options);assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].path,'/maintenance/standard-management/s1/request-review');assert.deepEqual(Object.keys(posts[0].options.body).sort(),['revision','versionId','reason','clientId'].sort());assert.equal(posts[0].options.body.revision,1);
  assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/data-sm-review="standard-case"/);assert.ok(!h.root.innerHTML.includes('data-sm-action="requestReview"'));assert.ok(!h.root.innerHTML.includes('data-sm-action="update"'));
});

test('opening a bound review respects unsaved draft confirmation and preserves input on navigation failure',async t=>{
  let opened=0;const linked={...result,versions:[{...version,reviewCaseId:'standard-case',capabilities:{viewReview:true,update:true}}]};
  const h=harness(t,async path=>path.includes('?')?{items:[],nextCursor:null}:linked,{async onReview(id){assert.equal(id,'standard-case');opened++;throw new Error('评议入口不可用');}});
  await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});await h.click('data-sm-action',{smAction:'update',smVersion:'v1'});h.input('standardReason','尚未保存');
  await h.click('data-sm-review',{smReview:'standard-case'});assert.equal(opened,0);globalThis.confirm=()=>true;await h.click('data-sm-review',{smReview:'standard-case'});assert.equal(opened,1);assert.match(h.status.textContent,/评议入口不可用/);assert.match(h.root.innerHTML,/尚未保存/);assert.equal(h.controller.hasUnsaved(),true);
});

test('published revision edits a separate draft, binds the selected base and preserves failed requests',async t=>{
 const pub={...version,status:'PUBLISHED',lifecycle:'EFFECTIVE',admission_decision:'INCLUDE',capabilities:{revise:true,disable:true}},available={...result,standard:{...result.standard,status:'PUBLISHED',revision:7},versions:[pub]};
 const next={...available,standard:{...available.standard,revision:8},versions:[{...version,id:'v2',version:2,lifecycle:'DRAFT',standard_hours:1.2,capabilities:{requestReview:true}},pub]};
 const calls=[];let fail=true;const h=harness(t,async(path,options)=>{calls.push({path,options:structuredClone(options)});if(options){if(fail)throw new Error('修订响应丢失');return next;}return path.includes('?')?{items:[],nextCursor:null}:available;});
 await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});assert.match(h.root.innerHTML,/当前生效/);assert.ok(!h.root.innerHTML.includes('data-sm-action="update"'));await h.click('data-sm-action',{smAction:'revise',smVersion:'v1'});assert.match(h.root.innerHTML,/旧版继续有效/);h.input('standard_standardHours','1.2');h.input('standardReason','新版修订依据');await h.submit();assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/修订响应丢失/);fail=false;await h.submit();const posts=calls.filter(item=>item.options);assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].path,'/maintenance/standard-management/s1/revise');assert.equal(posts[0].options.body.baseVersion,1);assert.equal(posts[0].options.body.revision,7);assert.equal(posts[0].options.body.definition.standardHours,'1.2');assert.equal(posts[0].options.body.versionId,undefined);assert.ok(!posts.some(item=>item.path.includes('publish')));assert.match(h.root.innerHTML,/版本 2/);assert.match(h.root.innerHTML,/当前生效/);assert.equal(h.controller.hasUnsaved(),false);
 const future=renderStandardManagement({result:{...next,versions:[{...next.versions[0],status:'PUBLISHED',lifecycle:'SCHEDULED',effective_at:'2027-01-01T00:00:00Z'},pub]}},escape);assert.match(future,/待生效/);assert.match(future,/当前生效/);
});

test('catalog filters are sent together and changing a filter prevents pagination of the old query',async t=>{
 const calls=[];const h=harness(t,async path=>{calls.push(path);return {items:[{id:'s1',version:2,title:'最新名称',status:'PUBLISHED',lifecycle:'SCHEDULED',references:{available:true,workItems:1,draftWorkItems:0,formalWorkItems:1},matchedVersions:[{version:1,lifecycle:'EFFECTIVE'}]}],nextCursor:'cursor'};});await new Promise(resolve=>setImmediate(resolve));assert.match(h.root.innerHTML,/工作引用 1 项/);assert.match(h.root.innerHTML,/命中 V1/);h.input('standardFilterCategory','单项工作');h.input('standardFilterAircraft','A320');h.input('standardFilterLifecycle','EFFECTIVE');h.input('standardFilterReferences','HAS_WORK');const before=calls.length;await h.click('data-sm-more');assert.equal(calls.length,before);await h.click('data-sm-query');const query=new URL('http://test'+calls.at(-1)).searchParams;assert.equal(query.get('category'),'单项工作');assert.equal(query.get('aircraftCode'),'A320');assert.equal(query.get('lifecycle'),'EFFECTIVE');assert.equal(query.get('references'),'HAS_WORK');await h.click('data-sm-more');assert.equal(new URL('http://test'+calls.at(-1)).searchParams.get('cursor'),'cursor');
});
test('reference labels distinguish unknown from zero and retain explicit withdrawal protection',()=>{
 const html=renderStandardManagement({result:{...result,references:{available:false,workItems:null},versions:[{...version,references:{available:false,workItems:null},withdrawBlockReason:'引用量未核实，暂不能修改或撤回',capabilities:{}}]}},escape);assert.match(html,/工作引用量待核实/);assert.ok(!html.includes('工作引用 0 项'));assert.match(html,/暂不能修改或撤回/);assert.ok(!html.includes('data-sm-action="withdraw"'));
 const zero=renderStandardManagement({result:{...result,references:{available:true,workItems:0,draftWorkItems:0,formalWorkItems:0},versions:[{...version,references:{available:true,workItems:0,draftWorkItems:0,formalWorkItems:0,sourceTraces:2,standardImportRows:1,originWorkRecognitions:0}}]}},escape);assert.match(zero,/工作引用 0 项/);assert.match(zero,/标准文件来源 1 行/);assert.match(zero,/不重复计作工作/);
});

test('management access loss clears previously visible details and blocks stale saves',async t=>{
 for(const status of [401,403,404])await t.test(String(status),async t=>{
  let denied=false,posts=0;const privateResult={...structuredClone(result),versions:[{...structuredClone(version),title:'旧权限私有标准'}]};
  const h=harness(t,async(path,options)=>{if(options)posts++;if(denied)throw Object.assign(Error('访问失效'),{status});return path.endsWith('/s1')?privateResult:{items:[{id:'s1',title:'旧权限私有标准',version:1}],nextCursor:null};});
  await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});assert.match(h.root.innerHTML,/旧权限私有标准/);denied=true;await h.controller.refresh();assert.ok(!h.root.innerHTML.includes('旧权限私有标准'));assert.equal(h.controller.hasUnsaved(),false);await h.submit();assert.equal(posts,0);
 });
});
test('denied management save removes draft reason and pending request instead of offering replay',async t=>{
 let denied=false,posts=0;const h=harness(t,async(path,options)=>{if(options){posts++;throw Object.assign(Error('无管理权限'),{status:403});}return path.endsWith('/s1')?structuredClone(result):{items:[],nextCursor:null};});
 await new Promise(resolve=>setImmediate(resolve));await h.click('data-sm-open',{smOpen:'s1'});await h.click('data-sm-action',{smAction:'update',smVersion:'v1'});h.input('standardReason','不得遗留的操作依据');await h.submit();assert.equal(posts,1);assert.equal(h.controller.hasUnsaved(),false);assert.ok(!h.root.innerHTML.includes('不得遗留的操作依据'));await h.submit();assert.equal(posts,1);
});
