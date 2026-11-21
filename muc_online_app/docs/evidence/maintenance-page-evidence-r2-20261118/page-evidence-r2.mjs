// page-evidence-r2.mjs — 2026-11-18 P0-67/90/141(漂移提示显示)/P0-138/146/186(UNDECIDED挂起显示)/
// P0-107(EQUAL均分显示)/P0-112(SSE触发状态重算边界) 页面取证。r1 驱动配方（SW注销+对话框自动
// 接受+CDP看门狗+导航前显式停同步）。合成环境专用，绝不指向业务库。
const DRIVER_VERSION='page-evidence-r2';
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
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r2-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r2-latest',out);
if(!fs.existsSync(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
const template=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(template.person_id),reviewers=[];
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`insert into ${table}(${keys.map(k=>'"'+k+'"').join(',')}) values(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
const role=code=>db.prepare('select id from rbac_roles where code=?').get(code).id;
for(let i=0;i<13;i++){
 const id='pevr2-reviewer-'+i,personId='person-'+id,stamp=new Date().toISOString();insert('personnel',{...person,id:personId,employee_no:String(99989600+i),name:'页面取证二轮'+i,employment_status:'在职',data_status:'active',created_at:stamp,updated_at:stamp});insert('users',{...template,id,username:id,person_id:personId,name:'页面取证二轮'+i,role:'receiver',status:'active'});
 for(const code of ['worker','addon_nonroutine_reviewer',...(i===12?['addon_nonroutine_review_finalizer','addon_nonroutine_review_auditor']:[])])insert('rbac_user_roles',{user_id:id,role_id:role(code),created_at:stamp});insert('rbac_user_scopes',{id:'scope-'+id,user_id:id,module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});reviewers.push({id,personId});
}
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']}),children=[server];let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
let chrome,ws,failureCapture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,description)=>{for(let n=0;n<200;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+description);};
const proof={driverVersion:DRIVER_VERSION,teardown:TEARDOWN,probe:PROBE,syntheticOnly:true,actualOriginalAppBrowser:true,physicalDeviceVerified:false,assertions:{},screenshots:[],servicesStopped:false};
const consoleLog=[];
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const auth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=auth.cookie,rootPerson=auth.value.user.personId;
 const made=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR2-PAGE',aircraftNo:'B-PV2',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+made.id;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:made.updatedAt,assignments:[{personId:rootPerson,role:'放行'}]}});
 const item={clientId:'pevr2-original',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'968',title:'页面取证二轮原单项工作',reportExplanation:'二轮取证：策略与漂移显示',standardHours:2,entries:[{personId:rootPerson,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 const version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});if(!(await call(base,{cookie})).value.flight.reportFinalizedAt){const report=(await call(base+'/reports',{cookie})).value.report;await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});}
 const initialTree=(await call(base+'/review',{cookie})).value.review;await call(base+'/review',{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:initialTree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:initialTree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
 const review=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(made.id);
 for(const actor of reviewers)actor.cookie=(await call('/login',{method:'POST',body:{username:actor.id,password:PASSWORD}})).cookie;
 const privileged=reviewers[12];
 await call('/maintenance/nonroutine-reviews/'+review.id+'/accept',{method:'POST',cookie,body:{revision:1,accountIds:reviewers.slice(0,12).map(r=>r.id),finalizerAccountId:privileged.id}});
 for(let i=0;i<12;i++)await call('/maintenance/nonroutine-reviews/'+review.id+'/opinion',{method:'POST',cookie:reviewers[i].cookie,body:{revision:0,hours:i+1,basis:'PEVR2-取证意见-'+i}});
 assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(review.id).state,'SEALED');
 // 预存漂移实验用的规则原值（驱动侧直改+finally恢复；服务端此刻空闲）
 const ruleRow=db.prepare("select value,updated_at from maintenance_hour_rules where name='主做::主做'").get();
 const frozenPolicy=JSON.parse(review.policy_json),frozenMainRatio=frozenPolicy.combinations?.['主做']?.['主做']??frozenPolicy.ratios?.['主做'];
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 // 打开维修页（SPA 启动竞态下点击可能早于路由就绪——等待+重试）
 const openMaintenancePage=async tab=>{for(let i=0;i<12;i++){await click('[data-page=maintenancePage]');if(await evaluate(`!!document.querySelector(${JSON.stringify('[data-maint-tab='+tab+']')})`))return true;await delay(500);}return false;};
 failureCapture=async stage=>{try{const html=await evaluate(`document.querySelector('#maintenancePage')?.innerHTML?.slice(0,8000)||document.body.innerHTML.slice(0,8000)`);fs.writeFileSync(out+'/failure-panel-'+stage+'.html',String(html));}catch{}try{const text=await evaluate(`document.body.innerText.slice(0,6000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 // ===== 会话1：终审负责人预览取证 =====
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr2-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(privileged.id)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr2-finalizer'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 assert.ok(await openMaintenancePage('reviews'),'maintenance page failed to render reviews tab');await click('[data-maint-tab=reviews]');await ui(`!!document.querySelector('[data-nr-open="${review.id}"]')`);await click(`[data-nr-open="${review.id}"]`);
 await ui(`!!document.querySelector('[data-nr-finalize]')`);
 const setCategoryAndFill=async category=>evaluate(`(()=>{const form=document.querySelector('[data-nr-finalize]');const s=form.querySelector('[name=final_category]');s.value=${JSON.stringify(category)};s.dispatchEvent(new Event('change',{bubbles:true}));s.dispatchEvent(new Event('input',{bubbles:true}));const h=form.querySelector('[name=final_recognizedHours]');h.value='2';h.dispatchEvent(new Event('input',{bubbles:true}));const v=form.querySelector('[name=final_participantsVerified]');if(!v.checked){v.checked=true;v.dispatchEvent(new Event('change',{bubbles:true}));}const a=form.querySelector('[name=final_admissionDecision]');a.value='PENDING';a.dispatchEvent(new Event('change',{bubbles:true}));return {category:s.value,hours:h.value,verified:v.checked,admission:a.value};})()`);
 const previewText=()=>evaluate(`document.querySelector('[data-nr-preview-result]')?.textContent||''`);
 // 1) EQUAL 均分显示（1人主做 → 试车，2/1=2h）
 assert.deepEqual(await setCategoryAndFill('试车'),{category:'试车',hours:'2',verified:true,admission:'PENDING'});
 await click('[data-nr-final-preview]');await ui(`(document.querySelector('[data-nr-preview-result]')?.textContent||'').includes('策略 EQUAL')`);
 const equalText=await previewText();
 assert.ok(equalText.includes('策略 EQUAL'),equalText);
 assert.ok(/核算角色 主做 · 2 小时/.test(equalText),equalText);
 assert.ok(equalText.includes('参与角色无变化'),equalText);
 assert.ok(!equalText.includes('配置版本已独立变化'),equalText);
 proof.assertions.p107EqualDisplay={ok:true,excerpt:equalText.slice(0,300)};await shot('p107-equal-preview');
 // 2) UNDECIDED 挂起显示（人工除冰：策略未决，暂无法分配）
 await setCategoryAndFill('人工除冰');
 await click('[data-nr-final-preview]');await ui(`(document.querySelector('[data-nr-preview-result]')?.textContent||'').includes('策略 UNDECIDED')`);
 const undecidedText=await previewText();
 assert.ok(undecidedText.includes('策略 UNDECIDED'),undecidedText);
 assert.ok(undecidedText.includes('策略未决'),undecidedText);
 assert.ok(!/核算角色/.test(undecidedText),undecidedText);
 assert.ok(undecidedText.includes('预览不是入账凭据'),undecidedText);
 proof.assertions.p138UndecidedDisplay={ok:true,excerpt:undecidedText.slice(0,300)};await shot('p138-undecided-preview');
 // 3) 漂移提示显示（改规则行→单项工作预览：提示在、金额仍冻结）
 db.prepare("update maintenance_hour_rules set value=? where name='主做::主做'").run(String(Number(ruleRow.value)+0.05));
 try{
  await setCategoryAndFill('单项工作');
  await click('[data-nr-final-preview]');await ui(`(document.querySelector('[data-nr-preview-result]')||{textContent:''}).textContent.includes('配置版本已独立变化')`);
  const driftText=await previewText();
  assert.ok(driftText.includes('配置版本已独立变化（只读提示）'),driftText);
  assert.ok(driftText.includes('分配仍按原提报冻结比例执行'),driftText);
  assert.ok(driftText.includes(`核算角色 主做 · ${2*frozenMainRatio} 小时`)||driftText.includes(`核算角色 主做 · ${(2*frozenMainRatio).toFixed(1)} 小时`),driftText+' frozen='+frozenMainRatio);
  proof.assertions.p6790141DriftDisplay={ok:true,frozenMainRatio,excerpt:driftText.slice(0,360)};await shot('p67-90-141-drift-hint');
 }finally{
  db.prepare("update maintenance_hour_rules set value=?,updated_at=? where name='主做::主做'").run(ruleRow.value,ruleRow.updated_at);
 }
 // ===== 会话2：root 维修页 SSE 触发状态重算（P0-112 边界）=====
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr2-shell2'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(l=>l.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr2-sse'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 assert.ok(await openMaintenancePage('dispatch'),'maintenance page failed to render dispatch tab');await click('[data-maint-tab=dispatch]');
 await ui(`!!document.querySelector('#maintenanceStartDateFilter')`);
 await evaluate(`(()=>{for(const id of ['maintenanceStartDateFilter','maintenanceEndDateFilter']){const n=document.getElementById(id);n.value='2023-06-10';n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));}return true;})()`);
 await delay(1500); // 过滤触发的 refreshMaintenance 完成
 // 服务端经 API 新建机会（未派工，默认派工视图可见）→ 不重载页面，DOM 应出现新机会（SSE→刷新→重算）
 assert.equal(await evaluate(`document.body.textContent.includes('PEVR2-SSE-QA')`),false,'precondition: new flight must not exist yet');
 const sseFlight=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR2-SSE-QA',aircraftNo:'B-SSE',aircraftType:'A320',workKind:'停场'}})).value.flight;
 await ui(`document.body.textContent.includes('PEVR2-SSE-QA')`);
 const sseState=await evaluate(`({url:location.href,visible:document.body.textContent.includes('PEVR2-SSE-QA'),syncing:typeof state==='undefined'?null:!!state.maintenanceSyncActive})`);
 assert.equal(sseState.visible,true);
 proof.assertions.p112SseBoundary={ok:true,newFlightNo:'PEVR2-SSE-QA',noReloadUrl:sseState.url,assertedBy:'DOM appearance without navigation after server-side API create'};await shot('p112-sse-appearance');
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.p107EqualDisplay?.ok||!proof.assertions.p138UndecidedDisplay?.ok||!proof.assertions.p6790141DriftDisplay?.ok||!proof.assertions.p112SseBoundary?.ok)process.exitCode=1;
