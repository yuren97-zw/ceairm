import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService} from '../handover-service.mjs';
import {createActionTaskService} from '../action-task-service.mjs';
const CLOCK=Date.parse('2026-11-14T09:00:00+08:00');
function fixture({withTasks=false,clock=CLOCK,loadNonroutineDrafts,loadRoutineReports}={}){
 const db=new DatabaseSync(':memory:');
 db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
 db.exec("create table users(id text primary key,person_id text,status text default 'active')");
 db.exec("create table maintenance_flights(id text primary key,date text,aircraft_no text,flight_no text,aircraft_type text,work_kind text,stand text,planned_arrival text,planned_departure text,departure_flight_no text,location_id text,remark text default '',status text default '未派工',archived_at text)");
 db.exec("create table maintenance_subtasks(id text primary key,flight_id text,title text,category text,content text,standard_hours real default 0,status text default '未派工',created_at text)");
 db.exec("create table maintenance_work_locations(id text primary key,name text,status text default 'active')");
 db.exec("create table maintenance_assignments(id text primary key,owner_type text,owner_id text,role text,user_name text,assigned_at text)");
 const people=[['p1','u1','10001','张三','TEAM-LINE-1'],['p2','u2','10002','李四','TEAM-LINE-1'],['p3','u3','10003','王五','TEAM-LINE-2'],['p9','u9','10009','赵干','TEAM-LINE-1'],['p10','u10','10010','孙六','TEAM-LINE-2']];
 for(const [pid,uid,eno,name,team] of people){
  db.prepare('insert into personnel(id,employee_no,name,position_code,administrative_team_id) values(?,?,?,?,?)').run(pid,eno,name,eno==='10001'?'班组长':'组员',team);
  db.prepare('insert into users(id,person_id) values(?,?)').run(uid,pid);
 }
 db.prepare('insert into users(id,person_id,status) values(?,?,?)').run('u4','p1','disabled');
 const flights=[['f1','2026-11-14','B-1234','MU5117','航后','桥位3','2026-11-14 12:30:00','未派工',null],['f2','2026-11-14','B-5678','MU2201','短停','桥位5','2026-11-14 15:10:00','已派工',null],['f3','2026-11-13','B-9999','MU0001','航前','桥位1','2026-11-13 06:30:00','已确认','2026-11-13T12:00:00.000Z']];
 for(const flight of flights)db.prepare('insert into maintenance_flights(id,date,aircraft_no,flight_no,work_kind,stand,planned_arrival,status,archived_at) values(?,?,?,?,?,?,?,?,?)').run(...flight);
 db.prepare('insert into maintenance_subtasks(id,flight_id,title,category,content,standard_hours,created_at) values(?,?,?,?,?,?,?)').run('s1','f1','右发振动检查','非例行','按手册 72-00 检查',1.5,'2026-11-14T01:00:00.000Z');
 db.prepare('insert into maintenance_assignments(id,owner_type,owner_id,role,user_name,assigned_at) values(?,?,?,?,?,?)').run('a1','flight','f1','机长','张三','2026-11-14T01:00:00.000Z');
 db.prepare('insert into maintenance_assignments(id,owner_type,owner_id,role,user_name,assigned_at) values(?,?,?,?,?,?)').run('a2','subtask','s1','主做','李四','2026-11-14T01:00:00.000Z');
 const allPerms=['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all'];
 const user=(id,perms=['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all'])=>({id,permissions:perms});
 let tasks=null;
 if(withTasks){
  db.exec("create table if not exists action_tasks(id text primary key,source_module text not null,source_type text not null,source_id text not null,action_type text not null,assignee_user_id text not null,title text not null,status text not null,target_json text not null,created_at text not null,updated_at text not null,unique(source_module,source_type,source_id,action_type,assignee_user_id))");
  tasks=createActionTaskService({db,canAct:()=>true});
 }
 const service=createHandoverService({db,clock:()=>clock,hasRbac:(u,code)=>!!u?.permissions?.includes(code),actionTask:tasks,loadNonroutineDrafts,loadRoutineReports});
 return {db,service,user,allPerms,tasks};
}
const draftPayload={toTeamId:'TEAM-LINE-2',recipients:[{userId:'u3'}],opportunities:[{flightId:'f1',note:'航后检查注意右发振动'}],otherItems:'工具间钥匙已交接'};
test('create draft auto-fills from team, resolves recipients and snapshots opportunities',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const result=service.create(creator,draftPayload);
 assert.equal(result.handover.status,'draft');
 assert.equal(result.handover.fromTeamId,'TEAM-LINE-1','交班班组自动带入');
 assert.equal(result.handover.fromTeamName,'一组');
 assert.deepEqual(result.recipients.map(r=>r.user_name),['王五']);
 const opportunity=result.opportunities[0];
 assert.equal(opportunity.snapshot.aircraftNo,'B-1234','提交前快照现读维修机会字段');
 assert.equal(opportunity.snapshot.workKind,'航后');
});
test('teamless operators must explicitly choose the from team',()=>{
 const {service,db,user}=fixture();
 db.prepare("insert into personnel(id,employee_no,name,administrative_team_id) values('p-none','19990002','无班组',NULL)");
 db.prepare("insert into users(id,person_id) values('u-none','p-none')");
 assert.throws(()=>service.create(user('u-none'),{otherItems:'x'}),/请选择交班班组/);
 const created=service.create(user('u-none'),{fromTeamId:'TEAM-LINE-2',otherItems:'手动选择交班班组'});
 assert.equal(created.handover.fromTeamId,'TEAM-LINE-2');
});
test('drafts can be deleted by the creator only while still drafts',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const draft=service.create(creator,draftPayload);
 assert.throws(()=>service.deleteDraft(user('u3'),draft.handover.id),/只有交班班组可以删除草稿/);
 assert.equal(service.deleteDraft(creator,draft.handover.id).ok,true);
 assert.throws(()=>service.detail(creator,draft.handover.id),/交接单不存在/);
 assert.equal(service.list(creator,{scope:'drafts'}).items.length,0);
 const second=service.create(creator,draftPayload);
 service.submit(creator,second.handover.id,{expectedVersion:second.handover.version});
 assert.throws(()=>service.deleteDraft(creator,second.handover.id),/仅草稿可以删除/);
});
test('history keyword search spans notes, aircraft and people with matched aircraft',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const first=service.create(creator,draftPayload);
 service.submit(creator,first.handover.id,{expectedVersion:first.handover.version});
 service.confirm(user('u3'),first.handover.id);
 const byNote=service.list(user('u1'),{scope:'mine',q:'右发振动'});
 assert.equal(byNote.items.length,1,'交接说明可搜');
 assert.equal(byNote.items[0].matchedAircraft,'B-1234','命中机号随结果返回');
 const byAircraft=service.list(user('u1'),{scope:'mine',aircraft:'B-12'});
 assert.equal(byAircraft.items.length,1,'机号筛选可搜');
 const byPerson=service.list(user('u1'),{scope:'mine',q:'王五'});
 assert.equal(byPerson.items.length,1,'接收人姓名可搜');
 const byCreator=service.list(user('u1'),{scope:'mine',q:'张三'});
 assert.equal(byCreator.items.length,1,'交班人姓名可搜');
 assert.equal(service.list(user('u1'),{scope:'mine',q:'绝不存在的关键词'}).items.length,0);
});
test('create rejects unknown flights and disabled recipient accounts atomically',()=>{
 const {service,user,db}=fixture();
 assert.throws(()=>service.create(user('u1'),{...draftPayload,opportunities:[{flightId:'nope'}]}),/维修机会不存在/);
 assert.equal(db.prepare('select count(*) c from handover').get().c,0,'失败创建不留孤儿交接单');
 db.prepare('update users set status=? where id=?').run('disabled','u3');
 assert.throws(()=>service.create(user('u1'),draftPayload),/接收人账号无效或已停用/);
});
test('submit enforces recipients, to-team and non-empty content',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const bare=service.create(creator,{});
 assert.throws(()=>service.submit(creator,bare.handover.id,{}),/接班班组/);
 service.update(creator,bare.handover.id,{toTeamId:'TEAM-LINE-2',expectedVersion:1});
 assert.throws(()=>service.submit(creator,bare.handover.id,{expectedVersion:2}),/接收人/);
 service.update(creator,bare.handover.id,{recipients:[{userId:'u3'}],expectedVersion:2});
 assert.throws(()=>service.submit(creator,bare.handover.id,{expectedVersion:3}),/至少勾选一个维修机会或填写其他交接事项/);
 const done=service.update(creator,bare.handover.id,{otherItems:'仅交接其他事项',expectedVersion:3});
 const submitted=service.submit(creator,done.handover.id,{expectedVersion:done.handover.version});
 assert.equal(submitted.handover.status,'pending');
 assert.ok(submitted.handover.submittedAt);
});
test('submitted handovers are locked: no edits, no recipient changes',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const created=service.create(creator,draftPayload);
 const submitted=service.submit(creator,created.handover.id,{expectedVersion:created.handover.version});
 const version=submitted.handover.version;
 assert.throws(()=>service.update(creator,created.handover.id,{otherItems:'试图改',expectedVersion:version}),/交接单已提交，不可修改/,'待接收单不可再修改');
 assert.throws(()=>service.update(creator,created.handover.id,{recipients:[{userId:'u2'}],expectedVersion:version}),/交接单已提交，不可修改/,'接收人名单提交后固定');
 assert.throws(()=>service.update(creator,created.handover.id,{otherItems:'x',expectedVersion:1}),/交接单已提交，不可修改/,'提交后一切编辑都被拒绝');
 const detail=service.detail(creator,created.handover.id);
 assert.deepEqual(detail.changes,[],'提交后无修改留痕需求');
});
test('confirm is recipient-only, atomic and final',()=>{
 const {service,user,db}=fixture();
 const creator=user('u1');
 const created=service.create(creator,draftPayload);
 const submitted=service.submit(creator,created.handover.id,{expectedVersion:created.handover.version});
 assert.throws(()=>service.confirm(user('u2'),created.handover.id),/只有当前接收人/,'同班组非接收人不可确认');
 const confirmed=service.confirm(user('u3'),created.handover.id);
 assert.equal(confirmed.handover.status,'accepted');
 assert.equal(confirmed.handover.confirmedBy,'u3');
 assert.equal(confirmed.handover.confirmedByName,'王五');
 assert.throws(()=>service.confirm(user('u3'),created.handover.id),/已被确认/,'重复确认必须失败且不产生第二个确认人');
 assert.equal(db.prepare('select confirmed_by,confirmed_by_name from handover where id=?').get(created.handover.id).confirmed_by,'u3','唯一确认人落库');
 assert.throws(()=>service.update(creator,created.handover.id,{otherItems:'x',expectedVersion:confirmed.handover.version}),/交接单已提交，不可修改/,'确认后任何编辑都被拒绝');
 assert.throws(()=>service.submit(creator,created.handover.id,{}),/仅草稿/);
});
test('list scopes separate pending, drafts and full history with permissions',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const created=service.create(creator,draftPayload);
 service.submit(creator,created.handover.id,{expectedVersion:created.handover.version});
 const second=service.create(creator,{otherItems:'草稿二'});
 assert.ok(service.list(user('u3'),{scope:'pending'}).items.some(h=>h.id===created.handover.id));
 assert.ok(service.list(user('u1'),{scope:'drafts'}).items.some(h=>h.id===second.handover.id));
 assert.ok(service.list(user('u9'),{scope:'all'}).items.length>=2);
 assert.throws(()=>service.list(user('u3',['handover.view']),{scope:'all'}),/没有执行该操作的权限/);
 const mine=service.list(user('u3'),{scope:'mine'});
 assert.ok(mine.items.some(h=>h.id===created.handover.id));
});
test('detail visibility follows creator, recipient, team and history permission',()=>{
 const {service,user}=fixture();
 const creator=user('u1',['handover.view','handover.create']);
 const created=service.create(creator,draftPayload);
 assert.doesNotThrow(()=>service.detail(user('u3',['handover.view']),created.handover.id),'接收人可见');
 assert.doesNotThrow(()=>service.detail(user('u9',['handover.view','handover.history.all']),created.handover.id),'history 权限可见');
 assert.throws(()=>service.detail(user('u10',['handover.view']),created.handover.id),/没有查看该交接单的权限/,'无关系且无全量权限者不可见');
});
test('maintenance options restrict dates and statuses even for legacy all scope',()=>{
 const {db,service,user}=fixture();
 const insert=db.prepare('insert into maintenance_flights(id,date,aircraft_no,status,archived_at) values(?,?,?,?,?)');
 for(const [id,date,status,archived] of [
  ['yesterday','2026-11-13','已提报',null],
  ['old','2026-11-12','未派工',null],
  ['future','2026-11-15','已派工',null],
  ['review','2026-11-14','待复核',null],
  ['confirmed','2026-11-14','已确认',null],
  ['archived','2026-11-14','已提报','2026-11-14T00:00:00Z']
 ])insert.run(id,date,'B-6587',status,archived);
 const options=service.maintenanceOptions(user('u1'),{});
 assert.deepEqual(options.items.map(i=>i.id),['yesterday','f1','f2']);
 assert.equal(options.items.find(i=>i.id==='f1').subtasks.length,1);
 assert.equal(options.items.find(i=>i.id==='f1').assignments.length,1);
 assert.equal(options.items.find(i=>i.id==='f1').subtasks[0].content,'按手册 72-00 检查');
 assert.deepEqual(service.maintenanceOptions(user('u1'),{scope:'all'}).items.map(i=>i.id),['yesterday','f1','f2']);
 assert.deepEqual(service.maintenanceOptions(user('u1'),{date:'2026-11-13'}).items.map(i=>i.id),['yesterday']);
 assert.deepEqual(service.maintenanceOptions(user('u1'),{date:'2026-11-12',scope:'all'}).items,[]);
});

test('action tasks follow recipients through submit, edit and confirm',()=>{
 const {service,user,tasks}=fixture({withTasks:true});
 const creator=user('u1');
 const created=service.create(creator,{toTeamId:'TEAM-LINE-2',recipients:[{userId:'u2'},{userId:'u3'}],otherItems:'双人接收待办验证'});
 const submitted=service.submit(creator,created.handover.id,{expectedVersion:created.handover.version});
 assert.equal(tasks.count({id:'u2'}).count,1,'每名接收人各一条待办');
 assert.equal(tasks.count({id:'u3'}).count,1);
 assert.equal(tasks.count({id:'u1'}).count,0,'交班人无待办');
 const listed=tasks.list({id:'u3'}).items[0];
 assert.equal(listed.sourceModule,'handover');
 assert.equal(listed.target.action,'handover','点击跳转班组交接');
 assert.match(listed.title,/一组 → 二组/);
 assert.throws(()=>service.update(creator,created.handover.id,{recipients:[{userId:'u1'}],expectedVersion:submitted.handover.version}),/交接单已提交，不可修改/,'提交后改人被拒绝');
 service.confirm(user('u3'),created.handover.id);
 assert.equal(tasks.count({id:'u3'}).count,0,'一人确认后全部待办终结');
 assert.equal(tasks.count({id:'u1'}).count,0);
});

 test('maintenance option date window uses Beijing midnight',()=>{
 const before=fixture({clock:Date.parse('2026-11-14T15:59:59Z')});
 assert.deepEqual(before.service.maintenanceOptions(before.user('u1')).items.map(i=>i.id),['f1','f2']);
 const after=fixture({clock:Date.parse('2026-11-15T16:00:00Z')});
 assert.deepEqual(after.service.maintenanceOptions(after.user('u1')).items,[]);
 });

test('maintenance candidates sort by date, arrival then missing-arrival departure',()=>{
 const {db,service,user}=fixture();
 const insert=db.prepare('insert into maintenance_flights(id,date,aircraft_no,status,planned_arrival,planned_departure) values(?,?,?,?,?,?)');
 for(const [id,date,arrival,departure] of [
  ['yesterday-no-arrival','2026-11-13',null,'2026-11-13 23:00:00'],
  ['early-arrival','2026-11-14','2026-11-14 08:00:00',null],
  ['null-arrival','2026-11-14',null,'2026-11-14 06:00:00'],
  ['empty-arrival','2026-11-14','','2026-11-14 10:00:00'],
  ['space-arrival','2026-11-14','  ','2026-11-14 12:00:00'],
  ['both-empty','2026-11-14','',null]
 ])insert.run(id,date,'6587','未派工',arrival,departure);
 assert.deepEqual(service.maintenanceOptions(user('u1')).items.map(item=>item.id),[
  'yesterday-no-arrival','early-arrival','f1','f2','null-arrival','empty-arrival','space-arrival','both-empty'
 ]);
});

test('handover detail reloads formal and draft work independently through draft conversion',()=>{
 let drafts=new Map([['f1',{items:[{title:'共享工作',entries:[]}],version:1}]]);
 const batches=[];
 const {db,service,user}=fixture({loadNonroutineDrafts:ids=>{batches.push(ids);return drafts;}});
 const created=service.create(user('u1'),draftPayload);
 assert.equal(created.opportunities[0].live.subtasks.length,1);
 assert.equal(created.opportunities[0].live.nonroutineDraft.items.length,1);
 const before=created.opportunities[0].snapshot;
 drafts=new Map();
 db.prepare('insert into maintenance_subtasks(id,flight_id,title,category,created_at) values(?,?,?,?,?)').run('converted','f1','共享工作','其他','2026-11-14T02:00:00Z');
 const updated=service.detail(user('u1'),created.handover.id);
 assert.equal(updated.opportunities[0].live.subtasks.length,2);
 assert.equal(updated.opportunities[0].live.nonroutineDraft,null);
 assert.deepEqual(updated.opportunities[0].snapshot,before);
 assert.equal(updated.opportunities[0].note,draftPayload.opportunities[0].note);
 assert.ok(batches.every(ids=>ids.includes('f1')));
});

test('routine explanation updates live without rewriting handover notes or snapshots',()=>{
 let reports=new Map([['f1',{feedback:'例行草稿',source:'draft',status:'草稿'}]]);
 const {service,user}=fixture({loadRoutineReports:()=>reports});
 const created=service.create(user('u1'),draftPayload);
 assert.equal(created.opportunities[0].live.routineReport.feedback,'例行草稿');
 const snapshot=created.opportunities[0].snapshot;
 reports=new Map([['f1',{feedback:'正式说明',source:'report',status:'已提报'}]]);
 const submitted=service.detail(user('u1'),created.handover.id);
 assert.equal(submitted.opportunities[0].live.routineReport.source,'report');
 assert.equal(submitted.opportunities[0].live.routineReport.feedback,'正式说明');
 assert.equal(submitted.opportunities[0].note,draftPayload.opportunities[0].note);
 assert.deepEqual(submitted.opportunities[0].snapshot,snapshot);
 reports=new Map([['f1',{feedback:'',source:'report',status:'已提报'}]]);
 assert.equal(service.detail(user('u1'),created.handover.id).opportunities[0].live.routineReport.feedback,'');
});
