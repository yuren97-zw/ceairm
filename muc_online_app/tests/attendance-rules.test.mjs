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

test('an old query cannot turn a later planned missing punch into confirmed absence',()=>{
 const a=input();a.punches=a.punches.filter(p=>p.type==='OnDuty');const r=classifyDay(a,off+600000,off-1000);assert.equal(r.category,'待核实');assert.equal(r.punchDetails.find(p=>p.type==='OffDuty').status,'待核实');assert.equal(r.overtime.status,'待核实');assert.equal(r.overtime.seconds,null);
});
test('a query after the planned point can confirm missing while complete punches and approval remain unchanged',()=>{
 const a=input();a.punches=a.punches.filter(p=>p.type==='OnDuty');assert.equal(classifyDay(a,off+600000,off+1000).category,'缺卡');const full=input();assert.equal(classifyDay(full,now,on-1000).category,'夜班');assert.equal(classifyDay(full,now,on-1000).overtime.seconds,3661);a.approvals=[trip()];assert.notEqual(classifyDay(a,now,off-1000).category,'待核实');
});

test('valid complete day/night punches take priority over outing while preserving approval evidence',()=>{
 for(const dayShift of [false,true]){const a=input();if(dayShift){a.points.forEach(p=>p.planned-=12*3600000);a.punches.forEach(p=>{p.planned-=12*3600000;p.actual-=12*3600000;});}a.approvals=[{...trip(),kind:'外出'}];const r=classifyDay(a,now);assert.equal(r.category,dayShift?'白班':'夜班');assert.equal(r.overtime.seconds,3661);assert.equal(r.approvalAttributions[0].id,'approval');assert.equal(a.approvals.length,1);}
});
test('outing priority does not conceal missing, conflicting, invalid or abnormal punches, or leave conflicts',()=>{
 const a=input();a.approvals=[{...trip(),kind:'外出',end:on+1000}];a.punches.pop();assert.equal(classifyDay(a,now).category,'缺卡');a.punches=input().punches.map(p=>({...p,source:'SYSTEM',timeResult:'NotSigned'}));assert.equal(classifyDay(a,now).category,'缺卡');a.punches=input().punches;a.punches.push({...a.punches[1],actual:off+7200000});assert.equal(classifyDay(a,now).category,'待核对');a.punches=input().punches;a.punches[1].timeResult='Early';assert.equal(classifyDay(a,now).category,'早退');a.punches=input().punches;a.approvals.push({...trip(),id:'leave',kind:'请假',subType:'病假'});assert.equal(classifyDay(a,now).category,'待核对');
});
test('same outing carried by a proved previous overnight shift does not consume the next rest date',()=>{
 const a=input(),approval={...trip(),kind:'外出',end:t('2026-09-22T02:05:00')};a.approvals=[approval];const rest={date:'2026-09-22',covered:true,rest:true,points:[],punches:[],approvals:[approval]};const r=classifyDay(rest,now,null,{previousWorkDays:[a]});assert.equal(r.category,'休息');assert.equal(r.approvalAttributions[0].workDate,'2026-09-21');assert.equal(r.approvalAttributions[0].status,'previous_workday');assert.equal(r.overtime.seconds,null);assert.equal(rest.approvals.length,1);
});
test('rest-day carry requires reliable preceding schedule and same approved instance, never assumes a noon cutoff',()=>{
 const approval={...trip(),kind:'外出',end:t('2026-09-22T02:05:00')},rest={date:'2026-09-22',covered:true,rest:true,points:[],punches:[],approvals:[approval]};const a=input();a.approvals=[approval];
 for(const prev of [[],[{...a,scheduleConflict:true}],[{...a,approvals:[{...approval,id:'other'}]}],[a,{...a,date:'2026-09-20'}]])assert.equal(classifyDay(rest,now,null,{previousWorkDays:prev}).category,'待核对');
 const current={...rest,approvals:[{...approval,start:t('2026-09-22T01:00:00')}]};assert.equal(classifyDay(current,now,null,{previousWorkDays:[a]}).category,'外出');
 const beyond={...rest,approvals:[{...approval,end:t('2026-09-22T09:00:00')}]};assert.equal(classifyDay(beyond,now,null,{previousWorkDays:[a]}).category,'外出');
 const revoked={...rest,approvals:[{...approval,revoked:true}]};assert.equal(classifyDay(revoked,now).category,'休息');
});
test('October 1.5-day outing example counts outing, night then rest with exact overtime intact',()=>{
 const approval={id:'outing-example',kind:'外出',approved:true,revoked:false,start:t('2026-10-10T08:30:00'),end:t('2026-10-12T02:05:00')};
 const make=(date,onTime,offTime)=>({date,covered:true,rest:false,points:[{type:'OnDuty',planned:t(onTime),planId:'on'},{type:'OffDuty',planned:t(offTime),planId:'off'}],punches:[],approvals:[approval]});
 const first=make('2026-10-10','2026-10-10T08:30:00','2026-10-10T19:40:00');const night=make('2026-10-11','2026-10-11T19:40:00','2026-10-12T08:30:00');night.punches=night.points.map(p=>({...p,actual:t(p.type==='OnDuty'?'2026-10-11T18:01:21':'2026-10-12T09:41:02'),source:'USER',recordId:p.planId,timeResult:'Normal',valid:true}));const rest={date:'2026-10-12',covered:true,rest:true,points:[],punches:[],approvals:[approval]};const at=t('2026-10-25T20:00:00');assert.deepEqual([classifyDay(first,at).category,classifyDay(night,at).category,classifyDay(rest,at,null,{previousWorkDays:[night,first]}).category],['外出','夜班','休息']);assert.equal(classifyDay(night,at).overtime.seconds,4262);
});

test('an outing really covering a rest date remains outing when reliable preceding schedule rules out overnight carry',()=>{
 const a=input(),approval={...trip(),kind:'外出',end:t('2026-09-22T12:00:00')};a.approvals=[approval];a.points=a.points.map(p=>({...p,planned:p.planned-12*3600000}));const rest={date:'2026-09-22',covered:true,rest:true,points:[],punches:[],approvals:[approval]};assert.equal(classifyDay(rest,now,null,{previousWorkDays:[a]}).category,'外出');
});

test('24-hour shift is defined by plan and paired valid records, not actual overtime duration',()=>{
 const a=input();a.points[0].planned=t('2026-09-21T08:30:00');a.points[1].planned=a.points[0].planned+86400000;a.punches=a.points.map(p=>({...p,actual:p.planned+(p.type==='OffDuty'?61000:-1000),recordId:p.planId,source:'USER',timeResult:'Normal',valid:true}));const r=classifyDay(a,now);assert.equal(r.category,'24小时班');assert.equal(r.shift,'24小时班');assert.equal(r.overtime.seconds,61);a.punches.pop();assert.equal(classifyDay(a,now).category,'缺卡');assert.equal(classifyDay(a,a.points[0].planned+1000).category,'尚未到下班时间');assert.equal(classifyDay(a,a.points[0].planned+1000).shift,'24小时班');const night=input();night.punches[1].actual=night.punches[0].actual+26*3600000;assert.equal(classifyDay(night,now).category,'夜班');
});
test('follow-along is mutually exclusive with remaining outing and cannot replace reliable work or rest carry',()=>{
 const out={...trip(),kind:'外出',reason:'参加跟班工作',reasonStatus:'ok'};const a=input();a.punches=[];a.approvals=[out];assert.equal(classifyDay(a,now).category,'跟班');a.approvals=[{...out,reason:'外出办公'}];assert.equal(classifyDay(a,now).category,'外出');a.punches=input().punches;a.approvals=[out];assert.equal(classifyDay(a,now).category,'夜班');const approval={...out,end:t('2026-09-22T02:05:00')};a.approvals=[approval];const rest={date:'2026-09-22',covered:true,rest:true,points:[],punches:[],approvals:[approval]};assert.equal(classifyDay(rest,now,null,{previousWorkDays:[a]}).category,'休息');a.punches=[];a.approvals=[out,{...out,id:'other',reason:'办事'}];assert.equal(classifyDay(a,now).category,'跟班');a.approvals=[{...out,revoked:true}];assert.equal(classifyDay(a,now).category,'缺卡');
});
