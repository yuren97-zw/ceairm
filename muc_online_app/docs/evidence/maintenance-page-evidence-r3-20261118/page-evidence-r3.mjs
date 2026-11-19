// page-evidence-r3.mjs — 2026-11-18 导入批次工作台界面取证（I簇 批次工作台要素）。
// r1/r2 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步）。合成环境专用。
const DRIVER_VERSION='page-evidence-r3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import assert from 'node:assert/strict';
import net from 'node:net';
const APP='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app';
const {default:WebSocket}=await import(APP+'/node_modules/ws/wrapper.mjs');
const BASE=process.env.BASE||'/private/tmp/zcode-sealed-20261117/base-r2.sqlite';
const PASSWORD='muc2026';
const TEARDOWN=process.env.TEARDOWN!=='0';
const PROBE=process.env.PROBE!=='0';
for(const port of [18888,18889]){const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',()=>reject(Error('port occupied: '+port)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});}
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r3-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r3-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']}),children=[server];let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
let chrome,ws,failureCapture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,description)=>{for(let n=0;n<200;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+description);};
const proof={driverVersion:DRIVER_VERSION,teardown:TEARDOWN,probe:PROBE,syntheticOnly:true,actualOriginalAppBrowser:true,physicalDeviceVerified:false,assertions:{},screenshots:[],servicesStopped:false};
const consoleLog=[];
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const auth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=auth.cookie;
 const made=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR3-IMP',aircraftNo:'B-PV3',aircraftType:'A320',workKind:'停场'}})).value.flight;
 const csvPath=out+'/import.csv';
 fs.writeFileSync(csvPath,['date,aircraftNo,workKind,flightNo,title,standardHours','2023-06-10,B-PV3,停场,PEVR3-IMP,页面取证三轮新草稿A,2','2023-06-10,B-PV3,停场,PEVR3-IMP,页面取证三轮新草稿B,2'].join('\n'),'utf8');
 const importSourcesBefore=Number(db.prepare('select count(*) n from maintenance_nonroutine_import_sources').get().n);
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 failureCapture=async stage=>{try{const html=await evaluate(`document.querySelector('#maintenancePage')?.innerHTML?.slice(0,8000)||document.body.innerHTML.slice(0,8000)`);fs.writeFileSync(out+'/failure-panel-'+stage+'.html',String(html));}catch{}try{const text=await evaluate(`document.body.innerText.slice(0,6000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr3-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr3-import'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 assert.ok(await openMaintenancePage('dispatch'),'maintenance page failed to render');
 await ui(`!!document.querySelector('[data-maint-import]')`);
 await click('[data-maint-import]');
 await ui(`!!document.querySelector('#maintenanceUnifiedImportDialog[open]')`);
 assert.equal(await evaluate(`document.querySelector('#maintenanceImportType option[value=subtasks]')?.textContent`),'附加工作');
 await evaluate(`(()=>{const s=document.querySelector('#maintenanceImportType');s.value='subtasks';s.dispatchEvent(new Event('change',{bubbles:true}));return s.value;})()`);
 await ui(`!!document.querySelector('#maintenanceImportPreview .maintenance-import-workbench, #maintenanceImportHelp')`);
 // CDP 注入 CSV 文件到文件输入
 const doc=await send('Page.getNavigationHistory').then(()=>send('DOM.getDocument',{depth:-1}));
 const nodeId=await send('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'#maintenanceUnifiedImportFile'}).then(r=>r.nodeId);
 assert.ok(nodeId,'file input node not found');
 await send('DOM.setFileInputFiles',{files:[csvPath],nodeId});
 await evaluate(`document.querySelector('#maintenanceUnifiedImportFile').dispatchEvent(new Event('change',{bubbles:true}));true`);
 await click('#maintenanceImportCheck');
 await ui(`!!document.querySelector('.maintenance-import-workbench .maintenance-import-work-row')`);
 const previewFacts=await evaluate(`(()=>{const rows=[...document.querySelectorAll('.maintenance-import-work-row')].map(a=>a.textContent.replace(/\\s+/g,' ').trim());return {rowCount:rows.length,texts:rows,confirm:document.querySelector('#maintenanceImportConfirm')?.textContent,summary:document.querySelector('.maintenance-import-workbench')?.textContent.match(/待处理[^ ]{0,12}|已匹配[^ ]{0,8}/g)?.slice(0,6)||null};})()`);
 assert.equal(previewFacts.rowCount,2,'expected new-draft + duplicate rows: '+JSON.stringify(previewFacts));
 assert.ok(previewFacts.texts.every(t=>t.includes('作为草稿导入')),JSON.stringify(previewFacts.texts));
 assert.ok(previewFacts.texts.some(t=>t.includes('页面取证三轮新草稿A'))&&previewFacts.texts.some(t=>t.includes('页面取证三轮新草稿B')),JSON.stringify(previewFacts.texts));
 assert.equal(previewFacts.confirm,'导入所选 2 行草稿',JSON.stringify(previewFacts));
 const checked=await evaluate(`[...document.querySelectorAll('[data-import-select]')].map(i=>[i.dataset.importSelect,i.checked,i.disabled])`);
 assert.equal(checked.length,2);assert.deepEqual(checked.map(c=>c[1]),[true,true],'both ready rows pre-selected');
 assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_import_sources').get().n),importSourcesBefore,'preview must not write');
 proof.assertions.importWorkbenchPreview={ok:true,facts:previewFacts,selection:checked};await shot('r3-import-workbench-preview');
 // 确认导入（真实提交路径）
 await click('#maintenanceImportConfirm');
 await ui(`(document.querySelector('#maintenanceImportProgress')?.textContent||'').includes('草稿处理结果已保存')`);
 const after=await evaluate(`({progress:document.querySelector('#maintenanceImportProgress')?.textContent,workbench:document.querySelector('.maintenance-import-workbench')?.textContent.replace(/\\s+/g,' ').trim().slice(0,500)})`);
 assert.ok((after.workbench||'').includes('已导入'),'post-commit rows should show 已导入: '+after.workbench);
 const countActive=Number(db.prepare("select count(*) n from maintenance_nonroutine_import_sources where state='ACTIVE' and original_json like '%页面取证三轮新草稿%'").get().n);
 assert.equal(countActive,2,'exactly two active imported drafts, got '+countActive);
 proof.assertions.importWorkbenchCommit={ok:true,progress:after.progress,activeDrafts:countActive};await shot('r3-import-workbench-committed');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.importWorkbenchPreview?.ok||!proof.assertions.importWorkbenchCommit?.ok)process.exitCode=1;
