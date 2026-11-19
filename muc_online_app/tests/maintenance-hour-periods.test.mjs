import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { MAINTENANCE_HOUR_PERIODS_SCHEMA,createMaintenanceHourPeriods } from '../maintenance-hour-periods.mjs';
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('pragma foreign_keys=on');db.exec(MAINTENANCE_HOUR_PERIODS_SCHEMA);
  const users=new Map();const actor=(id,actions)=>{const user={id,personId:`p-${id}`,active:true,all:true,permissions:actions.map(action=>`maintenance.hours.period.${action}`)};users.set(id,user);return user;};
  const admin=actor('admin',['view','assign','confirm']),owner=actor('owner',['view','confirm']),other=actor('other',['view','confirm']);
  const can=(user,permission)=>user.active && user.all && user.permissions.includes(permission);let sequence=0;
  const service=createMaintenanceHourPeriods({db,can,listAccounts:search=>[...users.values()].filter(user=>user.id.includes(search)).map(user=>({accountId:user.id,name:user.id,employeeNo:`no-${user.id}`,privatePermissions:user.permissions})),qualifiedAccount(id,permission){const user=users.get(id);return user && can(user,permission)?{accountId:id,personId:user.personId}:null;},clock:()=> '2026-11-09T00:00:00Z',randomId:prefix=>`${prefix}-${++sequence}`,
    transaction(action){db.exec('begin immediate');try{const result=action();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}});
  const assign=()=>service.assign('2026-09',{revision:0,accountId:owner.id,reason:'负责人安排'},admin);
  return {db,service,admin,owner,other,assign};
}
test('period schema matches replayable migration and absent months remain unknown',t=>{
  const f=fixture(t);const other=new DatabaseSync(':memory:');t.after(()=>other.close());
  const sql=fs.readFileSync(new URL('../migrations/039_maintenance_hour_periods.sql',import.meta.url),'utf8');other.exec(sql);other.exec(sql);
  const schema=db=>db.prepare('select name,sql from sqlite_master order by name').all();assert.deepEqual(schema(f.db),schema(other));
  assert.equal(f.service.state('2026-09').state,'UNKNOWN');
  for(const month of ['2026-13','2026-00','2026-9','1899-01','2026-09-extra'])assert.throws(()=>f.service.state(month),{status:400});
});
test('period view exposes only current nominated confirmation capability and candidate search rechecks qualification',t=>{
  const f=fixture(t);assert.equal(f.service.view('2026-09',f.admin).capabilities.confirm,false);
  f.assign();assert.equal(f.service.view('2026-09',f.admin).capabilities.confirm,false);assert.equal(f.service.view('2026-09',f.owner).capabilities.confirm,true);
  assert.throws(()=>f.service.candidates({},f.owner),{status:403});
  f.other.all=false;const candidates=f.service.candidates({},f.admin).items;
  assert.ok(candidates.some(person=>person.accountId==='owner'));assert.ok(!candidates.some(person=>person.accountId==='other'));
  assert.deepEqual(Object.keys(candidates[0]).sort(),['accountId','personId','name','employeeNo'].sort());
  assert.deepEqual(f.service.candidates({search:'owner'},f.admin).items.map(item=>item.accountId),['owner']);
  f.owner.active=false;assert.equal(f.service.view('2026-09',f.admin).capabilities.confirm,false);assert.equal(f.service.candidates({search:'owner'},f.admin).items.length,0);
});
test('only a nominated qualified responsible person can confirm, even an administrator cannot substitute',t=>{
  const f=fixture(t);f.assign();
  assert.equal(f.service.state('2026-09').state,'UNKNOWN');
  const payload={revision:1,state:'OPEN',reason:'负责人确认本月尚未封账'};
  assert.throws(()=>f.service.confirm('2026-09',payload,f.admin),{status:403});
  assert.throws(()=>f.service.confirm('2026-09',payload,f.other),{status:403});
  assert.equal(f.service.confirm('2026-09',payload,f.owner).period.state,'OPEN');
  assert.equal(f.service.state('2026-10').state,'UNKNOWN');
  assert.throws(()=>f.service.confirm('2026-09',payload,f.owner),{status:409});
});
test('scope and qualification changes revoke authority and invalid operations leave history untouched',t=>{
  const f=fixture(t);f.owner.all=false;
  assert.throws(()=>f.assign(),{status:400});f.owner.all=true;f.assign();
  f.owner.active=false;assert.throws(()=>f.service.confirm('2026-09',{revision:1,state:'OPEN',reason:'test'},f.owner),{status:403});f.owner.active=true;
  for(const change of [{reason:''},{state:'UNKNOWN'},{revision:'1'}])assert.throws(()=>f.service.confirm('2026-09',{revision:1,state:'OPEN',reason:'确认',...change},f.owner));
  assert.equal(Number(f.db.prepare('select count(*) n from maintenance_hour_period_history').get().n),1);
});
test('closed and reopened periods retain full history and replacing the owner resets confirmation to unknown',t=>{
  const f=fixture(t);f.assign();
  f.service.confirm('2026-09',{revision:1,state:'CLOSED',reason:'月末封账'},f.owner);
  f.service.confirm('2026-09',{revision:2,state:'OPEN',reason:'负责人批准重新开放并记录依据'},f.owner);
  const replaced=f.service.assign('2026-09',{revision:3,accountId:f.other.id,reason:'工作交接换负责人'},f.admin);
  assert.equal(replaced.period.state,'UNKNOWN');assert.equal(replaced.period.confirmed_at,null);
  assert.equal(replaced.history.length,4);
  assert.equal(replaced.history[1].snapshot.before.state,'CLOSED');
  assert.throws(()=>f.service.confirm('2026-09',{revision:4,state:'OPEN',reason:'旧负责人操作'},f.owner),{status:403});
});
