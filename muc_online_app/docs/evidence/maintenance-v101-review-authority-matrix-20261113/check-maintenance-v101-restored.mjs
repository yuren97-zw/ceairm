// Only the disposable restore database created by the isolated PG16 verifier.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import pg from 'pg';
import {postgresFingerprint} from './maintenance-postgres-fingerprint.mjs';
const prepare=process.argv[2]==='--prepare-fixture',url=new URL(process.env.DATABASE_URL||'');
if(process.argv.length>3||process.argv[2]&&!prepare||url.hostname!=='127.0.0.1'||url.port!=='15432'||url.pathname!==(prepare?'/muc_v101_qa':'/muc_v101_restored')||url.username!==(prepare?'muc_v101_app':'muc_v101_restore')||!url.password||url.search||url.hash)throw Error('Only the isolated fixture or restore database is allowed');
process.env.MUC_NO_LISTEN='1';process.env.MUC_NONSETTLEMENT_MODULES_ENABLED='1';process.env.MUC_NONROUTINE_CORRECTIONS_ENABLED='1';process.env.MUC_NONROUTINE_REVIEW_ENABLED='1';process.env.MUC_NONROUTINE_FINALIZATION_ENABLED='1';process.env.MUC_NONROUTINE_NOTIFICATIONS_ENABLED='0';process.env.MUC_STANDARDS_REVIEW_ENABLED='1';process.env.MUC_STANDARDS_PUBLICATION_ENABLED='1';process.env.MUC_STANDARDS_MANAGEMENT_ENABLED='1';process.env.MUC_STANDARDS_IMPORT_ENABLED='1';
const client=new pg.Client({connectionString:url.href});await client.connect();
const before=await postgresFingerprint(client,{businessOnly:true});
const money=async()=> (await client.query('select id,owner_type,owner_id,assignment_id,person_id,hours,adjusted_hours,status,confirmed_by,confirmed_at,created_at,updated_at from maintenance_hour_results order by id')).rows;
const frozen=async()=>{
  const result={};
  const tables=(await client.query("select tablename from pg_tables where schemaname='public' and (tablename like 'maintenance_nonroutine_%' or tablename like 'maintenance_standard%') order by tablename")).rows;
  for(const {tablename} of tables)result[tablename]=(await client.query(`select to_jsonb(t)::text as value from "${tablename}" t order by to_jsonb(t)::text`)).rows;
  for(const table of ['maintenance_flights','maintenance_subtasks','maintenance_assignments','maintenance_hour_results','maintenance_report_batches','maintenance_report_entries']){
    const predicate=table==='maintenance_flights'?'id in (select flight_id from maintenance_nonroutine_review_cases)':table==='maintenance_subtasks'?'id in (select subtask_id from maintenance_nonroutine_review_cases)':'flight_id in (select flight_id from maintenance_nonroutine_review_cases)';
    result[table]=(await client.query(`select to_jsonb(t)::text as value from "${table}" t where ${predicate} order by to_jsonb(t)::text`)).rows;
  }return result;
};
const moneyBefore=prepare?await money():null,frozenBefore=prepare?await frozen():null;
const auditBefore=prepare?(await client.query('select id,to_jsonb(t)::text as value from maintenance_logs t order by id')).rows:null;
const {measuredRoute,db}=await import('../server.mjs');
process.env.MUC_WORKFLOW_TASKS_ENABLED='1';process.env.MUC_WORKFLOW_SIMULATION_ENABLED='1';
process.env.MUC_MAINTENANCE_MODULE_SHADOW_ENABLED='1';
const {readMaintenanceModuleIdentity}=await import('../maintenance-module-instances.mjs');
const {createMaintenanceWorkflowActions}=await import('../maintenance-workflow-actions.mjs');
const actionFixture=db.prepare("select w.*,t.id as task_id,t.state as task_state,t.result_json from maintenance_workflow_instances w join maintenance_workflow_tasks t on t.workflow_id=w.id where w.template_code='workflow_action_fixture_only'").get();
assert.ok(actionFixture,'Recovery must retain the isolated action-service fixture');
assert.equal(actionFixture.state,'COMPLETED');assert.equal(actionFixture.task_state,'SUBMITTED');assert.equal(JSON.parse(actionFixture.result_json).outcome,'FAIL');assert.equal(createHash('sha256').update(actionFixture.template_json).digest('hex'),actionFixture.template_sha256);
const fixtureTransaction=fn=>{db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}};
const fixtureQualify=accountId=>accountId==='fixture-only-actor'?{accountId,personId:'fixture-only-person',fixtureOnly:true}:null;
const fixtureActions=createMaintenanceWorkflowActions({db,transaction:fixtureTransaction,authorize:user=>fixtureQualify(user),qualifyAssignee:fixtureQualify,resolveTemplate:()=>{throw Error('Recovery must not resolve a new template');},audit:()=>{throw Error('Recovery must not write another audit');},clock:()=> 't'});
for(let retry=0;retry<2;retry++)assert.equal(fixtureActions.submit(actionFixture.id,{clientId:'workflow-fixture-submit',expectedRevision:2,taskId:actionFixture.task_id,expectedTaskRevision:2,result:{type:'CHECK_RESULT',outcome:'FAIL',note:'Explicit fixture, not business approval'}},'fixture-only-actor').replayed,true);
const workflowStored=db.prepare("select w.id,w.template_json,w.template_sha256,w.result_type,t.state,t.result_json from maintenance_workflow_instances w join maintenance_workflow_tasks t on t.workflow_id=w.id where w.id='workflow-storage-fixture'").get();assert.ok(workflowStored,'Recovery must retain the explicit workflow storage fixture');assert.equal(createHash('sha256').update(workflowStored.template_json).digest('hex'),workflowStored.template_sha256);assert.equal(workflowStored.result_type,'CHECK_RESULT');assert.equal(workflowStored.state,'SUBMITTED');assert.equal(JSON.parse(workflowStored.result_json).outcome,'FAIL');assert.ok(db.prepare("select id from maintenance_workflow_events where workflow_id=? and task_id='workflow-storage-task'").get(workflowStored.id));
const {loadWorkStandardRecognition}=await import('../maintenance-work-recognition-source.mjs');
const factBaselines=db.prepare("select e.detail_json,c.flight_id,c.subtask_id,c.report_batch_id from maintenance_nonroutine_review_events e join maintenance_nonroutine_review_cases c on c.id=e.case_id where e.event_type='SOURCE_FACTS_BASELINE'").all();
for(const row of factBaselines){const {facts,token}=JSON.parse(row.detail_json);assert.equal(createHash('sha256').update(JSON.stringify(facts)).digest('hex'),token);assert.equal(facts.opportunityId,row.flight_id);assert.equal(facts.workItemId,row.subtask_id);assert.equal(facts.reportBatchId,row.report_batch_id);}
const factChanges=Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where event_type='SOURCE_FACTS_CHANGED'").get().n);
const attestedFinals=db.prepare("select c.id,c.revision,u.username,e.detail_json from maintenance_nonroutine_review_events e join maintenance_nonroutine_review_cases c on c.id=e.case_id join users u on u.id=c.finalizer_account_id where e.event_type='FINALIZED'").all().map(row=>({...row,event:JSON.parse(row.detail_json)})).filter(row=>row.event.sourceFacts?.attestationIncluded);
for(const row of attestedFinals){const result=loadWorkStandardRecognition(db,row.id,row.event.finalId);assert.equal(result.final.id,row.event.finalId);}
assert.ok(factBaselines.length>0&&factChanges>0&&attestedFinals.length>0,'Recovery must preserve original submission facts, authorized changes and exact finalization attestations');
const moduleSnapshots=db.prepare('select * from maintenance_opportunity_rule_snapshots order by opportunity_key').all();
let moduleSnapshotsVerified=0,detachedModuleSnapshotsVerified=0,extensionInstancesVerified=0;
for(const snapshot of moduleSnapshots){
  if(snapshot.opportunity_id){
    const identity=readMaintenanceModuleIdentity(db,snapshot.opportunity_id);
    assert.equal(identity.instances.length,3+identity.extensions.length);assert.equal(identity.ruleSnapshotSha256,snapshot.content_sha256);moduleSnapshotsVerified++;extensionInstancesVerified+=identity.extensions.length;
  }else{
    const rows=db.prepare('select * from maintenance_module_instances where opportunity_key=?').all(snapshot.opportunity_key);
    assert.equal(rows.length,3);assert.ok(rows.every(row=>row.opportunity_id===null));detachedModuleSnapshotsVerified++;
  }
}
assert.ok(extensionInstancesVerified>0,'Recovery must include actual registered non-settlement extensions');
assert.ok(moduleSnapshotsVerified>0&&detachedModuleSnapshotsVerified>0,'Recovery must include active and deleted-source module snapshots');
const postedCorrections=db.prepare("select c.* from maintenance_nonroutine_corrections c where c.state='POSTED' and not exists(select 1 from maintenance_nonroutine_corrections newer where newer.subtask_id=c.subtask_id and newer.state='POSTED' and newer.correction_number>c.correction_number)").all();
let correctionsVerified=0;
for(const correction of postedCorrections){
  const effective=db.prepare("select sum(coalesce(adjusted_hours,hours)) total from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(correction.subtask_id);
  assert.equal(Math.round(Number(effective.total)*100),Math.round(Number(correction.target_hours)*100));
  const deltas=db.prepare('select * from maintenance_nonroutine_correction_deltas where correction_id=?').all(correction.id);
  assert.ok(deltas.length);assert.ok(deltas.every(row=>JSON.parse(row.correction_of_json).length));
  assert.equal(correction.statistical_month,correction.work_month);
  if(correction.source_kind==='REVIEW')assert.ok(['MERGED_CLOSED','ADJUSTED_CLOSED'].includes(db.prepare('select state from maintenance_nonroutine_review_channels where case_id=?').get(correction.source_id)?.state));
  correctionsVerified++;
}
assert.ok(correctionsVerified>0,'Recovery must cover posted signed corrections without reopening the original channel');
const towAssessments=db.prepare("select a.* from maintenance_nonroutine_assessments a join maintenance_subtasks s on s.id=a.subtask_id where s.category='拖机'").all();
const towStandards=towAssessments.filter(row=>row.source_kind==='STANDARD'),towReviews=towAssessments.filter(row=>row.source_kind==='REVIEW');
assert.ok(towStandards.length&&towReviews.length,'Recovery must cover new standard and unlisted tow work');
for(const row of towStandards){assert.equal(Number(row.effective_hours),Number(JSON.parse(row.standard_json).standardHours));assert.equal(JSON.parse(row.policy_json).strategy,'EQUAL');}
const legacyTow=db.prepare("select sum(h.hours) hours from maintenance_hour_results h join maintenance_subtasks s on s.id=h.owner_id where h.owner_type='subtask' and s.title='原在途拖机维护' and s.category='拖机'").get();assert.equal(Number(legacyTow.hours),3);
class Response extends EventEmitter{
  headers={};statusCode=200;body=Buffer.alloc(0);
  writeHead(status,headers={}){this.statusCode=status;this.headers=headers;return this;}
  write(body=''){this.body=Buffer.concat([this.body,Buffer.isBuffer(body)?body:Buffer.from(String(body))]);return true;}
  end(body=''){this.write(body);this.emit('finish');}
}
async function request(path,body,cookie='',method='POST'){
  const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.url=path;req.headers={host:'127.0.0.1:8788',origin:'http://127.0.0.1:8788','content-type':'application/json',...(cookie?{cookie}:{})};
  const res=new Response();await measuredRoute(req,res);return {res,payload:res.body.length?JSON.parse(res.body.toString()):null};
}
try{
  if(prepare){
    assert.deepEqual(await money(),moneyBefore,'Fixture preparation must not change monetary facts');assert.deepEqual(await frozen(),frozenBefore,'Fixture preparation must preserve all V10 recognition and source facts');
    const after=await postgresFingerprint(client,{businessOnly:true}),changed=Object.keys(before.tables).filter(name=>JSON.stringify(before.tables[name])!==JSON.stringify(after.tables[name]));
    const auditAfter=(await client.query('select id,action,detail,to_jsonb(t)::text as value from maintenance_logs t order by id')).rows,auditById=new Map(auditAfter.map(row=>[row.id,row]));
    for(const row of auditBefore)assert.equal(auditById.get(row.id)?.value,row.value,'Fixture startup must preserve every original audit');
    const oldAuditIds=new Set(auditBefore.map(row=>row.id)),startupAudits=auditAfter.filter(row=>!oldAuditIds.has(row.id));
    for(const row of startupAudits){assert.equal(row.action,'coordinator_transition');const detail=JSON.parse(row.detail);assert.equal(detail.gateRuleVersion,'legacy-report-gates-v1');assert.equal(detail.actorQualification,null);assert.ok(detail.predicates.every(item=>typeof item.satisfied==='boolean'));}
    const allowed=['maintenance_assignments','maintenance_flights','maintenance_subtasks','maintenance_hour_results','maintenance_report_draft_versions',...(startupAudits.length?['maintenance_logs']:[])];
    assert.ok(changed.every(name=>allowed.includes(name)),'Unexpected fixture startup mutation');
    console.log(JSON.stringify({fixturePrepared:true,legacyCompatibilityTablesChanged:changed,v101FrozenFactsUnchanged:true,monetaryFactsUnchanged:true,originalAuditsUnchanged:true,startupCoordinatorAudits:startupAudits.length}));
  }else{
  assert.deepEqual(await postgresFingerprint(client,{businessOnly:true}),before,'Restored startup must preserve maintenance business facts');
  const towLogin=await request('/api/login',{username:'54002010',password:'muc2026'});assert.equal(towLogin.res.statusCode,200);const towCookie=String(towLogin.res.headers['Set-Cookie']||towLogin.res.headers['set-cookie']).split(';')[0];
  const previousTow=process.env.MUC_TOW_STANDARD_ONLY_ENABLED;process.env.MUC_TOW_STANDARD_ONLY_ENABLED='1';
  try{const rules=await request('/api/maintenance/rules',{},towCookie,'GET');assert.equal(rules.res.statusCode,200);assert.equal(rules.payload.towTransition.mode,'STANDARD_ONLY');const legacy=rules.payload.rules.find(row=>row.rule_type==='nonroutineCategoryHours'&&row.name==='拖机');assert.ok(legacy);const rejected=await request('/api/maintenance/rules',{rules:[legacy]},towCookie,'PUT');assert.equal(rejected.res.statusCode,409,JSON.stringify(rejected.payload));}finally{if(previousTow===undefined)delete process.env.MUC_TOW_STANDARD_ONLY_ENABLED;else process.env.MUC_TOW_STANDARD_ONLY_ENABLED=previousTow;}
  let extensionRegistrationsRetried=0;
  const registrations=db.prepare("select i.*,l.detail,u.username from maintenance_module_instances i join maintenance_logs l on l.owner_id=i.id and l.action='register_nonsettlement_module' join users u on u.id=l.user_id where i.module_code like 'extension_%'").all();
  assert.ok(registrations.length);
  for(const row of registrations){const event=JSON.parse(row.detail),definition=event.definition;const login=await request('/api/login',{username:row.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    const body={moduleTypeCode:definition.moduleTypeCode,moduleVersion:definition.moduleVersion,resultType:definition.resultType,instanceKey:row.instance_key,expectedRuleSnapshot:event.ruleSnapshot,reason:event.reason};
    for(let n=0;n<2;n++){const result=await request(`/api/maintenance/flights/${encodeURIComponent(row.opportunity_id)}/extension-modules`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.replayed,true);assert.equal(result.payload.module.moduleInstanceId,row.id);extensionRegistrationsRetried++;}
  }
  const cases=(await client.query("select c.id,u.username,ch.state from maintenance_nonroutine_review_cases c join users u on u.id=c.finalizer_account_id join maintenance_nonroutine_review_channels ch on ch.case_id=c.id where c.state='FINALIZED' and ch.state in ('MERGED_CLOSED','ADJUSTED_CLOSED') order by c.id")).rows;
  assert.ok(cases.some(item=>item.state==='MERGED_CLOSED')&&cases.some(item=>item.state==='ADJUSTED_CLOSED'),'Both posted paths must exist in the recovered fixture');
  let retried=0;
  for(const item of cases){const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);
    const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let index=0;index<2;index++){const result=await request(`/api/maintenance/nonroutine-reviews/${encodeURIComponent(item.id)}/sync`,{},cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.finalization.channel.state,item.state);retried++;}
  }
  let sourceAttestationsRetried=0;
  for(const row of attestedFinals){
    const {final}=loadWorkStandardRecognition(db,row.id,row.event.finalId),attestation=row.event.sourceFacts;
    const login=await request('/api/login',{username:row.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    const body={revision:Number(row.revision),decision:JSON.parse(final.decision_json),participants:JSON.parse(final.participants_json),participantsVerified:true,reason:final.reason,roleVerificationReason:final.role_verification_reason,admissionDecision:final.admission_decision,sourceFactsToken:attestation.token,sourceFactsReviewed:attestation.acknowledged};
    for(let n=0;n<2;n++){const result=await request(`/api/maintenance/nonroutine-reviews/${encodeURIComponent(row.id)}/finalize`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.finalization.id,final.id);sourceAttestationsRetried++;}
  }
  const standards=(await client.query("select c.id,c.revision,f.decision_json,f.admission_decision,f.reason,u.username from maintenance_standard_review_cases c join maintenance_standard_review_finals f on f.case_id=c.id join users u on u.id=c.finalizer_account_id where c.state='FINALIZED' order by c.id")).rows;
  let standardFinalizationsRetried=0;
  for(const item of standards){const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    const body={revision:Number(item.revision),decision:JSON.parse(item.decision_json),admissionDecision:item.admission_decision,reason:item.reason};
    for(let index=0;index<2;index++){const result=await request(`/api/maintenance/standard-reviews/${encodeURIComponent(item.id)}/finalize`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.review.state,'FINALIZED');standardFinalizationsRetried++;}
  }
  let standardPublicationsRetried=0;const publicationKinds=[];
  for(const table of ['maintenance_standard_publications','maintenance_standard_work_publications']){
    const records=(await client.query(`select p.*,u.username from ${table} p join users u on u.id=p.actor_id order by p.id`)).rows;
    for(const item of records){
      const normalized={standardId:item.standard_id,action:'PUBLISH',revision:Number(item.standard_revision),versionId:item.version_id,reason:item.reason,admissionId:item.admission_id};
      const effectiveAt=['IMMEDIATE',item.effective_at].find(value=>createHash('sha256').update(JSON.stringify({...normalized,effectiveAt:value})).digest('hex')===item.request_hash);assert.ok(effectiveAt,'Recovered publication request must match its immutable original digest');
      const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
      const body={revision:normalized.revision,versionId:item.version_id,reason:item.reason,admissionId:item.admission_id,effectiveAt,clientId:item.client_id};
      for(let index=0;index<2;index++){const response=await request(`/api/maintenance/standard-publications/${encodeURIComponent(item.standard_id)}/versions/${encodeURIComponent(item.version_id)}/publish`,body,cookie);assert.equal(response.res.statusCode,200,JSON.stringify(response.payload));assert.equal(response.payload.replayed,true);assert.equal(response.payload.result.publication.id,item.id);standardPublicationsRetried++;}
      publicationKinds.push(table);
    }
  }
  assert.ok(publicationKinds.includes('maintenance_standard_publications')&&publicationKinds.includes('maintenance_standard_work_publications'),'Recovery must cover both independent standard and original work publication sources');
  const standardImports=(await client.query("select a.*,u.username from maintenance_standard_import_attempts a join maintenance_standard_import_batches b on b.id=a.batch_id join users u on u.id=b.created_by order by a.batch_id,a.request_id")).rows;assert.ok(standardImports.length,'Recovery fixture must contain real standard import attempts');let standardImportsRetried=0;
  for(const item of standardImports){
    const body={...JSON.parse(item.request_json),requestId:item.request_id};assert.equal(createHash('sha256').update(item.request_json).digest('hex'),item.request_hash,'Recovered import must retain its original request');
    const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let index=0;index<2;index++){const response=await request(`/api/maintenance/standard-import/batches/${encodeURIComponent(item.batch_id)}/commit`,body,cookie);assert.equal(response.res.statusCode,200,JSON.stringify(response.payload));assert.equal(response.payload.replayed,true);assert.deepEqual(response.payload.results,JSON.parse(item.result_json).results);standardImportsRetried++;}
  }
  const correctionRequests=(await client.query('select c.*,u.username from maintenance_nonroutine_corrections c join users u on u.id=c.approved_by order by c.id')).rows;
  let correctionApprovalsRetried=0,correctionAuthorizationsRetried=0;
  for(const item of correctionRequests){
    const body=JSON.parse(item.target_json).request;if(!body)continue; // Explicit fixture-only foundation rows have no approval request.
    const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let index=0;index<2;index++){const result=await request(`/api/maintenance/nonroutine-corrections/sources/${encodeURIComponent(item.subtask_id)}/approve`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.replayed,true);assert.equal(result.payload.correction.id,item.id);correctionApprovalsRetried++;}
  }
  assert.ok(correctionApprovalsRetried>0,'Recovery must replay real financial correction approvals');
  const correctionAuthorizations=(await client.query('select a.*,u.username from maintenance_nonroutine_correction_period_authorizations a join users u on u.id=a.actor_id order by a.id')).rows;
  for(const item of correctionAuthorizations){
    const snapshot=JSON.parse(item.snapshot_json),body={clientId:snapshot.clientId,sourceRevision:Number(item.source_revision),targetRevision:Number(item.target_revision),targetMonth:item.target_month,reason:item.reason};
    const login=await request('/api/login',{username:item.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let index=0;index<2;index++){const result=await request(`/api/maintenance/nonroutine-corrections/${encodeURIComponent(item.correction_id)}/authorize-period`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.replayed,true);assert.ok(result.payload.correction.authorizations.some(authorization=>authorization.id===item.id));correctionAuthorizationsRetried++;}
  }
  assert.ok(correctionAuthorizationsRetried>0,'Recovery must replay real correction period authorizations');
  let workflowHttpRetries=0,workflowCompletionSourcesVerified=0,workflowAuditReadsVerified=0;
  const submittedWorkflows=db.prepare("select e.*,u.username,t.result_json,w.template_json,w.template_sha256 from maintenance_workflow_events e join maintenance_workflow_instances w on w.id=e.workflow_id join maintenance_workflow_tasks t on t.id=e.task_id join users u on u.id=e.actor_id where w.template_code='nonsettlement_simulation' and e.event_type='SUBMIT' order by e.id").all();
  assert.ok(submittedWorkflows.length>0,'Recovery must retain a real workflow HTTP submission');
  for(const row of submittedWorkflows){
    assert.equal(createHash('sha256').update(row.template_json).digest('hex'),row.template_sha256);
    const detail=JSON.parse(row.detail_json),body={clientId:row.client_id,expectedRevision:Number(detail.after.revision)-1,taskId:row.task_id,expectedTaskRevision:Number(detail.before.revision),result:JSON.parse(row.result_json)};
    const login=await request('/api/login',{username:row.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let retry=0;retry<2;retry++){const result=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}/submit`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.replayed,true);assert.equal(result.payload.state,'COMPLETED');workflowHttpRetries++;}
    const typed=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}/result?expectedVersion=${detail.after.revision}`,{},cookie,'GET');assert.equal(typed.res.statusCode,200,JSON.stringify(typed.payload));assert.equal(typed.payload.type,'CHECK_RESULT');assert.equal(typed.payload.sourceId,row.workflow_id);assert.equal(typed.payload.sourceVersion,detail.after.revision);assert.equal(typed.payload.outcome,body.result.outcome);assert.equal('hours' in typed.payload,false);assert.equal('count' in typed.payload,false);
    const history=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}/audit`,{},cookie,'GET');assert.equal(history.res.statusCode,200,JSON.stringify(history.payload));assert.equal(history.payload.sourceIntegrity,'VERIFIED');assert.equal(history.payload.manage,false);assert.deepEqual(history.payload.events.map(event=>event.eventType),['CREATE','CLAIM','SUBMIT']);assert.equal(history.payload.events[0].reason,null);assert.equal(JSON.stringify(history.payload).includes(body.result.note),false);assert.equal(JSON.stringify(history.payload).includes('request_hash'),false);workflowAuditReadsVerified++;
    const projected=await request(`/api/maintenance/flights/${encodeURIComponent(detail.opportunityId)}/report-modules`,{},towCookie,'GET');assert.equal(projected.res.statusCode,200,JSON.stringify(projected.payload));const module=projected.payload.modules.find(item=>item.moduleInstanceId===detail.moduleInstanceId);assert.equal(module.completionAvailable,true);assert.equal(module.moduleBusinessState,'SUBMITTED');assert.equal(module.resultSource.sourceId,row.workflow_id);assert.equal(module.countsAsFormalReportSubmission,false);assert.equal(module.requiredBeforePendingReview,false);assert.equal(module.requiredBeforeConfirmation,false);assert.equal(JSON.stringify(projected.payload).includes(body.result.note),false);workflowCompletionSourcesVerified++;
  }
  let workflowCancelRetries=0;
  const cancelledWorkflows=db.prepare("select e.*,u.username from maintenance_workflow_events e join maintenance_workflow_instances w on w.id=e.workflow_id join users u on u.id=e.actor_id where w.template_code='nonsettlement_simulation' and e.event_type='CANCEL' order by e.id").all();
  assert.ok(cancelledWorkflows.length>0,'Recovery must retain a real workflow cancellation');
  for(const row of cancelledWorkflows){
    const detail=JSON.parse(row.detail_json),body={clientId:row.client_id,expectedRevision:Number(detail.before.revision),reason:detail.reason};
    const login=await request('/api/login',{username:row.username,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];
    for(let retry=0;retry<2;retry++){const result=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}/cancel`,body,cookie);assert.equal(result.res.statusCode,200,JSON.stringify(result.payload));assert.equal(result.payload.replayed,true);assert.equal(result.payload.state,'CANCELLED');workflowCancelRetries++;}
    const view=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}`,{},cookie,'GET');assert.equal(view.res.statusCode,200);assert.equal(view.payload.completion.available,true);assert.equal(view.payload.completion.state,'CANCELLED');assert.equal(view.payload.completion.resultSource,null);
    const history=await request(`/api/maintenance/workflows/${encodeURIComponent(row.workflow_id)}/audit`,{},cookie,'GET');assert.equal(history.res.statusCode,200,JSON.stringify(history.payload));assert.equal(history.payload.sourceIntegrity,'VERIFIED');assert.equal(history.payload.manage,true);assert.deepEqual(history.payload.events.map(event=>event.eventType),['CREATE','REASSIGN','CANCEL']);assert.equal(history.payload.events.at(-1).reason,detail.reason);workflowAuditReadsVerified++;
  }
  const sourceCancellations=db.prepare("select * from maintenance_nonroutine_review_events where event_type='CANCELLED_BY_SOURCE_REMOVAL' order by id").all();
  assert.ok(sourceCancellations.length>0,'Recovery must retain actual original-source cancellation audits');
  const cancellationActions=[...new Set(sourceCancellations.map(event=>JSON.parse(event.detail_json).sourceAction))].sort();
  assert.deepEqual(cancellationActions,['OPPORTUNITY_REMOVAL','SUBTASK_REMOVAL']);
  for(const event of sourceCancellations){
    const detail=JSON.parse(event.detail_json),item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(event.case_id),channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(event.case_id);
    assert.equal(item.state,'CANCELLED');assert.equal(channel.state,'CANCELLED_CLOSED');assert.equal(channel.id,detail.channelId);assert.equal(detail.qualification.accountId,event.actor_id);assert.ok(detail.qualification.personId);assert.equal(detail.ledgerChanged,false);
    assert.equal(db.prepare('select 1 from maintenance_subtasks where id=?').get(item.subtask_id),undefined);
    assert.equal(db.prepare('select 1 from maintenance_nonroutine_posting_receipts where case_id=?').get(item.id),undefined);
    assert.equal(db.prepare('select 1 from maintenance_nonroutine_hour_adjustments where case_id=?').get(item.id),undefined);
    assert.equal(db.prepare("select 1 from maintenance_nonroutine_review_outbox where case_id=? and state='PENDING'").get(item.id),undefined);
  }
  console.log(JSON.stringify({restoredSourceCancellationsVerified:sourceCancellations.length,cancellationActions,closedWithoutFinancialReversal:true}));
  const mixedReview=db.prepare('select * from maintenance_nonroutine_review_cases').all().find(item=>JSON.parse(item.application_json).title==='SECOND-INDEPENDENT-REVIEW');
  assert.ok(mixedReview);assert.equal(mixedReview.state,'PENDING_ACCEPTANCE');
  assert.equal(db.prepare('select state from maintenance_nonroutine_review_channels where case_id=?').get(mixedReview.id).state,'WAITING_REVIEW');
  assert.equal(db.prepare('select status from maintenance_subtasks where id=?').get(mixedReview.subtask_id).status,'已提报');
  assert.equal(db.prepare('select status from maintenance_report_batches where id=?').get(mixedReview.report_batch_id).status,'已提报');
  const mixedZero=db.prepare("select r.hours from maintenance_effective_hour_results r join maintenance_subtasks s on s.id=r.owner_id where r.flight_id=? and r.owner_type='subtask' and s.title='手工有效零工时'").all(mixedReview.flight_id);assert.ok(mixedZero.length>0);assert.ok(mixedZero.every(row=>Number(row.hours)===0));
  const manualRemovalSnapshots=db.prepare("select detail from maintenance_logs where action='delete_flight'").all().flatMap(row=>JSON.parse(row.detail).before?.manualSources||[]).filter(row=>row.client_id==='manual-removal-fixture');
  assert.deepEqual(manualRemovalSnapshots.map(row=>row.state).sort(),['ACTIVE','SUBMITTED']);
  for(const source of manualRemovalSnapshots){const tombstone=db.prepare('select * from maintenance_nonroutine_manual_sources where fingerprint=?').get(source.fingerprint);assert.equal(tombstone.state,'DELETED');assert.equal(tombstone.client_id,source.client_id);assert.equal(tombstone.subtask_id,source.subtask_id);assert.equal(db.prepare('select id from maintenance_flights where id=?').get(tombstone.flight_id),undefined);}
  console.log(JSON.stringify({restoredMixedBatchReviewPreserved:true,restoredMixedBatchZeroResults:mixedZero.length,restoredManualRemovalTombstones:manualRemovalSnapshots.length}));
  const contentManager=db.prepare('select u.username from maintenance_flights f join users u on u.id=f.created_by where f.id=?').get(mixedReview.flight_id),contentLogin=await request('/api/login',{username:contentManager.username,password:'muc2026'});assert.equal(contentLogin.res.statusCode,200);const contentCookie=String(contentLogin.res.headers['Set-Cookie']||contentLogin.res.headers['set-cookie']).split(';')[0];
  for(const item of [{path:`/api/maintenance/flights/${encodeURIComponent(mixedReview.flight_id)}/subtasks`,method:'POST'},{path:`/api/maintenance/subtasks/${encodeURIComponent(mixedReview.subtask_id)}`,method:'PUT'}]){const refused=await request(item.path,{title:'Recovery must not invalidate frozen submitted sources',category:'其他',standardHours:99},contentCookie,item.method);assert.equal(refused.res.statusCode,409,JSON.stringify(refused.payload));}
  console.log(JSON.stringify({restoredGenericContentLocksVerified:2,frozenSourcesUnchanged:true}));
  const coordinatorAudits=db.prepare("select * from maintenance_logs where action='coordinator_transition' order by id").all();assert.ok(coordinatorAudits.length>0);
  let persistedCoordinatorAudits=0,legacyCoordinatorAudits=0;
  for(const row of coordinatorAudits){const detail=JSON.parse(row.detail);assert.equal(detail.gateRuleVersion,'legacy-report-gates-v1');assert.ok(['RECONCILE','APPLY_FINALIZE_REPORT','CONFIRM_REVIEW'].includes(detail.action));assert.ok(detail.predicates.every(item=>typeof item.satisfied==='boolean'&&(!item.required||item.satisfied)));if(detail.actorQualification){assert.equal(detail.actorQualification.accountId,row.user_id);assert.ok(detail.actorQualification.personId);}if(detail.identitySource==='PERSISTED'){const snapshot=db.prepare('select content_sha256 from maintenance_opportunity_rule_snapshots where opportunity_key=?').get(row.flight_id);assert.equal(detail.ruleSnapshotSha256,snapshot.content_sha256);persistedCoordinatorAudits++;}else{assert.equal(detail.identitySource,'LEGACY_ADAPTER');assert.equal(detail.ruleSnapshotSha256,null);legacyCoordinatorAudits++;}}
  assert.ok(persistedCoordinatorAudits>0&&legacyCoordinatorAudits>0);
  console.log(JSON.stringify({restoredCoordinatorAuditsVerified:coordinatorAudits.length,persistedCoordinatorAudits,legacyCoordinatorAudits,coordinatorEnabled:process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED==='1'}));
  const ruleChanges=db.prepare('select * from maintenance_rule_change_history order by revision').all();assert.ok(ruleChanges.length>0);
  for(const [index,row]of ruleChanges.entries()){assert.equal(Number(row.revision),index+1);assert.equal(createHash('sha256').update(row.before_json).digest('hex'),row.before_sha256);assert.equal(createHash('sha256').update(row.after_json).digest('hex'),row.after_sha256);assert.equal(JSON.parse(row.qualification_json).accountId,row.actor_id);}
  const visibleRuleChanges=[];let ruleCursor='';do{const history=await request(`/api/maintenance/rules/history${ruleCursor?`?cursor=${ruleCursor}`:''}`,{},towCookie,'GET');assert.equal(history.res.statusCode,200,JSON.stringify(history.payload));assert.ok(!JSON.stringify(history.payload).includes('qualification_json'));visibleRuleChanges.push(...history.payload.items);ruleCursor=history.payload.nextCursor;}while(ruleCursor);assert.equal(visibleRuleChanges.length,ruleChanges.length);assert.equal(new Set(visibleRuleChanges.map(row=>row.id)).size,ruleChanges.length);
  let configurationVersionsVerified=0;
  for(const row of db.prepare('select policy_json from maintenance_nonroutine_assessments').all()){const version=JSON.parse(row.policy_json).configurationVersion;if(!version)continue;assert.match(version.fingerprint,/^[a-f0-9]{64}$/);if(version.historyKnown&&!version.hasUnjournaledChanges){const recorded=db.prepare('select after_sha256 from maintenance_rule_change_history where revision=?').get(version.revision);assert.equal(version.fingerprint,recorded.after_sha256);}else if(!version.historyKnown)assert.equal(version.revision,0);configurationVersionsVerified++;}
  assert.ok(configurationVersionsVerified>0);console.log(JSON.stringify({restoredRuleChangesVerified:ruleChanges.length,restoredRuleHistoryPagesComplete:true,configurationVersionsVerified,legacyHistoryNotBackfilled:true}));
  const concurrencyCases=db.prepare("select c.id,c.subtask_id,f.flight_no,f.status,ch.state from maintenance_nonroutine_review_cases c join maintenance_flights f on f.id=c.flight_id join maintenance_nonroutine_review_channels ch on ch.case_id=c.id where f.flight_no like 'V101RACE-%' order by f.flight_no").all();
  if(concurrencyCases.length){
    const round=concurrencyCases.find(row=>row.flight_no==='V101RACE-ROUND12');assert.equal(concurrencyCases.length,round?4:3);
    for(const row of concurrencyCases){
      assert.equal(row.status,'已确认');assert.equal(row.state,row.flight_no==='V101RACE-CONFIRM'?'ADJUSTED_CLOSED':'MERGED_CLOSED');
      for(const table of ['maintenance_nonroutine_review_finals','maintenance_nonroutine_posting_receipts'])assert.equal(Number(db.prepare(`select count(*) n from ${table} where case_id=?`).get(row.id).n),1);
      assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinions where case_id=?').get(row.id).n),12);
      const effective=db.prepare("select count(*) n,sum(coalesce(adjusted_hours,hours)) hours from maintenance_effective_hour_results where owner_type='subtask' and owner_id=?").get(row.subtask_id);assert.equal(Number(effective.n),1);assert.equal(Number(effective.hours),2);
    }
    assert.equal((await client.query("select 1 from pg_tables where schemaname='public' and tablename='v101_race_confirmed_snapshots'")).rowCount,0);
    assert.equal((await client.query("select 1 from pg_proc where proname='v101_capture_confirmed_fixture'")).rowCount,0);
    if(round){
      const final=db.prepare('select statistics_json,opinion_versions_json from maintenance_nonroutine_review_finals where case_id=?').get(round.id);assert.deepEqual(JSON.parse(final.statistics_json),{trimmedMean:2.6,median:2.5});
      const versions=JSON.parse(final.opinion_versions_json),opinions=db.prepare('select person_id,account_id,revision from maintenance_nonroutine_review_opinions where case_id=?').all(round.id);assert.equal(versions.length,12);assert.equal(new Set(versions.map(row=>row.personId)).size,12);assert.equal(new Set(versions.map(row=>row.accountId)).size,12);
      for(const version of versions)assert.ok(opinions.some(row=>row.person_id===version.personId&&row.account_id===version.accountId&&Number(row.revision)===version.revision&&version.revision===1));
      assert.equal(Number(db.prepare("select count(*) n from maintenance_nonroutine_review_events where case_id=? and event_type='SEALED'").get(round.id).n),1);assert.equal(Number(db.prepare('select count(*) n from maintenance_nonroutine_review_opinion_history where case_id=?').get(round.id).n),12);
      console.log(JSON.stringify({restoredTwelveDistinctReviewersVerified:true,finalOpinionVersions:12,sealedEvents:1,statistics:{trimmedMean:2.6,median:2.5}}));
    }
    console.log(JSON.stringify({restoredMultiProcessCasesVerified:concurrencyCases.length,restoredEffectiveHours:concurrencyCases.length*2,duplicateFinancialFacts:0,temporaryObservationObjectsRemoved:true}));
  }
  const authorityStandard=db.prepare("select c.*,v.status as version_status,v.published_at,v.review_final_id from maintenance_standard_review_cases c join maintenance_standard_versions v on v.id=c.version_id where v.title='V101RACE-STD-AUTH'").get();
  if(authorityStandard){
    assert.equal(authorityStandard.state,'IN_REVIEW');assert.equal(Number(authorityStandard.revision),3);assert.equal(authorityStandard.version_status,'DRAFT');assert.equal(authorityStandard.published_at,null);assert.equal(authorityStandard.review_final_id,null);
    const seats=db.prepare('select account_id,person_id from maintenance_standard_review_seats where case_id=?').all(authorityStandard.id);assert.equal(seats.length,12);assert.equal(new Set(seats.map(row=>row.person_id)).size,12);assert.ok(seats.some(row=>row.account_id==='v101-race-reviewer-12'));assert.ok(!seats.some(row=>row.account_id==='v101-race-reviewer-11'));
    assert.equal(Number(db.prepare("select count(*) n from maintenance_standard_review_events where case_id=? and event_type='SEAT_REPLACED'").get(authorityStandard.id).n),1);
    const oldNotices=db.prepare("select state from maintenance_standard_review_outbox where case_id=? and recipient_account_id='v101-race-reviewer-11' and event_type in ('ASSIGNED','REMINDER_24')").all(authorityStandard.id);assert.equal(oldNotices.length,2);assert.ok(oldNotices.every(row=>row.state==='CANCELLED'));
    for(const table of ['maintenance_standard_review_opinions','maintenance_standard_review_finals'])assert.equal(Number(db.prepare(`select count(*) n from ${table} where case_id=?`).get(authorityStandard.id).n),0);
    for(const [accountId,status] of [['v101-race-reviewer-11',404],['v101-race-reviewer-12',200]]){const login=await request('/api/login',{username:accountId,password:'muc2026'});assert.equal(login.res.statusCode,200);const cookie=String(login.res.headers['Set-Cookie']||login.res.headers['set-cookie']).split(';')[0];const result=await request(`/api/maintenance/standard-reviews/${authorityStandard.id}`,{},cookie,'GET');assert.equal(result.res.statusCode,status,JSON.stringify(result.payload));}
    console.log(JSON.stringify({restoredStandardAuthorityFixtureVerified:true,seats:12,seatReplacements:1,removedMemberStatus:404,replacementMemberStatus:200,oldNoticesCancelled:2,published:false}));
  }
  assert.deepEqual(await postgresFingerprint(client,{businessOnly:true}),before,'Retry after recovery must not duplicate or rewrite business facts');
  console.log(JSON.stringify({restoredApplicationStartup:true,workflowAuditReadsVerified,workflowCompletionSourcesVerified,workflowHttpRetries,workflowCancelRetries,workflowActionFixtureVerified:true,workflowActionRetries:2,workflowStorageFixtureVerified:true,extensionInstancesVerified,extensionRegistrationsRetried,towStandardSourcesVerified:towStandards.length,towReviewSourcesVerified:towReviews.length,legacyTowHours:3,retiredTowRuleWriteRejected:true,sourceFactBaselinesVerified:factBaselines.length,sourceFactChangesVerified:factChanges,sourceAttestationsRetried,moduleSnapshotsVerified,detachedModuleSnapshotsVerified,correctionsVerified,correctionApprovalsRetried,correctionAuthorizationsRetried,retried,standardFinalizationsRetried,standardPublicationsRetried,standardImportsRetried,publicationKinds:[...new Set(publicationKinds)].sort(),postedPaths:[...new Set(cases.map(item=>item.state))].sort(),maintenanceBusinessUnchanged:true}));
  }
}finally{await db.close?.();await client.end();}
