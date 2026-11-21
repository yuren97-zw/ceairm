import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService,HANDOVER_STATUSES,HANDOVER_BASELINE_STATUSES} from '../handover-service.mjs';
const HANDOVER_TABLES=['handover','handover_opportunity','handover_recipient','handover_change_log','handover_shift_baseline'];
function fixture(){
 const db=new DatabaseSync(':memory:');
 const service=createHandoverService({db,clock:()=>Date.parse('2026-11-14T08:00:00+08:00')});
 return {db,service};
}
function insertHandover(db,id='hdo-1'){
 db.prepare("insert into handover(id,status,created_by,created_by_name,created_at,from_team_id,from_team_name,to_team_id,to_team_name,updated_at) values(?,'draft','u1','张三','2026-11-14T08:00:00.000Z','TEAM-LINE-1','一组','TEAM-LINE-2','二组','2026-11-14T08:00:00.000Z')").run(id);
 return id;
}
test('handover migration creates the five tables and re-applies idempotently',()=>{
 const {db,service}=fixture();
 const tables=db.prepare("select name from sqlite_master where type='table'").all().map(r=>r.name);
 for(const table of HANDOVER_TABLES)assert.ok(tables.includes(table),`缺少表 ${table}`);
 assert.deepEqual(service.STATUSES,HANDOVER_STATUSES);
 assert.deepEqual(service.BASELINE_STATUSES,HANDOVER_BASELINE_STATUSES);
 assert.doesNotThrow(()=>createHandoverService({db}),'重复初始化必须幂等');
});
test('handover defaults and version column behave as designed',()=>{
 const {db}=fixture();
 insertHandover(db);
 const row=db.prepare('select * from handover where id=?').get('hdo-1');
 assert.equal(row.version,1);
 assert.equal(row.status,'draft');
 assert.equal(row.confirmed_by,null);
 assert.equal(row.submitted_at,null);
});
test('handover_recipient allows multiple recipients but rejects duplicates',()=>{
 const {db}=fixture();
 insertHandover(db);
 const add=(user)=>db.prepare('insert into handover_recipient(handover_id,user_id,user_name,added_by,added_at) values(?,?,?,?,?)').run('hdo-1',user,'李四','u1','2026-11-14T08:00:00.000Z');
 add('u2');add('u3');
 assert.equal(db.prepare('select count(*) c from handover_recipient where handover_id=?').get('hdo-1').c,2);
 assert.throws(()=>add('u2'),/UNIQUE/,'同一交接单同一接收人必须被唯一约束拒绝');
});
test('handover_opportunity reference is unique per handover and supports logical removal',()=>{
 const {db}=fixture();
 insertHandover(db);
 const add=(id)=>db.prepare('insert into handover_opportunity(id,handover_id,maintenance_flight_id,handover_note,created_by,created_at) values(?,?,?,?,?,?)').run(id,'hdo-1','mtnf-1731-abc','航后检查注意右发振动','u1','2026-11-14T08:00:00.000Z');
 add('hdoop-1');
 assert.throws(()=>add('hdoop-2'),/UNIQUE/,'同一机会在同一交接单内不可重复引用');
 db.prepare('update handover_opportunity set removed_at=?,removed_by=? where id=?').run('2026-11-14T09:00:00.000Z','u1','hdoop-1');
 const removed=db.prepare('select removed_at,handover_note from handover_opportunity where id=?').get('hdoop-1');
 assert.ok(removed.removed_at);
 assert.equal(removed.handover_note,'航后检查注意右发振动','取消勾选后交接说明仍可追溯');
});
test('handover_change_log keeps deleted text queryable and orders by version',()=>{
 const {db}=fixture();
 insertHandover(db);
 const log=(id,version,action,oldJson,newJson)=>db.prepare('insert into handover_change_log(id,handover_id,version,entity_type,entity_id,action,old_value_json,new_value_json,changed_by,changed_by_name,changed_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(id,'hdo-1',version,'opportunity_note','hdoop-1',action,oldJson,newJson,'u1','张三','2026-11-14T08:30:00.000Z');
 log('hdoc-1',1,'update',JSON.stringify({text:'旧说明'}),JSON.stringify({text:'新说明'}));
 log('hdoc-2',2,'remove',JSON.stringify({text:'被删除的说明'}),null);
 const rows=db.prepare('select version,action,old_value_json from handover_change_log where handover_id=? order by version').all('hdo-1');
 assert.deepEqual(rows.map(r=>r.version),[1,2]);
 const removed=JSON.parse(rows[1].old_value_json);
 assert.equal(removed.text,'被删除的说明','被删除的交接文字必须留痕可查');
});
test('handover_shift_baseline keeps one row per team and tracks confirmation',()=>{
 const {db}=fixture();
 const upsert=(team,phase,status='inferred')=>db.prepare('insert into handover_shift_baseline(team_id,team_name,cycle_json,anchor_date,anchor_phase,evidence_json,status,updated_at) values(?,?,?,?,?,?,?,?) on conflict(team_id) do update set anchor_phase=excluded.anchor_phase,status=excluded.status,updated_at=excluded.updated_at').run(team,team==='TEAM-LINE-1'?'一组':team,JSON.stringify(['白班','夜班','休息','休息']),'2026-11-14',phase,JSON.stringify({sampleDays:7,source:'attendance_schedule_cache'}),status,'2026-11-14T08:00:00.000Z');
 upsert('TEAM-LINE-1',0);upsert('TEAM-LINE-2',1);upsert('TEAM-LINE-3',2);upsert('TEAM-LINE-4',3);
 upsert('TEAM-LINE-1',2,'confirmed');
 const row=db.prepare('select * from handover_shift_baseline where team_id=?').get('TEAM-LINE-1');
 assert.equal(row.anchor_phase,2);
 assert.equal(row.status,'confirmed');
 assert.equal(db.prepare('select count(*) c from handover_shift_baseline').get().c,4,'每班组仅一行基准');
});
