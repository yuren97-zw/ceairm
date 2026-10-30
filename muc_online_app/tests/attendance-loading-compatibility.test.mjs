import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {classifyDay,dayOf} from '../attendance-rules.mjs';
test('lightweight snapshots leave monthly approval details to the full leave endpoint',async()=>{
 const source=await fs.readFile(new URL('../public/attendance.mjs',import.meta.url),'utf8');
 assert.ok(source.includes('approvalPeople:data.detailLevel?[]:data.people'));
 assert.ok(source.includes('mountLeaveView'));
 assert.ok(source.includes('approvalReasonBackfill'));
 assert.ok(source.includes('schedulePoll'));
});
test('summary presentation flag preserves modern attribution and midnight semantics',()=>{
 for(const value of ['2026-10-21T15:59:59Z','2026-10-21T16:00:00Z','2028-02-28T16:00:00Z','invalid',0,null])assert.equal(dayOf(value),new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));
 const input={date:'2026-10-01',covered:true,rest:true,points:[],punches:[],approvals:[]},now=Date.parse('2026-10-30T12:00:00+08:00');
 const full=classifyDay(input,now,'2026-10-30T00:00:00Z',{previousWorkDays:[]});
 assert.deepEqual(classifyDay(input,now,'2026-10-30T00:00:00Z',{previousWorkDays:[],includePunchDetails:false}),{...full,punchDetails:[]});
});
