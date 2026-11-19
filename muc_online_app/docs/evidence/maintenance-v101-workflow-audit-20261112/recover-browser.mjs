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


await evaluate("document.querySelector('[data-wf-action=refresh]').click()");await waitFor("document.querySelector('[data-workflow-workbench]')?.textContent.includes('反馈结果来源已核验')");
const drill=JSON.parse(fs.readFileSync(output+'drill.json','utf8'));
await evaluate(`Array.from(document.querySelectorAll('[data-wf-action=history]')).find(button=>button.dataset.id==='${drill.workflowId}').click()`);await waitFor("document.querySelector('[data-wf-history]')?.textContent.includes('历史来源已核验')");
const response=await evaluate(`fetch('/api/maintenance/workflows/${drill.workflowId}/result?expectedVersion=3').then(async r=>({status:r.status,payload:await r.json()}))`);assert.equal(response.status,200);assert.equal(response.payload.outcome,'FAIL');assert.equal(response.payload.sourceVersion,3);
const proof=JSON.parse(fs.readFileSync(output+'drill-proof.json','utf8'));proof.recovered=true;proof.recoveredViaOriginalSyntheticBytes=true;proof.verifiedSourceAfterReread=true;fs.writeFileSync(output+'drill-proof.json',JSON.stringify(proof,null,2));console.log('WORKFLOW_SOURCE_RECOVERY_BROWSER_PASS');ws.close();
