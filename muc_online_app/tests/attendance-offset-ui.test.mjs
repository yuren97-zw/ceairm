import test from 'node:test';
import assert from 'node:assert/strict';
import {availableOffsetItems,ownLeaveDetail,offsetOperationId,personalDayStatus} from '../public/attendance-offset-ui.mjs';
test('only unoccupied eligible items can enter a new application; rejected history does not block a new request',()=>{
 const day={eligibility:{items:[{eventId:'pending'},{eventId:'approved'},{eventId:'rejected'},{eventId:'returned'}]},offset:{items:[{eventId:'pending',decision:'pending'},{eventId:'approved',decision:'approved',effective:1},{eventId:'rejected',decision:'rejected'},{eventId:'returned',decision:'approved',effective:0}]}};
 assert.deepEqual(availableOffsetItems(day).map(i=>i.eventId),['rejected','returned']);assert.deepEqual(availableOffsetItems({}),[]);
});

test('R12 own holiday detail preserves units, current availability, expiry and readable periods without inventing missing balances',()=>{
 const cell={group:'公休假',units:[{used:1,quota:5,remaining:4,unavailable:2,unit:'天'},{used:1,quota:3,remaining:2,unavailable:0,unit:'小时'}],quotas:[{names:['固定班制公休假'],availability:'expired',start:Date.parse('2026-01-01T00:00:00+08:00'),end:Date.parse('2026-10-31T23:59:59+08:00')}],records:[{period:'未来已批准占用',start:Date.parse('2026-11-20T08:30:00+08:00'),end:Date.parse('2026-11-20T12:30:00+08:00'),values:[{amount:0.5,unit:'天'}]}],issues:['<待核对>']};
 const quota=ownLeaveDetail(cell,'quota');assert.match(quota,/当前可用2天/);assert.match(quota,/当前可用2小时/);assert.match(quota,/已过期/);assert.match(quota,/2026-10-31/);assert.match(quota,/&lt;待核对&gt;/);
 const records=ownLeaveDetail(cell,'records');assert.match(records,/未来已批准占用/);assert.match(records,/0.5天/);assert.match(records,/2026-11-20 08:30:00/);assert.match(ownLeaveDetail({group:'婚假'},'quota'),/尚未同步或未完整/);
});

test('LAN phone preview generates secure operation IDs without randomUUID and fails before UI creation without entropy',()=>{
 const fallback={getRandomValues:array=>globalThis.crypto.getRandomValues(array)};
 const values=Array.from({length:100},()=>offsetOperationId(fallback));assert.equal(new Set(values).size,100);for(const v of values)assert.match(v,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(offsetOperationId({randomUUID:()=> 'native-id'}),'native-id');assert.throws(()=>offsetOperationId({}),/缺少安全随机数/);
});

test('personal popup separates original verdict and approval without hiding partial or invalid outcomes',()=>{
 const day={reason:'存在未被审批解释的缺卡',offset:{label:'已抵消',items:[{decision:'approved',effective:1,approverName:'刘亚乾'}]}};const html=personalDayStatus(day);assert.match(html,/已抵消，原始记录保留/);assert.match(html,/审批人：刘亚乾/);assert.match(html,/使用次数：1次/);assert.match(html,/原始判定：/);assert.match(html,/存在未被审批解释的缺卡/);assert.match(personalDayStatus({...day,offset:{...day.offset,label:'部分已抵消'}}),/部分已抵消，原始记录保留/);assert.doesNotMatch(personalDayStatus({...day,offset:{items:[{decision:'approved',effective:0}]}}),/使用次数/);assert.match(personalDayStatus({...day,offset:{...day.offset,items:[{decision:'approved',effective:1,approverName:'<姓名>'}]}}),/&lt;姓名&gt;/);
});

test('unified table preserves six/seven columns, paired timestamps and employee apply entry',async()=>{
 const {homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');const d={date:'2026-11-01',category:'缺卡',reason:'原始原因',issues:['问题'],purposes:[{category:'培训'}],shift:'白班',overtime:{seconds:0},eligibility:{items:[{eventId:'x'}]},punchDetails:[{type:'OnDuty',planned:1793493000000,actual:1793493000000,status:'有效打卡'}]};
 const issues=homeAttendanceTable([d],'issues',{canApply:true});assert.equal((issues.match(/<th>/g)||[]).length,6);assert.match(issues,/处理结果/);assert.match(issues,/审批人/);assert.match(issues,/data-apply/);assert.match(issues,/data-open-day="2026-11-01"/);const schedule=homeAttendanceTable([d],'schedule');assert.equal((schedule.match(/<th>/g)||[]).length,7);assert.match(schedule,/有效实际上班/);assert.match(schedule,/0小时0分/);
});
test('unified exception predicate and processing distinguish valid approvals, pending, partial, withdrawal and invalidation',async()=>{
 const {attendanceIssueDay,attendanceProcessingLines}=await import('../public/attendance-presentation.mjs');for(const category of ['迟到','严重迟到','早退','旷工迟到','旷工','缺卡','待核对'])assert.equal(attendanceIssueDay({category}),true);for(const category of ['未来日期','未同步','尚未到下班时间','病假','白班'])assert.equal(attendanceIssueDay({category}),false);
 const item={requestId:'r',decision:'pending',requestStatus:'pending',assigneeName:'负责人'};assert.equal(attendanceProcessingLines({offset:{items:[item]}})[0].approver,'待审批：负责人');assert.equal(attendanceProcessingLines({offset:{items:[{...item,requestStatus:'withdrawn'}]}})[0].result,'已撤回');assert.equal(attendanceProcessingLines({offset:{label:'部分已抵消',items:[{...item,decision:'approved',effective:1,active:1,approverName:'审批人'}]}})[0].result,'部分已抵消');assert.equal(attendanceProcessingLines({offset:{items:[{...item,decision:'approved',effective:0}]}})[0].result,'抵消失效');
});

test('shared category badges preserve exact management colors, escaped names and separate processing labels',async()=>{
 const {attendanceCategoryBadge,attendanceTone,attendanceBadgeStyles}=await import('../public/attendance-presentation.mjs');const {homeAttendanceTable}=await import('../public/attendance-offset-ui.mjs');for(const category of ['休息','白班','夜班','缺卡','迟到','待核对','病假','未定义']){const leaves=['病假'],badge=attendanceCategoryBadge(category,leaves),tone=attendanceTone(category,leaves);assert.ok(badge.includes(tone.background));assert.ok(badge.includes(tone.foreground));assert.match(badge,/att-tag att-tone/);}assert.match(attendanceCategoryBadge('<未知>'),/&lt;未知&gt;/);assert.match(attendanceBadgeStyles,/offset-table-sheet/);const html=homeAttendanceTable([{date:'2026-11-01',category:'休息',offset:{label:'部分已抵消'},overtime:{seconds:null},punchDetails:[]}],'schedule');assert.ok(html.includes(attendanceCategoryBadge('休息')));assert.match(html,/<\/span><small>部分已抵消<\/small>/);
});

test('own holiday tables hide unissued quota and zero records, retain used-up grants, hours, returns and incomplete notices',async()=>{const {ownLeaveTables}=await import('../public/attendance-offset-ui.mjs');const cells=[{group:'公休假',status:'ready',coverage:'complete',units:[{unit:'天',quota:2,used:2,remaining:0,unavailable:0}],records:[{name:'公休假',values:[{amount:0,unit:'天'}]},{name:'公休假',period:'已撤销／退回',values:[{amount:-0.5,unit:'天'}]}]},{group:'婚假',status:'no_quota',coverage:'complete',units:[{unit:'天',quota:0,used:0,remaining:0,unavailable:0}],records:[]}];const html=ownLeaveTables(cells,'quota');assert.match(html,/2天/);assert.match(html,/当前可用0天/);assert.doesNotMatch(html,/婚假/);assert.equal((html.match(/<tbody><tr>/g)||[]).length,1);const records=ownLeaveTables(cells,'records');assert.match(records,/-0.5天/);assert.match(records,/已撤销／退回/);assert.doesNotMatch(records,/婚假/);assert.match(ownLeaveTables([{group:'婚假',status:'not_synced',coverage:'partial'}],'quota'),/尚未同步或未完整/);});
