import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { NONROUTINE_REVIEW_SCHEMA } from '../nonroutine-review.mjs';
import { NONROUTINE_ASSESSMENT_SCHEMA } from '../nonroutine-assessment.mjs';

test('assessment and reserved-channel migration agrees with initialization and forbids duplicate or unsourced delivery', t => {
  const db = new DatabaseSync(':memory:');const migrated=new DatabaseSync(':memory:');
  t.after(()=>{db.close();migrated.close();});
  for(const instance of [db,migrated]){instance.exec('pragma foreign_keys=on');instance.exec(NONROUTINE_REVIEW_SCHEMA);}
  db.exec(NONROUTINE_ASSESSMENT_SCHEMA);
  const sql=fs.readFileSync(new URL('../migrations/043_nonroutine_assessment.sql',import.meta.url),'utf8');
  migrated.exec(sql);migrated.exec(sql);
  const schema=database=>database.prepare('select name,sql from sqlite_master order by name').all();
  assert.deepEqual(schema(db),schema(migrated));
  db.exec(`insert into maintenance_nonroutine_review_cases(id,flight_id,subtask_id,report_batch_id,application_revision,application_json,participants_json,applicant_account_id,state,created_at,updated_at)
    values('case-one','flight-one','task-one','batch-one',1,'{}','[]','applicant','PENDING_ACCEPTANCE','t','t')`);
  const channel=db.prepare("insert into maintenance_nonroutine_review_channels(id,case_id,subtask_id,state,created_at,updated_at) values(?,?,?,'WAITING_REVIEW','t','t')");
  channel.run('channel-one','case-one','task-one');
  assert.throws(()=>channel.run('channel-two','case-one','task-one'));
  assert.throws(()=>channel.run('channel-three','unknown-case','task-two'));
  const assessment=db.prepare("insert into maintenance_nonroutine_assessments(subtask_id,flight_id,report_batch_id,source_kind,source_fingerprint,application_json,participants_json,policy_json,review_case_id,effective_hours,created_at) values(?,'flight-one','batch-one','REVIEW',?,'{}','[]','{}',?,?,'t')");
  assessment.run('task-one','source-one','case-one',null);
  assert.throws(()=>assessment.run('task-one','source-two','case-one',null));
  assert.throws(()=>assessment.run('task-two','source-one','case-one',null));
  assert.throws(()=>assessment.run('task-two','source-two',null,null));
  assert.throws(()=>assessment.run('task-two','source-two','case-one',-1));
});
