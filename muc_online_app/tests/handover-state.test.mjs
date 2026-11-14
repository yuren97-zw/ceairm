import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService} from '../handover-service.mjs';
import {createActionTaskService} from '../action-task-service.mjs';
const CLOCK=Date.parse('2026-11-14T09:00:00+08:00');
function fixture({withTasks=false}={}){
 const db=new DatabaseSync(':memory:');
 db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
 db.exec("create table users(id text primary key,person_id text,status text default 'active')");
 db.exec("create table maintenance_flights(id text primary key,date text,aircraft_no text,flight_no text,work_kind text,stand text,planned_arrival text,status text default '未派工',archived_at text)");
 db.exec("create table maintenance_subtasks(id text primary key,flight_id text,title text,status text default '未派工')");
 const people=[['p1','u1','10001','张三','TEAM-LINE-1'],['p2','u2','10002','李四','TEAM-LINE-1'],['p3','u3','10003','王五','TEAM-LINE-2'],['p9','u9','10009','赵干','TEAM-LINE-1'],['p10','u10','10010','孙六','TEAM-LINE-2']];
 for(const [pid,uid,eno,name,team] of people){
  db.prepare('insert into personnel(id,employee_no,name,position_code,administrative_team_id) values(?,?,?,?,?)').run(pid,eno,name,eno==='10001'?'班组长':'组员',team);
  db.prepare('insert into users(id,person_id) values(?,?)').run(uid,pid);
 }
 db.prepare('insert into users(id,person_id,status) values(?,?,?)').run('u4','p1','disabled');
 const flights=[['f1','2026-11-14','B-1234','MU5117','航后','桥位3','2026-11-14 12:30:00','未派工',null],['f2','2026-11-14','B-5678','MU2201','短停','桥位5','2026-11-14 15:10:00','已派工',null],['f3','2026-11-13','B-9999','MU0001','航前','桥位1','2026-11-13 06:30:00','已确认','2026-11-13T12:00:00.000Z']];
 for(const flight of flights)db.prepare('insert into maintenance_flights(id,date,aircraft_no,flight_no,work_kind,stand,planned_arrival,status,archived_at) values(?,?,?,?,?,?,?,?,?)').run(...flight);
 db.prepare('insert into maintenance_subtasks(id,flight_id,title) values(?,?,?)').run('s1','f1');
 const allPerms=['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all'];
 const user=(id,perms=['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all'])=>({id,permissions:perms});
 let tasks=null;
 if(withTasks){
  db.exec("create table if not exists action_tasks(id text primary key,source_module text not null,source_type text not null,source_id text not null,action_type text not null,assignee_user_id text not null,title text not null,status text not null,target_json text not null,created_at text not null,updated_at text not null,unique(source_module,source_type,source_id,action_type,assignee_user_id))");
  tasks=createActionTaskService({db,canAct:()=>true});
 }
 const service=createHandoverService({db,clock:()=>CLOCK,hasRbac:(u,code)=>!!u?.permissions?.includes(code),actionTask:tasks});
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
test('pending edits are tracked in change log with version bumps and CAS',()=>{
 const {service,user}=fixture();
 const creator=user('u1');
 const created=service.create(creator,draftPayload);
 const submitted=service.submit(creator,created.handover.id,{expectedVersion:created.handover.version});
 const version=submitted.handover.version;
 assert.throws(()=>service.update(creator,created.handover.id,{otherItems:'过期编辑',expectedVersion:1}),/已被他人修改/,'过期版本必须被拒绝');
 const updated=service.update(creator,created.handover.id,{toTeamId:'TEAM-LINE-3',opportunities:[{flightId:'f1',note:'新说明'},{flightId:'f2'}],expectedVersion:version});
 assert.equal(updated.handover.version,version+1);
 const entities=updated.changes.map(c=>c.entityType+':'+c.action);
 assert.ok(entities.includes('to_team:update'));
 assert.ok(entities.includes('opportunity_note:update'));
 assert.ok(entities.includes('opportunity:add'));
 const noteChange=updated.changes.find(c=>c.entityType==='opportunity_note');
 assert.equal(noteChange.old.text,'航后检查注意右发振动','旧说明留痕');
 assert.equal(noteChange.new.text,'新说明');
 const removed=updated.opportunities.find(o=>o.flightId==='f1'&&o.removedAt);
 assert.ok(!removed,'仍被勾选的机会不因编辑被移除');
 const second=service.update(creator,created.handover.id,{opportunities:[{flightId:'f2',note:'短停注意除冰'}],expectedVersion:updated.handover.version});
 const removedRow=second.opportunities.find(o=>o.flightId==='f1');
 assert.ok(removedRow.removedAt,'取消勾选为逻辑删除');
 assert.equal(removedRow.note,'新说明','被移除机会的说明仍可追溯');
 assert.ok(second.changes.some(c=>c.entityType==='opportunity'&&c.action==='remove'&&c.old.note==='新说明'));
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
 assert.throws(()=>service.update(creator,created.handover.id,{otherItems:'x',expectedVersion:confirmed.handover.version}),/已接收锁定/,'确认后任何编辑都被拒绝');
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
test('maintenance options default to unfinished and support full view',()=>{
 const {service,user}=fixture();
 const options=service.maintenanceOptions(user('u1'),{});
 assert.deepEqual(options.items.map(i=>i.id),['f2','f1'],'未完成机会优先，排除已归档');
 assert.equal(options.items.find(i=>i.id==='f1').subtaskCount,1);
 const all=service.maintenanceOptions(user('u1'),{scope:'all'});
 assert.equal(all.items.length,3);
 const byDate=service.maintenanceOptions(user('u1'),{date:'2026-11-13',scope:'all'});
 assert.deepEqual(byDate.items.map(i=>i.id),['f3']);
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
 const updated=service.update(creator,created.handover.id,{recipients:[{userId:'u3'},{userId:'u1'}],expectedVersion:submitted.handover.version});
 assert.equal(tasks.count({id:'u2'}).count,0,'被移除接收人的待办失效');
 assert.equal(tasks.count({id:'u1'}).count,1,'新增接收人获得待办');
 service.confirm(user('u3'),created.handover.id);
 assert.equal(tasks.count({id:'u3'}).count,0,'一人确认后全部待办终结');
 assert.equal(tasks.count({id:'u1'}).count,0);
 assert.ok(updated);
});
