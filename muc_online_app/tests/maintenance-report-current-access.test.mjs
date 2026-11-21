import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const app=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
function harness(){
 const deferred=[],content={innerHTML:'OLD-PRIVATE',querySelectorAll:()=>[]},state={user:{id:'account-one'},activePage:'maintenancePage',maintenanceTab:'report',maintenanceReport:{rows:['OLD-PRIVATE']},maintenanceReportOptions:{people:[{name:'OLD-PRIVATE'}]},maintenanceReportNonroutineDetails:new Map([['old',{name:'OLD-PRIVATE'}]]),maintenanceReportOpportunityDetails:new Map([['old',{name:'OLD-PRIVATE'}]]),maintenanceReportOpenNonroutineIds:new Set(),maintenanceReportOpenOpportunityIds:new Set()};
 const context=vm.createContext({state,handleAuthExpired:async()=>{state.user={id:null};},document:{activeElement:null,querySelector:selector=>selector==='.maintenance-report-content'?content:null},maintenanceService:{getReport:()=>new Promise((resolve,reject)=>deferred.push({resolve,reject})),getReportOptions:async()=>({people:[],teams:[]})},maintenanceReportBody:data=>JSON.stringify(data),renderMaintenance:()=>{content.innerHTML=state.maintenanceReport?JSON.stringify(state.maintenanceReport):state.maintenanceReportError||'LOADING';},loadMaintenanceNonroutineAudit(){},loadMaintenanceOpportunityAudit(){}});
 for(const name of ['renderMaintenanceReportAccessState','clearMaintenanceReportAccessState','loadMaintenanceReportFresh','refreshMaintenanceReportContent','loadMaintenanceNonroutineAudit','loadMaintenanceOpportunityAudit','openMaintenanceReportPersonDetails']){const start=app.indexOf(`function ${name}(`),asyncStart=app.indexOf(`async function ${name}(`),begin=asyncStart>=0?asyncStart:start;if(begin>=0)vm.runInContext(app.slice(begin,app.indexOf('\n}\n',begin)+2),context);}
 return {context,state,content,deferred};
}
test('report refresh clears old private data before waiting and ignores an older successful response',async()=>{
 const h=harness(),first=h.context.refreshMaintenanceReportContent();
 assert.equal(h.state.maintenanceReport,null);assert.equal(h.state.maintenanceReportNonroutineDetails.size,0);assert.equal(h.state.maintenanceReportOpportunityDetails.size,0);assert.doesNotMatch(h.content.innerHTML,/OLD-PRIVATE/);
 const second=h.context.refreshMaintenanceReportContent();h.deferred[1].resolve({rows:['CURRENT-SCOPE']});await second;h.deferred[0].resolve({rows:['OLD-SCOPE-LATE']});await first;
 assert.deepEqual(h.state.maintenanceReport.rows,['CURRENT-SCOPE']);assert.doesNotMatch(h.content.innerHTML,/OLD-SCOPE-LATE|OLD-PRIVATE/);
});
test('report denial or offline failure leaves no stale report options details or enabled data',async()=>{
 for(const status of [401,403,404,undefined]){const h=harness(),pending=h.context.refreshMaintenanceReportContent(),error=Object.assign(Error(status?'access revoked':'offline'),{status});h.deferred[0].reject(error);assert.equal(await pending,false);assert.equal(h.state.maintenanceReport,null);assert.equal(h.state.maintenanceReportOptions.people.length,0);assert.equal(h.state.maintenanceReportNonroutineDetails.size,0);assert.doesNotMatch(h.content.innerHTML,/OLD-PRIVATE/);assert.equal(h.state.maintenanceReportLoading,false);}
});
test('late report response cannot enter a different account or a different page',async()=>{
 for(const change of ['account','tab','page']){const h=harness(),pending=h.context.refreshMaintenanceReportContent();if(change==='account')h.state.user={id:'account-two'};if(change==='tab')h.state.maintenanceTab='data';if(change==='page')h.state.activePage='homePage';h.deferred[0].resolve({rows:['PREVIOUS-CONTEXT-PRIVATE']});await pending;assert.equal(h.state.maintenanceReport,null);assert.doesNotMatch(h.content.innerHTML,/PREVIOUS-CONTEXT-PRIVATE/);}
});
test('late audit replies do not refill a cleared report and denied audit access clears all cached data',async()=>{
 for(const kind of ['Nonroutine','Opportunity']){
  const h=harness(),target={isConnected:true,innerHTML:'LOADING'};let resolve;
  h.context.maintenanceService['get'+kind+'Audit']=()=>new Promise(r=>resolve=r);
  const load=h.context['loadMaintenance'+kind+'Audit'],pending=load('old',target);h.context.clearMaintenanceReportAccessState();resolve({detail:{name:'LATE-PRIVATE'}});await pending;
  assert.equal(h.state['maintenanceReport'+kind+'Details'].size,0);assert.doesNotMatch(target.innerHTML,/LATE-PRIVATE/);
  const denied=harness();denied.context.maintenanceService['get'+kind+'Audit']=async()=>{throw Object.assign(Error('denied'),{status:403});};await denied.context['loadMaintenance'+kind+'Audit']('old',target);assert.equal(denied.state.maintenanceReport,null);assert.equal(denied.state.maintenanceReportOptions.people.length,0);assert.equal(denied.state.maintenanceReportNonroutineDetails.size,0);assert.equal(denied.state.maintenanceReportOpportunityDetails.size,0);
 }
});
test('person detail dialog ignores an older person response and clears data on current access denial',async()=>{
 const h=harness(),body={innerHTML:''},dialog={open:false,showModal(){this.open=true;},close(){this.open=false;}};
 Object.defineProperty(body,'textContent',{get(){return this.innerHTML;},set(value){this.innerHTML=value;}});
 const query=h.context.document.querySelector;h.context.document.querySelector=selector=>selector==='#maintenanceDataDetailDialog'?dialog:selector==='#maintenanceDataDetailDialogBody'?body:query(selector);
 Object.assign(h.context,{$:()=>body,ensureMaintenanceDataDetailDialog:()=>dialog,lockMaintenanceDataDetailBackground:()=>{},escapeHtml:String,maintenanceHoursLabel:String,maintenanceReportPersonGroups:hours=>hours,maintenanceReportPersonGroupHtml:row=>row.name});
 const a=h.context.openMaintenanceReportPersonDetails('a','FIRST-PERSON');dialog.close();const b=h.context.openMaintenanceReportPersonDetails('b','CURRENT-PERSON');h.deferred[1].resolve({hours:[{hours:2,name:'CURRENT-RESULT'}]});await b;h.deferred[0].resolve({hours:[{hours:99,name:'STALE-RESULT'}]});await a;assert.match(body.innerHTML,/CURRENT-RESULT/);assert.doesNotMatch(body.innerHTML,/FIRST-PERSON|STALE-RESULT/);
 dialog.close();const denied=h.context.openMaintenanceReportPersonDetails('c','PRIVATE-DENIED');h.deferred[2].reject(Object.assign(Error('denied'),{status:403}));await denied;assert.equal(dialog.open,false);assert.equal(body.innerHTML,'');assert.equal(h.state.maintenanceReport,null);
});
