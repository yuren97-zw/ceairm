// Actual HTTP commands in independent app processes; disposable PG only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import pg from 'pg';

const database=new URL(process.env.DATABASE_URL||''),worker=process.argv[2]==='--api-server',state=worker?process.env.MUC_RACE_STATE_DIR:process.argv[2];
if(database.hostname!=='127.0.0.1'||database.port!=='15432'||database.pathname!=='/muc_v101_qa'||database.username!=='muc_v101_app'||!database.password||database.search||database.hash||process.env.NODE_ENV!=='test'||!state||!/^muc-v101-pg16-[A-Za-z0-9]+$/.test(path.basename(state))||path.dirname(await fs.realpath(state))!==await fs.realpath(os.tmpdir()))throw Error('Only the isolated verifier database is allowed');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(worker){
 const port=Number(process.argv[3]);if(!Number.isInteger(port)||port<18890||port>18901)throw Error('Invalid private test port');
 process.env.MUC_NO_LISTEN='1';
 for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED','MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED','MUC_MAINTENANCE_COORDINATOR_ENABLED','MUC_STANDARDS_MANAGEMENT_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED'])process.env[key]='1';
 process.env.MUC_MAINTENANCE_V101='draft';
 const {default:http}=await import('node:http'),{db,measuredRoute}=await import('../server.mjs');
 const server=http.createServer(measuredRoute),backend=db.prepare('select pg_backend_pid() as pid').get();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 console.log(JSON.stringify({apiReady:true,port,backendPid:Number(backend.pid)}));
 let closing=false;process.on('SIGTERM',()=>{if(closing)return;closing=true;server.close(async()=>{await db.close?.();process.exit(0);});server.closeAllConnections();});
}else{
 const control=new pg.Client({connectionString:database.href});await control.connect();
 const workers=[],proof={syntheticOnly:true,processes:[],overlaps:[],cases:[],workersStopped:false};
 const progress=async stage=>{await fs.writeFile(path.join(state,'concurrency-progress.json'),JSON.stringify({stage,completedCases:proof.cases.length,observedOverlaps:proof.overlaps.length}),{mode:0o600});};
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const originalTables={flight:['maintenance_flights','id','id'],subtasks:['maintenance_subtasks','flight_id','id'],assignments:['maintenance_assignments','flight_id','id'],reports:['maintenance_report_batches','flight_id','id'],entries:['maintenance_report_entries','flight_id','id'],hours:['maintenance_hour_results','flight_id','id'],sorties:['maintenance_sortie_results','flight_id','id'],feedback:['maintenance_feedback','flight_id','id'],workReports:['maintenance_work_reports','flight_id','flight_id'],workEntries:['maintenance_work_report_entries','flight_id','role,t.person_id'],drafts:['maintenance_report_drafts','flight_id','id'],draftVersions:['maintenance_report_draft_versions','flight_id','report_type']};
 const snapshotSql=reference=>`jsonb_build_object(${Object.entries(originalTables).map(([key,[table,column,order]])=>`'${key}',coalesce((select jsonb_agg(to_jsonb(t) order by t.${order}) from ${table} t where ${key==='feedback'?`t.assignment_id in (select id from maintenance_assignments where flight_id=${reference})`:`t.${column}=${reference}`}),'[]'::jsonb)`).join(',')})`;
 async function start(port){
  const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--api-server',String(port)],{cwd:root,env:{...process.env,MUC_RACE_STATE_DIR:state,UPLOAD_DIR:path.join(state,`race-uploads-${port}`)},stdio:['ignore','pipe','pipe']});
  const entry={child,port,output:''};workers.push(entry);
  const ready=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error(`API ${port} did not become ready`)),45000);let lines='';child.stdout.on('data',chunk=>{entry.output+=chunk;lines+=chunk;let at;while((at=lines.indexOf('\n'))>=0){const line=lines.slice(0,at);lines=lines.slice(at+1);try{const value=JSON.parse(line);if(value.apiReady){clearTimeout(timer);resolve(value);}}catch{}}});child.stderr.on('data',chunk=>{entry.output+=chunk;});child.once('exit',code=>{clearTimeout(timer);reject(Error(`API ${port} exited before readiness (${code})`));});child.once('error',reject);});
  Object.assign(entry,ready);proof.processes.push({port,backendPid:entry.backendPid,processId:child.pid});return entry;
 }
 async function call(node,url,{method='GET',body,cookie=''}={}){
  const response=await fetch(`http://127.0.0.1:${node.port}${url}`,{method,headers:{origin:`http://127.0.0.1:${node.port}`,connection:'close',...(cookie?{cookie}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
  const text=await response.text();return {status:response.status,payload:text?JSON.parse(text):null,cookie:response.headers.get('set-cookie')?.split(';')[0]};
 }
 async function ok(node,url,options){const result=await call(node,url,options);assert.ok(result.status>=200&&result.status<300,JSON.stringify({url,status:result.status,payload:result.payload}));return result;}
 async function waitBlocked(entries){
  for(let attempt=0;attempt<80;attempt++){
   await control.query('select pg_stat_clear_snapshot()');
   const rows=(await control.query('select pid,state,wait_event_type,wait_event,xact_start,query from pg_stat_activity where pid=any($1::int[])',[entries.map(entry=>entry.backendPid)])).rows;
   if(rows.length===entries.length&&rows.every(row=>row.state==='active'&&row.wait_event_type==='Lock'&&row.wait_event==='advisory'&&row.xact_start&&row.query.includes('pg_advisory_xact_lock')))return rows.map(({query,...row})=>row);
   await sleep(25);
  }throw Error('The two actual API transactions did not reach the lock barrier');
 }
 async function overlap(label,first,second){
  await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,one,two;
  try{
   one=call(first.node,first.url,first.options);await waitBlocked([first.node]);
   two=call(second.node,second.url,second.options);const waiting=await waitBlocked([first.node,second.node]);
   const observation={label,waiting,firstCommand:first.name,secondCommand:second.name,releasedOnlyAfterBothWaiting:true};proof.overlaps.push(observation);await progress(label+':both-transactions-waiting');
   await control.query('commit');held=false;const results=await Promise.all([one,two]);observation.responseStatuses=results.map(row=>row.status);return results;
  }finally{if(held)await control.query('rollback');if(one||two)await Promise.allSettled([one,two].filter(Boolean));}
 }
 async function overlapRound(commands,caseId){
  assert.equal(commands.length,12);assert.equal(new Set(commands.map(command=>command.node.backendPid)).size,12);
  await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending=[];
  try{
   pending=commands.map(command=>call(command.node,command.url,command.options));
   const waiting=await waitBlocked(commands.map(command=>command.node));
   assert.equal(Number((await control.query('select count(*) n from maintenance_nonroutine_review_opinions where case_id=$1',[caseId])).rows[0].n),0);
   const observation={label:'twelve-distinct-reviewers',waiting,commands:commands.map(command=>({port:command.node.port,accountId:command.accountId})),releasedOnlyAfterAllTwelveWaiting:true};proof.overlaps.push(observation);await progress('twelve-distinct-reviewers:all-transactions-waiting');
   await control.query('commit');held=false;const results=await Promise.all(pending);observation.responseStatuses=results.map(row=>row.status);return results;
  }finally{if(held)await control.query('rollback');await Promise.allSettled(pending);}
 }
 async function insert(table,row){const keys=Object.keys(row);await control.query(`insert into ${table}(${keys.map(key=>`"${key}"`).join(',')}) values(${keys.map((_,index)=>'$'+(index+1)).join(',')})`,keys.map(key=>row[key]));}
 async function reviewFacts(caseId,purpose='WORK'){
  const prefix=purpose==='STANDARD'?'maintenance_standard_review_':'maintenance_nonroutine_review_',tables=['cases','seats','opinions','opinion_history','events','outbox','finals'].map(name=>prefix+name);
  if(purpose!=='STANDARD')tables.push('maintenance_nonroutine_review_channels','maintenance_nonroutine_posting_receipts');
  const facts={};for(const table of tables)facts[table]=(await control.query(`select to_jsonb(t) payload from ${table} t where ${table.endsWith('_cases')?'id':'case_id'}=$1 order by to_jsonb(t)::text`,[caseId])).rows;
  if(purpose==='STANDARD')for(const [table,column] of [['maintenance_standards','standard_id'],['maintenance_standard_versions','version_id']])facts[table]=(await control.query(`select to_jsonb(t) payload from ${table} t where id=(select ${column} from maintenance_standard_review_cases where id=$1)`,[caseId])).rows;
  return facts;
 }
 async function revokedAcceptance(node,caseId,admin,body,{purpose='WORK',action='accept'}={}){
  proof.revokedAcceptances??=[];
  const scenarios=[{name:'role-revoked',change:()=>control.query("delete from rbac_user_roles where user_id=$1 and role_id in(select id from rbac_roles where code='addon_nonroutine_review_assign')",[admin.id]),restore:()=>control.query("insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code='addon_nonroutine_review_assign'",[admin.id,new Date().toISOString()])},{name:'scope-shrunk',change:()=>control.query("update rbac_user_scopes set scope_type='self' where user_id=$1 and module='maintenance'",[admin.id]),restore:()=>control.query("update rbac_user_scopes set scope_type='all' where user_id=$1 and module='maintenance'",[admin.id])},{name:'person-suspended',change:()=>control.query("update personnel set employment_status='停职' where id=$1",[admin.personId]),restore:()=>control.query("update personnel set employment_status='在职' where id=$1",[admin.personId])}];
  for(const scenario of scenarios){
   const before=await reviewFacts(caseId,purpose);await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending;
   try{pending=call(node,`/api/maintenance/${purpose==='STANDARD'?'standard-reviews':'nonroutine-reviews'}/${caseId}/${action}`,{method:'POST',cookie:admin.cookie,body});const waiting=await waitBlocked([node]);await scenario.change();await control.query('commit');held=false;const result=await pending;const observed={purpose,action,caseId,scenario:scenario.name,waiting,status:result.status,authorityChangedOnlyAfterActualBusinessTransactionWaited:true};proof.revokedAcceptances.push(observed);assert.ok([403,404].includes(result.status),JSON.stringify({scenario:scenario.name,status:result.status,payload:result.payload}));assert.deepEqual(await reviewFacts(caseId,purpose),before,'Revoked review action must not change review facts');observed.reviewFactsUnchanged=true;
   }finally{if(held)await control.query('rollback');if(pending)await Promise.allSettled([pending]);await scenario.restore();}
  }
 }
 try{
  assert.equal((await control.query('select current_database() as db')).rows[0].db,'muc_v101_qa');assert.ok((await control.query("select 1 from settings where key='v101_old_schema_probe'")).rowCount);
  assert.equal((await control.query("select 1 from users where id like 'v101-race-reviewer-%' union all select 1 from maintenance_flights where flight_no like 'V101RACE-%' limit 1")).rowCount,0,'Choose the original synthetic baseline; this backup already contains concurrency fixtures');
  await progress('starting-independent-apis');const a=await start(18890),b=await start(18891);assert.notEqual(a.backendPid,b.backendPid);
  const login=await ok(a,'/api/login',{method:'POST',body:{username:'54002010',password:'muc2026'}}),cookie=login.cookie,actor=login.payload.user;assert.ok(actor.personId);
  const template=(await control.query("select * from users where id='54002010'")).rows[0],person=(await control.query('select * from personnel where id=$1',[actor.personId])).rows[0],reviewers=[];
  await control.query('begin');try{
   for(let i=0;i<13;i++){
    const id=`v101-race-reviewer-${i}`,personId=`person-${id}`,name=`隔离并发评议${i+1}`;
    await insert('personnel',{id:personId,employee_no:String(99983000+i),name,department:person.department,home_team:person.home_team,department_id:person.department_id,personnel_group_id:person.personnel_group_id,administrative_team_id:person.administrative_team_id,employment_status:'在职',data_status:'active',created_at:new Date().toISOString(),updated_at:new Date().toISOString()});
    await insert('users',{...template,id,username:id,name,role:'receiver',status:'active',person_id:personId});
    for(const code of ['worker','addon_nonroutine_reviewer'])await control.query('insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code=$3',[id,new Date().toISOString(),code]);
    await control.query("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values($1,$2,'maintenance','all','','','',$3,$3)",['scope-'+id,id,new Date().toISOString()]);reviewers.push({id,personId});
   }await control.query('commit');
  }catch(error){await control.query('rollback');throw error;}
  const spare=reviewers.pop();
  for(const reviewer of [...reviewers,spare])reviewer.cookie=(await ok(a,'/api/login',{method:'POST',body:{username:reviewer.id,password:'muc2026'}})).cookie;
  await control.query("insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code='addon_nonroutine_review_assign'",[reviewers[0].id,new Date().toISOString()]);
  await control.query('create table v101_race_confirmed_snapshots(flight_id text primary key,payload jsonb not null)');
  await control.query(`create function v101_capture_confirmed_fixture() returns trigger language plpgsql as $$ begin if exists(select 1 from maintenance_flights where id=new.id and flight_no like 'V101RACE-%' and status='已确认') then insert into v101_race_confirmed_snapshots values(new.id,${snapshotSql('new.id')}) on conflict(flight_id) do nothing;end if;return null;end $$`);
  await control.query('create constraint trigger v101_capture_confirmed_fixture after update on maintenance_flights deferrable initially deferred for each row execute function v101_capture_confirmed_fixture()');
  const existingMonths=new Set((await control.query('select month from maintenance_hour_periods')).rows.map(row=>row.month)),month=['2026-11','2026-08','2025-12','2025-11'].find(value=>!existingMonths.has(value));assert.ok(month);proof.month=month;
  const assigned=await ok(a,`/api/maintenance/hour-periods/${month}/assign`,{method:'POST',cookie,body:{revision:0,accountId:actor.id,reason:'隔离多进程验收明确指定账期负责人'}});await ok(a,`/api/maintenance/hour-periods/${month}/confirm`,{method:'POST',cookie,body:{revision:assigned.payload.period.revision,state:'OPEN',reason:'指定负责人明确开放隔离验收账期'}});
  const metricsBefore=(await ok(a,`/api/maintenance/stats/personal?month=${month}`,{cookie})).payload.metrics;
  async function version(id){return (await ok(a,`/api/maintenance/flights/${id}`,{cookie})).payload.flight.updatedAt;}
  const assoc=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:month+'-10',flightNo:'ASSOC-CAS-QA',aircraftNo:'B-ASSOCQA',aircraftType:'A320',workKind:'航后'}})).payload.flight;
  const assocPath=`/api/maintenance/flights/${assoc.id}/dispatch`;
  await ok(a,assocPath,{method:'POST',cookie,body:{expectedUpdatedAt:assoc.updatedAt,assignments:[{role:'放行',personId:actor.personId}]}});
  const releaseBefore=(await control.query('select * from maintenance_assignments where flight_id=$1',[assoc.id])).rows[0];
  const assocVersion=await version(assoc.id),assocBody={expectedUpdatedAt:assocVersion,assignments:[{role:'接机',personId:actor.personId}]};
  const addedRace=await overlap('dispatch-additions-same-version',{node:a,url:assocPath,options:{method:'POST',cookie,body:assocBody},name:'first-addition'},{node:b,url:assocPath,options:{method:'POST',cookie,body:assocBody},name:'stale-addition'});assert.deepEqual(addedRace.map(row=>row.status),[200,409]);
  const assocRows=(await control.query('select * from maintenance_assignments where flight_id=$1 order by id',[assoc.id])).rows;assert.equal(assocRows.length,2);assert.deepEqual(assocRows.find(row=>row.role==='放行'),releaseBefore);
  const removalId=assocRows.find(row=>row.role==='接机').id,removalPath=`/api/maintenance/assignments/${removalId}`;
  const impact=(await ok(a,removalPath+'/removal-preview',{method:'POST',cookie,body:{expectedUpdatedAt:await version(assoc.id)}})).payload.impact;
  const removalBody={expectedUpdatedAt:impact.expectedUpdatedAt,confirmation:impact.confirmation,reason:'实际双进程仅删除明确关联'};
  const removedRace=await overlap('dispatch-explicit-removal-same-impact',{node:a,url:removalPath,options:{method:'DELETE',cookie,body:removalBody},name:'first-removal'},{node:b,url:removalPath,options:{method:'DELETE',cookie,body:removalBody},name:'repeat-removal'});assert.deepEqual(removedRace.map(row=>row.status),[200,404]);
  assert.deepEqual((await control.query('select * from maintenance_assignments where flight_id=$1',[assoc.id])).rows,[releaseBefore]);
  assert.equal(Number((await control.query("select count(*) n from maintenance_logs where flight_id=$1 and action='dispatch_assignment_removed'",[assoc.id])).rows[0].n),1);
  assert.equal(Number((await control.query('select count(*) n from maintenance_hour_results where flight_id=$1',[assoc.id])).rows[0].n),0);
  proof.dispatchAssociationRace={flightId:assoc.id,additionStatuses:[200,409],removalStatuses:[200,404],releaseId:releaseBefore.id,removedId:removalId,retainedReleaseUnchanged:true,removalAudits:1,formalHours:0};
  const nr=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:month+'-10',flightNo:'NR-DRAFT-CAS-QA',aircraftNo:'B-NRDRAFT',aircraftType:'A320',workKind:'停场'}})).payload.flight,nrPath=`/api/maintenance/flights/${nr.id}`;
  await ok(a,nrPath+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:nr.updatedAt,assignments:[{role:'放行',personId:actor.personId}]}});
  await ok(a,nrPath+'/subtasks',{method:'POST',cookie,body:{title:'非例行人员草稿竞争',category:'单项工作',standardHours:2}});
  const nrTask=(await control.query('select * from maintenance_subtasks where flight_id=$1',[nr.id])).rows[0];
  await ok(a,`/api/maintenance/subtasks/${nrTask.id}/dispatch`,{method:'POST',cookie,body:{expectedUpdatedAt:await version(nr.id),assignments:[{role:'主做',personId:actor.personId}]}});
  await ok(a,nrPath+'/reports/nonroutine',{method:'PUT',cookie,body:{mode:'save',items:[{id:nrTask.id,temporary:false,title:nrTask.title,category:nrTask.category,standardHours:Number(nrTask.standard_hours),entries:[{role:'主做',personId:actor.personId}]}]}});
  const nrDispatchBefore=(await control.query('select * from maintenance_assignments where flight_id=$1 order by id',[nr.id])).rows,nrRead=(await ok(a,nrPath+'/reports',{cookie})).payload.report;
  const nrBody=personId=>({mode:'save',revision:nrRead.nonroutine.revision,draftVersion:nrRead.nonroutine.draft.version,items:[{id:nrTask.id,temporary:false,title:nrTask.title,category:nrTask.category,standardHours:Number(nrTask.standard_hours),entries:[{role:'主做',personId}]}]});
  const nrRace=await overlap('nonroutine-participant-draft-same-version',{node:a,url:nrPath+'/reports/nonroutine',options:{method:'PUT',cookie,body:nrBody(reviewers[0].personId)},name:'first-nonroutine-selection'},{node:b,url:nrPath+'/reports/nonroutine',options:{method:'PUT',cookie,body:nrBody(reviewers[1].personId)},name:'stale-nonroutine-selection'});assert.deepEqual(nrRace.map(row=>row.status),[200,409]);
  const nrSaved=(await control.query("select * from maintenance_report_drafts where flight_id=$1 and report_type='nonroutine'",[nr.id])).rows[0],nrPayload=JSON.parse(nrSaved.payload_json);assert.equal(Number(nrSaved.version),2);assert.equal(nrPayload.participantDrafts[0].subtaskId,nrTask.id);assert.equal(nrPayload.participantDrafts[0].entries[0].personId,reviewers[0].personId);assert.equal(nrPayload.items.length,0);assert.deepEqual((await control.query('select * from maintenance_assignments where flight_id=$1 order by id',[nr.id])).rows,nrDispatchBefore);assert.equal(Number((await control.query('select count(*) n from maintenance_hour_results where flight_id=$1',[nr.id])).rows[0].n),0);
  const nrReopened=(await ok(a,nrPath+'/reports',{cookie})).payload.report;assert.equal(nrReopened.nonroutine.items.length,1);assert.equal(nrReopened.nonroutine.items[0].id,nrTask.id);assert.equal(nrReopened.nonroutine.items[0].entries[0].personId,reviewers[0].personId);
  proof.nonroutineParticipantDraftRace={flightId:nr.id,subtaskId:nrTask.id,statuses:[200,409],version:2,selectedPersonId:reviewers[0].personId,formalPersonId:actor.personId,dispatchUnchanged:true,formalHours:0};
  proof.reportAuthority=[];
  const reportActor=reviewers[0];
  const reportFacts=async id=>({business:(await control.query(`select ${snapshotSql('$1')} payload`,[id])).rows[0].payload,logs:(await control.query('select to_jsonb(t) payload from maintenance_logs t where flight_id=$1 order by id',[id])).rows});
  for(const action of ['routine','release','confirmation-save','confirmation-finalize','nonroutine-save','nonroutine-draft','nonroutine-submit','nonroutine-delete']){
   const flight=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:month+'-10',flightNo:'AUTH-REPORT-'+action,aircraftNo:'B-AUTHQA',aircraftType:'A320',workKind:'航后'}})).payload.flight,base=`/api/maintenance/flights/${flight.id}`;
   await control.query('update maintenance_flights set routine_hours_snapshot=$1 where id=$2',[JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id]);
   await ok(a,base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:flight.updatedAt,assignments:[{role:'放行',personId:reportActor.personId},{role:'接机',personId:reportActor.personId}]}});
   const actorCookie=reportActor.cookie,entries=[{role:'接机',personId:reportActor.personId}];
   if(action.startsWith('confirmation'))for(const type of ['routine','release'])await ok(a,base+'/reports/'+type,{method:'PUT',cookie:actorCookie,body:{expectedUpdatedAt:await version(flight.id),entries,releasePersonId:reportActor.personId}});
   if(action==='nonroutine-delete')await ok(a,base+'/reports/nonroutine/draft',{method:'PUT',cookie:actorCookie,body:{version:0,items:[]}});
   const opened=(await ok(a,base+'/reports',{cookie:actorCookie})).payload.report,body={expectedUpdatedAt:opened.flight.updatedAt,revision:opened.nonroutine.revision,entries,routineEntries:entries,nonroutineItems:[],items:[],releasePersonId:reportActor.personId,draftVersion:opened.nonroutine.draft?.version||0,version:opened.nonroutine.draft?.version||0,...(action.endsWith('-save')?{mode:'save'}:{})};
   const url=base+(action.startsWith('confirmation')?'/report-confirmation':action==='routine'||action==='release'?'/reports/'+action:'/reports/nonroutine'+(['nonroutine-draft','nonroutine-delete'].includes(action)?'/draft':'')),method=action.startsWith('confirmation')?'POST':action==='nonroutine-delete'?'DELETE':'PUT';
   const roleRows=(await control.query('select * from rbac_user_roles where user_id=$1',[reportActor.id])).rows;
   for(const change of ['account','personnel','roles']){
    const before=await reportFacts(flight.id);await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending;
    try{pending=call(a,url,{method,cookie:actorCookie,body});const waiting=await waitBlocked([a]);
     if(change==='account')await control.query("update users set status='inactive' where id=$1",[reportActor.id]);
     if(change==='personnel')await control.query("update personnel set employment_status='停职' where id=$1",[reportActor.personId]);
     if(change==='roles')await control.query('delete from rbac_user_roles where user_id=$1',[reportActor.id]);
     await control.query('commit');held=false;const result=await pending;assert.equal(result.status,403,JSON.stringify({action,change,status:result.status,payload:result.payload}));assert.deepEqual(await reportFacts(flight.id),before);proof.reportAuthority.push({action,change,flightId:flight.id,waiting,status:result.status,businessAndLogsUnchanged:true,authorityChangedAfterActualLockWait:true});
    }finally{if(held)await control.query('rollback');if(pending)await Promise.allSettled([pending]);await control.query("update users set status='active' where id=$1",[reportActor.id]);await control.query("update personnel set employment_status='在职' where id=$1",[reportActor.personId]);if(change==='roles')for(const row of roleRows)await insert('rbac_user_roles',row);}
   }
  }
  proof.treeReviewAuthority=[];proof.treeReviewPositiveControls=[];
  const treeActor=spare,treeActorBefore=(await control.query('select status from users where id=$1',[treeActor.id])).rows[0],treePersonBefore=(await control.query('select employment_status from personnel where id=$1',[treeActor.personId])).rows[0],treeRolesBefore=(await control.query('select * from rbac_user_roles where user_id=$1',[treeActor.id])).rows,treeScopesBefore=(await control.query("select * from rbac_user_scopes where user_id=$1 and module='maintenance'",[treeActor.id])).rows;
  const treeFacts=async id=>({...await reportFacts(id),sourceJournal:(await control.query('select to_jsonb(t) payload from maintenance_report_source_journal t where flight_id=$1 order by id',[id])).rows});
  const treeBody=(tree,action)=>({mode:action==='confirm'?'confirm':'save',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,reason:action==='archive-save'?'隔离多服务归档资格核验':'',tasks:tree.tasks.map(task=>({ownerType:task.ownerType,ownerId:task.ownerId,assignments:task.assignments.map(row=>({personId:row.personId,role:row.role}))}))});
  try{
   for(const action of ['save','confirm','archive-save']){
    for(const code of ['addon_maintenance_review',...(action==='archive-save'?['addon_archive_modify']:[])])await control.query('insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code=$3 on conflict(user_id,role_id) do nothing',[treeActor.id,new Date().toISOString(),code]);
    // Keep these authorization fixtures outside the financial comparison month.
    const flight=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:'2024-07-10',flightNo:'TREE-AUTH-RACE-'+action,aircraftNo:'B-TREERACE',aircraftType:'A320',workKind:'航后'}})).payload.flight,base=`/api/maintenance/flights/${flight.id}`,entries=[{role:'接机',personId:treeActor.personId}];
    await control.query('update maintenance_flights set routine_hours_snapshot=$1 where id=$2',[JSON.stringify({baseHours:5,ratios:{接机:1},aircraftCode:'A320',opportunity:'航后',version:1}),flight.id]);
    await ok(a,base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:await version(flight.id),assignments:[{role:'放行',personId:actor.personId},{role:'接机',personId:actor.personId}]}});
    await ok(a,base+'/reports/routine',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(flight.id),entries}});await ok(a,base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(flight.id)}});await ok(a,base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(flight.id),routineEntries:entries,nonroutineItems:[],releasePersonId:actor.personId}});
    if(action==='archive-save'){const tree=(await ok(a,base+'/review',{cookie})).payload.review;await ok(a,base+'/review',{method:'PUT',cookie,body:{...treeBody(tree,'confirm'),reason:''}});}
    const tree=(await ok(a,base+'/review',{cookie:treeActor.cookie})).payload.review;assert.equal(tree.canEditEntireTree,true);const body=treeBody(tree,action),roleRows=(await control.query('select * from rbac_user_roles where user_id=$1',[treeActor.id])).rows;
    for(const change of ['account','personnel','review-permission','scope',...(action==='archive-save'?['archive-permission']:[])]){
     const before=await treeFacts(flight.id),node=proof.treeReviewAuthority.length%2?b:a;await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending;
     try{
      pending=call(node,base+'/review',{method:'PUT',cookie:treeActor.cookie,body});const waiting=await waitBlocked([node]);
      if(change==='account')await control.query("update users set status='inactive' where id=$1",[treeActor.id]);
      if(change==='personnel')await control.query("update personnel set employment_status='停职' where id=$1",[treeActor.personId]);
      if(change==='review-permission')await control.query("delete from rbac_user_roles where user_id=$1 and role_id in(select id from rbac_roles where code in ('addon_maintenance_review','addon_archive_modify'))",[treeActor.id]);
      if(change==='archive-permission')await control.query("delete from rbac_user_roles where user_id=$1 and role_id in(select id from rbac_roles where code='addon_archive_modify')",[treeActor.id]);
      if(change==='scope')await control.query("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=$1 and module='maintenance'",[treeActor.id]);
      await control.query('commit');held=false;const result=await pending;assert.equal(result.status,403,JSON.stringify({action,change,status:result.status,payload:result.payload}));const after=await treeFacts(flight.id);assert.deepEqual(after,before,'A task-tree request whose authority changed while waiting must preserve every original business row and source observation');
      proof.treeReviewAuthority.push({action,change,flightId:flight.id,accountId:treeActor.id,port:node.port,waiting,status:result.status,authorityChangedAfterActualLockWait:true,businessJournalAndLogsUnchanged:true,unchangedFactsSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex')});
     }finally{
      if(held)await control.query('rollback');if(pending)await Promise.allSettled([pending]);await control.query('update users set status=$1 where id=$2',[treeActorBefore.status,treeActor.id]);await control.query('update personnel set employment_status=$1 where id=$2',[treePersonBefore.employment_status,treeActor.personId]);await control.query('delete from rbac_user_roles where user_id=$1',[treeActor.id]);for(const row of roleRows)await insert('rbac_user_roles',row);for(const row of treeScopesBefore)await control.query('update rbac_user_scopes set scope_type=$1,scope_id=$2 where id=$3',[row.scope_type,row.scope_id,row.id]);
     }
    }
    const allowed=await ok(b,base+'/review',{method:'PUT',cookie:treeActor.cookie,body});assert.equal(allowed.payload.review.flight.status,action==='save'?'待复核':'已确认');proof.treeReviewPositiveControls.push({action,flightId:flight.id,status:allowed.status,resultStatus:allowed.payload.review.flight.status,restoredAuthorityAccepted:true});
   }
  }finally{
   await control.query('update users set status=$1 where id=$2',[treeActorBefore.status,treeActor.id]);await control.query('update personnel set employment_status=$1 where id=$2',[treePersonBefore.employment_status,treeActor.personId]);await control.query('delete from rbac_user_roles where user_id=$1',[treeActor.id]);for(const row of treeRolesBefore)await insert('rbac_user_roles',row);for(const row of treeScopesBefore)await control.query('update rbac_user_scopes set scope_type=$1,scope_id=$2 where id=$3',[row.scope_type,row.scope_id,row.id]);
  }
  assert.equal(proof.treeReviewAuthority.length,13);assert.equal(new Set(proof.treeReviewAuthority.map(row=>row.waiting[0].pid)).size,2);assert.equal(proof.treeReviewPositiveControls.length,3);await progress('task-tree-current-authority-verified');
  const routineCreated=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:month+'-10',flightNo:'DRAFT-CAS-QA',aircraftNo:'B-DRAFTQA',aircraftType:'A320',workKind:'航后'}})).payload.flight;
  await ok(a,`/api/maintenance/flights/${routineCreated.id}/dispatch`,{method:'POST',cookie,body:{expectedUpdatedAt:routineCreated.updatedAt,assignments:[{role:'接机',personId:actor.personId},{role:'放行',personId:actor.personId}]}});
  const routineDispatchBefore=(await control.query('select * from maintenance_assignments where flight_id=$1 order by id',[routineCreated.id])).rows;
  const draftPath=`/api/maintenance/flights/${routineCreated.id}/reports/routine/draft`,routineBody={version:0,entries:[{role:'接机',personId:reviewers[0].personId}],releasePersonId:reviewers[0].personId};
  const routineRace=await overlap('routine-first-draft-same-version',{node:a,url:draftPath,options:{method:'PUT',cookie,body:{...routineBody,feedback:'FIRST'}},name:'first-draft'},{node:b,url:draftPath,options:{method:'PUT',cookie,body:{...routineBody,feedback:'STALE'}},name:'stale-draft'});assert.deepEqual(routineRace.map(row=>row.status),[200,409]);
  const routineSaved=(await control.query("select version,payload_json from maintenance_report_drafts where flight_id=$1 and report_type='routine'",[routineCreated.id])).rows[0];assert.equal(Number(routineSaved.version),1);assert.equal(JSON.parse(routineSaved.payload_json).feedback,'FIRST');assert.equal(Number((await control.query('select count(*) n from maintenance_hour_results where flight_id=$1',[routineCreated.id])).rows[0].n),0);assert.deepEqual((await control.query('select * from maintenance_assignments where flight_id=$1 order by id',[routineCreated.id])).rows,routineDispatchBefore);proof.routineDraftRace={flightId:routineCreated.id,statuses:[200,409],version:1,feedback:'FIRST',formalHours:0,selectedPersonId:reviewers[0].personId,formalPersonId:actor.personId,dispatchUnchanged:true};
  async function fixture(label,{concurrentRound=false,earlyRecognition=false,cancellation=false,cancellationMonth='2024-08'}={}){
   const created=await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:cancellation?cancellationMonth+'-10':month+'-10',flightNo:(cancellation?'CANCELRACE-':'V101RACE-')+label,aircraftNo:'B-RACEQA',aircraftType:'A320',workKind:'停场'}}),id=created.payload.flight.id;
   await ok(a,`/api/maintenance/flights/${id}/dispatch`,{method:'POST',cookie,body:{expectedUpdatedAt:created.payload.flight.updatedAt,assignments:[{role:'放行',personId:actor.personId}]}});
   const item={clientId:'race-'+label,temporary:true,manualManaged:true,standardId:'',chapter:'29',title:'独立并发未收录测试-'+label,category:'单项工作',standardHours:2,reportExplanation:'仅限隔离库的一事一通道并发验证-'+label,entries:[{personId:actor.personId,role:'主做'}]},base=`/api/maintenance/flights/${id}/reports/nonroutine`;
   const saved=await ok(a,base+'/draft',{method:'PUT',cookie,body:{items:[item],version:0}});
   await ok(a,base,{method:'PUT',cookie,body:{mode:'submit',items:[item],draftVersion:saved.payload.draft.version,expectedUpdatedAt:await version(id)}});
   await ok(a,`/api/maintenance/flights/${id}/reports/release`,{method:'PUT',cookie,body:{expectedUpdatedAt:await version(id),releasePersonId:actor.personId}});
   const reports=(await ok(a,`/api/maintenance/flights/${id}/reports`,{cookie})).payload.report;
   const formalItems=reports.nonroutine.items.map(row=>({...row,standardHours:row.hourAssessment.requestedHours}));
   if(!earlyRecognition)await ok(a,`/api/maintenance/flights/${id}/report-confirmation`,{method:'POST',cookie,body:{expectedUpdatedAt:await version(id),routineEntries:[],nonroutineItems:formalItems,releasePersonId:actor.personId}});
   const itemCase=(await control.query('select * from maintenance_nonroutine_review_cases where flight_id=$1',[id])).rows[0];assert.ok(itemCase);
   const acceptance={revision:1,accountIds:reviewers.map(row=>row.id),finalizerAccountId:actor.id};
   if(label==='DUPLICATE')await revokedAcceptance(a,itemCase.id,reviewers[0],acceptance);
   await ok(a,`/api/maintenance/nonroutine-reviews/${itemCase.id}/accept`,{method:'POST',cookie,body:acceptance});
   if(label==='DUPLICATE')await revokedAcceptance(a,itemCase.id,reviewers[0],{revision:2,personId:reviewers[11].personId,accountId:spare.id,reason:'合成验证未提交席位人工替换'},{action:'seats'});
   const opinion=reviewer=>({method:'POST',cookie:reviewer.cookie,body:{revision:0,hours:2,basis:'独立隔离席位实际提交，仅用于并发验收'}});
   if(concurrentRound){
    const before=(await ok(a,`/api/maintenance/nonroutine-reviews/${itemCase.id}`,{cookie})).payload.review;assert.equal(before.submittedCount,0);assert.equal(before.state,'IN_REVIEW');
    const values=[0,0,1,1,2,2,3,3,4,5,5,5];
    const commands=reviewers.map((reviewer,index)=>({node:workers[index],accountId:reviewer.id,url:`/api/maintenance/nonroutine-reviews/${itemCase.id}/opinion`,options:{...opinion(reviewer),body:{...opinion(reviewer).body,hours:values[index],basis:`独立并发席位${index+1}明确依据`}}}));
    const results=await overlapRound(commands,itemCase.id);assert.ok(results.every(row=>row.status===200),JSON.stringify(results));
    assert.deepEqual(results.map(row=>row.payload.review.submittedCount).sort((a,b)=>a-b),Array.from({length:12},(_,index)=>index+1));
    for(let index=0;index<12;index++){const visible=results[index].payload.review;assert.equal(visible.opinions.length,1);assert.equal(visible.opinions[0].accountId,reviewers[index].id);assert.equal(visible.opinions[0].hours,values[index]);assert.equal(visible.statistics,undefined);}
    const after=(await ok(a,`/api/maintenance/nonroutine-reviews/${itemCase.id}`,{cookie})).payload.review;assert.equal(after.revision,before.revision+1);assert.equal(after.submittedCount,12);assert.equal(after.state,'SEALED');assert.deepEqual(after.statistics,{trimmedMean:2.6,median:2.5});
    const events=(await control.query("select event_type,detail_json from maintenance_nonroutine_review_events where case_id=$1 and event_type in ('OPINION_SUBMITTED','SEALED')",[itemCase.id])).rows;
    assert.equal(events.length,12);assert.equal(events.filter(row=>row.event_type==='SEALED').length,1);assert.deepEqual(events.map(row=>JSON.parse(row.detail_json).count).sort((a,b)=>a-b),Array.from({length:12},(_,index)=>index+1));
    assert.equal(Number((await control.query('select count(*) n from maintenance_nonroutine_review_opinion_history where case_id=$1',[itemCase.id])).rows[0].n),12);
    const roundFacts=async()=>{const facts={};for(const table of ['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_seats','maintenance_nonroutine_review_opinions','maintenance_nonroutine_review_opinion_history','maintenance_nonroutine_review_events'])facts[table]=(await control.query(`select to_jsonb(t) payload from ${table} t where ${table==='maintenance_nonroutine_review_cases'?'id':'case_id'}=$1 order by to_jsonb(t)::text`,[itemCase.id])).rows;return facts;};
    const frozenRound=await roundFacts();
    const sealedRetries=await Promise.all(commands.map(command=>call(command.node,command.url,{...command.options,body:{revision:1,hours:9,basis:'封轮后禁止再次改写本人意见'}})));assert.ok(sealedRetries.every(row=>row.status===409),JSON.stringify(sealedRetries));
    const thirteenth=await call(a,commands[0].url,{method:'POST',cookie,body:{revision:0,hours:9,basis:'非指定第十三人不得新增有效意见'}});assert.equal(thirteenth.status,409);assert.deepEqual(await roundFacts(),frozenRound);
    proof.concurrentRound={caseId:itemCase.id,distinctAccounts:12,distinctBackendPids:12,progressCounts:results.map(row=>row.payload.review.submittedCount).sort((a,b)=>a-b),sealedEvents:1,statistics:after.statistics,privateOpinionsOnly:true,sealedRetryStatuses:sealedRetries.map(row=>row.status),thirteenthStatus:thirteenth.status,sealedRoundFactsUnchanged:true};
   }else if(cancellation){
    for(const reviewer of reviewers)await ok(a,`/api/maintenance/nonroutine-reviews/${itemCase.id}/opinion`,opinion(reviewer));
   }else{
   for(const reviewer of reviewers.slice(0,11))await ok(a,`/api/maintenance/nonroutine-reviews/${itemCase.id}/opinion`,opinion(reviewer));
   const finalOpinion={url:`/api/maintenance/nonroutine-reviews/${itemCase.id}/opinion`,options:opinion(reviewers[11]),name:'last-seat-opinion'};
   const duplicate=await overlap(label+':last-opinion',{node:a,...finalOpinion},{node:b,...finalOpinion});assert.deepEqual(duplicate.map(row=>row.status).sort(),[200,409]);
   }
   assert.equal(Number((await control.query('select count(*) n from maintenance_nonroutine_review_opinions where case_id=$1',[itemCase.id])).rows[0].n),12);
   const sealed=(await control.query('select state,revision from maintenance_nonroutine_review_cases where id=$1',[itemCase.id])).rows[0];assert.equal(sealed.state,'SEALED');
   const final={revision:Number(sealed.revision),decision:{category:item.category,chapter:item.chapter,title:item.title,workScope:item.reportExplanation,recognizedHours:2},participantsVerified:true,participants:[{personId:actor.personId,role:'主做'}],reason:'',roleVerificationReason:'',admissionDecision:'PENDING'};
   const tree=(await ok(a,`/api/maintenance/flights/${id}/review`,{cookie})).payload.review;
   const confirm={mode:'confirm',expectedUpdatedAt:tree.flight.updatedAt,routineElectronicSigned:false,nonroutineElectronicSigned:false,tasks:tree.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(person=>({personId:person.personId,role:person.role}))}))};
   return {id,caseId:itemCase.id,subtaskId:itemCase.subtask_id,formalItems,finalize:{url:`/api/maintenance/nonroutine-reviews/${itemCase.id}/finalize`,options:{method:'POST',cookie,body:final},name:'finalize-review'},confirm:{url:`/api/maintenance/flights/${id}/review`,options:{method:'PUT',cookie,body:confirm},name:'confirm-opportunity'}};
  }
  async function inspect(fixture,label,expectedChannel){
   const channel=(await control.query('select * from maintenance_nonroutine_review_channels where case_id=$1',[fixture.caseId])).rows[0];assert.equal(channel.state,expectedChannel);
   for(const table of ['maintenance_nonroutine_review_finals','maintenance_nonroutine_posting_receipts'])assert.equal(Number((await control.query(`select count(*) n from ${table} where case_id=$1`,[fixture.caseId])).rows[0].n),1);
   assert.equal(Number((await control.query("select count(*) n from maintenance_nonroutine_review_events where case_id=$1 and event_type='FINALIZED'",[fixture.caseId])).rows[0].n),1);
   const money=(await control.query("select count(*) n,sum(coalesce(adjusted_hours,hours)) hours from maintenance_effective_hour_results where owner_type='subtask' and owner_id=$1",[fixture.subtaskId])).rows[0];assert.equal(Number(money.n),1);assert.equal(Number(money.hours),2);
   assert.equal((await control.query('select status from maintenance_flights where id=$1',[fixture.id])).rows[0].status,'已确认');
   const captured=(await control.query('select payload from v101_race_confirmed_snapshots where flight_id=$1',[fixture.id])).rows[0];assert.ok(captured,'The real confirmation commit must have been observed');
   const current=(await control.query(`select ${snapshotSql('$1')} as payload`,[fixture.id])).rows[0].payload;assert.deepEqual(current,captured.payload,'Finalization must preserve every original confirmed row');
   const result={label,opportunityId:fixture.id,caseId:fixture.caseId,channelState:channel.state,effectiveRows:1,effectiveHours:2,confirmedOriginalFactsUnchanged:true,confirmedOriginalSnapshotSha256:createHash('sha256').update(JSON.stringify(captured.payload)).digest('hex')};proof.cases.push(result);await progress(label+':verified');
  }
  const duplicate=await fixture('DUPLICATE');await progress('duplicate-finalization:prepared');
  const finalized=await overlap('duplicate-finalization',{node:a,...duplicate.finalize},{node:b,...duplicate.finalize});assert.deepEqual(finalized.map(row=>row.status),[200,200]);
  duplicate.confirm.options.body.expectedUpdatedAt=await version(duplicate.id);await ok(a,duplicate.confirm.url,duplicate.confirm.options);await inspect(duplicate,'duplicate-finalization','MERGED_CLOSED');
  for(const first of ['finalize','confirm']){
   const fixtureCase=await fixture(first.toUpperCase());await progress(first+'-first:prepared');
   const results=await overlap(first+'-first',{node:a,...fixtureCase[first]},{node:b,...fixtureCase[first==='finalize'?'confirm':'finalize']});assert.deepEqual(results.map(row=>row.status),[200,200],JSON.stringify(results));
   if(first==='confirm'){
    const retries=await overlap('confirmed-adjustment-finalization-retries',{node:a,...fixtureCase.finalize},{node:b,...fixtureCase.finalize});assert.deepEqual(retries.map(row=>row.status),[200,200],JSON.stringify(retries));
   }
   await inspect(fixtureCase,first+'-first',first==='finalize'?'MERGED_CLOSED':'ADJUSTED_CLOSED');
  }
  for(let port=18892;port<=18901;port++)await start(port);
  const round=await fixture('ROUND12',{concurrentRound:true});await ok(a,round.finalize.url,round.finalize.options);round.confirm.options.body.expectedUpdatedAt=await version(round.id);await ok(a,round.confirm.url,round.confirm.options);await inspect(round,'twelve-distinct-reviewers','MERGED_CLOSED');
  const frozenFinal=(await control.query('select statistics_json,opinion_versions_json from maintenance_nonroutine_review_finals where case_id=$1',[round.caseId])).rows[0];assert.deepEqual(JSON.parse(frozenFinal.statistics_json),{trimmedMean:2.6,median:2.5});
  const versions=JSON.parse(frozenFinal.opinion_versions_json);assert.equal(versions.length,12);assert.equal(new Set(versions.map(row=>row.personId)).size,12);assert.equal(new Set(versions.map(row=>row.accountId)).size,12);assert.ok(versions.every(row=>row.revision===1));proof.concurrentRound.finalSnapshotVerified=true;
  const early=await fixture('EARLY',{earlyRecognition:true});await ok(a,early.finalize.url,early.finalize.options);
  const earlyBefore=(await control.query('select * from maintenance_flights where id=$1',[early.id])).rows[0];assert.equal(earlyBefore.status,'已提报');assert.equal(earlyBefore.report_finalized_at,null);
  const nextMonth=month==='2026-11'?'2026-12':'2027-01',changedDate=nextMonth+'-10';
  const directInput={date:changedDate,flightNo:earlyBefore.flight_no,departureFlightNo:earlyBefore.departure_flight_no,aircraftNo:earlyBefore.aircraft_no,aircraftType:earlyBefore.aircraft_type,workKind:earlyBefore.work_kind};
  const editing={...directInput,date:earlyBefore.date,expectedUpdatedAt:earlyBefore.updated_at};
  const editRace=await overlap('ordinary-opportunity-explicit-version',{node:a,url:`/api/maintenance/flights/${early.id}`,options:{method:'PUT',cookie,body:{...editing,stand:'QA-FIRST'}},name:'first-versioned-edit'},{node:b,url:`/api/maintenance/flights/${early.id}`,options:{method:'PUT',cookie,body:{...editing,stand:'QA-STALE'}},name:'stale-versioned-edit'});assert.deepEqual(editRace.map(row=>row.status),[200,409]);assert.equal((await control.query('select stand from maintenance_flights where id=$1',[early.id])).rows[0].stand,'QA-FIRST');proof.opportunityVersionRace={statuses:[200,409],staleEditDidNotOverwrite:true};
  const changed=await call(a,`/api/maintenance/flights/${early.id}`,{method:'PUT',cookie,body:directInput});
  const afterDate=(await control.query('select date from maintenance_flights where id=$1',[early.id])).rows[0].date,receipt=(await control.query('select work_month,statistical_month from maintenance_nonroutine_posting_receipts where case_id=$1',[early.caseId])).rows[0];
  proof.earlyRecognitionDate={opportunityId:early.id,caseId:early.caseId,status:changed.status,beforeDate:earlyBefore.date,afterDate,receipt,sourceMonthMetrics:(await ok(a,`/api/maintenance/stats/personal?month=${month}`,{cookie})).payload.metrics,targetMonthMetrics:(await ok(a,`/api/maintenance/stats/personal?month=${nextMonth}`,{cookie})).payload.metrics};
  assert.equal(changed.status,409,JSON.stringify(proof.earlyRecognitionDate));assert.equal(afterDate,earlyBefore.date);
  const stand=await ok(a,`/api/maintenance/flights/${early.id}`,{method:'PUT',cookie,body:{...directInput,date:earlyBefore.date,stand:'QA-NEW-STAND'}});assert.equal(stand.payload.flight.stand,'QA-NEW-STAND');
  await ok(a,`/api/maintenance/flights/${early.id}/report-confirmation`,{method:'POST',cookie,body:{expectedUpdatedAt:await version(early.id),routineEntries:[],nonroutineItems:early.formalItems,releasePersonId:actor.personId}});
  early.confirm.options.body.expectedUpdatedAt=await version(early.id);await ok(a,early.confirm.url,early.confirm.options);await inspect(early,'early-recognition-date-protected','MERGED_CLOSED');
  proof.cancellationAuthority=[];proof.cancellationOverlaps=[];proof.cancellationCases=[];
  const cancelOwner=spare,cancelRoles=(await control.query('select * from rbac_user_roles where user_id=$1',[spare.id])).rows,cancelUser=(await control.query('select status from users where id=$1',[spare.id])).rows[0],cancelPerson=(await control.query('select employment_status from personnel where id=$1',[spare.personId])).rows[0],cancelScopes=(await control.query("select * from rbac_user_scopes where user_id=$1 and module='maintenance'",[spare.id])).rows;
  const grantCancel=()=>control.query("insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code='addon_nonroutine_review_cancel' on conflict(user_id,role_id) do nothing",[cancelOwner.id,new Date().toISOString()]);
  const cancellationCommand=async(f,label)=>({url:`/api/maintenance/nonroutine-reviews/${f.caseId}/cancel`,name:'independent-cancel',options:{method:'POST',cookie:cancelOwner.cookie,body:{clientId:'cancel-race-'+label,revision:Number((await control.query('select revision from maintenance_nonroutine_review_cases where id=$1',[f.caseId])).rows[0].revision),reason:'Isolated independently authorized cancellation race '+label}}});
  const cancelFacts=async f=>({report:await treeFacts(f.id),review:await reviewFacts(f.caseId),assessment:(await control.query('select to_jsonb(t) payload from maintenance_nonroutine_assessments t where subtask_id=$1',[f.subtaskId])).rows});
  const originalSource=async f=>({assignments:(await control.query('select id,owner_type,owner_id,flight_id,person_id,user_name,team,role,assigned_by,assigned_at from maintenance_assignments where flight_id=$1 order by id',[f.id])).rows,entries:(await control.query('select to_jsonb(t) payload from maintenance_report_entries t join maintenance_report_batches b on b.id=t.batch_id where b.flight_id=$1 order by t.id',[f.id])).rows,opinions:(await control.query('select to_jsonb(t) payload from maintenance_nonroutine_review_opinions t where case_id=$1 order by person_id',[f.caseId])).rows});
  const cancelOverlap=async(label,first,second)=>{const results=await overlap(label,first,second);proof.cancellationOverlaps.push(proof.overlaps.pop());return results;};
  const assertCancelOutcome=async(f,label,{cancelled,posted=false})=>{
   const row=(await control.query('select c.state,ch.state as channel_state from maintenance_nonroutine_review_cases c join maintenance_nonroutine_review_channels ch on ch.case_id=c.id where c.id=$1',[f.caseId])).rows[0];assert.equal(row.state,cancelled?'CANCELLED':'FINALIZED');assert.equal(row.channel_state,cancelled?'CANCELLED_CLOSED':'ADJUSTED_CLOSED');
   const hours=(await control.query("select hours from maintenance_effective_hour_results where owner_type='subtask' and owner_id=$1",[f.subtaskId])).rows;assert.equal(hours.reduce((n,r)=>n+Number(r.hours),0),posted?2:0);assert.equal(hours.length,posted?1:0);
   const events=(await control.query("select id from maintenance_nonroutine_review_events where case_id=$1 and event_type='CANCELLED_BY_AUTHORIZED_OWNER'",[f.caseId])).rows;assert.equal(events.length,cancelled?1:0);assert.equal(Number((await control.query('select count(*) n from maintenance_nonroutine_review_opinions where case_id=$1',[f.caseId])).rows[0].n),12);
   proof.cancellationCases.push({label,flightId:f.id,caseId:f.caseId,subtaskId:f.subtaskId,caseState:row.state,channelState:row.channel_state,effectiveRows:hours.length,effectiveHours:posted?2:0,cancellationEvents:events.length,opinionsRetained:12});
  };
  try{
   const cancelPeriod=await ok(a,'/api/maintenance/hour-periods/2024-08/assign',{method:'POST',cookie,body:{revision:0,accountId:actor.id,reason:'Isolated cancellation race accounting period owner'}});
   await ok(a,'/api/maintenance/hour-periods/2024-08/confirm',{method:'POST',cookie,body:{revision:cancelPeriod.payload.period.revision,state:'OPEN',reason:'Explicitly open the synthetic cancellation race period'}});
   await grantCancel();await control.query("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=$1 and module='maintenance'",[cancelOwner.id]);
   const denied=await fixture('AUTHORITY',{cancellation:true}),deniedCommand=await cancellationCommand(denied,'authority');
   for(const change of ['account','personnel','role','scope']){
    const before=await cancelFacts(denied),node=proof.cancellationAuthority.length%2?b:a;await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending;
    try{
     pending=call(node,deniedCommand.url,deniedCommand.options);const waiting=await waitBlocked([node]);
     if(change==='account')await control.query("update users set status='inactive' where id=$1",[cancelOwner.id]);
     if(change==='personnel')await control.query("update personnel set employment_status='停职' where id=$1",[cancelOwner.personId]);
     if(change==='role')await control.query("delete from rbac_user_roles where user_id=$1 and role_id in(select id from rbac_roles where code='addon_nonroutine_review_cancel')",[cancelOwner.id]);
     if(change==='scope')await control.query("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=$1 and module='maintenance'",[cancelOwner.id]);
     await control.query('commit');held=false;const result=await pending;assert.ok([403,404].includes(result.status),JSON.stringify(result));assert.deepEqual(await cancelFacts(denied),before);
     proof.cancellationAuthority.push({change,waiting,status:result.status,currentAuthorityRecheckedAfterActualLockWait:true,allBusinessJournalReviewFactsUnchanged:true});
    }finally{if(held)await control.query('rollback');if(pending)await Promise.allSettled([pending]);await control.query('update users set status=$1 where id=$2',[cancelUser.status,cancelOwner.id]);await control.query('update personnel set employment_status=$1 where id=$2',[cancelPerson.employment_status,cancelOwner.personId]);await grantCancel();await control.query("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=$1 and module='maintenance'",[cancelOwner.id]);}
   }
   const retained=await originalSource(denied),replays=await cancelOverlap('independent-duplicate-cancel',{node:a,...deniedCommand},{node:b,...deniedCommand});assert.deepEqual(replays.map(r=>r.status),[200,200]);assert.deepEqual(replays.map(r=>r.payload.cancellation.replayed),[false,true]);assert.equal(replays[0].payload.cancellation.eventId,replays[1].payload.cancellation.eventId);assert.deepEqual(await originalSource(denied),retained);await assertCancelOutcome(denied,'authority-restored-and-duplicate',{cancelled:true});
   for(const first of ['cancel','finalize']){
    const f=await fixture('FINALIZE-'+first,{cancellation:true});await ok(a,f.confirm.url,f.confirm.options);const retained=await originalSource(f),cancel=await cancellationCommand(f,'finalize-'+first);
    const results=await cancelOverlap('independent-'+first+'-versus-finalize',{node:a,...(first==='cancel'?cancel:f.finalize)},{node:b,...(first==='cancel'?f.finalize:cancel)});assert.deepEqual(results.map(r=>r.status),[200,409],JSON.stringify(results));assert.deepEqual(await originalSource(f),retained);await assertCancelOutcome(f,'finalize-'+first,{cancelled:first==='cancel',posted:first==='finalize'});
   }
   for(const first of ['cancel','sync']){
    const workMonth=first==='cancel'?'2024-09':'2024-10';assert.equal((await control.query('select 1 from maintenance_hour_periods where month=$1',[workMonth])).rowCount,0);
    const f=await fixture('POSTING-'+first,{cancellation:true,cancellationMonth:workMonth});await ok(a,f.confirm.url,f.confirm.options);await ok(a,f.finalize.url,f.finalize.options);
    const pending=(await control.query('select state from maintenance_nonroutine_review_channels where case_id=$1',[f.caseId])).rows[0];assert.equal(pending.state,'NEEDS_ATTENTION');assert.equal(Number((await control.query("select count(*) n from maintenance_effective_hour_results where owner_type='subtask' and owner_id=$1",[f.subtaskId])).rows[0].n),0);
    const assigned=await ok(a,`/api/maintenance/hour-periods/${workMonth}/assign`,{method:'POST',cookie,body:{revision:0,accountId:actor.id,reason:'Explicit synthetic posting race period owner'}});await ok(a,`/api/maintenance/hour-periods/${workMonth}/confirm`,{method:'POST',cookie,body:{revision:assigned.payload.period.revision,state:'OPEN',reason:'Open previously unknown period only after pending recognition is retained'}});
    const retained=await originalSource(f),cancel=await cancellationCommand(f,'posting-'+first),sync={url:`/api/maintenance/nonroutine-reviews/${f.caseId}/sync`,name:'retry-authorized-posting',options:{method:'POST',cookie,body:{}}};
    const results=await cancelOverlap('independent-'+first+'-versus-posting',{node:a,...(first==='cancel'?cancel:sync)},{node:b,...(first==='cancel'?sync:cancel)});assert.deepEqual(results.map(r=>r.status),[200,409],JSON.stringify(results.map(r=>({status:r.status,error:r.payload.error}))));assert.deepEqual(await originalSource(f),retained);
    await assertCancelOutcome(f,'posting-'+first,{cancelled:first==='cancel',posted:first==='sync'});
   }
  }finally{await control.query('delete from rbac_user_roles where user_id=$1',[cancelOwner.id]);for(const row of cancelRoles)await insert('rbac_user_roles',row);for(const row of cancelScopes)await control.query('update rbac_user_scopes set scope_type=$1,scope_id=$2 where id=$3',[row.scope_type,row.scope_id,row.id]);}
  assert.equal(proof.cancellationAuthority.length,4);assert.equal(new Set(proof.cancellationAuthority.map(r=>r.waiting[0].pid)).size,2);assert.equal(proof.cancellationOverlaps.length,5);assert.equal(proof.cancellationCases.length,5);await progress('independent-cancellation-races-verified');
  const moneyFacts=async()=>{const facts={};for(const table of ['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_report_batches','maintenance_report_entries','maintenance_hour_results','maintenance_sortie_results','maintenance_nonroutine_hour_adjustments','maintenance_nonroutine_role_results','maintenance_nonroutine_review_cases','maintenance_nonroutine_review_channels','maintenance_nonroutine_review_finals'])facts[table]=(await control.query(`select to_jsonb(t) payload from ${table} t order by to_jsonb(t)::text`)).rows;return facts;};
  const beforeStandard=await moneyFacts();
  await control.query("insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code='addon_maintenance_standard_manager'",[spare.id,new Date().toISOString()]);
  const draftCounts=async()=>(await control.query('select (select count(*) from maintenance_standards) standards,(select count(*) from maintenance_standard_versions) versions,(select count(*) from maintenance_standard_management_events) events')).rows[0];
  const countsBefore=await draftCounts();await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let draftHeld=true,draftPending;
  try{
   draftPending=call(a,'/api/maintenance/standard-management',{method:'POST',cookie:spare.cookie,body:{clientId:'v101-denied-standard-create',reason:'合成权限撤销验证',definition:{category:'单项工作',chapter:'29',title:'撤权后不得创建的草稿',workScope:'隔离来源',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}}});const waiting=await waitBlocked([a]);
   await control.query("delete from rbac_user_roles where user_id=$1 and role_id in(select id from rbac_roles where code='addon_maintenance_standard_manager')",[spare.id]);await control.query('commit');draftHeld=false;const result=await draftPending;
   proof.standardDraftAuthority={waiting,status:result.status,before:countsBefore,after:await draftCounts()};assert.equal(result.status,403,JSON.stringify(proof.standardDraftAuthority));assert.deepEqual(proof.standardDraftAuthority.after,countsBefore);
  }finally{if(draftHeld)await control.query('rollback');if(draftPending)await Promise.allSettled([draftPending]);}
  const createdStandard=await ok(a,'/api/maintenance/standard-management',{method:'POST',cookie,body:{clientId:'v101-race-std-authority-create',reason:'隔离标准评议当前资格验证',definition:{category:'单项工作',chapter:'29',title:'V101RACE-STD-AUTH',workScope:'隔离标准来源范围',standardHours:2,aircraftCodes:['A320'],genericAircraft:false}}});
  const standardId=createdStandard.payload.standard.id,versionId=createdStandard.payload.versions[0].id;
  const requested=await ok(a,`/api/maintenance/standard-management/${standardId}/request-review`,{method:'POST',cookie,body:{revision:1,versionId,clientId:'v101-race-std-authority-request',reason:'人工提交独立标准评议验证'}}),standardCaseId=requested.payload.review.id;
  const nominate={revision:1,accountIds:reviewers.map(row=>row.id),finalizerAccountId:actor.id};await revokedAcceptance(a,standardCaseId,reviewers[0],nominate,{purpose:'STANDARD'});
  await ok(a,`/api/maintenance/standard-reviews/${standardCaseId}/accept`,{method:'POST',cookie,body:nominate});
  const replacement={revision:2,personId:reviewers[11].personId,accountId:spare.id,reason:'明确替换尚未提交的合成席位'};
  await revokedAcceptance(a,standardCaseId,reviewers[0],replacement,{purpose:'STANDARD',action:'seats'});
  const replaced=await ok(a,`/api/maintenance/standard-reviews/${standardCaseId}/seats`,{method:'POST',cookie,body:replacement});assert.equal(replaced.payload.review.revision,3);assert.equal(replaced.payload.review.seats.length,12);assert.ok(replaced.payload.review.seats.some(row=>row.accountId===spare.id));assert.ok(!replaced.payload.review.seats.some(row=>row.accountId===reviewers[11].id));
  const removed=await call(b,`/api/maintenance/standard-reviews/${standardCaseId}`,{cookie:reviewers[11].cookie});assert.equal(removed.status,404);
  assert.deepEqual(await moneyFacts(),beforeStandard,'Independent standard review must not change any opportunity, report, financial or work-review fact');
  proof.standardAuthority={caseId:standardCaseId,standardId,versionId,state:'IN_REVIEW',revision:3,seats:12,replacementAccountId:spare.id,removedAccountId:reviewers[11].id,removedMemberStatus:removed.status,workAndFinancialFactsUnchanged:true};
  const publicationDraft=(await ok(a,'/api/maintenance/standard-management',{method:'POST',cookie,body:{clientId:'v101-publication-authority-create',reason:'隔离准入权限验证',definition:{category:'单项工作',chapter:'29',title:'V101RACE-PUBLISH-AUTH',workScope:'发布权限验证范围',standardHours:2,aircraftCodes:['A320'],genericAircraft:false}}})).payload;
  const pubId=publicationDraft.standard.id,pubVersion=publicationDraft.versions[0].id;
  const pubCase=(await ok(a,`/api/maintenance/standard-management/${pubId}/request-review`,{method:'POST',cookie,body:{revision:1,versionId:pubVersion,clientId:'v101-publication-authority-review',reason:'人工提出独立评议'}})).payload.review.id;
  await ok(a,`/api/maintenance/standard-reviews/${pubCase}/accept`,{method:'POST',cookie,body:nominate});
  for(const reviewer of reviewers)await ok(a,`/api/maintenance/standard-reviews/${pubCase}/opinion`,{method:'POST',cookie:reviewer.cookie,body:{revision:0,hours:2,basis:'独立合成标准意见'}});
  await ok(a,`/api/maintenance/standard-reviews/${pubCase}/finalize`,{method:'POST',cookie,body:{revision:3,decision:{category:'单项工作',chapter:'29',title:'V101RACE-PUBLISH-AUTH',workScope:'发布权限验证范围',recognizedHours:2},admissionDecision:'INCLUDE',reason:''}});
  await control.query("insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code='addon_maintenance_standard_manager'",[spare.id,new Date().toISOString()]);
  const pubPath=`/api/maintenance/standard-publications/${pubId}/versions/${pubVersion}`,pubView=(await ok(a,pubPath,{cookie:spare.cookie})).payload.result;
  const admissionBefore=(await control.query('select count(*) n from maintenance_standard_admissions where standard_id=$1',[pubId])).rows[0];await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let publishHeld=true,admissionPending;
  try{
   admissionPending=call(a,pubPath+'/admit',{method:'POST',cookie:spare.cookie,body:{revision:pubView.standard.revision,versionId:pubVersion,clientId:'v101-denied-admission-scope',decision:'INCLUDE',reason:'合成范围收缩验证'}});const waiting=await waitBlocked([a]);await control.query("update rbac_user_scopes set scope_type='self' where user_id=$1 and module='maintenance'",[spare.id]);await control.query('commit');publishHeld=false;const result=await admissionPending;
   proof.publicationScopeAuthority={standardId:pubId,waiting,status:result.status,before:admissionBefore,after:(await control.query('select count(*) n from maintenance_standard_admissions where standard_id=$1',[pubId])).rows[0]};assert.equal(result.status,403,JSON.stringify(proof.publicationScopeAuthority));assert.deepEqual(proof.publicationScopeAuthority.after,admissionBefore);
  }finally{if(publishHeld)await control.query('rollback');if(admissionPending)await Promise.allSettled([admissionPending]);await control.query("update rbac_user_scopes set scope_type='all' where user_id=$1 and module='maintenance'",[spare.id]);}
  const metricsAfter=(await ok(a,`/api/maintenance/stats/personal?month=${month}`,{cookie})).payload.metrics;
  assert.equal(Math.round((metricsAfter.monthHours-metricsBefore.monthHours)*100),1000);assert.equal(metricsAfter.monthSorties-metricsBefore.monthSorties,5);assert.equal(metricsAfter.pendingMonthHours,metricsBefore.pendingMonthHours);
  proof.personalMetrics={before:metricsBefore,after:metricsAfter,addedHours:10,addedSorties:5,pendingHoursUnchanged:true};
  proof.archiveSourceOverlaps=[];proof.archiveSourceCases=[];
  for(const first of ['archive','finalize']){
   const f=await fixture('ARCHIVE-SOURCE-'+first.toUpperCase(),{cancellation:true});await ok(a,f.confirm.url,f.confirm.options);
   const tree=(await ok(a,`/api/maintenance/flights/${f.id}/review`,{cookie})).payload.review,source=(await control.query('select * from maintenance_nonroutine_manual_sources where flight_id=$1',[f.id])).rows[0],before=await originalSource(f),application=JSON.parse((await control.query('select application_json from maintenance_nonroutine_review_cases where id=$1',[f.caseId])).rows[0].application_json);
   const archive={url:`/api/maintenance/flights/${f.id}/review`,name:'archive-managed-source-copy',options:{method:'PUT',cookie,body:{mode:'save',expectedUpdatedAt:tree.flight.updatedAt,reason:'Isolated same-source archive versus recognition race',tasks:tree.tasks.map(row=>({ownerType:row.ownerType,ownerId:row.ownerId,assignments:row.assignments.map(person=>({personId:person.personId,role:person.role}))})),newSubtasks:[{clientId:source.client_id,chapter:application.chapter,title:application.title,category:application.category,reportExplanation:application.workScope,standardHours:2,assignments:[{personId:actor.personId,role:'主做'}]}]}}};
   const commands={archive,finalize:f.finalize},second=first==='archive'?'finalize':'archive',results=await overlap('archive-source-'+first+'-first',{node:a,...commands[first]},{node:b,...commands[second]});proof.archiveSourceOverlaps.push(proof.overlaps.pop());
   const archiveResult=results[first==='archive'?0:1],finalResult=results[first==='finalize'?0:1];assert.equal(archiveResult.status,409,JSON.stringify(archiveResult));assert.match(archiveResult.payload.error,/来源|原项/);assert.equal(finalResult.status,200,JSON.stringify(finalResult));assert.deepEqual(await originalSource(f),before);
   assert.equal(Number((await control.query('select count(*) n from maintenance_subtasks where flight_id=$1',[f.id])).rows[0].n),1);const rows=(await control.query("select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id=$1 order by id",[f.subtaskId])).rows;assert.equal(rows.length,1);assert.equal(Number(rows[0].hours),2);assert.equal(Number((await control.query('select count(*) n from maintenance_nonroutine_posting_receipts where case_id=$1',[f.caseId])).rows[0].n),1);
   await ok(a,`/api/maintenance/nonroutine-reviews/${f.caseId}/sync`,{method:'POST',cookie,body:{}});assert.equal((await call(b,archive.url,archive.options)).status,409);assert.deepEqual((await control.query("select * from maintenance_effective_hour_results where owner_type='subtask' and owner_id=$1 order by id",[f.subtaskId])).rows,rows);
   proof.archiveSourceCases.push({flightId:f.id,caseId:f.caseId,subtaskId:f.subtaskId,first,archiveStatus:409,finalizeStatus:200,subtasks:1,effectiveRows:1,effectiveHours:2,originalSourceUnchanged:true});
  }
  assert.equal(proof.archiveSourceOverlaps.length,2);await progress('archive-source-races-verified');
  proof.archiveAdditionIdentityOverlaps=[];
  const legacyFlight=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:'2024-08-20',flightNo:'ARCHIVE-ADDITION-RETRY-RACE',aircraftNo:'B-ARID',aircraftType:'A320',workKind:'停场'}})).payload.flight,legacyBase=`/api/maintenance/flights/${legacyFlight.id}`;
  await ok(a,legacyBase+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:legacyFlight.updatedAt,assignments:[{personId:actor.personId,role:'放行'}]}});await ok(a,legacyBase+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(legacyFlight.id)}});const releaseState=(await ok(a,legacyBase,{cookie})).payload.flight;if(!releaseState.reportFinalizedAt)await ok(a,legacyBase+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(legacyFlight.id),routineEntries:[],nonroutineItems:[],releasePersonId:actor.personId}});
  const legacyTree=(await ok(a,legacyBase+'/review',{cookie})).payload.review;await ok(a,legacyBase+'/review',{method:'PUT',cookie,body:{...treeBody(legacyTree,'confirm'),routineElectronicSigned:false}});
  const legacyAddition={clientId:'archive-race-stable-source',chapter:'974',title:'稳定补录来源实际等待竞态',category:'工卡指令',standardHours:2,reportExplanation:'同一来源只能创建一次',assignments:[{personId:actor.personId,role:'主做'}]},currentLegacy=(await ok(a,legacyBase+'/review',{cookie})).payload.review;
  const legacyBody={...treeBody(currentLegacy,'archive-save'),newSubtasks:[legacyAddition]},command={url:legacyBase+'/review',name:'same-stable-archive-addition',options:{method:'PUT',cookie,body:legacyBody}};
  const duplicateAddition=await overlap('archive-addition-source-same-version',{node:a,...command},{node:b,...command});proof.archiveAdditionIdentityOverlaps.push(proof.overlaps.pop());assert.deepEqual(duplicateAddition.map(r=>r.status),[200,409]);
  const storedSource=(await control.query('select * from maintenance_review_addition_sources where flight_id=$1',[legacyFlight.id])).rows[0],legacyHours=(await control.query('select * from maintenance_hour_results where flight_id=$1 order by id',[legacyFlight.id])).rows;assert.equal(legacyHours.length,1);assert.equal(Number(legacyHours[0].hours),2);
  const refreshLegacy=(await ok(a,legacyBase+'/review',{cookie})).payload.review,retryAddition=await ok(b,legacyBase+'/review',{method:'PUT',cookie,body:{...treeBody(refreshLegacy,'archive-save'),newSubtasks:[legacyAddition]}});assert.equal(retryAddition.status,200);assert.deepEqual((await control.query('select * from maintenance_hour_results where flight_id=$1 order by id',[legacyFlight.id])).rows,legacyHours);assert.equal(Number((await control.query('select count(*) n from maintenance_subtasks where flight_id=$1',[legacyFlight.id])).rows[0].n),1);assert.deepEqual((await control.query('select * from maintenance_review_addition_sources where flight_id=$1',[legacyFlight.id])).rows,[storedSource]);
  proof.archiveAdditionIdentity={flightId:legacyFlight.id,clientId:legacyAddition.clientId,subtaskId:storedSource.subtask_id,concurrentStatuses:[200,409],refreshRetryStatus:200,sourceRows:1,effectiveRows:1,hours:2,originalResultPreserved:true};await progress('archive-addition-identities-verified');

  proof.originalDeletionAuthority=[];
  const deleteRoles=(await control.query('select * from rbac_user_roles where user_id=$1',[spare.id])).rows,deleteScopes=(await control.query("select * from rbac_user_scopes where user_id=$1 and module='maintenance'",[spare.id])).rows;
  const resetDeleteActor=async()=>{
   await control.query("update users set status='active' where id=$1",[spare.id]);await control.query("update personnel set employment_status='在职' where id=$1",[spare.personId]);await control.query('delete from rbac_user_roles where user_id=$1',[spare.id]);for(const row of deleteRoles)await insert('rbac_user_roles',row);
   for(const code of ['dispatcher','addon_maintenance_delete','addon_maintenance_review','addon_archive_modify'])await control.query('insert into rbac_user_roles(user_id,role_id,created_at) select $1,id,$2 from rbac_roles where code=$3 on conflict do nothing',[spare.id,new Date().toISOString(),code]);await control.query("update rbac_user_scopes set scope_type='all',scope_id='' where user_id=$1 and module='maintenance'",[spare.id]);
  };
  try{
   for(const target of ['subtask','flight'])for(const phase of ['pending','confirmed']){
    await resetDeleteActor();const made=(await ok(a,'/api/maintenance/flights',{method:'POST',cookie,body:{date:'2024-08-21',flightNo:`DELETE-AUTH-RACE-${target}-${phase}`,aircraftNo:'B-DEL-AUTH',aircraftType:'A320',workKind:'停场'}})).payload.flight,base=`/api/maintenance/flights/${made.id}`;
    await ok(a,base+'/dispatch',{method:'POST',cookie,body:{expectedUpdatedAt:made.updatedAt,assignments:[{personId:actor.personId,role:'放行'}]}});await ok(a,base+'/reports/release',{method:'PUT',cookie,body:{expectedUpdatedAt:await version(made.id)}});const release=(await ok(a,base,{cookie})).payload.flight;if(!release.reportFinalizedAt)await ok(a,base+'/report-confirmation',{method:'POST',cookie,body:{expectedUpdatedAt:await version(made.id),routineEntries:[],nonroutineItems:[],releasePersonId:actor.personId}});
    const tree=(await ok(a,base+'/review',{cookie})).payload.review;await ok(a,base+'/review',{method:'PUT',cookie,body:{...treeBody(tree,'save'),reason:'Synthetic original deletion current authority',newSubtasks:[{clientId:`delete-race-${target}-${phase}`,chapter:'969',title:'Original deletion race source',category:'工卡指令',standardHours:2,assignments:[{personId:actor.personId,role:'主做'}]}]}});if(phase==='confirmed'){const ready=(await ok(a,base+'/review',{cookie})).payload.review;await ok(a,base+'/review',{method:'PUT',cookie,body:treeBody(ready,'confirm')});}
    const source=(await control.query('select * from maintenance_review_addition_sources where flight_id=$1',[made.id])).rows[0],url=target==='flight'?base:`/api/maintenance/subtasks/${source.subtask_id}`,before=await treeFacts(made.id);
    for(const change of ['primary-permission','state-permission','scope','account','personnel']){
     const node=proof.originalDeletionAuthority.length%2?b:a;await control.query('begin');await control.query('select pg_advisory_xact_lock(54002010,31)');let held=true,pending;
     try{
      pending=call(node,url,{method:'DELETE',cookie:spare.cookie,body:{reason:'Synthetic actual lock-wait authority revocation'}});const waiting=await waitBlocked([node]);
      if(change==='primary-permission')await control.query('delete from rbac_user_roles where user_id=$1 and role_id in (select id from rbac_roles where code=$2)',[spare.id,target==='flight'?'addon_maintenance_delete':'dispatcher']);
      if(change==='state-permission')await control.query('delete from rbac_user_roles where user_id=$1 and role_id in (select id from rbac_roles where code=any($2::text[]))',[spare.id,phase==='confirmed'?['addon_archive_modify']:['addon_maintenance_review','addon_archive_modify']]);
      if(change==='scope')await control.query("update rbac_user_scopes set scope_type='self',scope_id='' where user_id=$1 and module='maintenance'",[spare.id]);
      if(change==='account')await control.query("update users set status='inactive' where id=$1",[spare.id]);if(change==='personnel')await control.query("update personnel set employment_status='停职' where id=$1",[spare.personId]);
      await control.query('commit');held=false;const result=await pending;assert.ok([403,404].includes(result.status),JSON.stringify({target,phase,change,...result}));assert.deepEqual(await treeFacts(made.id),before);assert.deepEqual((await control.query('select * from maintenance_review_addition_sources where flight_id=$1',[made.id])).rows,[source]);
      proof.originalDeletionAuthority.push({flightId:made.id,subtaskId:source.subtask_id,target,phase,change,waiting,status:result.status,currentAuthorityRecheckedAfterActualLockWait:true,originalBusinessAndSourcesUnchanged:true});
     }finally{if(held)await control.query('rollback');if(pending)await Promise.allSettled([pending]);await resetDeleteActor();}
    }
   }
   assert.equal(proof.originalDeletionAuthority.length,20);assert.equal(new Set(proof.originalDeletionAuthority.map(row=>row.waiting[0].pid)).size,2);await progress('original-deletion-current-authority-verified');
  }finally{
   await control.query('delete from rbac_user_roles where user_id=$1',[spare.id]);for(const row of deleteRoles)await insert('rbac_user_roles',row);for(const row of deleteScopes)await control.query('update rbac_user_scopes set scope_type=$1,scope_id=$2 where id=$3',[row.scope_type,row.scope_id,row.id]);
  }


 }finally{
  try{await control.query('rollback');}catch{}
  for(const worker of workers){if(worker.child.exitCode===null){worker.child.kill('SIGTERM');await Promise.race([new Promise(resolve=>worker.child.once('exit',resolve)),sleep(4000)]);if(worker.child.exitCode===null&&worker.child.signalCode===null){worker.child.kill('SIGKILL');await new Promise(resolve=>worker.child.once('exit',resolve));}}await fs.writeFile(path.join(state,`race-api-${worker.port}.log`),worker.output.split(database.password).join('[redacted]'),{mode:0o600});}
  proof.workersStopped=workers.every(row=>row.child.exitCode!==null||row.child.signalCode!==null);proof.workersCleanExit=workers.every(row=>row.child.exitCode===0);
  await control.query('drop trigger if exists v101_capture_confirmed_fixture on maintenance_flights');await control.query('drop function if exists v101_capture_confirmed_fixture()');await control.query('drop table if exists v101_race_confirmed_snapshots');proof.observationObjectsRemoved=true;await control.end();
  await fs.writeFile(path.join(state,'concurrency-proof.json'),JSON.stringify(proof,null,2),{mode:0o600});
 }
 assert.equal(proof.workersStopped,true);assert.equal(proof.workersCleanExit,true);assert.equal(proof.cases.length,5);assert.equal(proof.overlaps.length,14);assert.equal(proof.revokedAcceptances.length,12);assert.equal(proof.reportAuthority.length,24);assert.equal(proof.treeReviewAuthority.length,13);assert.equal(proof.treeReviewPositiveControls.length,3);await progress('complete');console.log(JSON.stringify({multiProcessConcurrency:true,verifiedCases:5,verifiedOverlaps:14,verifiedTaskTreeAuthority:13,taskTreePositiveControls:3,workersStopped:true,proof:path.join(state,'concurrency-proof.json')}));
}
