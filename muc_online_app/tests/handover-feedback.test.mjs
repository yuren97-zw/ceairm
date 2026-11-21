import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('handover remark indicator only uses live remarks and stays independent of navigation',()=>{
 const ui={view:{mode:'detail'},detail:{opportunities:[{flightId:'f',snapshot:{remark:'old'},live:null}]}};
 const context=vm.createContext({handoverUi:ui,escapeHtml});
 vm.runInContext(extract('function handoverRemarkIndicatorHtml(', 'function syncHandoverRemarkDialog('),context);
 assert.equal(vm.runInContext('handoverRemarkFlight("f")',context),null);
 assert.equal(vm.runInContext('handoverRemarkIndicatorHtml({id:"f",remark:"  "})',context),'');
 const html=vm.runInContext('handoverRemarkIndicatorHtml({id:"f",remark:"最新备注"})',context);
 assert.match(html,/data-hov-remark="f"/);assert.doesNotMatch(html,/goto|dispatch|expand/);
 ui.view={mode:'list'};ui.options=[];ui.editor={opportunities:[{flightId:'f',live:{id:'f',remark:'草稿实时备注'}}]};
 assert.equal(vm.runInContext('handoverRemarkFlight("f").remark',context),'草稿实时备注');
});
function submitFixture({save=true,submitError=false,renderError=false}={}){
 const ui={submitting:false,editor:{id:'draft',version:1,toTeamId:'team',recipients:[{}],opportunities:[{}],otherItems:''}};
 let submissions=0,prompts=0,resolve;
 const submitted=new Promise(r=>resolve=r);
 const context=vm.createContext({handoverUi:ui,handoverRepaint:()=>{},saveHandoverDraft:async()=>save,
 apiRequest:async()=>{submissions++;await submitted;if(submitError)throw Error('network');},
 renderHandover:()=>{if(renderError)throw Error('render');},newHandoverEditor:()=>({}),showHandoverSubmitted:()=>prompts++});
 vm.runInContext(extract('async function submitHandover(', 'async function gotoHandoverMaintenance('),context);
 return {ui,context,resolve,submissions:()=>submissions,prompts:()=>prompts};
}
test('submission is single-flight and acknowledgment is shown only after commit',async()=>{
 const f=submitFixture();const first=vm.runInContext('submitHandover()',f.context);
 await vm.runInContext('submitHandover()',f.context);await Promise.resolve();
 assert.equal(f.submissions(),1);assert.equal(f.prompts(),0);f.resolve();await first;
 assert.equal(f.prompts(),1);assert.equal(f.ui.editor,null);assert.equal(f.ui.tab,'create');assert.equal(f.ui.submitting,false);
});
test('failed draft save or submit preserves the form and never shows success',async()=>{
 const failedSave=submitFixture({save:false});await vm.runInContext('submitHandover()',failedSave.context);
 assert.equal(failedSave.submissions(),0);assert.equal(failedSave.prompts(),0);assert.ok(failedSave.ui.editor);
 const f=submitFixture({submitError:true});f.resolve();await vm.runInContext('submitHandover()',f.context);
 assert.equal(f.prompts(),0);assert.match(f.ui.editor.message,/提交失败/);assert.equal(f.ui.submitting,false);
});
test('a post-commit refresh failure still shows success and never invites resubmission',async()=>{
 const f=submitFixture({renderError:true});f.resolve();await vm.runInContext('submitHandover()',f.context);
 assert.equal(f.prompts(),1);assert.match(f.ui.editor.message,/已提交.*刷新失败/);assert.doesNotMatch(f.ui.editor.message,/提交失败/);
});
test('pending details group each opportunity and its own note without changing history layout',()=>{
 const detail={handover:{id:'h',status:'pending',fromTeamName:'一组',toTeamName:'二组',version:1},recipients:[],opportunities:[
  {id:'e1',flightId:'f1',note:'第一条说明',live:{id:'f1',remark:'实时备注',aircraftNo:'6587',stand:'桥位3',date:'2026-11-16',flightNo:'MU1234',subtasks:[],status:'已派工'}},
  {id:'e2',flightId:'f2',note:'',live:{id:'f2',remark:'',subtasks:[],status:'未派工'}}
 ]};
 const ui={tab:'pending',detail,changesOpen:'opp:e1'};
 const context=vm.createContext({handoverUi:ui,state:{user:{id:'u'}},escapeHtml,hasRbac:()=>false,
 handoverTabsHtml:()=>'',handoverTime:()=>'',handoverStatusBadgeClass:()=>'',handoverStatusText:()=>'',
 maintenanceOpportunityTag:()=>'<span>航后</span>',maintenanceStatusBadge:()=>'<span>已派工</span>',
 handoverOpportunityBodyHtml:()=>'<div class="execute-main-work">原执行内容</div>'});
 vm.runInContext(extract('function handoverRemarkIndicatorHtml(', 'function handoverRemarkFlight(')+extract('function handoverNonroutineCountsHtml(', 'function handoverNonroutineListHtml(')+extract('function handoverDetailBodyHtml(', 'function handoverChangesBlockHtml('),context);
 let html=vm.runInContext('handoverDetailBodyHtml()',context);
 const cards=[...html.matchAll(/<article class="handover-note-card[\s\S]*?<\/article>/g)].map(m=>m[0]);
 assert.equal(cards.length,2);assert.ok(cards.every(c=>c.includes('handover-opportunity-set')));
 const summary=cards[0].slice(0,cards[0].indexOf('</button>'));
 assert.match(summary,/航后[\s\S]*6587[\s\S]*桥位3[\s\S]*2026-11-16[\s\S]*非例行 0 项/);
 assert.doesNotMatch(summary,/MU1234/);
 assert.match(cards[0],/第一条说明/);assert.doesNotMatch(cards[1],/第一条说明/);
 assert.match(cards[1],/未填写交接说明/);assert.match(cards[0],/data-hov-remark="f1"/);
 assert.match(cards[0],/原执行内容/);assert.doesNotMatch(cards[1],/原执行内容/);
 assert.ok(cards[0].indexOf('原执行内容')<cards[0].indexOf('第一条说明'),'展开内容位于说明之前');
 assert.match(cards[0],/进港[\s\S]*落地[\s\S]*起飞[\s\S]*出港[\s\S]*地点/);
 ui.tab='history';html=vm.runInContext('handoverDetailBodyHtml()',context);
 assert.doesNotMatch(html,/handover-opportunity-set/);assert.match(html,/data-hov-remark="f1"/);
});

test('handover summary counts formal work and shared drafts separately, missing is not zero',()=>{
 const c=vm.createContext({escapeHtml});vm.runInContext(extract('function handoverNonroutineCountsHtml(', 'function handoverNonroutineListHtml('),c);
 assert.match(vm.runInContext('handoverNonroutineCountsHtml({subtasks:[],nonroutineDraft:null})',c),/非例行 0 项/);
 const html=vm.runInContext('handoverNonroutineCountsHtml({subtasks:[{}],nonroutineDraft:{items:[{},{}]}})',c);
 assert.match(html,/非例行 1 项/);assert.match(html,/草稿 2 项/);
 assert.match(vm.runInContext('handoverNonroutineCountsHtml(null)',c),/非例行 — 项/);
 const times=vm.runInContext('handoverFlightTimesHtml({plannedArrival:"1234",plannedDeparture:"1345"})',c);
 assert.match(times,/落地<\/span> 1234/);assert.match(times,/起飞<\/span> 1345/);
 assert.match(times,/进港<\/span> —/);assert.match(times,/出港<\/span> —/);
});

test('shared draft work shows explanation and unsubmitted assignment state',()=>{
 const c=vm.createContext({escapeHtml,maintenanceDraftSubtaskCard:item=>`<article>${escapeHtml(item.title)}</article>`});
 vm.runInContext(extract('function handoverDraftSubtaskHtml(', 'function handoverOpportunityBodyHtml('),c);
 const html=vm.runInContext('handoverDraftSubtaskHtml({title:"草稿工作",reportExplanation:"检查右发",entries:[{personId:"p1"}]})',c);
 assert.match(html,/草稿工作/);assert.match(html,/检查右发/);assert.match(html,/已选派工人员，未提交/);
 assert.match(vm.runInContext('handoverDraftSubtaskHtml({entries:[]})',c),/未派工，未提交/);
});
function dispatchFixture(){
 const flight={id:'f',status:'已派工',workKind:'航后',subtasks:[{id:'s',status:'未派工',category:'其他'}]};
 const ui={tab:'pending',view:{mode:'detail'},detail:{handover:{id:'h',status:'pending'},opportunities:[{flightId:'f',live:flight}]}};
 const calls=[],alerts=[];let fresh=flight,allowed=true,active=true;
 const context=vm.createContext({handoverUi:ui,state:{user:{id:'u'}},escapeHtml,handoverActive:()=>active,hasRbac:()=>allowed,alert:m=>alerts.push(m),
 hydrateMaintenanceFlight:async(id,scope)=>{calls.push(['load',id,scope]);return fresh;},maintenanceRolesForOwner:()=>['主做'],maintenanceLockedDispatchRoles:()=>new Set(),
 openMaintenanceDispatchDialog:async(type,id,isCurrent)=>{if(isCurrent()){calls.push(['open',type,id]);return true;}return false;}});
 vm.runInContext(extract('function handoverSubtaskCanDispatch(', 'function handoverNonroutineListHtml('),context);
 return {flight,ui,calls,alerts,context,setFresh:v=>fresh=v,setAllowed:v=>allowed=v,setActive:v=>active=v};
}
test('nonroutine dispatch is enabled only in pending details with existing permissions',()=>{
 const f=dispatchFixture();const html=()=>vm.runInContext('handoverSubtaskStatusHtml(handoverUi.detail.opportunities[0].live,handoverUi.detail.opportunities[0].live.subtasks[0])',f.context);
 assert.match(html(),/data-hov-subtask-dispatch="s"/);
 for(const tab of ['create','drafts','history']){f.ui.tab=tab;assert.doesNotMatch(html(),/data-hov-subtask-dispatch/);}f.ui.tab='pending';
 for(const status of ['已提报','待复核','已确认']){f.flight.subtasks[0].status=status;assert.doesNotMatch(html(),/data-hov-subtask-dispatch/);}f.flight.subtasks[0].status='已派工';
 f.flight.archived=true;assert.doesNotMatch(html(),/data-hov-subtask-dispatch/);f.flight.archived=false;
 f.setAllowed(false);assert.doesNotMatch(html(),/data-hov-subtask-dispatch/);
});
test('handover loads parent in dispatch scope before opening a previously unloaded subtask',async()=>{
 const f=dispatchFixture();await vm.runInContext('openHandoverSubtaskDispatch("f","s")',f.context);
 assert.deepEqual(f.calls,[['load','f','dispatch'],['open','subtask','s']]);assert.equal(f.ui.subtaskOpening,false);assert.equal(f.alerts.length,0);
});
test('deleted or newly locked nonroutine never opens dispatch',async()=>{
 const f=dispatchFixture();f.setFresh({...f.flight,subtasks:[]});await vm.runInContext('openHandoverSubtaskDispatch("f","s")',f.context);
 assert.match(f.alerts[0],/删除|范围/);assert.equal(f.calls.filter(c=>c[0]==='open').length,0);
 f.setFresh({...f.flight,subtasks:[{id:'s',status:'已提报'}]});await vm.runInContext('openHandoverSubtaskDispatch("f","s")',f.context);
 assert.equal(f.calls.filter(c=>c[0]==='open').length,0);
});
test('routine explanation is separate, escaped, omitted when blank, and labels draft source',()=>{
 const c=vm.createContext({escapeHtml});vm.runInContext(extract('function handoverRoutineExplanationHtml(', 'function handoverNonroutineListHtml('),c);
 assert.equal(vm.runInContext('handoverRoutineExplanationHtml({routineReport:{feedback:"  "}})',c),'');
 assert.match(vm.runInContext('handoverRoutineExplanationHtml({routineReport:{feedback:"检查完成",source:"report"}})',c),/例行报工说明/);
 const draft=vm.runInContext('handoverRoutineExplanationHtml({routineReport:{feedback:"<script>草稿</script>",source:"draft"}})',c);
 assert.match(draft,/未提交/);assert.doesNotMatch(draft,/<script>/);assert.match(draft,/&lt;script/);
});

test('handover navigation during parent hydration cannot open dispatch on a different sheet',async()=>{
 const f=dispatchFixture();let resolve;
 f.context.hydrateMaintenanceFlight=()=>new Promise(r=>resolve=r);
 const pending=vm.runInContext('openHandoverSubtaskDispatch("f","s")',f.context);
 f.ui.detail.handover.id='other';resolve(f.flight);await pending;
 assert.equal(f.calls.filter(c=>c[0]==='open').length,0);assert.equal(f.alerts.length,0);assert.equal(f.ui.subtaskOpening,false);
});
