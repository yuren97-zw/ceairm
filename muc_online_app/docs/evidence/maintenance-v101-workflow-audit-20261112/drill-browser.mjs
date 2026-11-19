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


async function login(username){const response=await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:'muc2026'})}).then(r=>r.status)`);assert.equal(response,200);const origin=await evaluate('performance.timeOrigin');await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa='+Date.now()});await waitFor(`performance.timeOrigin!==${origin}&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden`);await evaluate("document.querySelector('[data-page=maintenancePage]').click()");await waitFor("!!document.querySelector('[data-maint-tab=workflows]')");await evaluate("document.querySelector('[data-maint-tab=workflows]').click()");await waitFor("document.querySelector('[data-workflow-workbench]')?.textContent.includes('已读取当前有权办理')");}
const drill=JSON.parse(fs.readFileSync(output+'drill.json','utf8'));
await send('Page.navigate',{url:'http://127.0.0.1:18888/'});await waitFor("location.origin==='http://127.0.0.1:18888'&&document.readyState==='complete'");
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await login('workflow-ui-worker');
await evaluate("(()=>{const filter=document.querySelector('[name=filter]');filter.value='ALL';filter.dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('[data-wf-action=tasks]').click();})()");await waitFor("!!document.querySelector('[data-wf-action=open]')");await evaluate("document.querySelector('[data-wf-action=open]').click()");await waitFor("document.querySelector('[data-workflow-workbench]')?.textContent.includes('完成结果来源待核对')");
await evaluate(`Array.from(document.querySelectorAll('[data-wf-action=history]')).find(button=>button.dataset.id==='${drill.workflowId}').click()`);await waitFor("document.querySelector('[data-wf-history]')?.textContent.includes('历史来源待核对')");
assert.equal(await evaluate("document.querySelector('[data-wf-history]').textContent.includes('浏览器隔离验证启动依据')"),false);
const retry=await evaluate(`fetch('/api/maintenance/workflows/${drill.workflowId}/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(drill.request)})}).then(r=>r.status)`);assert.equal(retry,409);
const result=await evaluate(`fetch('/api/maintenance/workflows/${drill.workflowId}/result').then(r=>r.status)`);assert.equal(result,409);
await evaluate("document.querySelector('[data-wf-history]').scrollIntoView()");const layout=await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth})');assert.ok(layout.scrollWidth<=layout.width+1);fs.writeFileSync(output+'workflow-unverified-history-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
fs.writeFileSync(output+'drill-proof.json',JSON.stringify({syntheticOnly:true,damagedTemplateReadOnly:true,qualifiedHistoryAccessible:true,privateBasisAbsent:true,retryRefused:true,typedResultRefused:true,layout,recovered:false,stopped:false},null,2));console.log('WORKFLOW_CORRUPT_SOURCE_BROWSER_PASS');ws.close();
