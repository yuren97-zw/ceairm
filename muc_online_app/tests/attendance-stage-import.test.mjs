import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {attendanceStageTables,prepareAttendanceStage,assertAttendanceStageTarget,attendanceStageDecision} from '../attendance-stage-import.mjs';
function fixture(){const tables=Object.fromEntries(attendanceStageTables.map(t=>[t,[]]));return {tables,sourcePeople:[{id:'old-person',employee_no:'001'}],targetPeople:[{id:'new-person',employee_no:'001'}],sourceAccounts:[{id:'001',username:'001'}],targetAccounts:[{id:'new-account',username:'001'}]};}
test('stage target must be explicit loopback PostgreSQL staging DB, never default or query-overridden host',()=>{
 assertAttendanceStageTarget('postgresql://test:secret@127.0.0.1:55551/qa_attendance_stage');
 for(const url of ['postgresql://test@cloud:55551/qa_attendance_stage','postgresql://test@127.0.0.1:5432/qa_attendance_stage','postgresql://test@127.0.0.1:55551/production','postgresql://test@127.0.0.1:55551/qa_attendance_stage?host=cloud','postgresql://test@127.0.0.1:55551/qa_attendance_stage#fragment'])assert.throws(()=>assertAttendanceStageTarget(url));
});
test('typed JSON and relational IDs change but employee numbers, DingTalk user IDs and raw source remain exact',()=>{
 const f=fixture();f.tables.attendance_people=[{person_id:'old-person',user_id:'ding',employee_no:'001',department_ids:'[]'}];
 f.tables.attendance_sync_state=[{id:'sample',value_json:JSON.stringify({personId:'old-person',actorId:'001',employeeNo:'001',userId:'001'})}];
 f.tables.attendance_runs=[{id:'run',actor_id:'001',scope_json:'["old-person"]'}];
 const out=prepareAttendanceStage(f);assert.equal(out.tables.attendance_people[0].person_id,'new-person');assert.equal(out.tables.attendance_people[0].user_id,'ding');assert.equal(out.tables.attendance_people[0].employee_no,'001');assert.deepEqual(JSON.parse(out.tables.attendance_sync_state[0].value_json),{personId:'new-person',actorId:'new-account',employeeNo:'001',userId:'001'});assert.equal(out.tables.attendance_runs[0].scope_json,'["new-person"]');assert.equal(f.tables.attendance_people[0].person_id,'old-person');
});
test('unreferenced unmatched people are reported, while any actual unmapped reference blocks',()=>{
 const f=fixture();f.sourcePeople.push({id:'unmatched',employee_no:'999'});assert.equal(prepareAttendanceStage(f).summary.unreferencedUnmatchedPeople,1);
 f.tables.attendance_refresh=[{person_id:'unmatched'}];assert.throws(()=>prepareAttendanceStage(f),/UNMAPPED_PERSON/);
});
test('duplicate employee numbers, duplicate target identities and unmapped accounts block',()=>{
 let f=fixture();f.sourcePeople.push({id:'other',employee_no:'001'});assert.throws(()=>prepareAttendanceStage(f),/NOT_UNIQUE/);
 f=fixture();f.targetPeople.push({id:'other',employee_no:'001'});assert.throws(()=>prepareAttendanceStage(f),/NOT_UNIQUE/);
 f=fixture();f.tables.attendance_runs=[{id:'run',actor_id:'unknown'}];assert.throws(()=>prepareAttendanceStage(f),/UNMAPPED_ACCOUNT/);
});
test('invalid JSON, unknown table contract and unrecognized JSON ID positions fail closed',()=>{
 let f=fixture();f.tables.attendance_sync_state=[{value_json:'{'}];assert.throws(()=>prepareAttendanceStage(f),/INVALID_JSON/);
 f=fixture();f.tables.attendance_unknown=[];assert.throws(()=>prepareAttendanceStage(f),/TABLE_CONTRACT/);
 f=fixture();f.tables.attendance_sync_state=[{value_json:'{"futureIdentityField":"old-person"}'}];assert.throws(()=>prepareAttendanceStage(f),/UNRECOGNIZED_JSON/);
});
test('approval due primary key is regenerated using target person; opaque historical run IDs remain',()=>{
 const f=fixture(),row={instance_id:'approval',revision:2,person_id:'old-person',work_date:'2026-10-29',phase:'final',run_id:'historic'};
 const hash=id=>crypto.createHash('sha256').update(['approval',2,id,'2026-10-29','final'].join('|')).digest('hex');row.id=hash('old-person');f.tables.attendance_approval_plan_due=[row];f.tables.attendance_runs=[{id:'historic',actor_id:'scheduler'}];const result=prepareAttendanceStage(f);assert.equal(result.tables.attendance_approval_plan_due[0].id,hash('new-person'));assert.equal(result.tables.attendance_approval_plan_due[0].run_id,'historic');f.tables.attendance_approval_plan_due[0].id='bad';assert.throws(()=>prepareAttendanceStage(f),/UNKNOWN_DUE_ID/);
});
test('task run, batch and JSON membership must agree after transformation',()=>{
 const f=fixture();f.tables.attendance_runs=[{id:'r',actor_id:'scheduler'}];f.tables.attendance_batches=[{id:'b',run_id:'r',users_json:'[{"personId":"old-person","userId":"ding"}]'}];f.tables.attendance_tasks=[{id:'t',run_id:'r',batch_id:'b',person_id:'old-person',user_id:'ding'}];assert.equal(prepareAttendanceStage(f).tables.attendance_tasks[0].person_id,'new-person');f.tables.attendance_tasks[0].user_id='wrong';assert.throws(()=>prepareAttendanceStage(f),/TASK_BATCH_PERSON_MISMATCH/);f.tables.attendance_tasks[0].run_id='missing';assert.throws(()=>prepareAttendanceStage(f),/ORPHAN/);
});
test('approval reason cache may refer to an explicit reason backfill job but not an orphan',()=>{
 const f=fixture();f.tables.attendance_approvals=[{id:'a',run_id:'reason-job'}];assert.throws(()=>prepareAttendanceStage(f),/ORPHAN_APPROVAL_JOB/);f.tables.attendance_sync_state=[{id:'reasonBackfill:reason-job',value_json:'{"id":"reason-job","actorId":"001"}'}];assert.equal(prepareAttendanceStage(f).tables.attendance_approvals.length,1);
});
test('checkpoints allow only exact repeats and reject any source or target drift',()=>{
 assert.equal(attendanceStageDecision({nonempty:[],sourceHash:'s',targetHash:'t'}),'fresh');assert.throws(()=>attendanceStageDecision({nonempty:['attendance_days']}),/NONEMPTY/);
 const checkpoint={source_sha:'s',target_sha:'t'};assert.equal(attendanceStageDecision({checkpoint,sourceHash:'s',targetHash:'t'}),'repeat');for(const [sourceHash,targetHash] of [['new','t'],['s','new']])assert.throws(()=>attendanceStageDecision({checkpoint,sourceHash,targetHash}),/DRIFT/);
});
