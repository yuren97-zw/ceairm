import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {MAINTENANCE_RULE_HISTORY_SCHEMA,createMaintenanceRuleHistory} from '../maintenance-rule-history.mjs';
function fixture(t){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());db.exec("create table maintenance_hour_rules(rule_type text,name text,value real,unique(rule_type,name));insert into maintenance_hour_rules values('nonroutineCombinationRatio','主做::主做',1),('nonroutineCategoryHours','拖机',3)");db.exec(MAINTENANCE_RULE_HISTORY_SCHEMA);let seq=0;
 const service=createMaintenanceRuleHistory({db,clock:()=> '2026-11-13T05:00:00Z',randomId:prefix=>`${prefix}-${++seq}`}),actor={id:'manager',personId:'person-manager'},qualification={accountId:actor.id,personId:actor.personId,permissions:['PRIVATE-QUALIFICATION']};
 function tx(action){db.exec('begin immediate');try{const result=action();db.exec('commit');return result;}catch(error){db.exec('rollback');throw error;}}
 function change(value,expected=service.state(),after=()=>{}){return tx(()=>{const before=service.begin(expected);db.prepare("update maintenance_hour_rules set value=? where name='拖机'").run(value);const result=service.record(before,{actor,qualification,reason:'原授权规则变更'});after();return result;});}
 return {db,service,actor,qualification,tx,change};
}
test('rule history migration matches runtime, is replayable and reads never fabricate past versions',t=>{
 const f=fixture(t);f.db.exec(fs.readFileSync(new URL('../migrations/055_maintenance_rule_history.sql',import.meta.url),'utf8'));f.db.exec(MAINTENANCE_RULE_HISTORY_SCHEMA);
 const migrated=new DatabaseSync(':memory:');try{migrated.exec(fs.readFileSync(new URL('../migrations/055_maintenance_rule_history.sql',import.meta.url),'utf8'));assert.deepEqual(migrated.prepare("select name,sql from sqlite_master where name='maintenance_rule_change_history'").all(),f.db.prepare("select name,sql from sqlite_master where name='maintenance_rule_change_history'").all());}finally{migrated.close();}
 const before=f.db.prepare('select * from maintenance_hour_rules order by name').all(),state=f.service.state();assert.equal(state.revision,0);assert.equal(state.historyKnown,false);assert.equal(state.hasUnjournaledChanges,false);assert.deepEqual(f.service.list().items,[]);assert.equal(f.db.prepare('select count(*) n from maintenance_rule_change_history').get().n,0);assert.deepEqual(f.db.prepare('select * from maintenance_hour_rules order by name').all(),before);
});
test('actual before and after configuration, actor qualification and explicit reason are appended once; no-op is not a new version',t=>{
 const f=fixture(t),first=f.change(4);assert.equal(first.revision,1);assert.equal(first.continuity,'FIRST_OBSERVATION');assert.equal(first.writeMode,'VERSIONED');
 const row=f.db.prepare('select * from maintenance_rule_change_history').get();assert.equal(JSON.parse(row.qualification_json).personId,f.actor.personId);assert.equal(JSON.parse(row.before_json).find(item=>item.name==='拖机').value,3);assert.equal(JSON.parse(row.after_json).find(item=>item.name==='拖机').value,4);
 assert.equal(f.change(4),null);assert.equal(f.service.state().revision,1);assert.equal(f.service.list().items[0].changes[0].beforeValue,3);assert.ok(!JSON.stringify(f.service.list()).includes('PRIVATE-QUALIFICATION'));
});
test('version and actual content reject stale saves including ABA; unversioned legacy writes are labelled honestly',t=>{
 const f=fixture(t),old=f.service.state();f.change(4);assert.throws(()=>f.change(5,old),{status:409});f.change(3);assert.equal(f.service.state().fingerprint,old.fingerprint);assert.throws(()=>f.change(5,old),{status:409});
 const before=f.service.begin(undefined);f.tx(()=>{f.db.prepare("update maintenance_hour_rules set value=5 where name='拖机'").run();f.service.record(before,{actor:f.actor,qualification:f.qualification});});assert.equal(f.service.list().items[0].writeMode,'LEGACY_UNVERSIONED');
});
test('unrecorded changes are exposed as gaps, never reconstructed as a fabricated intermediate version',t=>{
 const f=fixture(t);f.change(4);const original=f.db.prepare('select * from maintenance_rule_change_history').get();f.db.prepare("update maintenance_hour_rules set value=7 where name='拖机'").run();assert.equal(f.service.state().hasUnjournaledChanges,true);f.change(8);assert.equal(f.service.list().items[0].continuity,'UNJOURNALED_GAP');assert.equal(f.service.list().items[0].changes[0].beforeValue,7);assert.deepEqual(f.db.prepare('select * from maintenance_rule_change_history where revision=1').get(),original);assert.equal(f.service.list().items.length,2);
});
test('history or downstream audit failure rolls configuration and version back together',t=>{
 const f=fixture(t),before=f.service.state();f.db.exec("create trigger reject_history before insert on maintenance_rule_change_history begin select raise(abort,'history unavailable');end");assert.throws(()=>f.change(4));assert.deepEqual(f.service.state(),before);f.db.exec('drop trigger reject_history');assert.throws(()=>f.change(4,undefined,()=>{throw Error('downstream audit unavailable');}));assert.deepEqual(f.service.state(),before);assert.equal(f.db.prepare('select count(*) n from maintenance_rule_change_history').get().n,0);
});
test('zero remains zero, missing remains missing, and history pagination cannot expose qualification or repair corruption',t=>{
 const f=fixture(t);f.tx(()=>{const before=f.service.begin(f.service.state());f.db.prepare("insert into maintenance_hour_rules values('roleRatio','new-zero',0)").run();f.service.record(before,{actor:f.actor,qualification:f.qualification});});const zero=f.service.list().items[0].changes[0];assert.equal(zero.beforeValue,null);assert.equal(zero.value,0);
 for(let i=0;i<11;i++)f.change(i+4);const first=f.service.list(),second=f.service.list({cursor:first.nextCursor});assert.equal(first.items.length,10);assert.equal(second.items.length,2);assert.equal(new Set([...first.items,...second.items].map(item=>item.id)).size,12);assert.throws(()=>f.service.list({cursor:'bad'}),{status:400});
 f.db.exec("update maintenance_rule_change_history set after_json='[]' where revision=1");assert.throws(()=>f.service.list({cursor:2}),{status:409});
});
