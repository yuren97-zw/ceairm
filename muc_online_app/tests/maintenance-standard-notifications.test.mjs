import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_STANDARDS_SCHEMA} from '../maintenance-standards.mjs';
import {STANDARD_MANAGEMENT_SCHEMA,createStandardManagement} from '../maintenance-standard-management.mjs';
import {STANDARD_REVIEW_SCHEMA,createStandardReview} from '../maintenance-standard-review.mjs';
import {STANDARD_NOTIFICATIONS_SCHEMA,createStandardNotifications} from '../maintenance-standard-notifications.mjs';
import {NONROUTINE_REVIEW_SCHEMA} from '../nonroutine-review.mjs';
import {NONROUTINE_NOTIFICATIONS_SCHEMA} from '../nonroutine-notifications.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('pragma foreign_keys=on');for(const schema of [MAINTENANCE_STANDARDS_SCHEMA,STANDARD_MANAGEMENT_SCHEMA,STANDARD_REVIEW_SCHEMA,STANDARD_NOTIFICATIONS_SCHEMA,NONROUTINE_REVIEW_SCHEMA,NONROUTINE_NOTIFICATIONS_SCHEMA])db.exec(schema);
  let sequence=0,stamp='2026-11-10T00:00:00.000Z';const accounts=new Map(),p=action=>`maintenance.nonroutine.review.${action}`;
  const actor=(id,permissions)=>{const user={id,personId:`person-${id}`,active:true,scope:true,permissions};accounts.set(id,user);return user;};
  const boss=actor('boss',['maintenance.standard.manage',p('view'),p('assign')]),finalizer=actor('finalizer',[p('view'),p('finalize')]);
  const members=Array.from({length:12},(_,index)=>actor(`member-${index}`,[p('view'),p('opinion.submit')]));
  const can=(user,permission)=>Boolean(user?.active&&user.scope&&user.permissions.includes(permission));
  const common={referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),db,can,qualifiedAccount(id,permission){const user=accounts.get(id);return can(user,permission)?{accountId:id,personId:user.personId,personName:id,employeeNo:`no-${id}`}:null;},clock:()=>stamp,randomId:prefix=>`${prefix}-${++sequence}`,transaction(fn){db.exec('begin immediate');try{const result=fn();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}};
  const management=createStandardManagement(common),review=createStandardReview(common),service=createStandardNotifications(common);
  const draft=management.create({clientId:'create-standard',reason:'建立标准',definition:{category:'单项工作',chapter:'29',title:'独立标准提醒',workScope:'左侧',standardHours:0,aircraftCodes:['A320'],genericAircraft:false}},boss);
  const id=review.request(draft.standard.id,{clientId:'request-standard',revision:1,versionId:draft.versions[0].id,reason:'申请12人评议'},boss).review.id;
  const accept=()=>review.accept(id,{revision:1,accountIds:members.map(user=>user.id),finalizerAccountId:finalizer.id},boss);
  const time=hours=>{stamp=new Date(Date.parse('2026-11-10T00:00:00.000Z')+hours*3600000).toISOString();};
  return {db,review,service,id,members,finalizer,time,boss,actor,accept};
}
test('standard notifications begin at manual acceptance and deliver once at 0/24/36/48 without work inbox rows or private opinions',t=>{
  const f=fixture(t);assert.deepEqual(f.service.pump(),{delivered:0,cancelled:0});f.time(10);f.accept();assert.equal(f.service.pump().delivered,12);assert.equal(f.service.pump().delivered,0);
  f.review.submitOpinion(f.id,{revision:0,hours:0,basis:'PRIVATE-STANDARD-NOTICE'},f.members[0]);
  f.time(33.99);assert.equal(f.service.pump().delivered,0);f.time(34);assert.equal(f.service.pump().delivered,11);assert.equal(f.service.list(f.members[0]).length,0);
  f.time(46);assert.equal(f.service.pump().delivered,1);const notice=f.service.list(f.finalizer)[0];assert.equal(notice.eventType,'REMINDER_36');assert.equal(notice.payload.title,'标准评议协调及终审提醒');assert.equal(notice.payload.submittedCount,1);assert.equal(notice.payload.pendingPeople.length,11);assert.ok(!JSON.stringify(notice).includes('PRIVATE'));assert.equal(notice.payload.hours,undefined);
  f.time(58);assert.equal(f.service.pump().delivered,1);f.time(82);assert.equal(f.service.pump().delivered,0);assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where event_type='REMINDER_72'").get().n,0);
  for(const table of ['maintenance_nonroutine_review_cases','maintenance_nonroutine_review_outbox','maintenance_nonroutine_review_notifications'])assert.equal(f.db.prepare(`select count(*) n from ${table}`).get().n,0);
  const sql=fs.readFileSync(new URL('../migrations/054_maintenance_standard_notifications.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_review_notifications').get().n,25);
});
test('standard inbox rechecks recipient, current seat, qualification and scope before read or dispatch',t=>{
  const f=fixture(t);f.accept();f.service.pump();const first=f.service.list(f.members[0])[0];assert.equal(first.payload.title,'新增标准评议任务');assert.throws(()=>f.service.markRead(first.id,f.members[1]),{status:404});assert.deepEqual(f.service.markRead(first.id,f.members[0]),f.service.markRead(first.id,f.members[0]));
  const replacement=f.actor('replacement',['view','opinion.submit'].map(action=>`maintenance.nonroutine.review.${action}`));f.time(23);f.review.replaceUnsubmittedSeat(f.id,{revision:2,personId:f.members[2].personId,accountId:replacement.id,reason:'人工更换'},f.boss);assert.equal(f.service.list(f.members[2]).length,0);assert.equal(f.service.pump().delivered,1);assert.equal(f.service.list(replacement).length,1);
  f.members[0].scope=false;assert.equal(f.service.list(f.members[0]).length,0);assert.throws(()=>f.service.markRead(first.id,f.members[0]),{status:404});f.members[1].active=false;f.time(24);f.service.pump();assert.equal(f.db.prepare("select state from maintenance_standard_review_outbox where event_type='REMINDER_24' and recipient_account_id=?").get(f.members[1].id).state,'CANCELLED');assert.ok(f.service.list(replacement).some(item=>item.eventType==='REMINDER_24'));
});
test('standard sealing and finalization hide stale member tasks and cancel pending reminders; inbox never trusts persisted private fields',t=>{
  const f=fixture(t);f.accept();f.service.pump();f.time(36);f.service.pump();f.db.prepare('update maintenance_standard_review_notifications set payload_json=? where recipient_account_id=?').run(JSON.stringify({hours:99,basis:'PRIVATE-INJECTED',submittedCount:99}),f.finalizer.id);
  for(const member of f.members)f.review.submitOpinion(f.id,{revision:0,hours:0,basis:'PRIVATE-SEALED'},member);
  const notice=f.service.list(f.finalizer)[0];assert.equal(notice.payload.submittedCount,12);assert.equal(notice.payload.awaitingFinalization,true);assert.deepEqual(notice.payload.pendingPeople,[]);assert.ok(!JSON.stringify(notice).includes('PRIVATE'));assert.equal(f.service.list(f.members[0]).length,0);
  f.review.finalize(f.id,{revision:3,decision:{category:'单项工作',chapter:'29',title:'独立标准提醒',workScope:'左侧',recognizedHours:0},admissionDecision:'PENDING',reason:''},f.finalizer);assert.equal(f.service.list(f.finalizer).length,0);assert.throws(()=>f.service.markRead(notice.id,f.finalizer),{status:404});f.time(48);assert.equal(f.service.pump().delivered,0);assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where state='PENDING'").get().n,0);
});
test('standard delivery and receipt are one transaction, and migration enforces a unique independent outbox receipt',t=>{
  const f=fixture(t);f.accept();f.db.exec("create trigger fail_standard_notification before insert on maintenance_standard_review_notifications begin select raise(abort,'injected standard inbox failure'); end");assert.throws(()=>f.service.pump(),/injected standard inbox failure/);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_review_notifications').get().n,0);assert.equal(f.db.prepare("select count(*) n from maintenance_standard_review_outbox where state='SENT'").get().n,0);f.db.exec('drop trigger fail_standard_notification');assert.equal(f.service.pump().delivered,12);assert.equal(f.service.pump().delivered,0);
  const row=f.db.prepare('select * from maintenance_standard_review_notifications limit 1').get();assert.throws(()=>f.db.prepare('insert into maintenance_standard_review_notifications(id,outbox_id,case_id,recipient_account_id,event_type,payload_json,created_at) values(?,?,?,?,?,?,?)').run('duplicate-receipt',row.outbox_id,row.case_id,row.recipient_account_id,row.event_type,'{}',row.created_at),/UNIQUE/);
});
