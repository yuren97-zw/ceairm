import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {attendanceViewerSnapshot} from '../attendance-response-policy.mjs';
test('read-only HTTP snapshots remove every aggregate alias without mutating exports or daily details',()=>{
 const data={approvalReasonCoverage:{total:5},people:[{personId:'p1',counts:{白班:2},displayCounts:{白班:3},pendingCounts:{外出:1},overtimeSeconds:10,computedDays:2,uncomputableDays:0,days:[{category:'白班'}]}]};
 const safe=attendanceViewerSnapshot(data,false);for(const key of ['counts','displayCounts','pendingCounts','overtimeSeconds','computedDays','uncomputableDays'])assert.ok(!(key in safe.people[0]));assert.ok(!('approvalReasonCoverage' in safe));assert.deepEqual(safe.people[0].days,data.people[0].days);assert.equal(data.people[0].counts.白班,2);assert.equal(attendanceViewerSnapshot(data,true),data);
});
test('all JSON attendance views use the shared response boundary',async()=>{const server=await fs.readFile(new URL('../server.mjs',import.meta.url),'utf8');assert.ok(server.includes('attendanceViewerSnapshot(attendanceService.snapshot(actor,filters'));});
