import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('async function openMaintenanceSubtaskDialog('),end=source.indexOf('async function openMaintenanceDispatchDialog(',start);
function setup(apiRequest){
 let html='',message='',retry;const requests=[];
 const dialog={open:false,dataset:{},showModal(){this.open=true;}};
 const body={get innerHTML(){return html;},set innerHTML(v){html=v;},querySelector(selector){return selector==='p'?{set textContent(v){message=v;}}:html.includes('data-maint-subtask-retry')?{addEventListener(_type,fn){retry=fn;}}:null;}};
 const ctx=vm.createContext({hasRbac:c=>c==='maintenance.content.manage',alert:()=>{},ensureMaintenanceDialogs:()=>{},$:s=>s==='#maintenanceTaskDialog'?dialog:body,
 maintenanceSubtaskFormHtml:(_f,_s,hours)=>'FORM HOURS '+hours,apiRequest:async url=>{requests.push(url);return apiRequest(url);}});
 vm.runInContext(source.slice(start,end),ctx);
 return {dialog,body,ctx,requests,message:()=>message,retry:()=>retry()};
}
test('new subtask opens immediately and needs only narrowly scoped form options',async()=>{
 let resolve;const f=setup(()=>new Promise(r=>resolve=r));const pending=vm.runInContext('openMaintenanceSubtaskDialog({id:"f"})',f.ctx);
 assert.equal(f.dialog.open,true);assert.match(f.message(),/读取/);assert.deepEqual(f.requests,['/maintenance/nonroutine-options']);
 resolve({towDefaultHours:4.5});await pending;assert.equal(f.body.innerHTML,'FORM HOURS 4.5');assert.equal(f.dialog.dataset.towDefaultHours,'4.5');
});
test('configuration failure is visible and can be retried',async()=>{
 let fail=true;const f=setup(async()=>{if(fail)throw Error('403 forbidden');return {towDefaultHours:3};});
 await vm.runInContext('openMaintenanceSubtaskDialog({id:"f"})',f.ctx);assert.match(f.message(),/403 forbidden/);assert.match(f.body.innerHTML,/data-maint-subtask-retry/);
 fail=false;await f.retry();assert.equal(f.body.innerHTML,'FORM HOURS 3');
});
test('closing and reopening cannot let an old load replace the current flight form',async()=>{
 const responses=[];const f=setup(()=>new Promise(r=>responses.push(r)));
 const old=vm.runInContext('openMaintenanceSubtaskDialog({id:"old"})',f.ctx);f.dialog.open=false;
 const current=vm.runInContext('openMaintenanceSubtaskDialog({id:"new"})',f.ctx);
 responses[1]({towDefaultHours:6});await current;responses[0]({towDefaultHours:1});await old;
 assert.equal(f.body.innerHTML,'FORM HOURS 6');
});
