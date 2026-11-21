import test from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';
import {installAccumulation,accumulationPolicies,capAccumulation,capAttendanceDay} from '../attendance-accumulation.mjs';
import {calculateOvertime} from '../attendance-rules.mjs';import {accumulatedCoverage} from '../attendance-offset-facts.mjs';
const at=s=>Date.parse(s+'+08:00'),rule={id:'cap2',single_cap_seconds:7200};
function input(date='2026-11-20',actual='2026-11-20T22:00:00'){const planned=at(date+'T19:40:00');return {date,covered:true,points:[{type:'OffDuty',planId:'off',planned}],punches:[{type:'OffDuty',planId:'off',planned,actual:at(actual),source:'USER',recordId:'p'}]};}
test('cap preserves raw seconds and null, thresholds, per-day aggregation and source immutability',()=>{
 const source=input(),before=JSON.stringify(source),raw=calculateOvertime(source,at('2026-11-21T23:00:00')),capped=capAccumulation(raw,rule);
 assert.equal(raw.seconds,8400);assert.equal(capped.seconds,7200);assert.equal(capped.rawSeconds,8400);assert.equal(capped.excessSeconds,1200);
 for(const seconds of [0,7199,7200,7201,null]){const r=capAccumulation({seconds},rule);assert.equal(r.seconds,seconds===null?null:Math.min(seconds,7200));assert.equal(r.rawSeconds,seconds);}
 assert.equal(capAccumulation(raw,null).seconds,8400);assert.equal(JSON.stringify(source),before);
 const days=[{date:source.date,input:source,sourceReadAt:at('2026-11-21T23:00:00')}];
 assert.equal(accumulatedCoverage(days,at('2026-11-21T23:00:00'),{expectedDates:[source.date],accumulationRule:rule}).seconds,7200);
 const missing={...source,punches:[]};assert.equal(capAccumulation(calculateOvertime(missing,at('2026-11-21T23:00:00')),rule).seconds,null);
 const future=calculateOvertime(source,at('2026-11-20T18:00:00'));assert.equal(capAccumulation(future,rule).seconds,null);
});
test('schema installs twice, historical months unlimited and cache policy versions change',()=>{
 const db=new DatabaseSync(':memory:');installAccumulation(db);installAccumulation(db);
 const before=accumulationPolicies(db);db.prepare('insert into attendance_monthly_exchange_rules values(?,?,?,?,?,?,?,?)').run('new','2026-11',7200,1,3,'admin','2026-11-20',7200);
 const after=accumulationPolicies(db);assert.notEqual(before.version,after.version);assert.equal(after.forDate('2026-10-31'),null);assert.equal(after.forDate('2026-11-01').id,'new');
 const day={date:'2026-11-01',overtime:{seconds:8400}};assert.equal(capAttendanceDay(day,after.forDate(day.date)).overtime.seconds,7200);assert.equal(day.overtime.seconds,8400);db.close();
});
test('one-second precision and last shift endpoint including cross-month workdays',async()=>{
 const {singleCapHoursToSeconds}=await import('../attendance-accumulation.mjs');
 assert.equal(singleCapHoursToSeconds('0.000277777778'),1);assert.equal(singleCapHoursToSeconds('2.5'),9000);assert.equal(singleCapHoursToSeconds(''),null);
 for(const v of ['0','-2','Infinity','1e3','0.00001'])assert.throws(()=>singleCapHoursToSeconds(v));
 const source=input('2026-11-30','2026-12-01T04:00:00');source.points.push({type:'OffDuty',planId:'early',planned:at('2026-11-30T12:00:00')});
 const capped=capAccumulation(calculateOvertime(source,at('2026-12-02T12:00:00')),rule);assert.equal(capped.seconds,7200);assert.equal(source.date,'2026-11-30');
 const future=input();future.punches[0].actual=at('2026-11-20T19:00:00');assert.equal(capAccumulation(calculateOvertime(future,at('2026-11-21T12:00:00')),rule).seconds,0);
});
