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
