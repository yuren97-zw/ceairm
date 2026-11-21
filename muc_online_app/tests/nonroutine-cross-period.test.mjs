import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {NONROUTINE_CROSS_PERIOD_SCHEMA,NONROUTINE_POSTING_RECEIPTS_SCHEMA,createNonroutineCrossPeriod} from '../nonroutine-cross-period.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("pragma foreign_keys=on;create table maintenance_nonroutine_review_cases(id text primary key,application_json text default '{}',state text default 'FINALIZED');insert into maintenance_nonroutine_review_cases(id) values('case');create table maintenance_nonroutine_review_channels(id text primary key,state text,approved_revision integer);insert into maintenance_nonroutine_review_channels values('channel','NEEDS_ATTENTION',1);");db.exec(NONROUTINE_CROSS_PERIOD_SCHEMA);
  const owner={id:'owner',personId:'person-owner',active:true,all:true},admin={id:'admin',personId:'person-admin',active:true,all:true};
  const people=new Map([[owner.id,owner],[admin.id,admin]]);
  const periods=new Map([['2026-09',{month:'2026-09',state:'CLOSED',revision:3,responsible_account_id:owner.id,responsible_person_id:owner.personId}],['2026-10',{month:'2026-10',state:'OPEN',revision:2}]]);
  let seq=0;
  const service=createNonroutineCrossPeriod({db,can:user=>user.active&&user.all,qualifiedAccount:id=>{const user=people.get(id);return user?.active&&user.all?{accountId:id,personId:user.personId}:null;},periodState:month=>{if(!periods.has(month))throw Object.assign(new Error('invalid month'),{status:400});return periods.get(month);},clock:()=> '2026-11-09T00:00:00Z',randomId:prefix=>`${prefix}-${++seq}`,
    transaction(action){db.exec('begin immediate');try{const result=action();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}});
  const source=periods.get('2026-09'),item={id:'case'},final={approved_revision:1},channel={id:'channel'};
  const ensure=()=>service.ensure(item,final,channel,source);
  const payload={revision:1,targetMonth:'2026-10',sourceRevision:3,targetRevision:2,reason:'原账期负责人批准在目标开放月份处理'};
  return {db,service,owner,admin,periods,source,ensure,payload};
}
test('cross-period source is uniquely reserved and original closed-period snapshot never changes',t=>{
  const f=fixture(t);const first=f.ensure();assert.equal(first.state,'PENDING_AUTHORIZATION');
  f.source.revision=4;assert.deepEqual(f.ensure(),first);
  assert.equal(JSON.parse(f.ensure().source_period_json).revision,3);
  const sql=fs.readFileSync(new URL('../migrations/048_nonroutine_cross_period.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);
  assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_cross_period_tasks').get().n,1);
});
test('month task list exposes no private application data and authorization capability follows current owner and effective authorization',t=>{
  const f=fixture(t),task=f.ensure();
  f.db.prepare('update maintenance_nonroutine_review_cases set application_json=?').run(JSON.stringify({title:'检查标题',hours:99,basis:'PRIVATE-CANARY'}));
  const listed=f.service.list({month:'2026-09'},f.owner);assert.equal(listed.items.length,1);assert.equal(listed.items[0].title,'检查标题');assert.ok(!JSON.stringify(listed).includes('PRIVATE'));
  assert.equal(f.service.list({month:'2026-10'},f.owner).items.length,0);
  assert.equal(f.service.view(task.id,f.admin).capabilities.authorize,false);assert.equal(f.service.view(task.id,f.owner).capabilities.authorize,true);
  f.owner.all=false;assert.throws(()=>f.service.list({month:'2026-09'},f.owner),{status:403});f.owner.all=true;
  const authorized=f.service.authorize(task.id,f.payload,f.owner);assert.equal(authorized.authorization.ok,true);assert.equal(authorized.capabilities.authorize,false);
  f.periods.get('2026-10').revision++;assert.equal(f.service.view(task.id,f.owner).capabilities.authorize,true);
  f.source.responsible_account_id='admin';f.source.responsible_person_id='person-admin';assert.equal(f.service.view(task.id,f.owner).capabilities.authorize,false);
});
test('only current source-period responsible person can authorize and both period revisions must match',t=>{
  const f=fixture(t),task=f.ensure();
  assert.throws(()=>f.service.authorize(task.id,f.payload,f.admin),{status:403});
  assert.throws(()=>f.service.authorize(task.id,{...f.payload,targetRevision:1},f.owner),{status:409});
  assert.throws(()=>f.service.authorize(task.id,{...f.payload,reason:''},f.owner),{status:400});
  f.owner.all=false;assert.throws(()=>f.service.authorize(task.id,f.payload,f.owner),{status:403});f.owner.all=true;
  const authorized=f.service.authorize(task.id,f.payload,f.owner);
  assert.equal(authorized.task.state,'AUTHORIZED');assert.equal(authorized.task.target_month,'2026-10');
  assert.equal(authorized.history.length,1);assert.equal(authorized.history[0].authorization.sourcePeriod.revision,3);
  assert.throws(()=>f.service.authorize(task.id,{...f.payload,revision:2},f.owner),{status:409});
});
test('closed target and consumed channel reject authorization without writing history',t=>{
  const f=fixture(t),task=f.ensure();f.periods.get('2026-10').state='CLOSED';
  assert.throws(()=>f.service.authorize(task.id,f.payload,f.owner),{status:409});f.periods.get('2026-10').state='OPEN';
  f.db.prepare("update maintenance_nonroutine_review_channels set state='ADJUSTED_CLOSED'").run();
  assert.throws(()=>f.service.authorize(task.id,f.payload,f.owner),{status:409});
  assert.equal(f.db.prepare('select count(*) n from maintenance_nonroutine_cross_period_history').get().n,0);
});
test('successful original-period delivery resolves only pending authorization, with a separate history record',t=>{
  const f=fixture(t),task=f.ensure();f.source.state='OPEN';f.source.revision=4;
  f.service.resolveReopened('case','finalizer',f.source);
  const result=f.service.view(task.id,f.owner);assert.equal(result.task.state,'RESOLVED_SOURCE_REOPENED');
  assert.equal(result.history[0].authorization.resolution,'SOURCE_REOPENED');
  assert.equal(JSON.parse(result.task.source_period_json).state,'CLOSED');
  f.service.resolveReopened('case','finalizer',f.source);assert.equal(f.service.view(task.id,f.owner).history.length,1);
});

test('delivery rechecks authorization revisions and current responsible identity before completing the original task',t=>{
  const f=fixture(t);const task=f.ensure();f.service.authorize(task.id,f.payload,f.owner);
  const authorized=f.service.view(task.id,f.owner).task;
  assert.equal(f.service.deliveryAuthorization(authorized,f.source).ok,true);
  f.periods.get('2026-10').revision=3;
  assert.equal(f.service.deliveryAuthorization(authorized,f.source).code,'CROSS_PERIOD_AUTHORIZATION_STALE');
  const reauthorized=f.service.authorize(task.id,{...f.payload,revision:2,targetRevision:3,reason:'目标版本变更后重新核对'},f.owner).task;
  f.owner.active=false;assert.equal(f.service.deliveryAuthorization(reauthorized,f.source).code,'CROSS_PERIOD_AUTHORIZER_UNAVAILABLE');f.owner.active=true;
  f.service.complete(reauthorized,'finalizer',{workMonth:'2026-09',handlingMonth:'2026-10',statisticalMonth:'2026-09',policy:'ORIGINAL_WORK_MONTH'});
  assert.equal(f.service.view(task.id,f.owner).task.state,'COMPLETED');
  assert.equal(f.service.view(task.id,f.owner).history.length,3);
});

test('posting receipt migration retains separate handling period and cannot classify work into the handling month',t=>{
  const f=fixture(t);f.ensure();f.db.exec(NONROUTINE_POSTING_RECEIPTS_SCHEMA);
  const sql=fs.readFileSync(new URL('../migrations/050_nonroutine_posting_receipts.sql',import.meta.url),'utf8');f.db.exec(sql);f.db.exec(sql);
  const insert=f.db.prepare("insert into maintenance_nonroutine_posting_receipts(channel_id,case_id,approved_revision,work_month,handling_month,statistical_month,policy,period_snapshot_json,created_at) values('channel','case',1,'2026-09','2026-10',?,'ORIGINAL_WORK_MONTH','{}','t')");
  assert.throws(()=>insert.run('2026-10'));
  insert.run('2026-09');assert.throws(()=>insert.run('2026-09'));
  assert.equal(f.db.prepare('select handling_month from maintenance_nonroutine_posting_receipts').get().handling_month,'2026-10');
});
test('cancelled review or channel overrides pending and authorized display while preserving all original authorization history',t=>{
 for(const authorized of [false,true])for(const source of ['case','channel']){
  const f=fixture(t),task=f.ensure();if(authorized)f.service.authorize(task.id,f.payload,f.owner);
  const raw=f.db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(task.id),history=f.db.prepare('select * from maintenance_nonroutine_cross_period_history').all();
  f.db.exec(source==='case'?"update maintenance_nonroutine_review_cases set state='CANCELLED'":"update maintenance_nonroutine_review_channels set state='CANCELLED_CLOSED'");
  const view=f.service.view(task.id,f.owner);assert.equal(view.task.state,'CANCELLED');assert.equal(view.task.recordedState,raw.state);assert.equal(view.authorization.code,'REVIEW_CANCELLED');assert.equal(view.capabilities.authorize,false);
  assert.equal(f.service.list({month:'2026-09'},f.owner).items[0].state,'CANCELLED');
  assert.equal(f.service.deliveryAuthorization(raw,f.source).code,'REVIEW_CANCELLED');
  assert.throws(()=>f.service.authorize(task.id,{...f.payload,revision:Number(raw.revision)},f.owner),{status:409});
  assert.throws(()=>f.service.complete(raw,'finalizer',{}),{status:409});
  assert.throws(()=>f.ensure(),{status:409});
  if(!authorized){f.source.state='OPEN';assert.throws(()=>f.service.resolveReopened('case','finalizer',f.source),{status:409});}
  assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_cross_period_tasks where id=?').get(task.id),raw);assert.deepEqual(f.db.prepare('select * from maintenance_nonroutine_cross_period_history').all(),history);
 }
});
