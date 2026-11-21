// Isolation timing: which endpoint blocks ~58s at SEALED? No browser involved.
// Synthetic-only fixture, same prep as four-state-diagnostic.mjs (API part).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {DatabaseSync,backup} from 'node:sqlite';
import assert from 'node:assert/strict';
import net from 'node:net';
const APP='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app';
const BASE='/private/tmp/zcode-sealed-20261117/base.sqlite';
const PASSWORD='muc2026';
for(const port of [18888]){const probe=net.createServer();await new Promise((resolve,reject)=>{probe.once('error',()=>reject(Error('port occupied: '+port)));probe.listen(port,'127.0.0.1',()=>probe.close(resolve));});}
const out=fs.mkdtempSync(path.join(os.tmpdir(),'muc-seal-isolate-'));
const source=new DatabaseSync(BASE,{readOnly:true});await backup(source,out+'/qa.sqlite');source.close();
const db=new DatabaseSync(out+'/qa.sqlite');db.exec('pragma busy_timeout=5000');
const template=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(template.person_id),reviewers=[];
const insert=(table,row)=>{const keys=Object.keys(row);db.prepare(`insert into ${table}(${keys.map(k=>'"'+k+'"').join(',')}) values(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
const role=code=>db.prepare('select id from rbac_roles where code=?').get(code).id;
for(let i=0;i<13;i++){
 const id='iso-reviewer-'+i,personId='person-'+id,stamp=new Date().toISOString();insert('personnel',{...person,id:personId,employee_no:String(99989300+i),name:'隔离计时评议'+i,employment_status:'在职',data_status:'active',created_at:stamp,updated_at:stamp});insert('users',{...template,id,username:id,person_id:personId,name:'隔离计时评议'+i,role:'receiver',status:'active'});
 for(const code of ['worker','addon_nonroutine_reviewer',...(i===12?['addon_archive_modify','addon_nonroutine_review_finalizer','addon_nonroutine_review_auditor']:[])])insert('rbac_user_roles',{user_id:id,role_id:role(code),created_at:stamp});insert('rbac_user_scopes',{id:'scope-'+id,user_id:id,module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});reviewers.push({id,personId});
}
fs.writeFileSync(out+'/server.mjs',`import http from 'node:http';process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=${JSON.stringify(out+'/qa.sqlite')};process.env.UPLOAD_DIR=${JSON.stringify(out+'/uploads')};process.env.MUC_MAINTENANCE_V101='draft';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';for(const k of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[k]='1';for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';const {db,measuredRoute}=await import(${JSON.stringify(APP+'/server.mjs')});const s=http.createServer(measuredRoute);s.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));process.on('SIGTERM',()=>s.close(async()=>{await db.close?.();process.exit(0)}));`);
const server=spawn(process.execPath,[out+'/server.mjs'],{stdio:['ignore','pipe','pipe']});let log='';server.stdout.on('data',v=>log+=v);server.stderr.on('data',v=>log+=v);
const delay=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,d)=>{for(let n=0;n<160;n++){if(await fn())return;await delay(100);}throw Error('Timed out: '+d);};
const result={out,timings:[]};
try{
 await wait(()=>log.includes('QA_READY'),'server');
 const call=async(url,{method='GET',body,cookie=''}={})=>{const r=await fetch('http://127.0.0.1:18888/api'+url,{method,headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(120000)});const value=await r.json();assert.ok(r.ok,JSON.stringify({url,status:r.status,value}));return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 const auth=await call('/login',{method:'POST',body:{username:'54002010',password:PASSWORD}}),cookie=auth.cookie,rootPerson=auth.value.user.personId;
 const made=(await call('/maintenance/flights',{method:'POST',cookie,body:{date:'2023-06-10',flightNo:'ISO-SEAL-TIMING',aircraftNo:'B-ISO',aircraftType:'A320',workKind:'停场'}})).value.flight,base='/maintenance/flights/'+made.id;
 await call(base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:made.updatedAt,assignments:[{personId:rootPerson,role:'放行'}]}});
 const item={clientId:'iso-original',temporary:true,manualManaged:true,standardId:'',category:'单项工作',chapter:'968',title:'隔离计时原工作',reportExplanation:'隔离计时',standardHours:2,entries:[{personId:rootPerson,role:'主做'}]},draft=(await call(base+'/reports/nonroutine/draft',{method:'PUT',cookie,body:{version:0,items:[item]}})).value.draft;await call(base+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'submit',draftVersion:draft.version,items:[item]}});
 const version=async()=>(await call(base,{cookie})).value.flight.updatedAt;
 await call(base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version()}});if(!(await call(base,{cookie})).value.flight.reportFinalizedAt){const report=(await call(base+'/reports',{cookie})).value.report;await call(base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(),routineEntries:[],nonroutineItems:report.nonroutine.items,releasePersonId:rootPerson}});}
 const initialTree=(await call(base+'/review',{cookie})).value.review;await call(base+'/review',{method:'PUT',cookie,body:{mode:'confirm',expectedUpdatedAt:initialTree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:initialTree.tasks.map(t=>({ownerType:t.ownerType,ownerId:t.ownerId,assignments:t.assignments.map(a=>({personId:a.personId,role:a.role}))}))}});
 const review=db.prepare('select * from maintenance_nonroutine_review_cases where flight_id=?').get(made.id),url='/maintenance/nonroutine-reviews/'+review.id;
 for(const actor of reviewers){actor.cookie=(await call('/login',{method:'POST',body:{username:actor.id,password:PASSWORD}})).cookie;}
 await call(url+'/accept',{method:'POST',cookie,body:{revision:1,accountIds:reviewers.slice(0,12).map(r=>r.id),finalizerAccountId:reviewers[12].id}});
 for(let i=0;i<12;i++)await call(url+'/opinion',{method:'POST',cookie:reviewers[i].cookie,body:{revision:0,hours:i+1,basis:'ISO-PRIVATE-'+i}});
 assert.equal(db.prepare('select state from maintenance_nonroutine_review_cases where id=?').get(review.id).state,'SEALED');
 const priv=reviewers[12];
 const timeit=async(label,url,opt)=>{const t=Date.now();try{const r=await call(url,{...opt,cookie:priv.cookie});result.timings.push({label,ms:Date.now()-t,ok:true,keys:Object.keys(r.value||{}).slice(0,8)});}catch(e){result.timings.push({label,ms:Date.now()-t,ok:false,error:String(e).slice(0,200)});}};
 result.timings.push({label:'stage',state:'SEALED',opinions:12});
 await timeit('GET capabilities','/maintenance/nonroutine-review-capabilities');
 await timeit('GET review detail',url);
 await timeit('GET finalization',url+'/finalization');
 await timeit('POST info/sync','/info/sync',{method:'POST',body:{}});
 await timeit('GET flights execute summary','/maintenance/flights?scope=execute&view=summary');
 await timeit('GET finalization again',url+'/finalization');
}catch(error){result.error=String(error).slice(0,800);}finally{
 server.kill('SIGTERM');await Promise.race([new Promise(r=>server.once('exit',r)),delay(4000)]);if(server.exitCode===null)server.kill('SIGKILL');
 try{db.close();}catch{}fs.writeFileSync(out+'/server.log',log);fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));
}
console.log(JSON.stringify(result,null,2));
