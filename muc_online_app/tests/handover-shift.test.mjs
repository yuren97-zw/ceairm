import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHandoverService} from '../handover-service.mjs';
const TODAY='2026-11-15';
function fixture({clock=Date.parse(TODAY+'T09:00:00+08:00'),teamOfUser='TEAM-LINE-4'}={}){
 const db=new DatabaseSync(':memory:');
 db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
 db.exec("create table users(id text primary key,person_id text,status text default 'active')");
 db.exec("create table organization_units(id text primary key,code text,name text,unit_type text,parent_id text,status text default 'active')");
 for(const [code,name] of [['TEAM-LINE-1','一组'],['TEAM-LINE-2','二组'],['TEAM-LINE-3','三组'],['TEAM-LINE-4','四组']])db.prepare('insert into organization_units(id,code,name,unit_type) values(?,?,?,?)').run('org-'+code,code,name,'administrative_team');
 let seq=0;
 for(const [code,name] of [['TEAM-LINE-1','一组'],['TEAM-LINE-2','二组'],['TEAM-LINE-3','三组'],['TEAM-LINE-4','四组']]){
  db.prepare('insert into personnel(id,employee_no,name,position_code,administrative_team_id) values(?,?,?,?,?)').run('p-'+code,String(10000+seq++),name+'组长','班组长','org-'+code);
  db.prepare('insert into users(id,person_id) values(?,?)').run('u-'+code,'p-'+code);
 }
 const admin={id:'admin',permissions:['handover.view','handover.create','handover.baseline.manage','handover.export','handover.history.all']};
 const me={id:'u-'+teamOfUser,permissions:['handover.view','handover.create','handover.export','handover.history.all','handover.baseline.manage']};
 const service=createHandoverService({db,clock:()=>clock,hasRbac:(u,code)=>!!u?.permissions?.includes(code)});
 return {db,service,admin,me};
}
test('fixed rotation seeds anchors and reproduces the stated sequence',()=>{
 const {service,admin}=fixture();
 const overview=service.baselineOverview(admin);
 const phaseAt=(teamId,offset)=>overview.teams.find(t=>t.teamId===teamId).upcoming[offset].phase;
 const expectDay=(offset,white,night)=>{assert.equal(phaseAt(white,offset),'白班',`D+${offset} 白班`);assert.equal(phaseAt(night,offset),'夜班',`D+${offset} 夜班`);};
 expectDay(0,'TEAM-LINE-4','TEAM-LINE-2');
 expectDay(1,'TEAM-LINE-1','TEAM-LINE-4');
 expectDay(2,'TEAM-LINE-3','TEAM-LINE-1');
 expectDay(3,'TEAM-LINE-2','TEAM-LINE-3');
 assert.equal(overview.teams.every(t=>t.row?.status==='confirmed'),true,'固定规则种子即视为已确认');
});
test('shift context recommends the operator team and rotation-based receiver',()=>{
 const {service,me}=fixture({teamOfUser:'TEAM-LINE-4',clock:Date.parse(TODAY+'T19:00:00+08:00')});
 const context=service.shiftContext(me);
 assert.equal(context.fromTeam.id,'TEAM-LINE-4','交班=提交人所在班组');
 assert.equal(context.toTeam.id,'TEAM-LINE-2','四组白→二组夜');
 assert.equal(context.recipientBasis,'team_leader_position');
 assert.equal(context.recipients[0].userId,'u-TEAM-LINE-2','推荐接班班组班组长');
});
test('night-shift operator hands to the next morning white team',()=>{
 const {service,me}=fixture({teamOfUser:'TEAM-LINE-2',clock:Date.parse('2026-11-16T09:00:00+08:00')});
 const context=service.shiftContext(me);
 assert.equal(context.fromTeam.id,'TEAM-LINE-2','交班=提交人班组（昨夜二组）');
 assert.equal(context.toTeam.id,'TEAM-LINE-1','11-16 白班=一组');
});
test('resting operator falls back to the duty-window pairing',()=>{
 const {service,me}=fixture({teamOfUser:'TEAM-LINE-3',clock:Date.parse(TODAY+'T09:00:00+08:00')});
 const context=service.shiftContext(me);
 assert.equal(context.toTeam.id,'TEAM-LINE-4','三组休班时按窗口推荐当日白班组');
});
test('recipient options only list 班组长 positions with team recommendation',()=>{
 const {service,me}=fixture();
 const options=service.recipientOptions(me,{teamId:'TEAM-LINE-2'});
 assert.equal(options.items.length,4,'候选仅班组长职位');
 assert.deepEqual(options.recommended.map(r=>r.user_name),['二组组长']);
 assert.equal(service.recipientOptions(me,{}).recommended.length,0,'未指定接班班组时不推荐');
});
test('create locks the from team to the leaders own team and org-row ids still map to fixed codes',()=>{
 const {service,db}=fixture();
 db.prepare("insert into personnel(id,employee_no,name,position_code,administrative_team_id) values('p-x','19990001','外来','班组长','org-TEAM-LINE-3')").run();
 db.prepare("insert into users(id,person_id) values('u-X','p-x')").run();
 // V1.1 §5.1：交班班组锁定为班组长本人行政班组；组织行 id 仍解析为固定代码。
 const created=service.create({id:'u-X',permissions:['handover.view','handover.create']},{toTeamId:'TEAM-LINE-1',otherItems:'本班发起'});
 assert.equal(created.handover.fromTeamId,'TEAM-LINE-3','组织行 id 映射到固定代码');
 assert.equal(created.handover.fromTeamName,'三组');
 const explicit=service.create({id:'u-X',permissions:['handover.view','handover.create']},{fromTeamId:'TEAM-LINE-1',toTeamId:'TEAM-LINE-1',otherItems:'显式传他组应被忽略'});
 assert.equal(explicit.handover.fromTeamId,'TEAM-LINE-3','显式传入他组不再改变交班班组');
});
