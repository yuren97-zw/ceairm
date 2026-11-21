// page-evidence-r10.mjs — 2026-11-18 首页(P0-16/17/123)+八类策略展示(P0-127)+统计双单位(P0-46/47界面要素)。
// r1-r3 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步）。合成环境专用。
const DRIVER_VERSION='page-evidence-r10';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r10-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r10-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED','MUC_STANDARDS_MANAGEMENT_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']}),children=[server];let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
let chrome,ws,failureCapture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,description)=>{for(let n=0;n<200;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+description);};
const proof={driverVersion:DRIVER_VERSION,teardown:TEARDOWN,probe:PROBE,syntheticOnly:true,actualOriginalAppBrowser:true,physicalDeviceVerified:false,assertions:{},screenshots:[],servicesStopped:false};
const consoleLog=[];
const MONTH='2023-06';
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const auth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=auth.cookie,rootPerson=auth.value.user.personId;
 // 种子：v1 标准绑定项 → 待复核（主做单人 2h）；浏览器将观测挂点触发后的页面数值刷新
 const stamp=new Date().toISOString();
 const publishStd=(id,version,hours)=>{db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,'fixture',?,?) on conflict(id) do update set status='PUBLISHED',updated_at=excluded.updated_at").run(id,stamp,stamp);db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,?,'单项工作','990','十轮生效引用标准','十轮生效引用范围',?,'[\"A320\"]',0,'PUBLISHED','INCLUDE','2026-01-01','fixture','2026-01-01',?)").run(id+'-v'+version,id,Number(version),hours,stamp);};
 publishStd('r10-std',1,2);
 const flight=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2027-12-01',flightNo:'R10-REFRESH-QA',aircraftNo:'B-R10',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+flight.id,version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:rootPerson}]}});
 const item={clientId:'r10-item-v1',temporary:true,manualManaged:true,standardId:'r10-std',standardVersion:1,category:'单项工作',chapter:'990',title:'十轮生效引用标准',reportExplanation:'十轮生效引用范围',standardHours:2,entries:[{personId:rootPerson,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;
 await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});
 const report=(await call(base+'/reports',{cookie})).value.report;
 await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});
 const subtask=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id);
 assert.equal(Number(db.prepare('select hours from maintenance_hour_results where owner_id=?').get(subtask.id).hours),2);
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{for(let attempt=0;attempt<3;attempt++){try{await delay(600);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');return;}catch{await delay(1500);}}proof.screenshots.push(name+'.png(missed)');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 failureCapture=async stage=>{try{const text=await evaluate(`document.body.innerText.slice(0,8000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr4-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=pevr4-home'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 // ---- 数据页待复核显示 +2 小时（P0-37 界面观测点）----
 assert.ok(await openMaintenancePage('data'),'data tab failed');await click('[data-maint-tab=data]');
 await ui(`!!document.querySelector('#maintenanceDataMonth')`);
 await evaluate(`(()=>{const n=document.querySelector('#maintenanceDataMonth');n.value='2027-12';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
 await delay(1500);
 await ui(`!!document.querySelector('.personal-metric-card')`);
 await ui(`document.body.textContent.includes('+ 2 小时待复核')`);
 const before=await evaluate(`document.querySelector('.personal-metric-pending')?.textContent`);
 proof.assertions.pendingBefore={ok:true,text:before};await shot('r10-pending-2h');
 // v2 入库（夹具直插）→ 真实 API 管理操作触发挂点 → 自动刷新
 publishStd('r10-std',2,3);
 const mgmt=(await call('/maintenance/standard-management',{method:'POST',cookie,body:{clientId:'r10-hook-create',reason:'十轮挂点触发：新建无关草稿以触发标准生效引用核对',definition:{category:'其他',chapter:'999',title:'十轮挂点触发草稿',workScope:'仅用于触发核对',standardHours:1,aircraftCodes:['A320'],genericAircraft:false}}}));
 assert.ok(mgmt&&mgmt.value&&mgmt.value.operation,'管理操作应成功: '+JSON.stringify(mgmt&&mgmt.value).slice(0,200));
 await delay(2500);
 assert.equal(Number(db.prepare('select effective_hours from maintenance_nonroutine_assessments where subtask_id=?').get(subtask.id).effective_hours),3,'挂点应刷新投影至3h');
 // 页面经 SSE 自动更新为 +3 小时待复核（无重载）
 const urlBefore=await evaluate(`location.href`);
 await ui(`document.body.textContent.includes('+ 3 小时待复核')`);
 const after=await evaluate(`({url:location.href,text:document.querySelector('.personal-metric-pending')?.textContent})`);
 assert.equal(after.url,urlBefore,'不得重载');
 proof.assertions.refreshE2E={ok:true,db:3,page:after.text,urlUnchanged:true};await shot('r10-pending-3h');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.pendingBefore?.ok||!proof.assertions.refreshE2E?.ok)process.exitCode=1;
