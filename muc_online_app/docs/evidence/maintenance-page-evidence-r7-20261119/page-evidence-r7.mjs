// page-evidence-r7.mjs — 2026-11-18 更正工作台(P0-92/143等界面要素)与账期工作台(P0-24)取证。
// r1-r4 配方（SW注销+对话框自动接受+CDP看门狗+开页重试+导航前停同步+尽力截图）。合成环境专用。
const DRIVER_VERSION='page-evidence-r7';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r7-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r7-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
const template=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(template.person_id);
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`insert into ${table}(${keys.map(k=>'"'+k+'"').join(',')}) values(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
const role=code=>db.prepare('select id from rbac_roles where code=?').get(code).id;
let r5seq=0;const makeAccount=(id,name,roles)=>{const personId='person-'+id,stamp=new Date().toISOString();insert('personnel',{...person,id:personId,employee_no:String(99989801+(r5seq++)),name,employment_status:'在职',data_status:'active',created_at:stamp,updated_at:stamp});insert('users',{...template,id,username:id,person_id:personId,name,role:'receiver',status:'active'});for(const code of roles)insert('rbac_user_roles',{user_id:id,role_id:role(code),created_at:stamp});insert('rbac_user_scopes',{id:'scope-'+id,user_id:id,module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});return {id,personId,username:id};};
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED','MUC_NONROUTINE_CORRECTIONS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const t0=Date.now();const s=http.createServer((req,res)=>{const a=Date.now();if(req.url.startsWith('/api'))console.log('REQ '+req.method+' '+req.url+' arrive=+'+((a-t0)/1000).toFixed(1)+'s');res.on('finish',()=>{if(req.url.startsWith('/api'))console.log('DONE '+req.method+' '+req.url+' dur='+(Date.now()-a)+'ms')});return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
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
 // r7 种子：建案至 PENDING_ACCEPTANCE（不受理）；root 授终审+审计角色用于会话C
 const insertRole=(uid,code)=>db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(uid,role(code),new Date().toISOString());
 insertRole('54002010','addon_nonroutine_review_finalizer');insertRole('54002010','addon_nonroutine_review_auditor');
 const flight=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'R7-FLOW-QA',aircraftNo:'B-R7F',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+flight.id,version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:rootPerson}]}});
 const item={clientId:'r7-item-v1',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'999',title:'七轮全流程验收工作',reportExplanation:'七轮全流程场景',standardHours:2,entries:[{personId:worker.personId,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;
 await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});
 const report=(await call(base+'/reports',{cookie})).value.report;
 await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});
 const tree=(await call(base+'/review',{cookie})).value.review;
 await call(base+'/review',{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
 const reviewCase=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(flight.id),url='/maintenance/nonroutine-reviews/'+reviewCase.id;
 assert.equal(reviewCase.state,'PENDING_ACCEPTANCE');
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{for(let attempt=0;attempt<3;attempt++){try{await delay(600);const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');return;}catch{await delay(1500);}}proof.screenshots.push(name+'.png(missed)');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 const loginPage=async username=>{await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=r5-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(username)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}await send('Page.navigate',{url:'http://127.0.0.1:18888/dashboard?qa=r5-'+encodeURIComponent(username)});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();};
 failureCapture=async stage=>{try{const text=await evaluate(`document.body.innerText.slice(0,8000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 // ===== 会话A（root）：受理表单 → UI 受理 12 人+终审负责人（P0-23）=====
 await loginPage('54002010');
 assert.ok(await openMaintenancePage('reviews'),'reviews tab failed');await click('[data-maint-tab=reviews]');
 await ui(`!!document.querySelector('[data-nr-open="${reviewCase.id}"]')`);await click(`[data-nr-open="${reviewCase.id}"]`);
 await ui(`!!document.querySelector('[data-nr-accept]')`);
 const acceptFacts=await evaluate(`(()=>{const f=document.querySelector('[data-nr-accept]');const t=f.textContent.replace(/\\s+/g,' ');return {nomineeCount:document.querySelector('[data-nr-nominee-count]')?.textContent,hasCandidates:!!document.querySelector('[data-nr-candidates]'),hasFinalizer:!!f.querySelector('[name=finalizer]'),notice:t.includes('12名不同人员及终审负责人')};})()`);
 assert.equal(acceptFacts.hasCandidates,true);assert.equal(acceptFacts.hasFinalizer,true);
 assert.ok(acceptFacts.notice,'受理说明: '+JSON.stringify(acceptFacts));
 proof.assertions.p23AcceptForm={ok:true,facts:acceptFacts};await shot('r7-accept-form');
 await click('[data-nr-candidates]');
 await ui(`document.querySelectorAll('input[name=nominee]').length>0`);
 const picked=await evaluate(`(()=>{const ids=${JSON.stringify(reviewers.map(r=>r.id))};let n=0;for(const id of ids){const box=document.querySelector('input[name=nominee][value="'+id+'"]');if(box&&!box.checked){box.checked=true;box.dispatchEvent(new Event('change',{bubbles:true}));n++;}}const sel=document.querySelector('[name=finalizer]');const opt=[...sel.options].find(o=>o.value===${JSON.stringify(finalizer.id)});if(opt)sel.value=opt.value;sel.dispatchEvent(new Event('change',{bubbles:true}));return {picked:n,finalizer:sel.value};})()`);
 assert.equal(picked.finalizer,finalizer.id,'终审负责人已选');
 await ui(`(document.querySelector('[data-nr-nominee-count]')?.textContent||'').includes('12/12')`);
 await evaluate(`document.querySelector('[data-nr-accept] button[type=submit]')?.click()`);
 await delay(1200);
 proof.acceptStatus=await evaluate(`document.querySelector('[data-nr-status]')?.textContent`);
 for(let i=0;i<20;i++){if(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(reviewCase.id).state==='IN_REVIEW')break;await evaluate(`document.querySelector('[data-nr-accept] button[type=submit]')?.click()`);await delay(1200);}
 assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(reviewCase.id).state,'IN_REVIEW','受理未生效 status='+proof.acceptStatus);
 proof.assertions.p23AcceptSubmitted={ok:true,picked};await shot('r7-accepted');
 // ===== 会话B（评议人0）：意见表单（P0-25/44）+共享建议保密勾选（P0-27）=====
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}}
 await loginPage(reviewers[0].username);
 assert.ok(await openMaintenancePage('reviews'),'reviews tab(B)');await click('[data-maint-tab=reviews]');
 await ui(`!!document.querySelector('[data-nr-open="${reviewCase.id}"]')`);await click(`[data-nr-open="${reviewCase.id}"]`);
 await ui(`!!document.querySelector('[data-nr-opinion] input[name=hours]')`);
 const opinionFacts=await evaluate(`(()=>{const f=document.querySelector('[data-nr-opinion]');const t=f.textContent.replace(/\\s+/g,' ');return {hours:!!f.querySelector('[name=hours]'),basis:!!f.querySelector('[name=basis]'),privacy:t.includes('仅本人及有权审议者可读')};})()`);
 assert.equal(opinionFacts.hours,true);assert.equal(opinionFacts.basis,true);assert.ok(opinionFacts.privacy,'意见隐私说明: '+JSON.stringify(opinionFacts));
 proof.assertions.p2544OpinionForm={ok:true,facts:opinionFacts};await shot('r7-opinion-form');
 await evaluate(`(()=>{const f=document.querySelector('[data-nr-opinion]');const h=f.querySelector('[name=hours]');h.value='2';h.dispatchEvent(new Event('input',{bubbles:true}));const b=f.querySelector('[name=basis]');b.value='七轮UI意见依据';b.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
 await evaluate(`document.querySelector('[data-nr-opinion] button[type=submit]')?.click()`);
 for(let i=0;i<20;i++){if(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=? and person_id=?').get(reviewCase.id,reviewers[0].personId).n)>=1)break;await delay(800);}
 assert.ok(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=? and person_id=?').get(reviewCase.id,reviewers[0].personId).n)>=1,'UI意见未入库');
 await ui(`(document.querySelector('[data-nr-opinion] button[type=submit]')?.textContent||'').includes('更新本人意见')`);
 await ui(`!!document.querySelector('[data-nr-suggestion]')`);
 const suggestionFacts=await evaluate(`(()=>{const f=document.querySelector('[data-nr-suggestion]');const t=f.textContent.replace(/\\s+/g,' ');return {field:!!f.querySelector('[name=suggestionField]'),value:!!f.querySelector('[name=suggestionValue]'),reason:!!f.querySelector('[name=suggestionReason]'),privacyBox:!!f.querySelector('[name=privacyAcknowledged]'),noticeRaw:/请勿在此填写本人或他人的工时数值及工时评价依据|禁止填写本人或他人的具体工时、工时评价依据|我确认未填写本人或他人的工时数值及评价依据/.test(t)};})()`);
 assert.equal(suggestionFacts.privacyBox,true,'保密勾选');
 assert.ok(suggestionFacts.noticeRaw,'页面保密告知: '+JSON.stringify(suggestionFacts));
 await evaluate(`(()=>{const f=document.querySelector('[data-nr-suggestion]');const set=(n,v)=>{const el=f.querySelector('[name='+n+']');el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));};set('suggestionField','title');set('suggestionValue','七轮建议后的名称');set('suggestionReason','核对工作名称');const p=f.querySelector('[name=privacyAcknowledged]');p.checked=true;p.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`);
 await evaluate(`document.querySelector('[data-nr-suggestion] button[type=submit]')?.click()`);
 for(let i=0;i<20;i++){if(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_suggestions where case_id=?').get(reviewCase.id).n)>=1)break;await delay(800);}
 assert.ok(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_suggestions where case_id=?').get(reviewCase.id).n)>=1,'UI建议未入库');
 await ui(`document.body.textContent.includes('七轮建议后的名称')`);
 proof.assertions.p27SuggestionForm={ok:true,facts:suggestionFacts};await shot('r7-suggestion-form');
 for(const [index,reviewer] of reviewers.slice(1).entries())await call(url+'/opinion',{method:'POST',cookie:await loginApi(reviewer.username),body:{revision:0,hours:index+1,basis:'R7-PRIVATE-'+index}});
 assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(reviewCase.id).state,'SEALED');
 // ===== 会话C（指定终审负责人）：参考值说明（P0-28）+同轮编辑→预览→提交锁定（P0-68）=====
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}}
 await loginPage(finalizer.username);
 assert.ok(await openMaintenancePage('reviews'),'reviews tab(C)');await click('[data-maint-tab=reviews]');
 await ui(`!!document.querySelector('[data-nr-open="${reviewCase.id}"]')`);await click(`[data-nr-open="${reviewCase.id}"]`);
 await ui(`!!document.querySelector('[data-nr-finalize]')`);
 const refFacts=await evaluate(`(()=>{const t=document.body.textContent;return {reference:t.includes('申请总工时 2 小时，仅供参考'),placeholder:document.querySelector('[name=final_recognizedHours]')?.placeholder};})()`);
 assert.ok(refFacts.reference,'参考值说明: '+JSON.stringify(refFacts));
 assert.ok(String(refFacts.placeholder).includes('不自动套用参考值'),'占位说明: '+refFacts.placeholder);
 proof.assertions.p28ReferenceNotice={ok:true,facts:refFacts};
 await evaluate(`(()=>{const form=document.querySelector('[data-nr-finalize]');const s=form.querySelector('[name=final_category]');s.value='工卡指令';s.dispatchEvent(new Event('change',{bubbles:true}));s.dispatchEvent(new Event('input',{bubbles:true}));const h=form.querySelector('[name=final_recognizedHours]');h.value='2';h.dispatchEvent(new Event('input',{bubbles:true}));const v=form.querySelector('[name=final_participantsVerified]');if(!v.checked){v.checked=true;v.dispatchEvent(new Event('change',{bubbles:true}));}const a=form.querySelector('[name=final_admissionDecision]');a.value='PENDING';a.dispatchEvent(new Event('change',{bubbles:true}));const rr=form.querySelector('[name=final_reason]');rr.value='七轮UI类别核实为工卡指令';rr.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
 await click('[data-nr-final-preview]');
 await ui(`(document.querySelector('[data-nr-preview-result]')?.textContent||'').includes('参与角色无变化')`);
 await evaluate(`document.querySelector('[data-nr-finalize] button[type=submit]')?.click()`);
 // 停止轮询期间让出读锁（非WAL下持续SELECT会饿死服务端写事务）
 await delay(15000);
 proof.finalizeStatus=await evaluate(`document.querySelector('[data-nr-status]')?.textContent`);
 if(!db.prepare('select 1 from maintenance_nonroutine_review_finals where case_id=?').get(reviewCase.id)){
   await evaluate(`document.querySelector('[data-nr-finalize] button[type=submit]')?.click()`);
   await delay(15000);
 }
 assert.ok(db.prepare('select 1 from maintenance_nonroutine_review_finals where case_id=?').get(reviewCase.id),'终审未锁定 status='+proof.finalizeStatus);
 const finalState=db.prepare('select state from maintenance_nonroutine_review_channels where case_id=?').get(reviewCase.id);
 assert.ok(['MERGED_CLOSED','NEEDS_ATTENTION','APPROVED_PENDING_SYNC'].includes(finalState?.state||''),'通道状态: '+JSON.stringify(finalState));
 proof.assertions.p68FinalizeSubmitFlow={ok:true,channel:finalState?.state};await shot('r7-finalize-submitted');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.p23AcceptForm?.ok||!proof.assertions.p23AcceptSubmitted?.ok||!proof.assertions.p2544OpinionForm?.ok||!proof.assertions.p27SuggestionForm?.ok||!proof.assertions.p28ReferenceNotice?.ok||!proof.assertions.p68FinalizeSubmitFlow?.ok)process.exitCode=1;
