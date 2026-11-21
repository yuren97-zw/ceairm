import assert from 'node:assert/strict';
import test from 'node:test';
import {renderStandardPublication,createStandardPublicationWorkbench} from '../public/maintenance-standard-publication-workbench.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const result={standard:{id:'std',status:'DRAFT',revision:3},version:{id:'version',version:1,status:'DRAFT'},source:{decision:{category:'试车',chapter:'71',title:'<锁定标准>',workScope:'完整范围',recognizedHours:0},aircraft:{aircraftCodes:['A320'],genericAircraft:false},reviewAdmissionIntent:'INCLUDE'},admission:null,admissionHistory:[],publication:null,capabilities:{admit:true,publish:false},applicability:{ready:true,dictionaryVersion:2}};
const admitted={...result,standard:{...result.standard,revision:4},admission:{id:'admission',sequence:1,decision:'INCLUDE'},capabilities:{admit:true,publish:true}};
const item={standardId:'std',versionId:'version',version:1,title:'锁定标准',versionStatus:'DRAFT',admissionDecision:null};
function harness(t,api){
 const prior=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
 const handlers=new Map(),status={textContent:''},root={innerHTML:'',querySelector:()=>status,addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener(){}};
 const controller=createStandardPublicationWorkbench({root,api,escapeHtml:escape});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=prior;});
 return {root,status,controller,click:(attr,dataset={})=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset})}}),input:(name,value)=>handlers.get('input')({target:{name,value,checked:typeof value==='boolean'?value:undefined}}),submit:()=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-sp-save]'}})};
}
test('publisher view keeps locked zero readonly and does not turn review intent into an admission or default publication',()=>{
 const html=renderStandardPublication({result,mode:'admit'},escape);assert.match(html,/&lt;锁定标准>/);assert.match(html,/0 小时/);assert.match(html,/当前独立准入：尚未办理/);assert.ok(!html.includes('data-sp-mode="publish"'));assert.match(html,/<option value="">请明确选择/);assert.ok(!html.includes('selected'));
 assert.ok(!/name=".*(?:recognizedHours|category|workScope)"/.test(html));const blocked=renderStandardPublication({result:{...admitted,capabilities:{admit:true,publish:false},applicability:{ready:false,reason:'通用范围未批准'}}},escape);assert.match(blocked,/通用范围未批准/);assert.ok(!blocked.includes('data-sp-mode="publish"'));
});
test('admission retry retains exact reason and client id, never auto-publishes and blocks dirty refresh/navigation',async t=>{
 const calls=[];let fail=true;const h=harness(t,async(path,options)=>{calls.push({path,options:structuredClone(options)});if(options){if(fail)throw new Error('准入响应丢失');return {result:admitted,replayed:true};}return path.includes('/versions/')?{result}:{items:[item],nextCursor:null};});
 await new Promise(resolve=>setImmediate(resolve));await h.click('data-sp-open',{spOpen:'std',spVersion:'version'});await h.click('data-sp-mode',{spMode:'admit'});await h.submit();assert.equal(calls.filter(row=>row.options).length,0);
 h.input('publicationDecision','INCLUDE');h.input('publicationReason','明确独立准入依据');await h.submit();assert.match(h.root.innerHTML,/响应丢失/);assert.equal(h.controller.hasUnsaved(),true);
 const before=calls.length;await h.controller.refresh();await h.click('data-sp-open',{spOpen:'other',spVersion:'other'});assert.equal(calls.length,before);fail=false;await h.submit();
 const posts=calls.filter(row=>row.options);assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].path,'/maintenance/standard-publications/std/versions/version/admit');assert.deepEqual(Object.keys(posts[0].options.body).sort(),['revision','versionId','reason','decision','clientId'].sort());assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/此操作没有发布标准/);assert.ok(posts.every(row=>row.path.endsWith('/admit')));
});
test('publish requires an explicit activation, sends the current admission and preserves failed immediate requests for idempotent retry',async t=>{
 const posts=[];let fail=true;const published={...admitted,version:{...admitted.version,status:'PUBLISHED'},capabilities:{admit:false,publish:false},publication:{id:'published',effectiveAt:'2026-11-10T00:00:01Z',reason:'发布依据'}};
 const h=harness(t,async(path,options)=>{if(options){posts.push(structuredClone(options.body));if(fail)throw new Error('发布响应丢失');return {result:published};}return path.includes('/versions/')?{result:admitted}:{items:[item],nextCursor:null};});await new Promise(resolve=>setImmediate(resolve));await h.click('data-sp-open',{spOpen:'std',spVersion:'version'});await h.click('data-sp-mode',{spMode:'publish'});
 h.input('publicationReason','核对机型后发布');await h.submit();assert.equal(posts.length,0);h.input('publicationActivation','FUTURE');await h.submit();assert.equal(posts.length,0);h.input('publicationActivation','IMMEDIATE');await h.submit();assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/响应丢失/);assert.equal(posts[0].admissionId,'admission');assert.equal(posts[0].effectiveAt,'IMMEDIATE');assert.equal(posts[0].approved,undefined);assert.equal(posts[0].definition,undefined);
 fail=false;await h.submit();assert.deepEqual(posts[0],posts[1]);assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/历史报工未改变/);assert.ok(!h.root.innerHTML.includes('data-sp-mode="publish"'));
});
test('future activation carries an explicit Beijing offset and failed detail refresh preserves the editing context',async t=>{
 let failDetail=false,body;const h=harness(t,async(path,options)=>{if(options){body=options.body;throw new Error('保留输入');}if(path.includes('/versions/')){if(failDetail)throw new Error('详情暂不可读');return {result:admitted};}return {items:[item],nextCursor:null};});await new Promise(resolve=>setImmediate(resolve));await h.click('data-sp-open',{spOpen:'std',spVersion:'version'});await h.click('data-sp-mode',{spMode:'publish'});h.input('publicationActivation','FUTURE');h.input('publicationEffectiveLocal','2026-11-12T08:30');h.input('publicationReason','未来生效依据');await h.submit();assert.equal(body.effectiveAt,'2026-11-12T08:30:00+08:00');
 globalThis.confirm=()=>true;failDetail=true;await h.click('data-sp-query');assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/未来生效依据/);assert.match(h.root.innerHTML,/2026-11-12T08:30/);assert.match(h.root.innerHTML,/详情暂不可读/);
});
test('work intake requires explicit scope, preserves failed request identity and moves only to an unadmitted draft',async t=>{
 const work={source:{kind:'WORK_FINAL',caseId:'work-case',finalId:'work-final',decision:result.source.decision,reviewAdmissionIntent:'PENDING',workSource:{flightId:'flight',subtaskId:'task',reportBatchId:'batch'}},canIntake:true,prepared:null};
 const posts=[];let fail=true;const h=harness(t,async(path,options)=>{if(options){posts.push({path,body:structuredClone(options.body)});if(fail)throw new Error('转入响应丢失');return {result:{...result,source:{...result.source,kind:'WORK_FINAL'}},replayed:true};}if(path.endsWith('/work-case'))return {workSource:work};return {items:[],nextCursor:null};});
 await new Promise(resolve=>setImmediate(resolve));await h.click('data-sp-work',{spWork:'work-case'});assert.match(h.root.innerHTML,/0 小时/);await h.click('data-sp-intake');h.input('publicationReason','明确来源与机型');await h.submit();assert.equal(posts.length,0);
 h.input('publicationAircraftMode','EXACT');await h.submit();assert.equal(posts.length,0);h.input('publicationAircraftCodes','A320，A321');await h.submit();assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/转入响应丢失/);
 const before=posts.length;await h.controller.refresh();await h.click('data-sp-work',{spWork:'other'});assert.equal(posts.length,before);fail=false;await h.submit();assert.deepEqual(posts[0],posts[1]);assert.equal(posts[0].path,'/maintenance/standard-publication-work-sources/work-case/intake');assert.deepEqual(posts[0].body.aircraftCodes,['A320','A321']);assert.equal(posts[0].body.genericAircraft,false);assert.equal(posts[0].body.finalId,'work-final');assert.equal(posts[0].body.recognizedHours,undefined);assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/已建立待准入标准草稿/);assert.match(h.root.innerHTML,/打开已转入标准/);assert.ok(!h.root.innerHTML.includes('data-sp-mode="publish"'));
});

test('publication detail distinguishes scheduled, currently effective and superseded versions',()=>{
 for(const [lifecycle,label]of [['SCHEDULED','待生效'],['EFFECTIVE','当前生效'],['SUPERSEDED','已被新版替代']]){
   const html=renderStandardPublication({result:{...admitted,version:{...admitted.version,status:'PUBLISHED',lifecycle},capabilities:{admit:false,publish:false}}},escape);assert.match(html,new RegExp(label));assert.ok(!html.includes('data-sp-mode="publish"'));
 }
});

test('generic admission requires an explicit unchecked scope approval separate from publication',async t=>{
 const generic={...result,source:{...result.source,aircraft:{aircraftCodes:[],genericAircraft:true}},applicability:{ready:false,reason:'须逐条批准通用范围'}};
 const posts=[];const h=harness(t,async(path,options)=>{if(options){posts.push(options.body);return {result:{...generic,standard:{...generic.standard,revision:4},admission:{id:'generic-admission',decision:'INCLUDE'},capabilities:{admit:true,publish:true},applicability:{ready:true,genericAircraft:true}}};}return path.includes('/versions/')?{result:generic}:{items:[item],nextCursor:null};});
 await new Promise(resolve=>setImmediate(resolve));await h.click('data-sp-open',{spOpen:'std',spVersion:'version'});await h.click('data-sp-mode',{spMode:'admit'});
 h.input('publicationDecision','INCLUDE');h.input('publicationReason','逐条核验通用范围');assert.match(h.root.innerHTML,/name="publicationGenericScopeApproved"/);assert.ok(!h.root.innerHTML.includes('publicationGenericScopeApproved" checked'));
 await h.submit();assert.equal(posts.length,0);h.input('publicationGenericScopeApproved',true);await h.submit();assert.equal(posts.length,1);assert.equal(posts[0].genericScopeApproved,true);assert.equal(posts[0].effectiveAt,undefined);
});
