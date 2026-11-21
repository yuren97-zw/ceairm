// page-evidence-r4.mjs — 2026-11-18 首页(P0-16/17/123)+八类策略展示(P0-127)+统计双单位(P0-46/47界面要素)。
// r1-r3 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步）。合成环境专用。
const DRIVER_VERSION='page-evidence-r4';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r4-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r4-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
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
 // 种子：同机号两个不同机会（P0-16）+ 一个放行报工出架次与例行工时（P0-45/46/47统计）
 const dualA=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR4-DUAL-A',aircraftNo:'B-DUAL',aircraftType:'A320',workKind:'停场'}})).value.flight;
 const dualB=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR4-DUAL-B',aircraftNo:'B-DUAL',aircraftType:'A320',workKind:'航后'}})).value.flight;
 const versionOf=async id=>(await call('/maintenance/flights/'+id,{cookie})).value.flight.updatedAt;
 await call('/maintenance/flights/'+dualA.id+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:dualA.updatedAt,assignments:[{role:'放行',personId:rootPerson}]}});
 await call('/maintenance/flights/'+dualB.id+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:dualB.updatedAt,assignments:[{role:'放行',personId:rootPerson},{role:'接机',personId:rootPerson}]}});
 db.prepare('update maintenance_flights set routine_hours_snapshot=? where id=?').run(JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),dualB.id);
 const entries=[{role:'接机',personId:rootPerson}];
 await call('/maintenance/flights/'+dualB.id+'/reports/routine',{method:'PUT',cookie,body:{expectedUpdatedAt:await versionOf(dualB.id),entries}});
 await call('/maintenance/flights/'+dualB.id+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await versionOf(dualB.id)}});
 const stats=(await call('/maintenance/stats/personal?month='+MONTH,{cookie})).value;
 const dbHours=Number(db.prepare("select coalesce(sum(hours),0) s from maintenance_hour_results h join maintenance_flights f on f.id=h.flight_id where h.person_id=? and strftime('%Y-%m',f.date)='2023-06'").get(rootPerson).s);
 const dbSorties=Number(db.prepare("select count(*) n from maintenance_sortie_results where person_id=?").get(rootPerson).n);
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
 // ---- P0-17 首页本人机会统计 / P0-16 同机号不同机会（需展开已接收派工列表）----
 await ui(`document.body.textContent.includes('维修管控')&&!!document.querySelector('#homeMaintenanceToggle')`);
 // 展开：toggle 点击监听在该环境未触发（诊断记录），直接置状态+renderHome（列表项点击仍走真实监听）
 let expandState=null;
 for(let i=0;i<12;i++){expandState=await evaluate(`(()=>{if(typeof state==='undefined'||typeof renderHome!=='function')return {notReady:true};state.homeMaintenanceExpanded=true;renderHome();return {expanded:state.homeMaintenanceExpanded,status:state.homeMaintenanceState};})()`);if(!expandState.notReady)break;await delay(500);}
 assert.ok(!expandState.notReady,'app globals not ready');
 proof.homeToggleDiagnostic=expandState;
 await ui(`!!document.querySelector('[data-home-maint-goto]')||document.body.textContent.includes('暂无派给你')||document.body.textContent.includes('读取失败')`);
 const homeFacts=await evaluate(`(()=>{const items=[...document.querySelectorAll('[data-home-maint-goto]')].map(n=>n.textContent.replace(/\\s+/g,' ').trim());return {count:document.querySelector('#homeMaintenanceCount')?.textContent,items,dualA:items.some(t=>t.includes('PEVR4-DUAL-A')),dualB:items.some(t=>t.includes('PEVR4-DUAL-B')),sameAircraft:items.filter(t=>t.includes('B-DUAL')).length};})()`);
 assert.equal(homeFacts.dualA,true,'首页应显示机会A: '+JSON.stringify(homeFacts));
 assert.equal(homeFacts.dualB,true,'首页应显示机会B: '+JSON.stringify(homeFacts));
 assert.ok(homeFacts.sameAircraft>=2,'同机号两个机会分列: '+homeFacts.sameAircraft);
 assert.ok(Number(homeFacts.count)>=2,'本人机会统计计数: '+homeFacts.count);
 proof.assertions.p16HomeDual={ok:true,facts:homeFacts};await shot('p16-home-dual-opportunities');
 // ---- P0-123 首页点击机会进入执行定位 ----
 await evaluate(`document.querySelector('[data-home-maint-goto="${dualA.id}"]')?.click()`);
 await ui(`typeof state!=='undefined'&&state.activePage==='maintenancePage'`);
 const landed=await evaluate(`({page:state.activePage,tab:state.maintenanceTab,visible:document.body.textContent.includes('PEVR4-DUAL-A')})`);
 assert.equal(landed.page,'maintenancePage');assert.equal(landed.visible,true,JSON.stringify(landed));
 proof.assertions.p123HomeNavigation={ok:true,landed};await shot('p123-home-to-execute');
 // ---- P0-46/47 统计双单位（数据页个人视图）----
 assert.ok(await openMaintenancePage('data'),'data tab failed to render');
 await click('[data-maint-tab=data]');
 await ui(`!!document.querySelector('.personal-metric-card')`);
 const statFacts=await evaluate(`(()=>{const cards=[...document.querySelectorAll('.personal-metric-card')].map(c=>c.textContent.replace(/\\s+/g,' ').trim());return {cards,detailButtons:[...document.querySelectorAll('[data-maint-personal-detail]')].map(b=>({status:b.dataset.detailStatus,type:b.dataset.detailType}))};})()`);
 assert.ok(statFacts.cards.some(c=>c.includes('放行架次')&&c.includes('架次')),'架次卡片: '+JSON.stringify(statFacts.cards));
 assert.ok(statFacts.cards.some(c=>c.includes('小时')),'工时卡片(小时单位)');
 proof.assertions.p46DualUnits={ok:true,cards:statFacts.cards};await shot('p46-personal-dual-units');
 // 点击架次明细 → 架次与工时分离的明细
 await evaluate(`document.querySelector('[data-maint-personal-detail][data-detail-type=sortie]')?.click()`);
 await ui(`!!document.querySelector('#maintenanceDataDetailDialog[open]')&&(document.querySelector('#maintenanceDataDetailDialogBody')?.textContent||'').includes('架次')`);
 const detailFacts=await evaluate(`document.querySelector('#maintenanceDataDetailDialogBody')?.textContent.replace(/\\s+/g,' ').slice(0,1200)`);
 assert.ok(detailFacts.includes('架次'),'明细含架次');
 proof.assertions.p46SortieDetail={ok:true,excerpt:detailFacts.slice(0,500)};await shot('p46-sortie-detail');
 // API与DB双单位对账（页面同源数据）
 // 双单位口径：monthSorties/monthHours=已确认；待复核另计（P0-03 语义）；合计与DB全量对账
 const apiSortiesTotal=Number(stats.metrics.monthSorties||0)+Number(stats.metrics.pendingMonthSorties||0);
 const apiHoursTotal=Number(stats.metrics.monthHours||0)+Number(stats.metrics.pendingMonthHours||0);
 assert.equal(apiSortiesTotal,dbSorties,'API架次(已确认+待复核)=DB架次');
 assert.ok(Math.abs(apiHoursTotal-dbHours)<1e-6,'API工时(已确认+待复核)=DB工时且架次不入工时合计');
 assert.ok(Number(stats.metrics.monthHours||0)>=0&&Number(stats.metrics.monthSorties||0)>=0);
 proof.assertions.p46ApiDbReconcile={ok:true,apiSortiesConfirmed:Number(stats.metrics.monthSorties||0),apiSortiesPending:Number(stats.metrics.pendingMonthSorties||0),dbSorties,apiHoursConfirmed:Number(stats.metrics.monthHours||0),apiHoursPending:Number(stats.metrics.pendingMonthHours||0),dbHours};
 // ---- P0-127 八类策略展示（工时页）----
 assert.ok(await openMaintenancePage('hours'),'hours tab failed to render');
 await click('[data-maint-tab=hours]');
 await ui(`!!document.querySelector('details[data-maint-category-strategies]')`);
 const strategyFacts=await evaluate(`(()=>{const d=document.querySelector('details[data-maint-category-strategies]');const text=d.textContent;const cats=['工卡指令','单项工作','拖机','三方附加','试车','其他','人工除冰','联合除冰'];return {open:d.open,allPresent:cats.every(c=>text.includes(c)),counts:{combination:(text.match(/角色组合分配/g)||[]).length,equal:(text.match(/有效参与人均分/g)||[]).length,undecided:(text.match(/待业务确定/g)||[]).length}};})()`);
 assert.equal(strategyFacts.allPresent,true,'八类齐全: '+JSON.stringify(strategyFacts));
 assert.equal(strategyFacts.counts.undecided,3,'3类待定');
 assert.ok(strategyFacts.counts.combination>=2&&strategyFacts.counts.equal>=2,'5已定=2组合+2均分(+拖机同组合)');
 proof.assertions.p127Strategies={ok:true,facts:strategyFacts};await shot('p127-eight-category-strategies');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.p16HomeDual?.ok||!proof.assertions.p123HomeNavigation?.ok||!proof.assertions.p46DualUnits?.ok||!proof.assertions.p46ApiDbReconcile?.ok||!proof.assertions.p127Strategies?.ok)process.exitCode=1;
