// page-evidence-r8.mjs — 2026-11-18 更正工作台(P0-92/143等界面要素)与账期工作台(P0-24)取证。
// r1-r4 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步+尽力截图）。合成环境专用。
const DRIVER_VERSION='page-evidence-r8';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r8-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r8-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
const template=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(template.person_id);
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`insert into ${table}(${keys.map(k=>'"'+k+'"').join(',')}) values(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
const role=code=>db.prepare('select id from rbac_roles where code=?').get(code).id;
let r5seq=0;const makeAccount=(id,name,roles)=>{const personId='person-'+id,stamp=new Date().toISOString();insert('personnel',{...person,id:personId,employee_no:String(99989801+(r5seq++)),name,employment_status:'在职',data_status:'active',created_at:stamp,updated_at:stamp});insert('users',{...template,id,username:id,person_id:personId,name,role:'receiver',status:'active'});for(const code of roles)insert('rbac_user_roles',{user_id:id,role_id:role(code),created_at:stamp});insert('rbac_user_scopes',{id:'scope-'+id,user_id:id,module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});return {id,personId,username:id};};
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED','MUC_NONROUTINE_CORRECTIONS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']}),children=[server];let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
let chrome,ws,failureCapture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,description)=>{for(let n=0;n<200;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+description);};
const proof={driverVersion:DRIVER_VERSION,teardown:TEARDOWN,probe:PROBE,syntheticOnly:true,actualOriginalAppBrowser:true,physicalDeviceVerified:false,assertions:{},screenshots:[],servicesStopped:false};
const consoleLog=[];
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const loginApi=async username=>(await call('/login',{method:'POST',body:{username,password:PASSWORD}})).cookie;
 const rootAuth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=rootAuth.cookie,rootPerson=rootAuth.value.user.personId;
 const worker=makeAccount('r5-worker','五轮验收工人',['worker']);
 const reviewers=Array.from({length:12},(_,i)=>makeAccount('r5-reviewer-'+i,'五轮评议'+i,['worker','addon_nonroutine_reviewer']));
 const finalizer=makeAccount('r5-finalizer','五轮终审',['worker','addon_nonroutine_review_finalizer','addon_nonroutine_review_auditor']);
 const periodResponsible=makeAccount('r5-period','五轮账期负责人',['addon_maintenance_period_responsible']);
 const corrector=makeAccount('r5-corrector','五轮更正批准人',['worker','addon_archive_modify']);
 const finalizerCookie=await loginApi(finalizer.username),correctorCookie=await loginApi(corrector.username);
 const flight=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'R8-RPT-QA',aircraftNo:'B-R8R',aircraftType:'A320',workKind:'航后'}})).value.flight,base='/maintenance/flights/'+flight.id,version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:rootPerson},{role:'接机',personId:rootPerson}]}});
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id);
 await call(base+'/reports/routine',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(),entries:[{role:'接机',personId:rootPerson}]}});
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});
 const dbHours=Number(db.prepare('select coalesce(sum(hours),0) s from maintenance_hour_results where person_id=?').get(rootPerson).s);
 const dbSorties=Number(db.prepare('select count(*) n from maintenance_sortie_results where person_id=?').get(rootPerson).n);
 assert.equal(dbSorties,1);assert.ok(Math.abs(dbHours-5)<1e-6);
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{for(let attempt=0;attempt<3;attempt++){try{await delay(600);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');return;}catch{await delay(1500);}}proof.screenshots.push(name+'.png(missed)');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 const loginPage=async username=>{await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=r5-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=r5-'+encodeURIComponent(username)});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();};
 failureCapture=async stage=>{try{const text=await evaluate(`document.body.innerText.slice(0,8000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 // ===== 会话（root）：报表汇总页 + 导出 =====
 await loginPage('54002010');
 assert.ok(await openMaintenancePage('report'),'report tab failed');await click('[data-maint-tab=report]');
 await ui(`!!document.querySelector('.maintenance-report-views')`);
 // 日期范围与状态过滤对准种子（默认=当月+已确认）
 await evaluate(`(()=>{for(const [sel,val] of [['[data-maint-report-filter=dateFrom]','2023-06-01'],['[data-maint-report-filter=dateTo]','2023-06-30'],['[data-maint-report-filter=status]','已提报']]){const n=document.querySelector(sel);n.value=val;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`);
 await delay(1500);
 const viewsFacts=await evaluate(`(()=>{const views=[...document.querySelectorAll('[data-maint-report-view]')].map(b=>b.textContent.trim());const text=document.body.textContent.replace(/\s+/g,' ');return {views,dashboard:document.querySelector('[data-maint-report-view=dashboard]')?.getAttribute('aria-selected')==='true',units:{hours:text.includes('总工时')&&text.includes('小时'),sorties:text.includes('放行架次')&&text.includes('架次'),opportunities:text.includes('维修机会')}};})()`);
 assert.deepEqual(viewsFacts.views,['看板','人员清单','维修机会清单','非例行清单'],'报表视图: '+JSON.stringify(viewsFacts));
 assert.equal(viewsFacts.dashboard,true,'默认看板');
 proof.assertions.reportViews={ok:true,facts:viewsFacts};await shot('r8-report-dashboard');
 // 人员清单：双单位行 + DB 对账
 await click('[data-maint-report-view=people]');
 await ui(`!!document.querySelector('[data-maint-report-person]')`);
 const peopleFacts=await evaluate(`[...document.querySelectorAll('[data-maint-report-person]')].map(n=>n.textContent.replace(/\s+/g,' ').trim())`);
 assert.ok(peopleFacts.some(t=>t.includes('5h')&&t.includes('1 架次')&&t.includes('1 项')),'人员行双单位(例5h/放行1架次/机会1项): '+JSON.stringify(peopleFacts));
 proof.assertions.reportPeopleDual={ok:true,rows:peopleFacts,dbHours,dbSorties};await shot('r8-report-people');
 // 维修机会清单
 await click('[data-maint-report-view=opportunities]');
 await ui(`document.body.textContent.includes('R8-RPT-QA')`);
 const oppFacts=await evaluate(`(()=>{const row=[...document.querySelectorAll('.maintenance-report-row')].find(n=>n.textContent.includes('R8-RPT-QA'));return row?row.textContent.replace(/\s+/g,' ').trim().slice(0,220):null;})()`);
 assert.ok(String(oppFacts).includes('1 架次'),'机会行架次: '+oppFacts);
 proof.assertions.reportOpportunities={ok:true,row:oppFacts};await shot('r8-report-opportunities');
 // 导出：对话框 7 节 + xlsx 下载
 await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:out});
 await click('[data-maint-report-export]');
 await ui(`!!document.querySelector('#maintenanceReportExportDialog[open]')`);
 const exportFacts=await evaluate(`(()=>{const d=document.querySelector('#maintenanceReportExportDialog');const boxes=[...d.querySelectorAll('input[name=section]')].map(b=>({value:b.value,checked:b.checked}));return {sections:boxes.map(b=>b.value),checked:boxes.filter(b=>b.checked).length,range:d.querySelector('.maintenance-report-export-range')?.textContent,submit:!!d.querySelector('button[type=submit]')};})()`);
 assert.deepEqual(exportFacts.sections,['people','hours','signatures','sorties','teams','opportunities','nonroutine'],'导出节: '+JSON.stringify(exportFacts));
 assert.ok(exportFacts.checked>=1,'默认勾选节: '+exportFacts.checked);
 proof.assertions.reportExportDialog={ok:true,facts:exportFacts};await shot('r8-export-dialog');
 await click('#maintenanceReportExportDialog button[type=submit]');
 let exported=null;
 for(let i=0;i<40;i++){await delay(700);const files=fs.readdirSync(out).filter(f=>/\.xlsx$/i.test(f));if(files.length){exported=files[0];break;}}
 assert.ok(exported,'导出文件未生成');
 const stat=fs.statSync(path.join(out,exported));
 assert.ok(stat.size>2000,'导出文件过小: '+stat.size);
 const head=fs.readFileSync(path.join(out,exported)).subarray(0,2);
 assert.equal(head[0],0x50);assert.equal(head[1],0x4b,'xlsx应为PK zip头');
 proof.assertions.reportExportFile={ok:true,file:exported,bytes:stat.size};await shot('r8-export-done');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.reportViews?.ok||!proof.assertions.reportPeopleDual?.ok||!proof.assertions.reportOpportunities?.ok||!proof.assertions.reportExportDialog?.ok||!proof.assertions.reportExportFile?.ok)process.exitCode=1;
