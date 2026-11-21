import assert from 'node:assert/strict';
import test from 'node:test';
import {renderReviewNotifications} from '../public/nonroutine-notification-view.mjs';
import {createReviewWorkbench} from '../public/nonroutine-review-workbench.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const notice={id:'notice',caseId:'case',eventType:'REMINDER_36',createdAt:'2026-11-10',readAt:null,payload:{title:'协调提醒',submittedCount:11,pendingPeople:[{name:'<人员>',employeeNo:'123'}],hours:99,basis:'PRIVATE-CANARY'}};
test('inbox shows current pending names and explicit read state without rendering extra private fields',()=>{
  const html=renderReviewNotifications([notice],escape);assert.match(html,/11\/12/);assert.match(html,/&lt;人员>/);assert.match(html,/未读/);assert.ok(!html.includes('PRIVATE-CANARY'));assert.ok(!html.includes('99'));
  assert.match(renderReviewNotifications(null,escape),/点击查询/);assert.match(renderReviewNotifications([],escape),/没有可办理/);
});
test('notice refresh and read preserve opinion drafts; refused navigation does not read or fetch another case',async t=>{
  const previous=[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm];globalThis.addEventListener=()=>{};globalThis.removeEventListener=()=>{};globalThis.confirm=()=>false;
  const handlers=new Map(),status={textContent:''},requests=[];
  const root={innerHTML:'',querySelector:()=>status,addEventListener:(type,handler)=>handlers.set(type,handler),removeEventListener(){}};
  const review={id:'case',state:'IN_REVIEW',submittedCount:0,application:{title:'工作',requestedHours:2},capabilities:{submitOpinion:true},opinions:[],suggestions:[]};
  let readFails=true;
  const controller=createReviewWorkbench({root,escapeHtml:escape,accountId:'me',async api(path,options){requests.push({path,options});
    if(path.endsWith('/read')){if(readFails)throw new Error('当前任务已变化');return {readAt:'read-time'};}
    if(path.endsWith('/nonroutine-review-notifications'))return {notifications:[structuredClone(notice)]};
    if(path.endsWith('/case'))return {review};return {items:[],nextCursor:null};
  }});t.after(()=>{controller.destroy();[globalThis.addEventListener,globalThis.removeEventListener,globalThis.confirm]=previous;});
  await new Promise(resolve=>setImmediate(resolve));
  const click=(attr,dataset={})=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr,dataset})}});
  await click('data-nr-open',{nrOpen:'case'});handlers.get('input')({target:{name:'basis',value:'PRIVATE-DRAFT'}});
  await click('data-nr-notifications');assert.match(root.innerHTML,/PRIVATE-DRAFT/);assert.equal(controller.hasUnsaved(),true);
  const before=requests.length;await click('data-nr-notification-open',{nrNotificationOpen:'notice'});assert.equal(requests.length,before);
  await click('data-nr-notification-read',{nrNotificationRead:'notice'});assert.match(status.textContent,/当前任务已变化/);assert.match(root.innerHTML,/未读/);
  readFails=false;await click('data-nr-notification-read',{nrNotificationRead:'notice'});assert.match(root.innerHTML,/已读/);assert.match(root.innerHTML,/PRIVATE-DRAFT/);assert.equal(controller.hasUnsaved(),true);
  assert.equal(requests.filter(item=>item.options).every(item=>item.path.endsWith('/read')),true);
});
