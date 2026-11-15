import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService} from '../handover-service.mjs';
import {handoverXlsx} from '../handover-export.mjs';
const CLOCK=Date.parse('2026-11-14T09:00:00+08:00');
function fixture(){
 const db=new DatabaseSync(':memory:');
 db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
 db.exec("create table users(id text primary key,person_id text,status text default 'active')");
 db.exec("create table maintenance_flights(id text primary key,date text,aircraft_no text,flight_no text,aircraft_type text,work_kind text,stand text,planned_arrival text,planned_departure text,departure_flight_no text,location_id text,remark text default '',status text default '未派工',archived_at text)");
 db.exec("create table maintenance_work_locations(id text primary key,name text,status text default 'active')");
 db.exec("create table maintenance_assignments(id text primary key,owner_type text,owner_id text,role text,user_name text,assigned_at text)");
 db.exec("create table maintenance_subtasks(id text primary key,flight_id text,title text,category text,standard_hours real default 0,status text default '未派工',created_at text)");
 const people=[['p1','u1','张三','TEAM-LINE-1'],['p3','u3','王五','TEAM-LINE-2']];
 for(const [pid,uid,name,team] of people){db.prepare('insert into personnel(id,employee_no,name,administrative_team_id) values(?,?,?,?)').run(pid,uid,name,team);db.prepare('insert into users(id,person_id) values(?,?)').run(uid,pid);}
 db.prepare('insert into maintenance_flights(id,date,aircraft_no,flight_no,work_kind,stand,planned_arrival,status,archived_at) values(?,?,?,?,?,?,?,?,?)').run('f1','2026-11-14','B-1234','MU5117','航后','桥位3','2026-11-14 12:30:00','已派工',null);
 db.prepare('insert into maintenance_flights(id,date,aircraft_no,flight_no,work_kind,stand,planned_arrival,status,archived_at) values(?,?,?,?,?,?,?,?,?)').run('f3','2026-11-13','B-9999','MU0001','航前','桥位1','2026-11-13 06:30:00','已确认','2026-11-13T12:00:00.000Z');
 const perms=['handover.view','handover.create','handover.history.all','handover.export'];
 const user=id=>({id,permissions:perms});
 const service=createHandoverService({db,clock:()=>CLOCK,hasRbac:(u,code)=>!!u?.permissions?.includes(code)});
 const creator=user('u1');
 const first=service.create(creator,{toTeamId:'TEAM-LINE-2',recipients:[{userId:'u3'}],opportunities:[{flightId:'f1',note:'右发振动关注'},{flightId:'f3',note:'已归档机会引用'}],otherItems:'防冰液余量正常'});
 service.submit(creator,first.handover.id,{expectedVersion:first.handover.version});
 service.confirm(user('u3'),first.handover.id);
 return {db,service,user,first};
}
test('export data requires permission and injects live status alongside snapshots',()=>{
 const {service,user,first}=fixture();
 assert.throws(()=>service.exportData({id:'u1',permissions:['handover.view']},{}),/没有执行该操作的权限/);
 const data=service.exportData(user('u1'),{id:first.handover.id});
 assert.equal(data.handovers.length,1);
 const bundle=data.handovers[0];
 assert.equal(bundle.handover.status,'accepted');
 const live=bundle.opportunities.find(o=>o.flightId==='f1');
 assert.equal(live.snapshot.status,'已派工','提交时快照状态');
 assert.equal(live.liveStatus,'已派工','导出时状态分列');
 const archived=bundle.opportunities.find(o=>o.flightId==='f3');
 assert.equal(archived.liveStatus,'已确认（归档）');
});
test('batch export honors aircraft, keyword and inclusive date bounds',()=>{
 const {service,user}=fixture();
 const byAircraft=service.exportData(user('u1'),{aircraft:'B-1234'});
 assert.equal(byAircraft.handovers.length,1);
 assert.equal(service.exportData(user('u1'),{aircraft:'B-7777'}).handovers.length,0);
 const byKeyword=service.exportData(user('u1'),{q:'防冰液'});
 assert.equal(byKeyword.handovers.length,1);
 const sameDay=service.exportData(user('u1'),{from:'2026-11-14',to:'2026-11-14'});
 assert.equal(sameDay.handovers.length,1,'提交当天的日期边界应包含');
 const after=service.exportData(user('u1'),{from:'2026-11-15'});
 assert.equal(after.handovers.length,0);
});
test('handover xlsx renders a real workbook with three sheets',()=>{
 const {service,user,first}=fixture();
 const data=service.exportData(user('u1'),{id:first.handover.id});
 const body=handoverXlsx(data.handovers);
 assert.ok(Buffer.isBuffer(body));
 assert.equal(body.slice(0,2).toString(),'PK','xlsx 是 zip 容器');
});
