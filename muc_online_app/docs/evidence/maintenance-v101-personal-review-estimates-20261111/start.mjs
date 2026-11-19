import fs from 'node:fs';
import http from 'node:http';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-personal-estimates-crli_wyy/synthetic.sqlite';process.env.UPLOAD_DIR='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-personal-estimates-crli_wyy/uploads';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
process.env.MUC_MAINTENANCE_V101='draft';for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
const stamp=new Date().toISOString(),user=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(user.person_id);
db.prepare("insert into maintenance_flights(id,date,flight_no,aircraft_no,aircraft_type,work_kind,status,created_by,created_at,updated_at) values('qa-manual-flight','2026-11-11','QA901','B-QA','A320','停场','已派工',?,?,?)").run(user.id,stamp,stamp);
db.prepare("insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,role,status,assigned_by,assigned_at) values('qa-manual-assignment','flight','qa-manual-flight','qa-manual-flight',?,?,'例行检查','已派工',?,?)").run(user.person_id,user.name,user.id,stamp);

const insert=(table,row)=>db.prepare(`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
const {publicationFixture}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/tests/fixtures/maintenance-standard-publication.mjs');
const fixture=publicationFixture({after(){}},{db});
const {createNonroutineReview}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/nonroutine-review.mjs');
const rounds=createNonroutineReview(fixture.common);
insert('maintenance_report_batches',{id:'qa-batch',flight_id:'qa-manual-flight',report_type:'nonroutine',status:'已提报',created_at:stamp,updated_at:stamp});
for(const [index,category,strategy,title] of [[0,'试车','EQUAL','本人可计算申请'],[1,'其他','UNDECIDED','本人待分配申请']]){
 const subtaskId='qa-pending-'+index,participants=[{personId:user.person_id,assignmentId:'qa-participant-'+index,role:'主做',assignedAt:stamp}],policy={strategy,category,version:1};
 const snapshot={category,chapter:'29',title,workScope:'合成待审页面验证',requestedHours:2};
 const caseId=rounds.create({flightId:'qa-manual-flight',subtaskId,reportBatchId:'qa-batch',applicationRevision:1,applicantId:fixture.admin.id,snapshot,participants,policySnapshot:policy});
 insert('maintenance_subtasks',{id:subtaskId,flight_id:'qa-manual-flight',title,category,standard_hours:null,status:'已提报',created_at:stamp,updated_at:stamp});
 insert('maintenance_nonroutine_assessments',{subtask_id:subtaskId,flight_id:'qa-manual-flight',report_batch_id:'qa-batch',source_kind:'REVIEW',source_fingerprint:'qa-source-'+index,application_json:JSON.stringify(snapshot),participants_json:JSON.stringify(participants),policy_json:JSON.stringify(policy),review_case_id:caseId,effective_hours:null,created_at:stamp});
 insert('maintenance_nonroutine_review_channels',{id:'qa-channel-'+index,case_id:caseId,subtask_id:subtaskId,state:'WAITING_REVIEW',created_at:stamp,updated_at:stamp});
 rounds.accept(caseId,{revision:1,accountIds:fixture.members.map(user=>user.id),finalizerAccountId:fixture.finalizer.id},fixture.admin);
 for(const member of fixture.members.slice(0,3))rounds.submitOpinion(caseId,{revision:0,hours:1,basis:'PRIVATE-ESTIMATE-CANARY'},member);
}
http.createServer(measuredRoute).listen(18888,'127.0.0.1',()=>console.log('QA_READY'));
