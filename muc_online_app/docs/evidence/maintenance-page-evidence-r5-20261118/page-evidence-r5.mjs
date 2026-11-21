// page-evidence-r5.mjs — 2026-11-18 更正工作台(P0-92/143等界面要素)与账期工作台(P0-24)取证。
// r1-r4 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步+尽力截图）。合成环境专用。
const DRIVER_VERSION='page-evidence-r5';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r5-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r5-latest',out);
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
 const periodUrl='/maintenance/hour-periods/2027-11';
 await call(periodUrl+'/assign',{method:'POST',cookie,body:{revision:0,accountId:periodResponsible.id,reason:'五轮指定账期负责人'}});
 await call(periodUrl+'/confirm',{method:'POST',cookie:await loginApi(periodResponsible.username),body:{revision:1,state:'OPEN',reason:'五轮开放当月'}});
 const flight=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2027-11-01',flightNo:'R5-CORR-QA',aircraftNo:'B-R5C',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+flight.id,version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:rootPerson}]}});
 const item={clientId:'r5-item-v1',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'998',title:'五轮更正验收工作',reportExplanation:'五轮更正场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;
 await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});
 const report=(await call(base+'/reports',{cookie})).value.report;
 await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});
 const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url='/maintenance/nonroutine-reviews/'+reviewCase.id;
 await call(url+'/accept',{method:'POST',cookie,body:{revision:1,accountIds:reviewers.map(r=>r.id),finalizerAccountId:finalizer.id}});
 for(const [index,reviewer] of reviewers.entries())await call(url+'/opinion',{method:'POST',cookie:await loginApi(reviewer.username),body:{revision:0,hours:index+1,basis:'R5-PRIVATE-'+index}});
 const sealed=(await call(url,{cookie:finalizerCookie})).value.review;
 const decision={revision:sealed.revision,decision:{category:'单项工作',chapter:'998',title:item.title,workScope:item.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:worker.personId,role:'主做'}],reason:'',admissionDecision:'PENDING'};
 const preview=(await call(url+'/preview',{method:'POST',cookie:finalizerCookie,body:decision})).value.preview;
 const finalization=(await call(url+'/finalize',{method:'POST',cookie:finalizerCookie,body:{...decision,expectedPolicyToken:preview.policyToken}})).value.finalization;
 assert.equal(finalization.channel.state,'MERGED_CLOSED',JSON.stringify(finalization));
 const tree=(await call(base+'/review',{cookie})).value.review;
 await call(base+'/review',{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
 const subtask=db.prepare('select id from maintenance_subtasks where flight_id=?').get(flight.id);
 assert.equal(db.prepare('select status from maintenance_hour_results where owner_id=?').get(subtask.id).status,'已确认');
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{for(let attempt=0;attempt<3;attempt++){try{await delay(600);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');return;}catch{await delay(1500);}}proof.screenshots.push(name+'.png(missed)');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 const loginPage=async username=>{await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=r5-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=r5-'+encodeURIComponent(username)});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();};
 failureCapture=async stage=>{try{const text=await evaluate(`document.body.innerText.slice(0,8000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 // ===== 会话1：更正批准人（addon_archive_modify）看更正工作台 =====
 await loginPage(corrector.username);
 assert.ok(await openMaintenancePage('corrections'),'corrections tab failed to render');await click('[data-maint-tab=corrections]');
 await ui(`!!document.querySelector('.hc-workbench')`);
 const wbFacts=await evaluate(`(()=>({header:document.querySelector('.hc-workbench h3')?.textContent,hasQuery:!!document.querySelector('[data-hc-query-sources]'),notice:document.querySelector('.hc-workbench p')?.textContent}))()`);
 assert.ok(String(wbFacts.header).includes('已确认工时更正'),JSON.stringify(wbFacts));
 proof.assertions.correctionsWorkbenchRender={ok:true,facts:wbFacts};await shot('r5-corrections-workbench');
 await click('[data-hc-query-sources]');
 await ui(`!!document.querySelector('[data-hc-source]')`);
 const sources=await evaluate(`[...document.querySelectorAll('[data-hc-source]')].map(n=>n.textContent.replace(/\\s+/g,' ').trim())`);
 assert.ok(sources.some(t=>t.includes('五轮更正验收工作')),'来源清单应含已确认工作: '+JSON.stringify(sources));
 let sourceButton=null;
 for(let i=0;i<10;i++){
   const step=await evaluate(`(()=>{const form=document.querySelector('[name=hc_amount]');if(form)return {done:true};const n=[...document.querySelectorAll('[data-hc-source]')].find(n=>n.textContent.includes('五轮更正验收工作'));if(!n)return {done:false,missing:true};n.click();return {done:false,id:n.dataset.hcSource,status:document.querySelector('[data-hc-status]')?.textContent};})()`);
   if(step.id)sourceButton=step.id;
   if(step.done)break;
   await delay(900);
 }
 proof.sourceOpenDiagnostic=await evaluate(`({status:document.querySelector('[data-hc-status]')?.textContent,busyText:document.querySelector('.hc-workbench')?.textContent.includes('正在')})`);
 await ui(`!!document.querySelector('[name=hc_amount]')`);
 const formFacts=await evaluate(`(()=>{const wb=document.querySelector('.hc-workbench');const text=wb.textContent.replace(/\\s+/g,' ');return {amount:!!document.querySelector('[name=hc_amount]'),previewButton:!!document.querySelector('[data-hc-preview]'),verifiedCheckbox:!!document.querySelector('[name=hc_verified]'),mentionsOriginal:text.includes('原认定 2 小时'),noParticipantEdit:text.includes('不能增加或删除原参与人'),subtaskId:${JSON.stringify(sourceButton)}};})()`);
 assert.equal(formFacts.amount,true);assert.equal(formFacts.previewButton,true);assert.equal(formFacts.verifiedCheckbox,true);
 assert.ok(formFacts.mentionsOriginal,JSON.stringify(formFacts));
 assert.ok(formFacts.noParticipantEdit,JSON.stringify(formFacts));
 proof.assertions.correctionsSourceForm={ok:true,facts:formFacts};await shot('r5-corrections-source-form');
 // ===== 会话2：账期负责人看账期工作台 =====
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}}
 await loginPage(periodResponsible.username);
 assert.ok(await openMaintenancePage('periods'),'periods tab failed to render');await click('[data-maint-tab=periods]');
 await ui(`!!document.querySelector('.mp-workbench input[name=periodMonth]')`);
 await evaluate(`(()=>{const n=document.querySelector('input[name=periodMonth]');n.value='2027-11';n.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
 await click('[data-mp-query]');
 await ui(`document.querySelector('.mp-workbench')?.textContent.includes('2027-11')`);
 const periodFacts=await evaluate(`(()=>{const wb=document.querySelector('.mp-workbench');const text=wb.textContent.replace(/\\s+/g,' ');return {open:text.includes('2027-11 · 开放'),responsible:text.includes(${JSON.stringify(periodResponsible.id)}),confirmForm:!!document.querySelector('[data-mp-confirm]'),history:text.includes('账期操作历史')};})()`);
 assert.equal(periodFacts.open,true,JSON.stringify(periodFacts));
 assert.equal(periodFacts.responsible,true,JSON.stringify(periodFacts));
 assert.equal(periodFacts.confirmForm,true,'指定负责人应有确认表单');
 assert.equal(periodFacts.history,true);
 proof.assertions.periodWorkbench={ok:true,facts:periodFacts};await shot('r5-period-workbench');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.correctionsWorkbenchRender?.ok||!proof.assertions.correctionsSourceForm?.ok||!proof.assertions.periodWorkbench?.ok)process.exitCode=1;
