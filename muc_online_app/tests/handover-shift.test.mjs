import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService} from '../handover-service.mjs';
const TODAY='2026-11-14',CYCLE=['白班','夜班','休息','休息'];
const dateAdd=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
function shiftRows(category,date){
 if(category==='休息')return JSON.stringify([{is_rest:'Y'}]);
 if(category==='白班')return JSON.stringify([{is_rest:'N',check_type:'OnDuty',plan_check_time:date+' 08:00:00'},{is_rest:'N',check_type:'OffDuty',plan_check_time:date+' 20:00:00'}]);
 return JSON.stringify([{is_rest:'N',check_type:'OnDuty',plan_check_time:date+' 20:00:00'},{is_rest:'N',check_type:'OffDuty',plan_check_time:dateAdd(date,1)+' 08:00:00'}]);
}
function fixture({days=8,clock=Date.parse(TODAY+'T09:00:00+08:00'),permissions=['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all']}={}){
 const db=new DatabaseSync(':memory:');
 db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
 db.exec("create table users(id text primary key,person_id text,status text default 'active')");
 db.exec("create table attendance_schedule_cache(person_id text,work_date text,schedules_json text,verified_at text,invalidated_at text)");
 db.exec("create table attendance_days(person_id text,work_date text,input_json text)");
 const phases={'TEAM-LINE-1':0,'TEAM-LINE-2':1,'TEAM-LINE-3':2,'TEAM-LINE-4':3};
 let seq=0;const members=[];
 for(const [teamId,phaseToday] of Object.entries(phases))for(let m=0;m<3;m++){
  const pid=teamId+'-p'+m,person={pid,uid:teamId+'-u'+m,teamId,position:m===0?'班组长':'组员'};
  db.prepare("insert into personnel(id,employee_no,name,position_code,administrative_team_id) values(?,?,?,?,?)").run(pid,String(10000+seq++),'成员'+m,person.position,teamId);
  db.prepare('insert into users(id,person_id) values(?,?)').run(person.uid,pid);
  members.push(person);
 }
 for(let i=-days+1;i<=0;i++){
  const date=dateAdd(TODAY,i);
  for(const member of members)db.prepare('insert into attendance_schedule_cache(person_id,work_date,schedules_json,verified_at) values(?,?,?,?)').run(member.pid,date,shiftRows(CYCLE[((phases[member.teamId]+i)%4+4)%4],date),'2026-11-13T20:00:00.000Z');
 }
 const admin={id:'admin',personId:'admin-p',permissions};
 const service=createHandoverService({db,clock:()=>clock,hasRbac:(user,code)=>!!user?.permissions?.includes(code)});
 return {db,service,members,admin};
}
test('four teams are inferred from schedule data with correct phases',()=>{
 const {service,admin}=fixture();
 const overview=service.baselineOverview(admin);
 const byTeam=new Map(overview.teams.map(t=>[t.teamId,t]));
 assert.equal(byTeam.get('TEAM-LINE-1').upcoming[0].phase,'白班');
 assert.equal(byTeam.get('TEAM-LINE-2').upcoming[0].phase,'夜班');
 assert.equal(byTeam.get('TEAM-LINE-3').upcoming[0].phase,'休息');
 assert.equal(byTeam.get('TEAM-LINE-4').upcoming[0].phase,'休息');
 assert.equal(byTeam.get('TEAM-LINE-1').upcoming[1].phase,'夜班','明日相位推进一天');
 assert.equal(byTeam.get('TEAM-LINE-1').row.status,'inferred');
});
test('shift context recommends the pairing by duty window and falls back to position leaders',()=>{
 const {service,admin,members}=fixture();
 const morning=service.shiftContext(admin);
 assert.equal(morning.fromTeam.id,'TEAM-LINE-3','上午交班=昨日夜班组');
 assert.equal(morning.toTeam.id,'TEAM-LINE-1','上午接班=今日白班组');
 assert.equal(morning.recipientBasis,'position_fallback');
 assert.ok(morning.recipients.some(r=>r.userId===members.find(m=>m.teamId==='TEAM-LINE-1'&&m.position==='班组长').uid));
 assert.equal(morning.needsConfirmation,true);
 const {db}=fixture();
 const evening=createHandoverService({db,clock:()=>Date.parse(TODAY+'T19:00:00+08:00'),hasRbac:(user,code)=>!!user?.permissions?.includes(code)}).shiftContext(admin);
 assert.equal(evening.fromTeam.id,'TEAM-LINE-1','傍晚交班=今日白班组');
 assert.equal(evening.toTeam.id,'TEAM-LINE-2','傍晚接班=今日夜班组');
});
test('confirmed baseline with leader drives recipient recommendation',()=>{
 const {service,admin,members}=fixture({clock:Date.parse(TODAY+'T19:00:00+08:00')});
 const leader=members.find(m=>m.teamId==='TEAM-LINE-2'&&m.position==='班组长');
 service.confirmBaseline(admin,{teams:[{teamId:'TEAM-LINE-1',anchorDate:TODAY,anchorPhase:0},{teamId:'TEAM-LINE-2',anchorDate:TODAY,anchorPhase:1,leaderPersonId:leader.pid},{teamId:'TEAM-LINE-3',anchorDate:TODAY,anchorPhase:2},{teamId:'TEAM-LINE-4',anchorDate:TODAY,anchorPhase:3}]});
 const context=service.shiftContext(admin);
 assert.equal(context.toTeam.id,'TEAM-LINE-2');
 assert.equal(context.recipientBasis,'baseline_leader');
 assert.equal(context.recipients[0].userId,leader.uid);
 assert.equal(context.needsConfirmation,false);
});
test('individual absence does not distort the team phase',()=>{
 const {db}=fixture();
 db.prepare('update attendance_schedule_cache set schedules_json=? where person_id=? and work_date=?').run(JSON.stringify([{is_rest:'Y'}]),'TEAM-LINE-1-p1',TODAY);
 const service=createHandoverService({db,clock:()=>Date.parse(TODAY+'T09:00:00+08:00'),hasRbac:()=>true});
 const overview=service.baselineOverview({id:'admin',permissions:['handover.baseline.manage']});
 assert.equal(overview.teams.find(t=>t.teamId==='TEAM-LINE-1').upcoming[0].phase,'白班','个别成员请假不改变班组多数相位');
});
test('insufficient schedule data leaves baseline empty and flags setup',()=>{
 const {service,admin}=fixture({days:2});
 const context=service.shiftContext(admin);
 assert.equal(context.needsSetup,true);
 assert.match(context.setupHint,/管理员/);
 const overview=service.baselineOverview(admin);
 assert.ok(overview.teams.every(t=>!t.row));
});
test('baseline management requires the permission',()=>{
 const {service}=fixture();
 assert.throws(()=>service.baselineOverview({id:'x',permissions:[]}),/没有执行该操作的权限/);
 assert.throws(()=>service.confirmBaseline({id:'x',permissions:[]},{teams:[]}),/没有执行该操作的权限/);
});
test('confirm rejects leaders outside the team and invalid phases',()=>{
 const {service,admin,members}=fixture();
 const outsider=members.find(m=>m.teamId==='TEAM-LINE-1');
 assert.throws(()=>service.confirmBaseline(admin,{teams:[{teamId:'TEAM-LINE-2',anchorDate:TODAY,anchorPhase:1,leaderPersonId:outsider.pid}]}),/班组长不属于该班组/);
 assert.throws(()=>service.confirmBaseline(admin,{teams:[{teamId:'TEAM-LINE-2',anchorDate:TODAY,anchorPhase:5}]}),/基准相位无效/);
 assert.throws(()=>service.confirmBaseline(admin,{teams:[{teamId:'TEAM-LINE-9',anchorDate:TODAY,anchorPhase:1}]}),/未知班组/);
});
