import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function fixture(){
 const pending=[];const context=vm.createContext({state:{user:{id:'old'},homeAttendance:{private:'old account'},homeAttendanceState:'ready'},isLoggedIn:()=>true,canView:()=>true,renderHome:()=>{},maintenanceLocalDateValue:()=> '2026-11-12',Date,isAuthExpired:()=>false,apiRequest:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 vm.runInContext(source.slice(source.indexOf('const homeDataService = {'),source.indexOf('let homeTaskSequence=')).replace('const homeDataService =','globalThis.service ='),context);
 return {context,pending};
}
test('R11 delayed success and failure from the previous account cannot replace current own attendance or block its loading',async()=>{
 for(const failure of [false,true]){
  const {context:c,pending}=fixture();const old=c.service.loadAttendance(true);c.state.user={id:'new'};
  const next=c.service.loadAttendance(true);assert.equal(pending.length,2);assert.equal(c.state.homeAttendance,null);
  pending[1].resolve({status:'ready',personId:'new-person',overtimeSeconds:0});await next;assert.equal(c.state.homeAttendance.personId,'new-person');
  if(failure)pending[0].reject(Error('old account failed'));else pending[0].resolve({status:'ready',personId:'old-person'});
  await old;assert.equal(c.state.homeAttendance.personId,'new-person');assert.equal(c.state.homeAttendanceState,'ready');
 }
});
test('R11 delayed old task-count error cannot hide the new account pending chip',async()=>{
 const pending=[],button={hidden:true,textContent:''};const c=vm.createContext({state:{user:{id:'old'}},isLoggedIn:()=>true,document:{querySelector:()=>button},apiRequest:()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))});
 vm.runInContext('let homeTaskSequence=0;'+source.slice(source.indexOf('async function loadHomeActionTasks(){'),source.indexOf('function renderHome() {'))+'globalThis.load=loadHomeActionTasks;',c);
 const old=c.load();c.state.user={id:'new'};const next=c.load();pending[1].resolve({count:2});await next;pending[0].reject(Error('old count failed'));await old;
 assert.equal(button.hidden,false);assert.equal(button.textContent,'待处理 2 ›');
});

test('home exception/offset metric shows 0/0 and 1/1 with all-exception entry retained',()=>{
 for(const [missingCount,missingOffsetCount] of [[0,0],[1,1],[2,1]]){const box={innerHTML:''},module={};const c=vm.createContext({state:{homeAttendance:{issueCount:missingCount,exceptionOffsetCount:missingOffsetCount,overtimeSeconds:14241,credits:{available:1}}},$:id=>id==='#homeAttendanceMetrics'?box:module,canView:()=>true,escapeHtml:String,formatHomeOvertime:()=> '3:57'});vm.runInContext(source.slice(source.indexOf('function renderHomeAttendanceMetrics()'),source.indexOf('function renderHomeMaintenanceModule()'))+'renderHomeAttendanceMetrics();',c);assert.match(box.innerHTML,/异常\/抵消/);assert.ok(box.innerHTML.replace(/<[^>]*>/g,'').includes(`${missingCount}/${missingOffsetCount}`));assert.match(box.innerHTML,/data-home-attendance-action="issues"/);assert.equal(box.innerHTML.includes('home-exception-number'),missingCount>0);assert.equal(box.innerHTML.includes('home-offset-number'),missingOffsetCount>0);}
});

test('home available count highlights only finite nonzero numbers',()=>{
 for(const available of [0,2,null,undefined,NaN,'2']){
  const box={innerHTML:''};const c=vm.createContext({state:{homeAttendance:{credits:{available}}},$:id=>id==='#homeAttendanceMetrics'?box:{},canView:()=>true,escapeHtml:String,formatHomeOvertime:()=> '0:00'});
  vm.runInContext(source.slice(source.indexOf('function renderHomeAttendanceMetrics()'),source.indexOf('function renderHomeMaintenanceModule()'))+'renderHomeAttendanceMetrics();',c);
  assert.equal(box.innerHTML.includes('home-credit-highlight'),Number.isFinite(available)&&available!==0);
 }
});

test('homepage and execution share opportunity metadata, status progress and navigation boundaries',()=>{
 const start=source.indexOf('function maintenanceExecuteHeaderHtml('),end=source.indexOf('\nfunction ',start+1);
 const c=vm.createContext({escapeHtml:String,maintenanceTitle:()=> '航班',maintenanceFlightPrimaryHtml:()=> '机号',maintenanceFlightSecondaryHtml:()=> '机位 时间 地点',maintenanceStatusBadge:(status,a,b,d,flight)=>`<span>${status}:${flight.reportProgress.marker}</span>`});
 vm.runInContext(source.slice(start,end)+'globalThis.header=maintenanceExecuteHeaderHtml;',c);
 const flight={id:'f1',status:'已提报',personalReportProgress:{allAssignedWorkComplete:true},reportProgress:{marker:'progress'},subtasks:[{}],nonroutineDraft:{items:[{}]},remark:'备注'};
 const home=c.header(flight,{home:true}),execute=c.header(flight,{});
 for(const html of [home,execute]){assert.match(html,/execute-flight-head-meta/);assert.match(html,/execute-personal-complete-check/);assert.match(html,/已提报:progress/);assert.match(html,/非例行 1 项/);assert.match(html,/草稿 1 项/);assert.match(html,/maintenance-remark-indicator/);}
 assert.match(home,/data-home-maint-goto="f1"/);assert.doesNotMatch(home,/data-maint-execute-toggle|data-maint-remark-view/);
 assert.match(execute,/data-maint-execute-toggle="f1"/);assert.match(execute,/data-maint-remark-view="f1"/);assert.doesNotMatch(execute,/data-home-maint-goto/);
});

function maintenanceFixture(){
 const pending=[];
 const c=vm.createContext({state:{user:{id:'a'},activePage:'homePage',homeMaintenanceGroups:[],homeMaintenanceFlights:[],homeMaintenanceState:'',loadedData:new Set(['maintenance:execute']),maintenanceSyncVersion:5},URLSearchParams,Date,isLoggedIn:()=>true,canView:()=>true,hasRbac:()=>true,renderHome:()=>{},maintenanceAssignmentsForMeFrom:flights=>flights.map(flight=>({flight})),isAuthExpired:()=>false,apiRequest:()=>new Promise((resolve,reject)=>pending.push({resolve,reject})),maintenanceHasOpenEditor:()=>false,refreshMaintenance:async()=>{}});
 vm.runInContext(source.slice(source.indexOf('const homeDataService = {'),source.indexOf('let homeTaskSequence=')).replace('const homeDataService =','globalThis.homeDataService ='),c);
 const start=source.indexOf('async function refreshMaintenanceFromSync('),end=source.indexOf('\nfunction flushMaintenancePendingRefresh',start);vm.runInContext(source.slice(start,end),c);
 return {c,pending};
}
test('home snapshot updates even when execution already consumed the same version or an editor is open',async()=>{
 for(const editor of [false,true]){
  const {c,pending}=maintenanceFixture();c.maintenanceHasOpenEditor=()=>editor;c.homeDataService.maintenanceVersion=4;
  await c.refreshMaintenanceFromSync(5);assert.equal(pending.length,1);
  pending[0].resolve({version:5,flights:[{id:'new'}]});await new Promise(r=>setImmediate(r));assert.equal(c.state.homeMaintenanceGroups[0].flight.id,'new');assert.equal(c.homeDataService.maintenanceVersion,5);
  await c.refreshMaintenanceFromSync(5);assert.equal(pending.length,1);
 }
});
test('maintenance events arriving during a home read are coalesced into one follow-up read',async()=>{
 const {c,pending}=maintenanceFixture();const first=c.homeDataService.loadMaintenance(true);
 await c.refreshMaintenanceFromSync(6);await c.refreshMaintenanceFromSync(7);assert.equal(pending.length,1);
 pending[0].resolve({version:5,flights:[{id:'old'}]});await first;assert.equal(pending.length,2);
 pending[1].resolve({version:7,flights:[{id:'latest'}]});await new Promise(r=>setImmediate(r));assert.equal(c.state.homeMaintenanceGroups[0].flight.id,'latest');assert.equal(c.homeDataService.maintenanceVersion,7);assert.equal(c.homeDataService.maintenanceLoadingUser,'');assert.equal(pending.length,2);
});
test('late maintenance success or failure from another account cannot replace the current snapshot',async()=>{
 for(const failure of [false,true]){
  const {c,pending}=maintenanceFixture();const old=c.homeDataService.loadMaintenance(true);c.state.user={id:'b'};const next=c.homeDataService.loadMaintenance(true);assert.equal(pending.length,2);
  pending[1].resolve({version:8,flights:[{id:'b-only'}]});await next;
  if(failure)pending[0].reject(Error('old account'));else pending[0].resolve({version:9,flights:[{id:'a-private'}]});await old;
  assert.equal(c.state.homeMaintenanceGroups[0].flight.id,'b-only');assert.equal(c.state.homeMaintenanceState,'ready');assert.equal(c.homeDataService.maintenanceVersion,8);
 }
});
