import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyDay,calculateOvertime,tripPurpose,monthDates,datesBetween,stamp} from '../attendance-rules.mjs';
import {normalizeDay,extractReason,configuration} from '../attendance-dingtalk.mjs';
const t=v=>Date.parse(v+'+08:00'),now=t('2026-10-22T22:00:00');
const on=t('2026-09-21T19:40:00'),off=t('2026-09-22T08:30:00');
function input(){return {date:'2026-09-21',covered:true,rest:false,points:[{type:'OnDuty',planned:on,planId:'1'},{type:'OffDuty',planned:off,planId:'2'}],punches:[{type:'OnDuty',planned:on,actual:on-1000,planId:'1',recordId:'a',source:'USER',timeResult:'Normal'},{type:'OffDuty',planned:off,actual:off+3661000,planId:'2',recordId:'b',source:'USER',timeResult:'Normal'}],approvals:[]};}
function trip(reason='培训',detailStatus='ok'){return {id:'approval',kind:'出差',start:on-86400000,end:off+86400000,approved:true,revoked:false,reason,detailStatus};}
test('trip reason matches only exact specified keywords; missing and unmatched differ',()=>{
 assert.equal(tripPurpose('参加培训').category,'培训');assert.equal(tripPurpose('派驻保障').category,'派驻');assert.equal(tripPurpose('学习驻站').category,'出差');assert.equal(tripPurpose('培训和派驻').status,'conflict');assert.equal(tripPurpose(null).status,'reason_missing');assert.equal(tripPurpose('培训','permission_denied').category,null);
});
test('night shift priority keeps purpose and exact seconds, never duplicates day',()=>{const a=input();a.approvals=[trip()];const r=classifyDay(a,now);assert.equal(r.category,'夜班');assert.equal(r.purposes[0].category,'培训');assert.equal(r.overtime.seconds,3661);});
test('purpose conflict does not erase reliable night shift',()=>{const a=input();a.approvals=[trip('派驻培训')];const r=classifyDay(a,now);assert.equal(r.category,'夜班');assert.equal(r.purposes[0].status,'conflict');assert.ok(r.issues.length);});
test('without punches valid trip explains system missing and determines purpose',()=>{const a=input();a.punches=a.punches.map(p=>({...p,source:'SYSTEM',timeResult:'NotSigned',actual:p.planned}));a.approvals=[trip('派驻')];const r=classifyDay(a,now);assert.equal(r.category,'派驻');assert.equal(r.overtime.seconds,null);});
test('unexplained missing is not covered by trip purpose',()=>{const a=input();a.punches=[];a.approvals=[{...trip(),start:off,end:off+1000}];assert.equal(classifyDay(a,now).category,'缺卡');assert.equal(classifyDay(a,now).punchDetails[1].status,'缺卡');});
test('approval missing, denied, conflict and revoked are distinct',()=>{for(const [reason,status] of [[null,'ok'],['培训','permission_denied'],['派驻培训','ok']]){const a=input();a.punches=[];a.approvals=[trip(reason,status)];assert.equal(classifyDay(a,now).category,'待核对');}const a=input();a.punches=[];a.approvals=[{...trip(),revoked:true}];assert.equal(classifyDay(a,now).category,'缺卡');});
test('approved leave does not become absence from SYSTEM/NotSigned',()=>{const a=input();a.punches=[];a.approvals=[{...trip(),kind:'请假',subType:'婚假'}];assert.equal(classifyDay(a,now).category,'婚假');});
test('empty successful response is no record; failed coverage is not zero or absence',()=>{assert.equal(classifyDay({date:'2026-09-01',covered:true},now).category,'无记录');const r=classifyDay({date:'2026-09-01',covered:false},now);assert.equal(r.category,'未同步');assert.equal(r.overtime.seconds,null);});
test('future and not-yet-due shift distinguish incomplete day',()=>{assert.equal(classifyDay({date:'2026-10-23',covered:false},now).category,'未来日期');assert.equal(classifyDay(input(),on+1000).category,'尚未到下班时间');});
test('last scheduled endpoint, not latest unrelated punch',()=>{const a=input();a.points.unshift({type:'OffDuty',planned:on-1000,planId:'0'});a.punches.push({...a.punches[1],actual:off+86400000,planId:'different'});assert.equal(calculateOvertime(a,now).seconds,3661);});
test('single missing start can still calculate overtime',()=>{const a=input();a.punches.shift();const r=classifyDay(a,now);assert.equal(r.category,'缺卡');assert.equal(r.overtime.seconds,3661);});
test('duplicates dedupe; conflicting valid endpoint does not silently choose latest',()=>{const a=input();a.punches.push({...a.punches[1]});assert.equal(calculateOvertime(a,now).seconds,3661);a.punches.push({...a.punches[1],actual:off+7200000});assert.equal(calculateOvertime(a,now).seconds,null);assert.equal(classifyDay(a,now).category,'待核对');});
test('early endpoint equals genuine zero, not missing',()=>{const a=input();a.punches[1].actual=off-60000;assert.equal(calculateOvertime(a,now).seconds,0);});
test('rest shift is explicit and unplanned work is not automatically attendance',()=>{const a={date:'2026-09-01',covered:true,rest:true,points:[],punches:[]};assert.equal(classifyDay(a,now).category,'休息');a.punches=input().punches;assert.equal(classifyDay(a,now).category,'待核对');});
test('cross-month approval counts date, not approval total duration',()=>{const a=input();a.approvals=[{...trip('培训'),start:t('2026-08-31T19:40:00'),end:t('2026-09-25T08:30:00'),duration:25}];a.punches=[];assert.equal(classifyDay(a,now).category,'培训');assert.equal(classifyDay(a,now).date,'2026-09-21');});
test('form field uses exact configured identifier/name and never title/comments',()=>{const c=configuration({});assert.equal(extractReason({title:'培训',formComponentValues:[{name:'备注',value:'派驻'}]},c),null);assert.equal(extractReason({formComponentValues:[{name:'出差事由',value:'参加培训'}]},c),'参加培训');assert.equal(extractReason({formComponentValues:[{id:'x',name:'其他',value:'派驻'}]},{...c,reasonFieldId:'x'}),'派驻');});
test('normalizer handles actual camel/snake fields, does not retain sensitive telemetry',()=>{
 const day={attendance_result_list:[{check_type:'OffDuty',plan_check_time:String(off),user_check_time:String(off+1000),source_type:'SYSTEM',time_result:'NotSigned',plan_id:2,user_address:'secret'}],approve_list:[{procInst_id:'x',tag_name:'出差',begin_time:on,end_time:off+1}],check_record_list:[]};
 const n=normalizeDay({date:'2026-09-21',userId:'u',day,schedules:[{userid:'u',work_date:on,check_type:'OffDuty',plan_check_time:off,id:2,is_rest:'N'}],details:new Map([['x',{status:'ok',detail:{status:'COMPLETED',result:'agree',formComponentValues:[{name:'出差事由',value:'培训'}]}}]]),config:configuration({})});
 assert.equal(n.approvals[0].reason,'培训');assert.equal(n.punches[0].planId,'2');assert.equal(calculateOvertime(n,now).seconds,null);assert.ok(!JSON.stringify(n).includes('secret'));
});
test('calendar validates invalid dates and months',()=>{assert.equal(monthDates('2026-09').length,30);assert.throws(()=>monthDates('2026-13'));assert.throws(()=>datesBetween('2026-02-30','2026-03-01'));assert.equal(stamp('2026-09-01 08:30:00'),t('2026-09-01T08:30:00'));});
test('verified API response shapes preserve overnight missing and explicit next-day rest',async()=>{const {readFile}=await import('node:fs/promises');const rows=JSON.parse(await readFile(new URL('./fixtures/attendance-api-shapes.json',import.meta.url)));const actual=rows.map(r=>classifyDay(normalizeDay({...r,userId:'sample-user',config:configuration({})}),now));assert.deepEqual(actual.map(r=>r.category),['缺卡','休息']);assert.ok(actual.every(r=>r.overtime.seconds===null));});
test('real same-day work/rest schedule conflict is retained for review, not treated as failed API schema',()=>{
 const n=normalizeDay({date:'2026-09-21',userId:'u',day:{attendance_result_list:[],check_record_list:[],approve_list:[]},schedules:[{userid:'u',work_date:on,is_rest:'N',check_type:'OffDuty',plan_check_time:off,id:2},{userid:'u',work_date:on,is_rest:'Y',id:3}],config:configuration({})});
 const r=classifyDay(n,now);assert.equal(n.covered,true);assert.equal(r.category,'待核对');assert.equal(r.overtime.seconds,null);assert.match(r.reason,/排班来源冲突/);assert.deepEqual(n.scheduleRestFlags,['N','Y']);
});
test('punch details pair the first start and last end across multiple segments without changing business results',async()=>{
 const {punchSummary}=await import('../public/attendance-presentation.mjs');const a=input();
 const earlier=on-3600000;a.points.push({type:'OnDuty',planned:earlier,planId:'early-start'},{type:'OffDuty',planned:on-1800000,planId:'early-end'});
 a.punches.push({type:'OnDuty',planned:earlier,actual:earlier-5000,planId:'early-start',recordId:'early',source:'USER',timeResult:'Normal'});
 a.punches.push({...a.punches[0],planId:'unrelated',planned:on-7200000,actual:on-7200000,recordId:'unrelated'});
 const r=classifyDay(a,now),summary=punchSummary(r);assert.equal(summary.on.planned,earlier);assert.equal(summary.on.actual,earlier-5000);assert.equal(summary.off.actual,off+3661000);assert.equal(summary.multiple,true);assert.equal(r.punchDetails.filter(p=>p.status==='未配对').length,1);assert.equal(r.overtime.seconds,3661);
});
test('punch details distinguish exempt, invalid, missing, conflict and not due without fabricated actuals',()=>{
 const a=input();a.punches=[];assert.equal(classifyDay(a,now).punchDetails[0].status,'缺卡');
 a.approvals=[trip()];assert.equal(classifyDay(a,now).punchDetails[0].status,'审批免打卡');assert.equal(classifyDay(a,now).punchDetails[0].actual,null);
 a.approvals=[];a.punches=[{...input().punches[0],source:'SYSTEM',timeResult:'NotSigned'}];assert.equal(classifyDay(a,now).punchDetails[0].status,'无有效打卡');assert.equal(classifyDay(a,now).punchDetails[0].actual,null);
 a.punches=[input().punches[0],{...input().punches[0],actual:on+1000}];assert.equal(classifyDay(a,now).punchDetails[0].status,'配对冲突');assert.equal(classifyDay(a,now).punchDetails[0].actual,null);
 const pending=input();pending.punches.pop();assert.equal(classifyDay(pending,on+1000).punchDetails[1].status,'尚未到时');
});
test('duplicate actuals agree; unplanned and uncovered records cannot enter summaries',async()=>{
 const {punchSummary}=await import('../public/attendance-presentation.mjs');const a=input();a.punches.push({...a.punches[0]});assert.equal(punchSummary(classifyDay(a,now)).on.actual,on-1000);
 a.points=[];assert.equal(punchSummary(classifyDay(a,now)).on.actual,null);assert.ok(classifyDay(a,now).punchDetails.every(p=>p.status==='未配对'));
 a.covered=false;assert.ok(classifyDay(a,now).punchDetails.every(p=>p.actual===null));
});
