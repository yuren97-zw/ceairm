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





const proof=JSON.parse(fs.readFileSync(output+'browser-proof.json','utf8')),key='subtask:'+proof.subtaskId;
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await waitFor('innerWidth===390');
console.log(JSON.stringify(await evaluate(`(()=>{const t=document.querySelector('.maintenance-review-tree'),a=document.querySelector('[data-maint-review-task="${key}"]');return {tree:{top:t.getBoundingClientRect().top,height:t.clientHeight,scroll:t.scrollHeight,scrollTop:t.scrollTop},task:{top:a.getBoundingClientRect().top,height:a.clientHeight},body:document.querySelector('#maintenanceReviewDialogBody').scrollHeight}})()`)));
await evaluate("(()=>{const t=document.querySelector('.maintenance-review-tree');t.scrollTop=t.scrollHeight;})()");await waitFor(`document.querySelector('[data-maint-review-task="${key}"]').getBoundingClientRect().top<600`);const text=await evaluate(`document.querySelector('[data-maint-review-task="${key}"]').textContent`);assert.ok(text.includes('复核修订乙')&&text.includes('2h'));fs.writeFileSync(output+'confirmed-nonroutine-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));proof.confirmedReviewLayout=await evaluate('({viewport:innerWidth,width:document.documentElement.scrollWidth,dialogWidth:document.querySelector(\"#maintenanceReviewDialog\").getBoundingClientRect().width})');assert.ok(proof.confirmedReviewLayout.width<=390&&proof.confirmedReviewLayout.dialogWidth<=390);proof.confirmedReadRetainsActualRevision=true;proof.confirmedNonroutineText=text;fs.writeFileSync(output+'browser-proof.json',JSON.stringify(proof,null,2));ws.close();
