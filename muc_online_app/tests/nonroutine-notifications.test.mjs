import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,createNonroutineReview} from '../nonroutine-review.mjs';
import {NONROUTINE_NOTIFICATIONS_SCHEMA,createNonroutineNotifications} from '../nonroutine-notifications.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('pragma foreign_keys=on');for(const sql of [NONROUTINE_REVIEW_SCHEMA,NONROUTINE_REVIEW_SUGGESTIONS_SCHEMA,NONROUTINE_NOTIFICATIONS_SCHEMA])db.exec(sql);
  const accounts=new Map(),actor=(id,actions)=>{const user={id,personId:`p-${id}`,active:true,scope:true,permissions:actions.map(action=>`maintenance.nonroutine.review.${action}`)};accounts.set(id,user);return user;};
  const boss=actor('boss',['view','assign']),finalizer=actor('finalizer',['view','finalize']);
  const members=Array.from({length:12},(_,index)=>actor(`member-${index}`,['view','opinion.submit']));
  let sequence=0,stamp='2026-11-09T00:00:00.000Z';
  const can=(user,permission)=>user.active&&user.scope&&user.permissions.includes(permission);
  const common={db,can,qualifiedAccount(id,permission){const user=accounts.get(id);return user&&can(user,permission)?{accountId:id,personId:user.personId}:null;},clock:()=>stamp,randomId:prefix=>`${prefix}-${++sequence}`,
    transaction(action){db.exec('begin immediate');try{const value=action();db.exec('commit');return value;}catch(error){db.exec('rollback');throw error;}}};
  const review=createNonroutineReview(common),service=createNonroutineNotifications(common);
  const id=review.create({flightId:'flight',subtaskId:'task',reportBatchId:'batch',applicationRevision:1,applicantId:'applicant',snapshot:{category:'单项工作',chapter:'29',title:'检查',workScope:'左侧',requestedHours:2},participants:[{personId:'worker',role:'主做'}]});
  review.accept(id,{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id},boss);
  const time=hours=>{stamp=new Date(Date.parse('2026-11-09T00:00:00.000Z')+hours*3600000).toISOString();};
  return {db,review,service,id,members,finalizer,time,boss,actor};
}
test('scheduled inbox dispatch delivers once at assignment, 24h to outstanding members and 36/48h to finalizer only',t=>{
  const f=fixture(t);assert.equal(f.service.pump().delivered,12);assert.equal(f.service.pump().delivered,0);
  f.review.submitOpinion(f.id,{revision:0,hours:2,basis:'PRIVATE-BASIS'},f.members[0]);
  f.time(23.99);assert.equal(f.service.pump().delivered,0);
  f.time(24);assert.equal(f.service.pump().delivered,11);
  f.time(36);assert.equal(f.service.pump().delivered,1);
  const notice=f.service.list(f.finalizer)[0];assert.equal(notice.eventType,'REMINDER_36');assert.equal(notice.payload.submittedCount,1);assert.equal(notice.payload.pendingPersonIds.length,11);
  assert.ok(!JSON.stringify(notice).includes('PRIVATE-BASIS'));assert.equal(notice.payload.hours,undefined);
  f.time(48);assert.equal(f.service.pump().delivered,1);f.time(72);assert.equal(f.service.pump().delivered,0);
});
test('read and action ownership, current scope and seat replacement prevent stale or cross-account notifications',t=>{
  const f=fixture(t);f.service.pump();const first=f.service.list(f.members[0])[0];
  assert.throws(()=>f.service.markRead(first.id,f.members[1]),{status:404});
  const read=f.service.markRead(first.id,f.members[0]);assert.deepEqual(f.service.markRead(first.id,f.members[0]),read);
  const replacement=f.actor('replacement',['view','opinion.submit']);
  f.review.replaceUnsubmittedSeat(f.id,{revision:2,personId:f.members[2].personId,accountId:replacement.id,reason:'人工替换未提交席位'},f.boss);
  assert.equal(f.service.list(f.members[2]).length,0);
  assert.equal(f.service.pump().delivered,1);assert.equal(f.service.list(replacement).length,1);
  f.members[0].scope=false;assert.equal(f.service.list(f.members[0]).length,0);
  assert.throws(()=>f.service.markRead(first.id,f.members[0]),{status:404});
  f.members[1].active=false;f.time(24);f.service.pump();
  assert.equal(f.db.prepare("select state from maintenance_nonroutine_review_outbox where event_type='REMINDER_24' and recipient_account_id=?").get(f.members[1].id).state,'CANCELLED');
});
test('terminal cases stop outstanding reminders and notification inserts roll back with their outbox receipts',t=>{
  const f=fixture(t);
  f.db.exec("create trigger fail_notification before insert on maintenance_nonroutine_review_notifications begin select raise(abort,'injected notification failure'); end");
  assert.throws(()=>f.service.pump(),/injected/);assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_review_notifications').get().n,0);
  assert.equal(f.db.prepare("select count(*) n from maintenance_nonroutine_review_outbox where state='SENT'").get().n,0);
  f.db.exec('drop trigger fail_notification');assert.equal(f.service.pump().delivered,12);
  f.db.prepare("update maintenance_nonroutine_review_cases set state='FINALIZED' where id=?").run(f.id);f.time(48);
  assert.equal(f.service.pump().delivered,0);assert.equal(f.service.list(f.members[0]).length,0);
  assert.equal(f.db.prepare("select count(*) n from maintenance_nonroutine_review_outbox where state='PENDING'").get().n,0);
  const sql=fs.readFileSync(new URL('../migrations/044_nonroutine_notifications.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);
  assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_review_notifications').get().n,12);
});
test('finalizer inbox reprojects current progress after later opinions and never trusts stored payload fields',t=>{
  const f=fixture(t);f.time(36);f.service.pump();
  f.db.prepare("update maintenance_nonroutine_review_notifications set payload_json=? where recipient_account_id=?").run(JSON.stringify({hours:99,basis:'PRIVATE-INJECTED',submittedCount:99}),f.finalizer.id);
  f.review.submitOpinion(f.id,{revision:0,hours:0,basis:'PRIVATE-LATER'},f.members[0]);
  const notice=f.service.list(f.finalizer)[0];assert.equal(notice.payload.submittedCount,1);assert.equal(notice.payload.pendingPeople.length,11);
  assert.ok(!notice.payload.pendingPersonIds.includes(f.members[0].personId));assert.ok(!JSON.stringify(notice).includes('PRIVATE'));
  for(const member of f.members.slice(1))f.review.submitOpinion(f.id,{revision:0,hours:2,basis:'完成核对'},member);
  const sealed=f.service.list(f.finalizer)[0];assert.equal(sealed.payload.submittedCount,12);assert.equal(sealed.payload.awaitingFinalization,true);assert.deepEqual(sealed.payload.pendingPeople,[]);
  assert.equal(f.service.list(f.members[0]).length,0);
});
