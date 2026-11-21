import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import {MAINTENANCE_MODULE_INSTANCES_SCHEMA,createMaintenanceModuleInstances,readMaintenanceModuleIdentity,readPersistedMaintenanceReportModules} from '../maintenance-module-instances.mjs';
const fixture=t=>{
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());
 db.exec("pragma foreign_keys=on;create table maintenance_flights(id text primary key);insert into maintenance_flights values('new'),('old');");
 db.exec(MAINTENANCE_MODULE_INSTANCES_SCHEMA);
 const create=id=>createMaintenanceModuleInstances({db,opportunityId:id,actorId:'creator',stamp:'2026-11-11T00:00:00Z'});
 return {db,create};
};
const progress={batches:{release:{id:'release',status:'已提报',version:3}},hasRoutine:true,hasFormalNonroutine:false,hasNonroutineDraft:false};
test('module identity migration is additive, replayable and matches the runtime schema',async t=>{
 const {db}=fixture(t);const sql=await fs.readFile(new URL('../migrations/059_maintenance_module_instances.sql',import.meta.url),'utf8');
 assert.equal(MAINTENANCE_MODULE_INSTANCES_SCHEMA,sql);db.exec(sql);db.exec(sql);
 assert.equal(db.prepare('select count(*) n from maintenance_flights').get().n,2);
 assert.equal(db.prepare('select count(*) n from maintenance_module_instances').get().n,0);
});
test('new opportunity identity freezes three original modules, is idempotent and never backfills old records',t=>{
 const {db,create}=fixture(t);const first=create('new');assert.equal(first.instances.length,3);
 assert.deepEqual(create('new'),first);assert.equal(readMaintenanceModuleIdentity(db,'old'),null);
 assert.equal(db.prepare('select count(*) n from maintenance_module_definitions').get().n,3);
 assert.equal(db.prepare('select count(*) n from maintenance_gate_rule_versions').get().n,1);
 const before=db.prepare('select * from maintenance_module_instances order by id').all();
 const projected=readPersistedMaintenanceReportModules(db,'new',progress);
 assert.ok(projected.every(row=>row.identitySource==='PERSISTED'&&row.ruleSnapshotSha256===first.ruleSnapshotSha256));
 assert.equal(projected.find(row=>row.moduleTypeCode==='release_report').resultSource.type,'RELEASE_COUNT');
 assert.equal(projected.find(row=>row.moduleTypeCode==='routine_report').moduleBusinessState,'PENDING');
 const submitted=readPersistedMaintenanceReportModules(db,'new',{...progress,batches:{...progress.batches,routine:{id:'routine',status:'已提报',version:2}}});
 assert.equal(submitted.find(row=>row.moduleTypeCode==='routine_report').resultSource.category,'ROUTINE');
 assert.deepEqual(db.prepare('select * from maintenance_module_instances order by id').all(),before);
 assert.ok(readPersistedMaintenanceReportModules(db,'old',progress).every(row=>row.identitySource==='LEGACY_ADAPTER'));
 assert.equal(db.prepare('select count(*) n from maintenance_opportunity_rule_snapshots').get().n,1);
});
test('unrelated future rule rows cannot change an in-flight snapshot or adapter output',t=>{
 const {db,create}=fixture(t);const first=create('new'),before=readPersistedMaintenanceReportModules(db,'new',progress);
 db.prepare('insert into maintenance_gate_rule_versions values(?,?,?,?)').run('future-v2','{}','future-hash','future');
 assert.deepEqual(readMaintenanceModuleIdentity(db,'new'),first);
 assert.deepEqual(readPersistedMaintenanceReportModules(db,'new',progress),before);
});
test('authorized source deletion keeps module identities and original opportunity keys as detached audit facts',t=>{
 const {db,create}=fixture(t);create('new');db.prepare('delete from maintenance_flights where id=?').run('new');
 const snapshot=db.prepare('select * from maintenance_opportunity_rule_snapshots').get();assert.equal(snapshot.opportunity_id,null);assert.equal(snapshot.opportunity_key,'new');
 const instances=db.prepare('select * from maintenance_module_instances').all();assert.equal(instances.length,3);assert.ok(instances.every(row=>row.opportunity_id===null&&row.opportunity_key==='new'));
 assert.throws(()=>readMaintenanceModuleIdentity(db,'new'),{status:409});
 assert.throws(()=>create('missing'),{status:409});
});
test('tampered rules, definitions, missing instances and unsupported snapshots fail closed without repair writes',t=>{
 for(const sql of ["update maintenance_gate_rule_versions set rules_json='{}'", "update maintenance_module_definitions set content_sha256='bad'", "delete from maintenance_module_instances where module_code='routine_report'", "update maintenance_opportunity_rule_snapshots set snapshot_json='{}'"]){
  const {db,create}=fixture(t);create('new');db.exec(sql);
  assert.throws(()=>readPersistedMaintenanceReportModules(db,'new',progress),{status:409});
  assert.throws(()=>create('new'),{status:409});
 }
});
test('failure in the caller transaction rolls back the opportunity, registry and snapshots together',t=>{
 const {db,create}=fixture(t);db.exec('begin');
 db.prepare('insert into maintenance_flights values(?)').run('rollback');create('rollback');db.exec('rollback');
 assert.equal(db.prepare('select count(*) n from maintenance_flights').get().n,2);
 for(const table of ['maintenance_module_definitions','maintenance_gate_rule_versions','maintenance_module_instances','maintenance_opportunity_rule_snapshots'])assert.equal(db.prepare('select count(*) n from '+table).get().n,0);
});
