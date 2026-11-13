import test from 'node:test';
import assert from 'node:assert/strict';
import {availableOffsetItems,ownLeaveQuotaTable,ownLeaveRecordEntries,ownLeaveRecordTable,offsetOperationId} from '../public/attendance-offset-ui.mjs';
test('only unoccupied eligible items can enter a new application; rejected history does not block a new request',()=>{
 const day={eligibility:{items:[{eventId:'pending'},{eventId:'approved'},{eventId:'rejected'},{eventId:'returned'}]},offset:{items:[{eventId:'pending',decision:'pending'},{eventId:'approved',decision:'approved',effective:1},{eventId:'rejected',decision:'rejected'},{eventId:'returned',decision:'approved',effective:0}]}};
 assert.deepEqual(availableOffsetItems(day).map(i=>i.eventId),['rejected','returned']);assert.deepEqual(availableOffsetItems({}),[]);
});

test('R12 own holiday tables show granted quota rows with validity and status, and readable record periods without inventing missing balances',()=>{
 const cell={group:'公休假',status:'ready',coverage:'complete',quotas:[{id:'q1',year:2026,names:['固定班制公休假'],availability:'expired',start:Date.parse('2026-01-01T00:00:00+08:00'),end:Date.parse('2026-10-31T23:59:59+08:00'),values:[{unit:'天',quota:5,used:1,remaining:4},{unit:'小时',quota:3,used:1,remaining:2}]}],issues:['<待核对>']};
 const quota=ownLeaveQuotaTable([cell]);assert.match(quota,/公休假<small>固定班制公休假 · 2026年度<\/small>/);assert.match(quota,/1\/5 · 4天/);assert.match(quota,/1\/3 · 2小时/);assert.match(quota,/已过期，非当前可休余额/);assert.match(quota,/2026-01-01/);assert.match(quota,/2026-10-31/);assert.doesNotMatch(quota,/&lt;待核对&gt;/);
 const zeroGrant=ownLeaveQuotaTable([{group:'婚假',status:'ready',coverage:'complete',quotas:[{id:'q2',year:2026,names:['婚假'],availability:'active',values:[{unit:'天',quota:0,used:0,remaining:0}]}]}]);assert.doesNotMatch(zeroGrant,/婚假/);assert.match(zeroGrant,/暂无已发放额度的假期/);
 const entries=ownLeaveRecordEntries([[{group:'公休假',records:[{id:'r1',name:'公休假',period:'未来已批准占用',start:Date.parse('2026-11-20T08:30:00+08:00'),end:Date.parse('2026-11-20T12:30:00+08:00'),values:[{amount:0.5,unit:'天'}]}]}]],2026);assert.equal(entries.length,1);
 const records=ownLeaveRecordTable(entries);assert.match(records,/未来已批准占用/);assert.match(records,/0\.5天/);assert.match(records,/2026-11-20 08:30:00/);
 assert.match(ownLeaveQuotaTable([{group:'婚假',status:'not_synced',coverage:'partial'}]),/尚未同步或未完整/);
});

test('LAN phone preview generates secure operation IDs without randomUUID and fails before UI creation without entropy',()=>{
 const fallback={getRandomValues:array=>globalThis.crypto.getRandomValues(array)};
 const values=Array.from({length:100},()=>offsetOperationId(fallback));assert.equal(new Set(values).size,100);for(const v of values)assert.match(v,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(offsetOperationId({randomUUID:()=> 'native-id'}),'native-id');assert.throws(()=>offsetOperationId({}),/缺少安全随机数/);
});

test('unified table preserves six/seven columns, paired timestamps and employee apply entry',async()=>{
 const {homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');const d={date:'2026-11-01',category:'缺卡',reason:'原始原因',issues:['问题'],purposes:[{category:'培训'}],shift:'白班',overtime:{seconds:0},eligibility:{items:[{eventId:'x'}]},punchDetails:[{type:'OnDuty',planned:1793493000000,actual:1793493000000,status:'有效打卡'}]};
 const issues=homeAttendanceTable([d],'issues',{canApply:true});assert.equal((issues.match(/<th>/g)||[]).length,6);assert.match(issues,/处理结果/);assert.match(issues,/审批人/);assert.match(issues,/data-apply/);assert.match(issues,/data-open-day="2026-11-01"/);const schedule=homeAttendanceTable([d],'schedule');assert.equal((schedule.match(/<th>/g)||[]).length,7);assert.match(schedule,/有效实际上班/);assert.match(schedule,/0小时0分/);const accumulation=homeAttendanceTable([d],'accumulation');assert.equal((accumulation.match(/<th>/g)||[]).length,7);assert.match(accumulation,/可横向滚动的考勤表格/);assert.match(accumulation,/data-open-day="2026-11-01"/);assert.match(homeAttendanceTable([],'accumulation'),/本月暂无记录/);
});
test('unified exception predicate and processing distinguish valid approvals, pending, partial, withdrawal and invalidation',async()=>{
 const {attendanceIssueDay,attendanceProcessingLines}=await import('../public/attendance-presentation.mjs');for(const category of ['迟到','严重迟到','早退','旷工迟到','旷工','缺卡','待核对'])assert.equal(attendanceIssueDay({category}),true);for(const category of ['未来日期','未同步','尚未到下班时间','病假','白班'])assert.equal(attendanceIssueDay({category}),false);
 const item={requestId:'r',decision:'pending',requestStatus:'pending',assigneeName:'负责人'};assert.equal(attendanceProcessingLines({offset:{items:[item]}})[0].approver,'待审批：负责人');assert.equal(attendanceProcessingLines({offset:{items:[{...item,requestStatus:'withdrawn'}]}})[0].result,'已撤回');assert.equal(attendanceProcessingLines({offset:{label:'部分已抵消',items:[{...item,decision:'approved',effective:1,active:1,approverName:'审批人'}]}})[0].result,'部分已抵消');assert.equal(attendanceProcessingLines({offset:{items:[{...item,decision:'approved',effective:0}]}})[0].result,'抵消失效');
});

test('shared category badges preserve exact management colors, escaped names and separate processing labels',async()=>{
 const {attendanceCategoryBadge,attendanceTone,attendanceBadgeStyles}=await import('../public/attendance-presentation.mjs');const {homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');for(const category of ['休息','白班','夜班','缺卡','迟到','待核对','病假','未定义']){const leaves=['病假'],badge=attendanceCategoryBadge(category,leaves),tone=attendanceTone(category,leaves);assert.ok(badge.includes(tone.background));assert.ok(badge.includes(tone.foreground));assert.match(badge,/att-tag att-tone/);}assert.match(attendanceCategoryBadge('<未知>'),/&lt;未知&gt;/);assert.match(attendanceBadgeStyles,/offset-table-sheet/);const html=homeAttendanceTable([{date:'2026-11-01',category:'休息',offset:{label:'部分已抵消'},overtime:{seconds:null},punchDetails:[]}],'schedule');assert.ok(html.includes(attendanceCategoryBadge('休息')));assert.match(html,/<\/span><small>部分已抵消<\/small>/);
});

test('own holiday tables hide unissued quota and zero records, merge previous-year entries with pending attribution and incomplete notices',()=>{
 const cells=[{group:'公休假',status:'ready',coverage:'complete',quotas:[{id:'q1',year:2026,names:['公休假'],availability:'active',start:Date.parse('2026-01-01T00:00:00+08:00'),end:Date.parse('2026-12-31T23:59:59+08:00'),values:[{unit:'天',quota:2,used:2,remaining:0}]}]},{group:'婚假',status:'no_quota',coverage:'complete',quotas:[{id:'q2',year:2026,names:['婚假'],availability:'active',values:[{unit:'天',quota:0,used:0,remaining:0}]}]}];
 const html=ownLeaveQuotaTable(cells);assert.match(html,/2\/2 · 0天/);assert.match(html,/生效中/);assert.doesNotMatch(html,/婚假/);assert.equal((html.match(/<tbody><tr>/g)||[]).length,1);
 const entries=ownLeaveRecordEntries([[{group:'公休假',records:[{id:'r1',name:'公休假',period:'已发生休假',start:Date.parse('2026-03-01T08:00:00+08:00'),end:Date.parse('2026-03-02T18:00:00+08:00'),values:[{amount:2,unit:'天'}]},{id:'r6',name:'公休假',period:'已撤销／退回',start:Date.parse('2026-05-01T08:00:00+08:00'),end:Date.parse('2026-05-01T12:00:00+08:00'),values:[{amount:-0.5,unit:'天'}]}],unassigned:[{id:'r2',name:'公休假',type:'leave',status:'success',start:Date.parse('2026-04-01T08:00:00+08:00'),end:Date.parse('2026-04-02T18:00:00+08:00'),values:[{amount:1,unit:'天'}]}]}],[{group:'公休假',records:[{id:'r1',name:'公休假',period:'已发生休假',start:Date.parse('2026-03-01T08:00:00+08:00'),end:Date.parse('2026-03-02T18:00:00+08:00'),values:[{amount:2,unit:'天'}]},{id:'r3',name:'公休假',period:'已发生休假',start:Date.parse('2025-12-15T08:00:00+08:00'),end:Date.parse('2025-12-16T18:00:00+08:00'),values:[{amount:3,unit:'天'}]},{id:'r4',name:'公休假',period:'已发生休假',start:Date.parse('2024-05-01T08:00:00+08:00'),end:Date.parse('2024-05-02T18:00:00+08:00'),values:[{amount:1,unit:'天'}]},{id:'r5',name:'公休假',period:'已发生休假',start:Date.parse('2025-06-01T08:00:00+08:00'),end:Date.parse('2025-06-02T18:00:00+08:00'),values:[{amount:0,unit:'天'}]}]}]],2026);
 assert.deepEqual(entries.map(e=>e.id),['r6','r2','r1','r3']);
 const records=ownLeaveRecordTable(entries);assert.match(records,/-0\.5天/);assert.match(records,/已撤销／退回/);assert.match(records,/年度归属待核对/);assert.match(records,/3天/);assert.doesNotMatch(records,/婚假/);assert.equal((records.match(/<tr>/g)||[]).length,5);
 assert.match(ownLeaveRecordTable([],{incomplete:true}),/尚未同步或未完整/);assert.match(ownLeaveRecordTable([]),/暂无前一年及当年的休假记录/);
});
test('accumulation shows configured exchange ratio and removes only its old scrolling instruction',async()=>{
 const {exchangeRuleText,homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');
 assert.equal(exchangeRuleText({hours:2,count:1,cap:3}),'兑换规则：每累计2小时兑换1次，每月最多3次，下月使用。');
 assert.equal(exchangeRuleText({hours:2.5,count:2,cap:4}),'兑换规则：每累计2.5小时兑换2次，每月最多4次，下月使用。');
 assert.equal(exchangeRuleText({hours:2,count:1,cap:0}),'兑换规则：当前暂停兑换');assert.equal(exchangeRuleText(null),'兑换规则尚未设置');
 assert.doesNotMatch(homeAttendanceTable([],'accumulation'),/表格可左右滑动查看完整内容/);assert.match(homeAttendanceTable([],'accumulation'),/home-att-table/);assert.match(homeAttendanceTable([],'issues'),/表格可左右滑动查看完整内容/);
});
test('only accumulation swaps overtime and trip purpose, keeping row cells aligned and source unchanged',async()=>{
 const {homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');
 const day={date:'2026-11-13',category:'白班',shift:'白班',purposes:[{category:'模拟用途'}],punchDetails:[],overtime:{seconds:7200}},before=JSON.stringify(day);
 const cells=html=>[...html.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(m=>m[1]);
 const accumulation=homeAttendanceTable([day],'accumulation'),schedule=homeAttendanceTable([day],'schedule');
 assert.match(accumulation,/<th>班次<\/th><th>当日加班<\/th><th>有效实际上班<\/th><th>有效实际下班<\/th><th>出差用途<\/th>/);
 assert.match(cells(accumulation)[3],/2小时0分/);assert.equal(cells(accumulation)[6],'模拟用途');assert.equal(cells(schedule)[3],'模拟用途');assert.match(cells(schedule)[6],/2小时0分/);assert.doesNotMatch(schedule,/home-accumulation-table/);assert.equal(JSON.stringify(day),before);
});
