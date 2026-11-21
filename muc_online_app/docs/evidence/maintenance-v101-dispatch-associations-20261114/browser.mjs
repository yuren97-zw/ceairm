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




let cancelPrompt=false;const dialogs=[];
ws.on('message',raw=>{const event=JSON.parse(raw);if(event.method==='Page.javascriptDialogOpening'){dialogs.push({type:event.params.type,message:event.params.message});send('Page.handleJavaScriptDialog',{accept:!(cancelPrompt&&event.params.type==='prompt'),...(event.params.type==='prompt'?{promptText:'合成页面验收明确删除该关联'}:{})}).catch(()=>{});}});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:'http://127.0.0.1:18888/'});await waitFor("document.readyState==='complete'");
assert.equal(await evaluate("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:'muc2026'})}).then(r=>r.status)"),200);
const api=async(url,method='GET',body)=>evaluate(`fetch(${JSON.stringify(url)},{method:${JSON.stringify(method)},headers:{'Content-Type':'application/json'},${body===undefined?'':`body:JSON.stringify(${JSON.stringify(body)}),`}}).then(async r=>({status:r.status,body:await r.json()}))`);
const me=(await api('/api/me')).body,personId=me.personId||me.user?.personId;assert.ok(personId);
const made=await api('/api/maintenance/flights','POST',{date:'2026-11-14',flightNo:'ASSOC-BROWSER-QA',aircraftNo:'B-ASSOCQA',aircraftType:'A320',workKind:'航后'});assert.equal(made.status,201);const id=made.body.flight.id,base='/api/maintenance/flights/'+id;
const dispatched=await api(base+'/dispatch','POST',{expectedUpdatedAt:made.body.flight.updatedAt,assignments:[{role:'放行',personId},{role:'接机',personId}]});assert.equal(dispatched.status,200);
const original=dispatched.body.flight.assignments.slice().sort((a,b)=>a.id.localeCompare(b.id)),intake=original.find(row=>row.role==='接机');
await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=dispatch-assoc'});await waitFor("document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden");await evaluate("document.querySelector('[data-page=maintenancePage]').click()");await waitFor("!!document.querySelector('[data-maint-tab=dispatch]')");await evaluate("document.querySelector('[data-maint-tab=dispatch]').click()");
const open=async()=>{await waitFor(`!!document.querySelector('[data-maint-dispatch="flight:${id}"]')`);await evaluate(`document.querySelector('[data-maint-dispatch="flight:${id}"]').click()`);await waitFor("document.querySelector('#maintenanceDispatchDialog')?.open&&!!document.querySelector('#maintenanceDispatchForm')");};await open();
assert.ok(await evaluate("document.querySelector('#maintenanceDispatchDialog').textContent.includes('取消勾选不会删除')"));
await evaluate("document.querySelector('[data-maint-role-group=接机]').click()");await waitFor(`!!document.querySelector('[data-maint-person="${personId}"][data-maint-role-category=接机]')`);await evaluate(`document.querySelector('[data-maint-person="${personId}"][data-maint-role-category=接机]').click()`);await evaluate("document.querySelector('#maintenanceDispatchForm').requestSubmit()");await waitFor("!document.querySelector('#maintenanceDispatchDialog').open");
const afterOmit=(await api(base)).body.flight.assignments.slice().sort((a,b)=>a.id.localeCompare(b.id));assert.deepEqual(afterOmit,original);
await open();cancelPrompt=true;await evaluate(`document.querySelector('[data-maint-assignment-remove="${intake.id}"]').click()`);await waitFor(`!document.querySelector('[data-maint-assignment-remove="${intake.id}"]').disabled`);assert.ok(dialogs.some(row=>row.type==='prompt'));assert.deepEqual((await api(base)).body.flight.assignments.slice().sort((a,b)=>a.id.localeCompare(b.id)),original);
fs.writeFileSync(output+'preserved-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
cancelPrompt=false;await evaluate(`document.querySelector('[data-maint-assignment-remove="${intake.id}"]').click()`);await waitFor(`document.querySelector('#maintenanceDispatchDialog')?.open&&!document.querySelector('[data-maint-assignment-remove="${intake.id}"]')`);
const afterDelete=(await api(base)).body.flight.assignments;assert.equal(afterDelete.length,1);assert.equal(afterDelete[0].role,'放行');assert.equal(afterDelete[0].id,original.find(row=>row.role==='放行').id);assert.ok(dialogs.some(row=>row.type==='confirm'&&row.message.includes('只删除')));
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});const layout=await evaluate("({viewport:innerWidth,width:document.documentElement.scrollWidth,dialogWidth:document.querySelector('#maintenanceDispatchDialog').getBoundingClientRect().width})");assert.ok(layout.width<=layout.viewport);assert.ok(layout.dialogWidth<=layout.viewport);
fs.writeFileSync(output+'removed-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));fs.writeFileSync(output+'browser-proof.json',JSON.stringify({syntheticOnly:true,actualOriginalPage:true,flightId:id,omissionPreservesRecords:true,cancelPreservesRecords:true,explicitRemovalLeavesReleaseId:afterDelete[0].id,removedId:intake.id,layout,dialogs},null,2));ws.close();
