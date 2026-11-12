import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveOffsetFacts, accumulatedCoverage, exchangeSeconds} from '../attendance-offset-facts.mjs';
const date='2026-11-09', on=Date.parse(date+'T08:30:00+08:00'), off=Date.parse(date+'T19:40:00+08:00'), now=off+3600000;
const make=()=>({date,covered:true,points:[{type:'OnDuty',planned:on,planId:'on'},{type:'OffDuty',planned:off,planId:'off'}],punches:[],approvals:[]});
const resolve=a=>resolveOffsetFacts('p',a,{now,sourceReadAt:now});
test('R03/R05 missing both punches permits only the off point without mutating input',()=>{
 const a=make(),before=JSON.stringify(a),r=resolve(a);assert.equal(r.eligibility,'eligible');assert.equal(r.items.length,1);assert.equal(r.items[0].type,'day_off_missing');assert.equal(JSON.stringify(a),before);
});
test('R07 logical identity survives source hash and point order changes',()=>{
 const a=make(),id=resolve(a).items[0].eventId;a.source_hash='new';a.points.reverse();assert.equal(resolve(a).items[0].eventId,id);
});
test('R04 stale, exempt, night, rest, identity and conflicting sources cannot apply',()=>{
 const a=make();assert.equal(resolveOffsetFacts('p',a,{now,sourceReadAt:on}).eligibility,'unresolved');
 a.approvals=[{approved:true,kind:'请假',start:on,end:off}];assert.equal(resolve(a).items.length,0);
 for(const change of [{rest:true},{identityIssue:'x'},{scheduleConflict:true},{covered:false}])assert.notEqual(resolve({...make(),...change}).eligibility,'eligible');
 const night=make();night.points[1].planned+=86400000;assert.equal(resolveOffsetFacts('p',night,{now:now+86400000,sourceReadAt:now+86400000}).eligibility,'ineligible');
});
test('R06 only paired Early is eligible, unrelated Early does not qualify',()=>{
 const a=make();a.punches=[{...a.points[1],actual:off-60000,source:'USER',timeResult:'Early'}];assert.equal(resolve(a).items[0].type,'day_off_early');
 a.punches[0].planId='other';a.punches[0].planned=off-1;assert.equal(resolve(a).items[0].type,'day_off_missing');
});
test('R01 exchange preserves seconds and complete units',()=>{
 assert.equal(exchangeSeconds(14399,14400,1,3),0);assert.equal(exchangeSeconds(14400,14400,1,3),1);assert.equal(exchangeSeconds(21600,14400,2,9),2);assert.equal(exchangeSeconds(46800,14400,1,3),3);
});
test('R02 incomplete accumulation is not a complete month; rest is not missing time',()=>{
 const a=make();a.punches=[{...a.points[1],actual:off+61000,source:'USER',timeResult:'Normal'}];
 const r=accumulatedCoverage([{date,input:a,sourceReadAt:now},{date:'2026-11-08',input:{covered:false}}],now);
 assert.equal(r.seconds,61);assert.equal(r.status,'pending_review');
 assert.equal(accumulatedCoverage([{date,input:{covered:true,rest:true,points:[]}}],now,{expectedDates:[date]}).status,'complete');
});

import {DatabaseSync} from 'node:sqlite';
import {createOffsetRegister} from '../attendance-offset-register.mjs';
test('persistent register revisions are idempotent and unresolved input retains successful evidence',()=>{
 const db=new DatabaseSync(':memory:');const register=createOffsetRegister({db,clock:()=>now});
 const a=make();register.reconcile('p',a,now);register.reconcile('p',a,now);
 let row=db.prepare('select * from attendance_offset_events').get();assert.equal(row.revision,1);
 register.reconcile('p',{...a,covered:false},now);assert.equal(db.prepare('select active from attendance_offset_events').get().active,1);
 a.punches=[{...a.points[1],actual:off,source:'USER',timeResult:'Normal'}];register.reconcile('p',a,now);
 row=db.prepare('select * from attendance_offset_events').get();assert.equal(row.active,0);assert.equal(row.revision,2);
 a.punches=[];register.reconcile('p',a,now);row=db.prepare('select * from attendance_offset_events').get();assert.equal(row.revision,3);
 assert.equal(register.responsibility('p',date).status,'unresolved');db.close();
});

test('partial or empty caller input cannot claim monthly completeness',()=>{
 assert.equal(accumulatedCoverage([],now).status,'pending_review');
 assert.equal(accumulatedCoverage([],now,{expectedDates:[date]}).unresolved[0].reason,'来源日记录缺失');
});

test('conflicting statuses on the same effective record and malformed segment plans remain unresolved',()=>{
 const a=make();const punch={...a.points[1],actual:off-60000,source:'USER',timeResult:'Early'};a.punches=[punch,{...punch,timeResult:'Normal'}];assert.equal(resolve(a).eligibility,'unresolved');
 const bad=make();bad.points.push({...bad.points[1],planId:'extra',planned:off+60000});assert.equal(resolve(bad).eligibility,'unresolved');
});

test('a shared schedule ID never collapses independent OffDuty points into one event',()=>{
 const a=make();a.points=[{type:'OnDuty',planned:on,planId:'same'},{type:'OffDuty',planned:on+3600000,planId:'same'},{type:'OnDuty',planned:on+7200000,planId:'same'},{type:'OffDuty',planned:off,planId:'same'}];
 const r=resolve(a);assert.equal(r.items.length,2);assert.notEqual(r.items[0].eventId,r.items[1].eventId);
});

import {offsetDayLabel} from '../attendance-offset-facts.mjs';
test('R06 day summary never implies that a non-offsettable late or mixed exception has been erased',()=>{
 assert.equal(offsetDayLabel({category:'待核对',punchDetails:[]},{approved:1,eligibleCount:1}),'部分已抵消');
 assert.equal(offsetDayLabel({category:'缺卡',punchDetails:[{type:'OnDuty',status:'有效打卡',rawStatus:['Late']}]},{approved:1,eligibleCount:1}),'部分已抵消');
 assert.equal(offsetDayLabel({category:'早退',punchDetails:[]},{approved:1,eligibleCount:1}),'已抵消');
 assert.equal(offsetDayLabel({category:'白班'},{approved:1,eligibleCount:1}),'抵消待核实');
});

test('capped conversion uses exact integer arithmetic even when the intermediate product exceeds Number precision',()=>{
 assert.equal(exchangeSeconds(2147483647,1,2147483647,3),3);
});
test('future actual punches cannot fund an issued monthly allowance',()=>{
 const a=make();a.punches=[{...a.points[1],actual:now+1000,source:'USER',timeResult:'Normal'}];const result=accumulatedCoverage([{date,input:a,sourceReadAt:now}],now,{expectedDates:[date]});assert.equal(result.status,'pending_review');assert.equal(result.seconds,0);assert.match(result.unresolved[0].reason,/尚未发生/);
});
