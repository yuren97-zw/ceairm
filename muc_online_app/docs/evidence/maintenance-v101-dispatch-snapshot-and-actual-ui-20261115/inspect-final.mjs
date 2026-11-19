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
const proof=JSON.parse(fs.readFileSync(output+'browser-proof.json','utf8')),id=proof.flightId,key='subtask:'+proof.subtaskId;
await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=confirmed-actual-source'});await waitFor("document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden");await evaluate("document.querySelector('[data-page=maintenancePage]').click()");await waitFor("!!document.querySelector('[data-maint-tab=dispatch]')");await evaluate("document.querySelector('[data-maint-tab=dispatch]').click()");await waitFor("!!document.querySelector('[data-maint-status-option=left][value=已确认]')");await evaluate("(()=>{const b=document.querySelector('[data-maint-status-option=left][value=已确认]');if(!b.checked)b.click();})()");await waitFor(`!!document.querySelector('[data-maint-review="${id}"]')`);
await evaluate(`document.querySelector('[data-maint-review="${id}"]').scrollIntoView({block:'center'})`);fs.writeFileSync(output+'confirmed-dispatch-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));await evaluate(`document.querySelector('[data-maint-review="${id}"]').click()`);await waitFor("document.querySelector('#maintenanceReviewDialog')?.open");await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate(`document.querySelector('[data-maint-review-task="${key}"]').scrollIntoView({block:'start'})`);await waitFor(`document.querySelector('[data-maint-review-task="${key}"]').getBoundingClientRect().top<300`);const text=await evaluate(`document.querySelector('[data-maint-review-task="${key}"]').textContent`);assert.ok(text.includes('复核修订乙')&&text.includes('2h'));fs.writeFileSync(output+'confirmed-nonroutine-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));proof.confirmedReadRetainsActualRevision=true;proof.confirmedNonroutineText=text;fs.writeFileSync(output+'browser-proof.json',JSON.stringify(proof,null,2));ws.close();
