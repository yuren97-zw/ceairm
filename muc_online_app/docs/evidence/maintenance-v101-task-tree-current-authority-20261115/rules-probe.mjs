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





const seen=[],dialogs=[];ws.on('message',buffer=>{const e=JSON.parse(buffer);if(e.method==='Network.responseReceived'&&e.params.response.url.includes('/api/maintenance/rules'))seen.push({url:e.params.response.url,status:e.params.response.status});if(e.method==='Page.javascriptDialogOpening'){dialogs.push(e.params.message);send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}});await evaluate("document.querySelector('[data-maint-review]').click()");for(let n=0;n<100&&!seen.length;n++)await new Promise(r=>setTimeout(r,50));console.log(JSON.stringify({seen,dialogs,open:await evaluate("!!document.querySelector('#maintenanceReviewDialog')?.open")}));assert.ok(seen.some(x=>x.status===403));ws.close();