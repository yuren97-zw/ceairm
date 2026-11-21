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
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:18888/'});await waitFor(`document.body.classList.contains('app-locked')||document.body.classList.contains('app-ready')`);
if(await evaluate(`document.body.classList.contains('app-locked')`)){
await evaluate(`(()=>{document.querySelector('#loginUser').value='88000000';document.querySelector('#loginPass').value='muc2026';document.querySelector('#loginPass').closest('form').requestSubmit();})()`);}
await waitFor(`document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden`);
await evaluate(`document.querySelector('[data-page="maintenancePage"]').click()`);await waitFor(`!!document.querySelector('[data-maint-tab="standardReviews"]')`);
await evaluate(`document.querySelector('[data-maint-tab="standardReviews"]').click()`);await waitFor(`!!document.querySelector('[data-nr-notifications]')&&!!document.querySelector('[data-nr-open="stdreview-qa-72"]')`);
await evaluate(`document.querySelector('[data-nr-notifications]').click()`);await waitFor(`!!document.querySelector('[data-nr-notification-open]')`);
const before=await evaluate(`document.querySelector('[data-review-workbench]').innerText`);assert.ok(before.includes('新增标准评议任务'));assert.ok(!before.includes('标准私有依据'));
await evaluate(`document.querySelector('[data-nr-notification-open]').click()`);await waitFor(`!!document.querySelector('[name="basis"]')&&document.querySelector('[data-review-workbench]').innerText.includes('标准通知任务样例')`);
assert.ok((await evaluate(`document.querySelector('[data-review-workbench]').innerText`)).includes('已读'));
await evaluate(`(()=>{const field=document.querySelector('[name="basis"]');field.value='本人尚未提交的评价依据';field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[data-nr-notifications]').click();})()`);
await waitFor(`document.querySelector('[data-nr-status]').innerText.includes('通知已按当前资格')`);assert.equal(await evaluate(`document.querySelector('[name="basis"]').value`),'本人尚未提交的评价依据');
const privacy=await evaluate(`(async()=>{const r=await(await fetch('/api/maintenance/standard-reviews/stdreview-qa-4')).json();return {readAll:r.review.capabilities.readAllOpinions,opinions:r.review.opinions.length,privateOther:JSON.stringify(r).includes('标准私有依据2')};})()`);assert.equal(privacy.readAll,false);assert.equal(privacy.opinions,1);assert.equal(privacy.privateOther,false);
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});const mobile=await evaluate(`({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.querySelector('[data-review-workbench]').innerText,draft:document.querySelector('[name="basis"]').value})`);assert.equal(mobile.width,390);assert.equal(mobile.scrollWidth,390);assert.equal(mobile.draft,'本人尚未提交的评价依据');
fs.writeFileSync(output+'mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});fs.writeFileSync(output+'desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
fs.writeFileSync(output+'browser-evidence.json',JSON.stringify({syntheticOnly:true,ordinaryReviewer:true,noticeRendered:true,noticeOpened:true,markedRead:true,unsentOpinionPreserved:true,privacy,mobile},null,2));console.log(JSON.stringify({syntheticOnly:true,ordinaryReviewer:true,noticeRendered:true,noticeOpened:true,markedRead:true,unsentOpinionPreserved:true,privateOther:false,mobileWidth:390,mobileScrollWidth:390}));ws.close();
