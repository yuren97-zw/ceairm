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




const {execFileSync}=await import('node:child_process');
const dialogs=[];ws.on('message',raw=>{const e=JSON.parse(raw);if(e.method==='Page.javascriptDialogOpening'){dialogs.push(e.params.message);send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}});
await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
await send('Page.navigate',{url:'http://127.0.0.1:18888/'});await waitFor("document.readyState==='complete'");
assert.equal(await evaluate("fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'qa-manager',password:'muc2026'})}).then(r=>r.status)"),200);
const created=await evaluate("fetch('/api/maintenance/standard-management',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'browser-access-fixture',reason:'合成浏览器初始依据',definition:{category:'单项工作',chapter:'29',title:'旧权限合成标准',workScope:'合成范围',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}})}).then(async r=>({status:r.status,body:await r.json()}))");assert.equal(created.status,200);
await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=management-access'});await waitFor("document.body.classList.contains('app-ready')&&document.querySelector('#loginPage').hidden");
await evaluate("document.querySelector('[data-page=maintenancePage]').click()");await waitFor("!!document.querySelector('[data-maint-tab=standards]')");await evaluate("document.querySelector('[data-maint-tab=standards]').click()");await waitFor("!!document.querySelector('[data-sm-open]')");
await evaluate(`document.querySelector('[data-sm-open="${created.body.standard.id}"]').click()`);await waitFor("!!document.querySelector('[data-sm-action=update]')");await evaluate("document.querySelector('[data-sm-action=update]').click()");await waitFor("!!document.querySelector('[name=standardReason]')");
await evaluate("(()=>{const x=document.querySelector('[name=standardReason]');x.value='撤权后不得保留的依据';x.dispatchEvent(new Event('input',{bubbles:true}));})()");
await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await evaluate("document.querySelector('[data-sm-save]').requestSubmit()");await waitFor("document.querySelector('.sm-workbench').textContent.includes('输入及请求标识已保留')");assert.equal(await evaluate("document.querySelector('[name=standardReason]').value"),'撤权后不得保留的依据');
fs.writeFileSync(output+'offline-input-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
execFileSync(process.execPath,['--input-type=module','-e',"import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync(process.argv[1]);db.prepare(\"delete from rbac_user_roles where user_id='qa-manager' and role_id in(select id from rbac_roles where code='addon_maintenance_standard_manager')\").run();db.close();",output+'synthetic.sqlite']);
await evaluate("document.querySelector('[data-sm-save]').requestSubmit()");await waitFor("document.querySelector('.sm-workbench')?.textContent.includes('原记录及未提交内容已清除')");
const cleared=await evaluate("({text:document.querySelector('.sm-workbench').textContent,form:!!document.querySelector('[data-sm-save]'),details:!!document.querySelector('[data-sm-action]')})");assert.ok(!cleared.text.includes('旧权限合成标准'));assert.ok(!cleared.text.includes('撤权后不得保留的依据'));assert.equal(cleared.form,false);assert.equal(cleared.details,false);
assert.equal(await evaluate("fetch('/api/maintenance/standard-management').then(r=>r.status)"),403);
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await evaluate("document.querySelector('.sm-workbench').scrollIntoView({block:'start'})");const layout=await evaluate("({viewport:innerWidth,width:document.documentElement.scrollWidth})");assert.ok(layout.width<=layout.viewport);
fs.writeFileSync(output+'access-cleared-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
fs.writeFileSync(output+'browser-proof.json',JSON.stringify({actualBrowser:true,actualOriginalPage:true,syntheticOnly:true,networkFailureRetainsInput:true,actualRoleRevocationClearsOldDetails:true,apiStatusAfterRevocation:403,layout,standardId:created.body.standard.id},null,2));ws.close();
