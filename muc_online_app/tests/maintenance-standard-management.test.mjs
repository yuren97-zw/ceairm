import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_STANDARDS_SCHEMA,createMaintenanceStandards} from '../maintenance-standards.mjs';
import {STANDARD_MANAGEMENT_SCHEMA,createStandardManagement} from '../maintenance-standard-management.mjs';
const definition={category:'单项工作',chapter:'29',title:'检查',workScope:'左侧管路',standardHours:0,aircraftCodes:['a320','A320'],genericAircraft:false};
function fixture(t){
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec('pragma foreign_keys=on');db.exec(MAINTENANCE_STANDARDS_SCHEMA);db.exec(STANDARD_MANAGEMENT_SCHEMA);let seq=0;
  const admin={id:'admin',active:true,all:true,final:true},editor={id:'editor',active:true,all:true};
  const service=createStandardManagement({referenceSnapshot:()=>({available:true,byVersion:new Map(),byStandard:new Map()}),db,can:(user,permission)=>user.active&&user.all&&(permission!=='maintenance.nonroutine.review.finalize'||user.final),clock:()=> '2026-11-10T00:00:00Z',randomId:prefix=>`${prefix}-${++seq}`,transaction(action){db.exec('begin immediate');try{const result=action();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}});
  const create=(overrides={})=>service.create({clientId:'create-1',reason:'规范草稿',definition,...overrides},admin);
  const published=()=>{const r=create(),id=r.standard.id;db.prepare("update maintenance_standards set status='PUBLISHED' where id=?").run(id);db.prepare("update maintenance_standard_versions set status='PUBLISHED',admission_decision='INCLUDE',published_by='publisher',published_at='2026-11-01',effective_at='2026-11-01' where standard_id=?").run(id);return service.view(id,admin);};
  return {db,service,admin,editor,create,published};
}
test('management migration matches additive schema and create retries keep one draft and one audit',t=>{
  const f=fixture(t),other=new DatabaseSync(':memory:');t.after(()=>other.close());other.exec(MAINTENANCE_STANDARDS_SCHEMA);const sql=fs.readFileSync(new URL('../migrations/050_maintenance_standard_management.sql',import.meta.url),'utf8');other.exec(sql);other.exec(sql);
  const schema=db=>db.prepare('select name,sql from sqlite_master order by name').all();assert.deepEqual(schema(f.db),schema(other));
  const first=f.create(),again=f.create();assert.equal(again.standard.id,first.standard.id);assert.equal(again.operation.replayed,true);assert.equal(again.history.length,1);
  assert.equal(first.versions[0].standard_hours,0);assert.deepEqual(first.versions[0].aircraftCodes,['A320']);assert.equal(first.versions[0].admission_decision,'PENDING');
  assert.equal(createMaintenanceStandards({db:f.db}).list({aircraftCode:'A320'}).items.length,0);
  assert.throws(()=>f.create({reason:'不同内容'}),{status:409});
});
test('draft updates use revisions and cannot inject admission, publication or review linkage',t=>{
  const f=fixture(t),r=f.create(),id=r.standard.id,versionId=r.versions[0].id;
  const body={clientId:'update-1',revision:1,versionId,reason:'完善范围',definition:{...definition,workScope:'右侧'}};
  const updated=f.service.update(id,body,f.admin);assert.equal(updated.standard.revision,2);assert.equal(updated.versions[0].work_scope,'右侧');assert.equal(f.service.update(id,body,f.admin).operation.replayed,true);
  assert.throws(()=>f.service.update(id,{...body,clientId:'update-stale'},f.admin),{status:409});
  for(const changes of [{standardHours:''},{standardHours:0.11},{standardHours:null},{aircraftCodes:['A32*']},{genericAircraft:false,aircraftCodes:[]},{admission_decision:'INCLUDE'}])assert.throws(()=>f.create({clientId:`invalid-${JSON.stringify(changes)}`,definition:{...definition,...changes}}));
  assert.throws(()=>f.service.update(id,{...body,revision:2,clientId:'inject',published_by:'admin'},f.admin),{status:400});
});
test('published definitions remain immutable and only final-review permission starts a separate pending version',t=>{
  const f=fixture(t),r=f.published(),id=r.standard.id,before=f.db.prepare('select * from maintenance_standard_versions where id=?').get(r.versions[0].id);
  assert.throws(()=>f.service.update(id,{clientId:'bad-update',revision:1,versionId:r.versions[0].id,reason:'直接改',definition},f.admin),{status:409});
  const body={clientId:'new-version',revision:1,baseVersion:1,reason:'发起工时修订草稿',definition:{...definition,standardHours:1.2}};
  assert.throws(()=>f.service.revise(id,body,f.editor),{status:403});
  const next=f.service.revise(id,body,f.admin);assert.equal(next.versions[0].version,2);assert.equal(next.versions[0].status,'DRAFT');assert.equal(next.versions[0].review_final_id,null);assert.deepEqual(f.db.prepare('select * from maintenance_standard_versions where id=?').get(r.versions[0].id),before);assert.equal(next.versions[1].capabilities.revise,false);
  assert.equal(next.history[0].snapshot.request.baseVersion,1);assert.equal(next.history[0].snapshot.request.id,id);
  const current=createMaintenanceStandards({db:f.db,clock:()=> '2026-11-10'}).list({aircraftCode:'A320'}).items;assert.equal(current[0].version,1);assert.equal(current[0].standardHours,0);
  assert.throws(()=>f.service.revise(id,{...body,revision:2,clientId:'duplicate-version'},f.admin),{status:409});
});
test('withdrawal and disabling retain version history and cannot mutate old definitions or resume stopped standards',t=>{
  const f=fixture(t),draft=f.create();const withdrawn=f.service.withdraw(draft.standard.id,{clientId:'withdraw',revision:1,versionId:draft.versions[0].id,reason:'撤回草稿'},f.admin);
  assert.equal(withdrawn.standard.status,'DISABLED');assert.equal(withdrawn.versions[0].status,'WITHDRAWN');assert.equal(withdrawn.history.length,2);
  assert.throws(()=>f.service.update(draft.standard.id,{clientId:'after-withdraw',revision:2,versionId:draft.versions[0].id,reason:'恢复修改',definition},f.admin),{status:409});
  const pub=f.create({clientId:'second'});f.db.prepare("update maintenance_standards set status='PUBLISHED' where id=?").run(pub.standard.id);f.db.prepare("update maintenance_standard_versions set status='PUBLISHED' where standard_id=?").run(pub.standard.id);
  const before=f.db.prepare('select * from maintenance_standard_versions where standard_id=? order by version').all(pub.standard.id);
  const disabled=f.service.disable(pub.standard.id,{clientId:'disable',revision:1,versionId:pub.versions[0].id,reason:'停止新引用'},f.admin);assert.deepEqual(f.db.prepare('select * from maintenance_standard_versions where standard_id=? order by version').all(pub.standard.id),before);assert.equal(disabled.versions[0].capabilities.disable,false);assert.equal(disabled.standard.status,'DISABLED');
});
test('scope loss and audit failures leave no partial standard mutations',t=>{
  const f=fixture(t);f.admin.all=false;assert.throws(()=>f.create(),{status:403});f.admin.all=true;
  f.db.exec("create trigger fail_audit before insert on maintenance_standard_management_events begin select raise(abort,'audit failure'); end");assert.throws(()=>f.create(),/audit failure/);
  assert.equal(f.db.prepare('select count(*) n from maintenance_standards').get().n,0);assert.equal(f.db.prepare('select count(*) n from maintenance_standard_versions').get().n,0);
});
