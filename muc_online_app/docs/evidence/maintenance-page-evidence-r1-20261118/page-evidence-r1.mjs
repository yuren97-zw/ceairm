// page-evidence-r1.mjs — 2026-11-18 P0-84/132/139 页面取证驱动（合成环境专用）。
// 依据 r2 驱动配方（docs/evidence/zcode-sealed-20261117/four-state-diagnostic-r2.mjs）：
// 导航前显式 stopMaintenanceSync/stopInfoSync（SSE 滞留对策）+ 每文档卸载探针。
// 只指向合成 qa.sqlite（临时目录），绝不指向业务库。断言失败进程退出码非 0。
const DRIVER_VERSION='page-evidence-r1';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import assert from 'node:assert/strict';
import net from 'node:net';
import {createHash} from 'node:crypto';
const APP='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app';
const {default:WebSocket}=await import(APP+'/node_modules/ws/wrapper.mjs');
const BASE=process.env.BASE||'/private/tmp/zcode-sealed-20261117/base-r2.sqlite';
const PASSWORD='muc2026';
const TEARDOWN=process.env.TEARDOWN!=='0';
const PROBE=process.env.PROBE!=='0';
for(const port of [18888,18889]){const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',()=>reject(Error('port occupied: '+port)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});}
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-page-evidence-r1-'));fs.writeFileSync('/private/tmp/zcode-page-evidence-r1-latest',out);
if(!fs.existsSync(BASE)||!/\.sqlite$/.test(BASE))throw Error('missing synthetic base: '+BASE);
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
const template=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(template.person_id),reviewers=[];
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`insert into ${table}(${keys.map(k=>'"'+k+'"').join(',')}) values(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
const role=code=>db.prepare('select id from rbac_roles where code=?').get(code).id;
for(let i=0;i<13;i++){
 const id='pevr-reviewer-'+i,personId='person-'+id,stamp=new Date().toISOString();insert('personnel',{...person,id:personId,employee_no:String(99989500+i),name:'页面取证评议'+i,employment_status:'在职',data_status:'active',created_at:stamp,updated_at:stamp});insert('users',{...template,id,username:id,person_id:personId,name:'页面取证评议'+i,role:'receiver',status:'active'});
 for(const code of ['worker','addon_nonroutine_reviewer',...(i===12?['addon_archive_modify','addon_nonroutine_review_finalizer','addon_nonroutine_review_auditor']:[])])insert('rbac_user_roles',{user_id:id,role_id:role(code),created_at:stamp});insert('rbac_user_scopes',{id:'scope-'+id,user_id:id,module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});reviewers.push({id,personId});
}
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer((req,res)=>{return measuredRoute(req,res)});s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']}),children=[server];let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
let chrome,ws,failureCapture;
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,description)=>{for(let n=0;n<200;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+description);};
const proof={driverVersion:DRIVER_VERSION,teardown:TEARDOWN,probe:PROBE,syntheticOnly:true,actualOriginalAppBrowser:true,physicalDeviceVerified:false,assertions:{},screenshots:[],servicesStopped:false};
const netLog=[],consoleLog=[];let browserWrites=0;
const settlement=()=>JSON.stringify(['maintenance_flights','maintenance_hour_results','maintenance_sortie_results','maintenance_effective_hour_results','maintenance_report_batches','maintenance_report_entries'].map(t=>[t,db.prepare(`select * from ${t} order by id`).all()]));
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const auth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=auth.cookie,rootPerson=auth.value.user.personId;
 const made=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'PEVR1-PAGE',aircraftNo:'B-PEVR1',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+made.id;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:made.updatedAt,assignments:[{personId:rootPerson,role:'放行'}]}});
 const item={clientId:'pevr1-original',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'968',title:'页面取证原单项工作',reportExplanation:'页面取证：类别切换交互与表单字段核对',standardHours:2,entries:[{personId:rootPerson,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 const version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});if(!(await call(base,{cookie})).value.flight.reportFinalizedAt){const report=(await call(base+'/reports',{cookie})).value.report;await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});}
 const initialTree=(await call(base+'/review',{cookie})).value.review;await call(base+'/review',{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:initialTree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:initialTree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
 const review=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(made.id);
 for(const actor of reviewers)actor.cookie=(await call('/login',{method:'POST',body:{username:actor.id,password:PASSWORD}})).cookie;
 const privileged=reviewers[12];
 await call('/maintenance/nonroutine-reviews/'+review.id+'/accept',{method:'POST',cookie,body:{revision:1,accountIds:reviewers.slice(0,12).map(r=>r.id),finalizerAccountId:privileged.id}});
 for(let i=0;i<12;i++)await call('/maintenance/nonroutine-reviews/'+review.id+'/opinion',{method:'POST',cookie:reviewers[i].cookie,body:{revision:0,hours:i+1,basis:'PEVR1-取证意见-'+i}});
 assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(review.id).state,'SEALED');
 const settlementBefore=settlement();
 chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--log-net-log='+out+'/netlog.json','--remote-debugging-port=18889','--user-data-dir='+out+'/chrome','about:blank'],{stdio:'ignore'});children.push(chrome);
 let target;await wait(async()=>{try{target=(await(await fetch('http://127.0.0.1:18889/json/list')).json()).find(t=>t.type==='page');return Boolean(target);}catch{return false;}},'browser');ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.once('open',r));let seq=0;const pending=new Map();ws.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}else if(m.method==='Network.requestWillBeSent'){const r=m.params.request;netLog.push({t:Date.now(),phase:'request',method:r.method,url:r.url});if(r.url.includes('/api/')&&r.method!=='GET')browserWrites++;}else if(m.method==='Network.responseReceived'){netLog.push({t:Date.now(),phase:'response',status:m.params.response.status,url:m.params.response.url});}else if(m.method==='Page.javascriptDialogOpening'){send('Page.handleJavaScriptDialog',{accept:true}).catch(()=>{});}
    else if(m.method==='Runtime.consoleAPICalled'){consoleLog.push({t:Date.now(),type:m.params.type,text:(m.params.args||[]).map(a=>a.value??a.description??'').join(' ').slice(0,600)});}else if(m.method==='Runtime.exceptionThrown'){consoleLog.push({t:Date.now(),type:'exception',text:JSON.stringify(m.params.exceptionDetails).slice(0,1500)});}});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{for(let i=0;i<10;i++){try{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}catch(e){const text=e?.message||JSON.stringify(e);if(/navigated|closed|context/i.test(text)&&i<9){await delay(300);continue;}throw e;}}};const ui=expression=>wait(async()=>{try{return await evaluate(expression);}catch{return false;}},expression),click=s=>evaluate(`document.querySelector(${JSON.stringify(s)})?.click()`),shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(out+'/'+name+'.png',Buffer.from(r.data,'base64'));proof.screenshots.push(name+'.png');};
 const installProbe=async()=>{try{await evaluate(`['pagehide','beforeunload','unload','visibilitychange'].forEach(ev=>addEventListener(ev,()=>{try{navigator.sendBeacon('/api/__unload_probe?ev='+ev+'&doc='+encodeURIComponent(location.search||'/login'))}catch{}},{capture:true}));true`);}catch{}};
 failureCapture=async stage=>{try{const html=await evaluate(`document.querySelector('#maintenancePage')?.innerHTML?.slice(0,8000)||document.body.innerHTML.slice(0,8000)`);fs.writeFileSync(out+'/failure-panel-'+stage+'.html',String(html));}catch{}try{const text=await evaluate(`document.body.innerText.slice(0,6000)`);fs.writeFileSync(out+'/failure-text-'+stage+'.txt',String(text));}catch{}try{await shot('failure-'+stage);}catch{}};
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Network.setBypassServiceWorker',{bypass:true});
 // ===== 会话1：终审负责人（reviewers[12]）看终审工作台 =====
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr1-shell'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:${JSON.stringify(privileged.id)},password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(list=>list.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr1-finalizer'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 await click('[data-page=maintenancePage]');await ui(`!!document.querySelector('[data-maint-tab=reviews]')`);await click('[data-maint-tab=reviews]');await ui(`!!document.querySelector('[data-nr-open="${review.id}"]')`);await click(`[data-nr-open="${review.id}"]`);
 await ui(`!!document.querySelector('[data-nr-finalize]')`);
 // ---- P0-139 终审表单无比例输入 ----
 const formFacts=await evaluate(`(()=>{const form=document.querySelector('[data-nr-finalize]');const fields=[...form.querySelectorAll('input,select,textarea')];const labeled=fields.filter(f=>f.closest('label'));return {fieldCount:fields.length,names:fields.map(f=>f.name).sort(),numberFields:fields.filter(f=>f.type==='number').map(f=>f.name).sort(),checkboxFields:fields.filter(f=>f.type==='checkbox').map(f=>f.name).sort(),selectFields:fields.filter(f=>f.type==='select-one').map(f=>f.name).sort(),ratioFieldMatch:fields.filter(f=>{const own=String(f.value??'');const label=(f.closest('label')?.textContent||'').replaceAll(own,'');return /比例|ratio|percent/i.test(f.name+(f.placeholder||'')+label);}).map(f=>f.name),ratioLabelMatch:labeled.filter(f=>/比例/.test(f.closest('label').textContent)).map(f=>f.name),noRatioEditText:form.textContent.includes('不编辑后台比例'),participantsLockedText:form.textContent.includes('不能增加或删除人员')};})()`);
 assert.equal(formFacts.ratioFieldMatch.length,0,'比例字段残留: '+JSON.stringify(formFacts.ratioFieldMatch));
 assert.equal(formFacts.ratioLabelMatch.length,0,'比例标签残留: '+JSON.stringify(formFacts.ratioLabelMatch));
 assert.deepEqual(formFacts.numberFields,['final_recognizedHours']);
 assert.ok(formFacts.checkboxFields.every(name=>/^finalRoleSet_/.test(name)||['final_participantsVerified','final_sourceFactsReviewed'].includes(name)),JSON.stringify(formFacts.checkboxFields));
 assert.deepEqual(formFacts.selectFields,['final_admissionDecision','final_category']);
 assert.equal(formFacts.noRatioEditText,true);assert.equal(formFacts.participantsLockedText,true);
 proof.assertions.p139={ok:true,facts:formFacts};await shot('p139-final-form-no-ratio');
 // ---- P0-84 类别切换不强制重选 ----
 const roleSnap=()=>evaluate(`JSON.stringify([...document.querySelectorAll('[data-nr-finalize] input[name^="finalRoleSet_"]')].map(i=>[i.name,i.checked]).sort())`);
 const beforeRoles=await roleSnap();const categorySwitch=await evaluate(`(()=>{const s=document.querySelector('[data-nr-finalize] [name=final_category]');const from=s.value;const target=[...s.options].map(o=>o.value).find(v=>v!=='from'&&v==='工卡指令');if(!target)return {error:'no target option',options:[...s.options].map(o=>o.value)};s.value=target;s.dispatchEvent(new Event('change',{bubbles:true}));s.dispatchEvent(new Event('input',{bubbles:true}));return {from,to:s.value};})()`);
 assert.ok(!categorySwitch.error,JSON.stringify(categorySwitch));assert.equal(categorySwitch.from,'单项工作');assert.equal(categorySwitch.to,'工卡指令');
 const afterRoles=await roleSnap();assert.equal(afterRoles,beforeRoles,'类别切换后参与人勾选被改动');
 const noRepick=await evaluate(`({repickText:/重新选择|重新勾选|重新挑选|请重选/.test(document.body.textContent),fieldsets:document.querySelectorAll('[data-nr-finalize] fieldset').length,previewNote:document.querySelector('[data-nr-preview-result]')?.textContent})`);
 assert.equal(noRepick.repickText,false,'出现强制重选提示');
 assert.equal(noRepick.previewNote,'终审输入已变化，请重新预览。');
 assert.equal(await evaluate('state.maintenanceReviewController.hasUnsaved()'),true);
 // 预览前三项必填（与 nonroutine-finalization normalize 一致）：认定工时、参与核实、准入意向
 assert.deepEqual(await evaluate(`(()=>{const h=document.querySelector('[data-nr-finalize] [name=final_recognizedHours]');h.value='2.5';h.dispatchEvent(new Event('input',{bubbles:true}));const v=document.querySelector('[data-nr-finalize] [name=final_participantsVerified]');v.checked=true;v.dispatchEvent(new Event('change',{bubbles:true}));const a=document.querySelector('[data-nr-finalize] [name=final_admissionDecision]');a.value='PENDING';a.dispatchEvent(new Event('change',{bubbles:true}));return {hours:h.value,verified:v.checked,admission:a.value};})()`),{hours:'2.5',verified:true,admission:'PENDING'},'预览必填写入失败');
 await click('[data-nr-final-preview]');
 await ui(`(document.querySelector('[data-nr-preview-result]')?.textContent||'').includes('参与角色无变化')`);
 const previewText=await evaluate(`document.querySelector('[data-nr-preview-result]')?.textContent`);
 assert.ok(previewText.includes('类别：单项工作 → 工卡指令'),previewText);
 assert.ok(previewText.includes('参与角色无变化'),previewText);
 assert.equal(await roleSnap(),beforeRoles,'预览后参与人勾选被改动');
 proof.assertions.p84={ok:true,switch:categorySwitch,rolesBefore:JSON.parse(beforeRoles),repickPrompt:false,previewExcerpt:previewText.slice(0,400)};await shot('p84-category-switch-preview');
 // ===== 会话2：root 看工时页七组 =====
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}try{await evaluate('navigator.serviceWorker?.getRegistrations?.().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(list=>list.length).catch(e=>"err:"+e)');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr1-shell2'});await ui("document.readyState==='complete'");if(PROBE)await installProbe();
 assert.equal(await evaluate(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:${JSON.stringify(PASSWORD)}})}).then(r=>r.status)`),200);
 if(TEARDOWN){try{await evaluate('stopMaintenanceSync();stopInfoSync();true');}catch{}}
 await send('Page.navigate',{url:'http://127.0.0.1:18888/?qa=pevr1-hours'});await ui("document.readyState==='complete'&&document.body.classList.contains('app-ready')&&document.querySelector('#loginPage')?.hidden");if(PROBE)await installProbe();
 await click('[data-page=maintenancePage]');await ui(`!!document.querySelector('[data-maint-tab=hours]')`);await click('[data-maint-tab=hours]');await ui(`!!document.querySelector('input[data-maint-rule]')`);
 const pageRules=await evaluate(`(()=>{const inputs=[...document.querySelectorAll('input[data-maint-rule]')].map(i=>({id:i.dataset.maintRule,value:i.value,disabled:i.disabled}));const groups=[...document.querySelectorAll('details[data-maint-rule-group]')].map(d=>({key:d.dataset.maintRuleGroup,inputs:d.querySelectorAll('input[data-maint-rule]').length}));return {inputs,groups};})()`);
 const dbRules=Object.fromEntries(db.prepare('select id,value from maintenance_hour_rules').all().map(r=>[r.id,Number(r.value)]));
 const nonroutineGroups=pageRules.groups.filter(g=>g.key.startsWith('nonroutine:'));
 assert.equal(nonroutineGroups.length,7,'非例行组合组数量: '+JSON.stringify(nonroutineGroups));
 const expectedCombinations=['主做+检验+辅助','主做+检验','主做+辅助','检验+辅助','主做','检验','辅助'];
 assert.deepEqual(nonroutineGroups.map(g=>g.key.slice('nonroutine:'.length)).sort(),[...expectedCombinations].sort());
 assert.ok(nonroutineGroups.every(g=>g.inputs>=1));
 const mismatches=pageRules.inputs.filter(i=>!(i.id in dbRules)||Number(i.value)!==dbRules[i.id]);
 assert.equal(mismatches.length,0,'页面值与后台不一致: '+JSON.stringify(mismatches));
 // 页面按业务分组有意渲染精选规则集（七组+策略+常规组），不要求等于全表行数；逐输入值对账为准
 assert.ok(pageRules.inputs.length>=40,'渲染规则输入异常偏少: '+pageRules.inputs.length);
 const combinationRows=Object.fromEntries(db.prepare("select name,value from maintenance_hour_rules where rule_type='nonroutineCombinationRatio'").all().map(r=>[r.name,Number(r.value)]));
 const sumOf=a=>Object.entries(combinationRows).filter(([name])=>name.startsWith(a+'::')).reduce((s,[,v])=>s+v,0);
 const combinationSums=Object.fromEntries(expectedCombinations.map(c=>[c,Math.round(sumOf(c)*1e6)/1e6]));
 proof.assertions.p132={ok:true,renderedInputs:pageRules.inputs.length,groups:nonroutineGroups.map(g=>g.key),mismatches,combinationSums};await shot('p132-hours-seven-groups');
 assert.equal(settlement(),settlementBefore,'页面操作后结算数据被改动');
 proof.settlementUnchanged=true;proof.browserApiWrites=browserWrites;
 proof.caseState=db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(review.id).state;
}catch(error){proof.error=(error?.message||JSON.stringify(error))?.slice(0,800);await failureCapture?.('late');}
finally{
 ws?.close();for(const child of [...children].reverse()){if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),delay(4000)]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}}
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/console.json',JSON.stringify(consoleLog,null,2));proof.servicesStopped=children.every(c=>c.exitCode!==null||c.signalCode!==null);fs.writeFileSync(out+'/proof.json',JSON.stringify(proof,null,2));
}
console.log(JSON.stringify({out,...proof}));
if(proof.error||!proof.assertions.p139?.ok||!proof.assertions.p84?.ok||!proof.assertions.p132?.ok)process.exitCode=1;
