import WebSocket from '/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/node_modules/ws/wrapper.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const output=new URL('.',import.meta.url).pathname;
const targets=await(await fetch('http://127.0.0.1:18889/json/list')).json(),target=targets.find(item=>item.type==='page');
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.once('open',resolve));let seq=0;const pending=new Map();
ws.on('message',buffer=>{const message=JSON.parse(buffer);if(message.id){const item=pending.get(message.id);pending.delete(message.id);message.error?item.reject(message.error):item.resolve(message.result);}});
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const waitFor=async expression=>{for(let n=0;n<150;n++){try{if(await evaluate(expression))return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error('UI timeout '+expression);};
await send('Runtime.enable');await send('Page.enable');
await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});





const dialogs=[];ws.on('message',raw=>{const e=JSON.parse(raw);if(e.method==='Page.javascriptDialogOpening'){dialogs.push(e.params.message);send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:18888/'});await waitFor("document.readyState==='complete'");
assert.equal(await evaluate("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:'muc2026'})}).then(r=>r.status)"),200);
const api=async(url,method='GET',body)=>evaluate(`fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}}).then(async r=>({status:r.status,body:await r.json()}))`);
const me=(await api('/api/me')).body,personId=me.personId||me.user?.personId,peerId='person-browser-draft-only';assert.ok(personId);
const made=await api('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'DRAFT-BOUNDARY-BROWSER',aircraftNo:'B-DRAFTQA',aircraftType:'A320',workKind:'航后'});assert.equal(made.status,201);const id=made.body.flight.id,base='/api/maintenance/flights/'+id;
const dispatched=await api(base+'/dispatch','POST',{expectedUpdatedAt:made.body.flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]});assert.equal(dispatched.status,200);const original=dispatched.body.flight.assignments.slice().sort((a,b)=>a.id.localeCompare(b.id));
await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=draft-boundary'});await waitFor("document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden");await evaluate("document.querySelector('[data-page=maintenancePage]').click()");await waitFor("!!document.querySelector('[data-maint-tab=execute]')");await evaluate("document.querySelector('[data-maint-tab=execute]').click()");
await evaluate(`(()=>{const b=document.querySelector('[data-maint-execute-date="2026-11-14"]');if(b&&b.getAttribute('aria-expanded')!=='true')b.click();})()`);await waitFor(`!!document.querySelector('[data-maint-execute-toggle="${id}"]')`);await evaluate(`document.querySelector('[data-maint-execute-toggle="${id}"]').click()`);
const open=async()=>{await waitFor(`!!document.querySelector('[data-maint-report="${id}"][data-report-type=routine]')`);await evaluate(`document.querySelector('[data-maint-report="${id}"][data-report-type=routine]').click()`);await waitFor("document.querySelector('#maintenanceWorkReportDialog')?.open&&!!document.querySelector('[data-maint-work-save-routine]')");};await open();
await waitFor(`!!document.querySelector('[data-maint-work-person="${peerId}"]')`);await evaluate(`document.querySelector('[data-maint-work-person="${peerId}"]').click()`);
await evaluate("document.querySelector('[data-maint-work-role=接机]').click()");await waitFor(`!!document.querySelector('[data-maint-work-person="${personId}"]')`);await evaluate(`document.querySelector('[data-maint-work-person="${personId}"]').click();document.querySelector('[data-maint-work-person="${peerId}"]').click()`);
assert.ok(await evaluate("document.querySelector('#maintenanceWorkReportDialog').textContent.includes('不修改正式派工')"));await evaluate("document.querySelector('[data-maint-work-save-routine]').click()");await waitFor("!document.querySelector('#maintenanceWorkReportDialog').open");assert.deepEqual((await api(base)).body.flight.assignments.slice().sort((a,b)=>a.id.localeCompare(b.id)),original);
const read=(await api(base+'/reports')).body.report;assert.equal(read.routine.draft.releasePersonId,peerId);assert.equal(read.routine.draft.entries[0].personId,peerId);assert.equal(read.release.personId,personId);assert.equal(read.routine.draft.version,1);
await open();assert.equal(await evaluate(`document.querySelector('[data-maint-work-person="${peerId}"]').checked`),true);fs.writeFileSync(output+'reopened-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
await evaluate("document.querySelector('[data-maint-work-role=接机]').click()");assert.equal(await evaluate(`document.querySelector('[data-maint-work-person="${peerId}"]').checked`),true);assert.equal(await evaluate(`document.querySelector('[data-maint-work-person="${personId}"]').checked`),false);
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});const layout=await evaluate("({viewport:innerWidth,width:document.documentElement.scrollWidth,dialogWidth:document.querySelector('#maintenanceWorkReportDialog').getBoundingClientRect().width})");assert.ok(layout.width<=layout.viewport);assert.ok(layout.dialogWidth<=layout.viewport);
fs.writeFileSync(output+'reopened-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));fs.writeFileSync(output+'browser-proof.json',JSON.stringify({syntheticOnly:true,actualOriginalPage:true,flightId:id,formalAssignmentIds:original.map(row=>row.id),formalPersonId:personId,draftPersonId:peerId,formalDispatchUnchanged:true,releaseAndRoutineChoicesRestored:true,draftVersion:1,layout,dialogs},null,2));ws.close();
