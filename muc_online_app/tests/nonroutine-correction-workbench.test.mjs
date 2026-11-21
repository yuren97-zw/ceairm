import test from 'node:test';
import assert from 'node:assert/strict';
import {createCorrectionWorkbench,renderCorrectionWorkbench} from '../public/nonroutine-correction-workbench.mjs';
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const source={subtaskId:'task',kind:'STANDARD',sourceVersion:'1',workMonth:'2026-09',currentHours:1,decision:{title:'<来源>',category:'单项工作',recognizedHours:1},people:[{personId:'person',name:'<甲>'}],participants:[{personId:'person',role:'主做'}]};
const record={id:'correction',subtaskId:'task',number:1,state:'APPROVED_PENDING_PERIOD',workMonth:'2026-09',statisticalMonth:'2026-09',handlingMonth:null,beforeHours:1,targetHours:0,deltaHours:-1,sourcePeriod:{state:'CLOSED',revision:3},authorizations:[],capabilities:{authorizePeriod:true}};
const preview={readOnly:true,number:1,token:'token',policy:{version:'frozen',ratios:{主做:1}},period:{state:'OPEN'},plan:{beforeHours:1,targetHours:0,deltaHours:-1,deltas:[{userName:'甲',role:'主做',beforeHours:1,targetHours:0,hours:-1}]}};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness(t,handler,caps={enabled:true,approve:true,authorizePeriod:false}){
 const prior=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
 const events=new Map(),requests=[],status={textContent:''};const root={innerHTML:'',querySelector:selector=>selector==='[data-hc-status]'?status:null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name)};
 const controller=createCorrectionWorkbench({root,escapeHtml:escape,async api(path,options){requests.push({path,options});if(path.endsWith('capabilities'))return caps;if(path.startsWith('/maintenance/nonroutine-corrections?')||path.startsWith('/maintenance/nonroutine-corrections/sources?'))return {items:[],nextCursor:null};return handler(path,options);}});
 t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=prior;});await tick();
 return {root,requests,status,controller,input:(name,value,checked=false)=>events.get('input')({target:{name,value,checked}}),click:(attribute,value)=>events.get('click')({target:{closest:()=>({hasAttribute:key=>key===attribute,dataset:{hcSource:value,hcOpen:value}})}}),submit:selector=>events.get('submit')({preventDefault(){},target:{matches:value=>value===selector}})};
}
test('correction page separates explicit zero, missing totals and owner aggregate-only actions',()=>{
 const html=renderCorrectionWorkbench({caps:{approve:true},source,participants:source.participants},escape);
 assert.match(html,/value="" required placeholder/);assert.match(html,/&lt;甲>/);assert.match(html,/type="submit" disabled/);assert.match(html,/原认定 1 小时/);
 const owner=renderCorrectionWorkbench({caps:{authorizePeriod:true},record},escape);assert.match(owner,/目标净额<strong>0 小时/);assert.match(owner,/差额<strong>-1 小时/);assert.match(owner,/授权并办理/);assert.ok(!owner.includes('data-hc-approval'));assert.ok(!owner.includes('差额明细'));
 const unknown=renderCorrectionWorkbench({record:{...record,targetHours:null}},escape);assert.match(unknown,/目标净额<strong>待核对/);
});
test('explicit reversal requires preview; failed approval preserves exact request identity and inputs',async t=>{
 let fail=true;const h=await harness(t,async(path,options)=>{if(path.endsWith('/preview'))return {preview};if(path.endsWith('/approve')){if(fail)throw Error('连接中断');return {correction:{...record,state:'POSTED',handlingMonth:'2026-09',capabilities:{newCorrection:true}}};}return {source};});
 await h.click('data-hc-source','task');h.input('hc_verified','',true);await h.click('data-hc-preview');assert.ok(!h.requests.some(item=>item.path.endsWith('/preview')));
 h.input('hc_amount','0');await h.click('data-hc-preview');assert.match(h.root.innerHTML,/只读预览，尚未批准/);h.input('hc_reason','核对后全额冲销');await h.submit('[data-hc-approval]');
 assert.equal(h.controller.hasUnsaved(),true);assert.match(h.root.innerHTML,/核对后全额冲销/);assert.match(h.root.innerHTML,/连接中断/);const failed=h.requests.at(-1);assert.equal(failed.options.body.recognizedHours,'0');
 const count=h.requests.length;await h.controller.refresh();assert.equal(h.requests.length,count);fail=false;await h.submit('[data-hc-approval]');assert.deepEqual(h.requests.at(-1),failed);assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/已入账/);
});
test('changed amount or participant verification invalidates preview; role removal cannot approve omitted people',async t=>{
 const h=await harness(t,async path=>path.endsWith('/preview')?{preview}:{source});await h.click('data-hc-source','task');h.input('hc_amount','0');h.input('hc_verified','',true);await h.click('data-hc-preview');
 h.input('hc_amount','0.5');h.input('hc_reason','依据');const count=h.requests.length;await h.submit('[data-hc-approval]');assert.equal(h.requests.length,count);
 await h.click('data-hc-preview');h.input('hc_verified','',false);await h.submit('[data-hc-approval]');assert.equal(h.requests.length,count+1);
 h.input('hc_verified','',true);h.input('hc_role_0_0','',false);assert.match(h.root.innerHTML,/name="hc_verified"  required/);await h.click('data-hc-preview');assert.equal(h.requests.length,count+1);assert.match(h.status.textContent,/每名原参与人/);
});
test('owner verifies a separate open month and retries lost-response authorization without extra finance fields',async t=>{
 let fail=true;const h=await harness(t,async(path,options)=>{if(path.includes('/target-period?'))return {target:{month:'2026-11',state:'OPEN',revision:8}};if(path.endsWith('/authorize-period')){if(fail)throw Error('回执丢失');return {correction:{...record,state:'POSTED',handlingMonth:'2026-11',capabilities:{}}};}return {correction:record};},{enabled:true,approve:false,authorizePeriod:true});
 await h.click('data-hc-open','correction');h.input('hc_target_month','2026-09');await h.click('data-hc-target');assert.ok(!h.requests.some(item=>item.path.includes('/target-period?')));
 h.input('hc_target_month','2026-11');h.input('hc_period_reason','原月份负责人授权');await h.submit('[data-hc-period]');assert.ok(!h.requests.some(item=>item.path.endsWith('/authorize-period')));
 await h.click('data-hc-target');await h.submit('[data-hc-period]');const failed=h.requests.at(-1);assert.deepEqual(Object.keys(failed.options.body).sort(),['clientId','reason','sourceRevision','targetMonth','targetRevision']);assert.equal(failed.options.body.sourceRevision,3);
 fail=false;await h.submit('[data-hc-period]');assert.deepEqual(h.requests.at(-1),failed);assert.equal(h.controller.hasUnsaved(),false);assert.match(h.root.innerHTML,/2026-11/);
});
test('incomplete receipts preserve editor; permission loss clears private data and disposed requests do not repaint',async t=>{
 let reject=false;const h=await harness(t,async(path)=>{if(path.endsWith('/preview')){if(reject)throw Object.assign(Error('授权已收回'),{status:403});return {preview};}return {source};});
 await h.click('data-hc-source','task');h.input('hc_amount','0');h.input('hc_verified','',true);h.input('hc_reason','应保留依据');globalThis.confirm=()=>true;
 await h.click('data-hc-open','broken');assert.match(h.root.innerHTML,/应保留依据/);assert.equal(h.controller.hasUnsaved(),true);
 reject=true;await h.click('data-hc-preview');assert.equal(h.controller.hasUnsaved(),false);assert.ok(!h.root.innerHTML.includes('&lt;甲>'));assert.ok(!h.root.innerHTML.includes('应保留依据'));
});
test('disposed requests do not repaint a previous account panel',async t=>{
 let resolve;const deferred=await harness(t,()=>new Promise(r=>{resolve=r;}));const opening=deferred.click('data-hc-source','task');deferred.controller.destroy();const html=deferred.root.innerHTML;resolve({source});await opening;assert.equal(deferred.root.innerHTML,html);
});
