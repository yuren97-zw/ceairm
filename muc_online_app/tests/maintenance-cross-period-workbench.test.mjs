import assert from 'node:assert/strict';
import test from 'node:test';
import {renderCrossPeriodWorkbench,createCrossPeriodWorkbench} from '../public/maintenance-cross-period-workbench.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const result={task:{id:'task',case_id:'case',source_month:'2026-09',state:'PENDING_AUTHORIZATION',revision:1,approved_revision:1},sourcePeriod:{month:'2026-09',state:'CLOSED',revision:3},capabilities:{authorize:true},authorization:{ok:false},history:[]};
test('cross-period view distinguishes authorization from posting and does not render arbitrary private data',()=>{
  const html=renderCrossPeriodWorkbench({result,items:[{id:'task',title:'<工作>',state:'PENDING_AUTHORIZATION'}],reason:'依据',privateBasis:'PRIVATE-CANARY'},escape);
  assert.match(html,/&lt;工作>/);assert.match(html,/工时仍统计在原作业月份/);assert.match(html,/授权成功不等于已入账/);assert.ok(!html.includes('PRIVATE-CANARY'));
  const locked=renderCrossPeriodWorkbench({result:{...result,task:{...result.task,state:'AUTHORIZED'},capabilities:{authorize:false},authorization:{ok:true}}},escape);
  assert.ok(!locked.includes('data-cp-authorize'));assert.match(locked,/不能重复覆盖/);
  const cancelled=renderCrossPeriodWorkbench({result:{...result,task:{...result.task,state:'CANCELLED',recordedState:'AUTHORIZED'},capabilities:{authorize:false},authorization:{ok:false,code:'REVIEW_CANCELLED'}}},escape);
  assert.match(cancelled,/原审核及一次性通道已取消关闭/);assert.ok(!cancelled.includes('data-cp-authorize'));assert.ok(!cancelled.includes('等待原审核通道核验入账'));
});
test('authorization requires a checked target, retains failed drafts and submits task and both period revisions without posting',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
  const handlers=new Map(),status={textContent:''},requests=[];
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(name,handler)=>handlers.set(name,handler),removeEventListener(){}};
  let fail=true;
  const controller=createCrossPeriodWorkbench({root,escapeHtml:escape,async api(path,options){requests.push({path,options});
    if(path.includes('/hour-periods/'))return {period:{month:path.endsWith('2026-10')?'2026-10':'2026-11',state:'OPEN',revision:2}};
    if(options){if(fail)throw new Error('原账期版本已变化');return {...result,task:{...result.task,state:'AUTHORIZED',revision:2,target_month:'2026-10'},capabilities:{authorize:false},authorization:{ok:true}};}
    if(path.includes('?'))return {items:[{id:'task',title:'检查',state:'PENDING_AUTHORIZATION'}],nextCursor:null};return structuredClone(result);
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=previous;});
  const input=(name,value)=>handlers.get('input')({target:{name,value}});
  const click=(attr,dataset={})=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset})}});
  const submit=()=>handlers.get('submit')({preventDefault(){},target:{matches:selector=>selector==='[data-cp-authorize]'}});
  await click('data-cp-query');assert.equal(requests.length,0);input('crossMonth','2026-09');await click('data-cp-query');await click('data-cp-open',{cpOpen:'task'});
  input('crossTargetMonth','2026-10');input('crossReason','跨期办理依据');await submit();assert.equal(requests.filter(item=>item.options).length,0);
  await click('data-cp-target');input('crossTargetMonth','2026-11');await submit();assert.equal(requests.filter(item=>item.options).length,0);
  input('crossTargetMonth','2026-10');await click('data-cp-target');
  input('crossMonth','2026-11');await submit();assert.equal(requests.filter(item=>item.options).length,0);input('crossMonth','2026-09');
  const before=requests.length;await controller.refresh();await click('data-cp-refresh');assert.equal(requests.length,before);assert.equal(controller.hasUnsaved(),true);
  await submit();assert.match(root.innerHTML,/原账期版本已变化/);assert.match(root.innerHTML,/跨期办理依据/);assert.equal(controller.hasUnsaved(),true);
  assert.deepEqual(requests.at(-1).options.body,{revision:1,sourceRevision:3,targetRevision:2,targetMonth:'2026-10',reason:'跨期办理依据'});
  fail=false;await submit();assert.equal(controller.hasUnsaved(),false);assert.match(root.innerHTML,/已授权，待核验入账/);assert.ok(!root.innerHTML.includes('data-cp-authorize'));
  assert.ok(requests.filter(item=>item.options).every(item=>item.path.endsWith('/authorize')));
});
