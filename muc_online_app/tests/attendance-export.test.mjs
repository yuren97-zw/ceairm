import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateRawSync} from 'node:zlib';
import fs from 'node:fs/promises';
import {exportTables,exportXlsx,exportHtml} from '../attendance-export.mjs';
import {classifyDay,monthDates} from '../attendance-rules.mjs';
export function sample(){
 const dates=monthDates('2026-09'),people=[{personId:'p1',name:'测试人员 <script>',employeeNo:'05400001',department:'航线',team:'一组',days:[],counts:{'夜班':2,'未同步':28},overtimeSeconds:100000,computedDays:2,uncomputableDays:0}];
 people[0].days=dates.map(date=>{const input={date,covered:false};return {...classifyDay(input,Date.parse('2026-10-22T00:00:00+08:00')),input,updatedAt:null};});
 for(const d of people[0].days.slice(0,2)){d.category='夜班';d.input.covered=true;d.overtime={seconds:50000,status:'已计算',planned:Date.parse(d.date+'T19:40:00+08:00'),actual:Date.parse(d.date+'T19:40:00+08:00')+50000000,reason:'末次计划点差额'};}
 people[0].days[0].purposes=[{id:'approval',start:1,end:2,reason:'培训 </script><img onerror=alert(1)>',keywords:['培训'],category:'培训',status:'ok'}];
 return {month:'2026-09',dates,people,categories:['夜班','未同步'],generatedAt:'2026-10-22T01:00:00Z',lastSyncedAt:null,ruleVersion:'test',historyWarning:'历史覆盖待核实',overtimeNote:'下班后差额',exportScope:'当前筛选人员'};
}
export function unzip(buf){let pos=0;const files={};while(buf.readUInt32LE(pos)===0x04034b50){const length=buf.readUInt32LE(pos+18),nl=buf.readUInt16LE(pos+26),el=buf.readUInt16LE(pos+28),name=buf.subarray(pos+30,pos+30+nl).toString();files[name]=inflateRawSync(buf.subarray(pos+30+nl+el,pos+30+nl+el+length)).toString();pos+=30+nl+el+length;}return files;}
test('all eleven workbooks preserve totals, actual zeros, missing data and night allowance',()=>{const s=sample(),tables=exportTables(s);assert.equal(tables.length,11);const summary=tables[0][1];assert.equal(summary[1][4],2);assert.equal(tables.find(t=>t[0]==='夜班值班统计表')[1][1].at(-2),50);assert.ok(!JSON.stringify(tables).includes('60分钟次数'));const overtime=tables.find(t=>t[0]==='加班明细')[1];assert.equal(overtime[3][5],null);});
test('xlsx is complete XML archive, numeric elapsed time exceeds 24h, source text never executes',async()=>{const b=exportXlsx(sample()),files=unzip(b);assert.equal(Object.keys(files).length,16);assert.match(files['xl/styles.xml'],/\[h\]:mm:ss/);assert.match(files['xl/worksheets/sheet1.xml'],/05400001/);assert.match(files['xl/worksheets/sheet1.xml'],/1\.157407/);assert.ok(!files['xl/worksheets/sheet3.xml'].includes('<script>'));assert.ok(!Object.values(files).some(v=>v.includes('<f>')));await fs.writeFile(new URL('../../work/attendance-test.xlsx',import.meta.url),b);});
test('HTML is self-contained read-only snapshot with escaped embedded data',async()=>{const html=exportHtml(sample());assert.ok(!html.includes('<img onerror=alert(1)>'));assert.ok(html.includes('\\u003c/script>'));assert.ok(!html.includes('<script src='));assert.ok(!html.includes('<link rel='));assert.ok(html.includes('offline:true'));await fs.writeFile(new URL('../../work/attendance-test.html',import.meta.url),html);});
test('export keeps all start/end points, summaries and semantic colors with approved leave kept normal',async()=>{
 const {attendanceTone}=await import('../public/attendance-presentation.mjs');const s=sample(),day=s.people[0].days[0];
 day.punchDetails=[{type:'OnDuty',planned:100000,actual:99000,status:'有效打卡',rawStatus:['Normal'],reason:'配对'},{type:'OffDuty',planned:200000,actual:null,status:'缺卡',rawStatus:[],reason:'没有打卡'}];
 const tables=exportTables(s),detail=tables.find(([n])=>n==='逐日明细')[1];assert.equal(detail[1][detail[0].indexOf('上班状态')],'有效打卡');assert.match(detail[1].at(-1),/上班.*计划/);assert.match(detail[1].at(-1),/下班.*缺卡/);
 const files=unzip(exportXlsx(s));assert.ok(files['xl/styles.xml'].includes(attendanceTone('缺卡').background.slice(1)));assert.ok(!exportHtml(s).includes("import {attendanceTone"));
 assert.match(attendanceTone('婚假',['婚假']).key,/^leave/);assert.equal(attendanceTone('新未知状态').key,'neutral');assert.equal(attendanceTone('早退').key,'early');
});
test('unused catalog leave types remain zero columns in all eleven sheets export and offline HTML carries catalog status',async()=>{
 const s=sample();s.leaveTypes={names:['病假','事假'],status:'ready',lastSyncedAt:'2026-10-23T00:00:00Z'};s.categories.push(...s.leaveTypes.names);
 const tables=exportTables(s),summary=tables[0][1];assert.equal(tables.length,11);for(const name of s.leaveTypes.names)assert.equal(summary[1][summary[0].indexOf(name)],0);
 assert.match(tables.find(([n])=>n==='统计规则')[1].find(r=>r[0]==='假期目录')[1],/病假、事假/);
 const html=exportHtml(s);assert.ok(html.includes('leaveTypes'));assert.ok(html.includes('病假'));assert.ok(!html.includes('import {'));
 const {legalLeaveCategories,attendanceTone}=await import('../public/attendance-presentation.mjs');assert.match(attendanceTone('病假',legalLeaveCategories(s)).key,/^leave/);
});

test('fixed order drives all export columns regardless of legacy order and offline keeps page size',async()=>{
 const {attendanceOrderedCategories}=await import('../public/attendance-presentation.mjs');
 const s=sample();s.displaySettings={categoryOrder:[...s.categories].reverse(),pageSize:100,canManage:true};
 const order=attendanceOrderedCategories(s.categories);assert.deepEqual(exportTables(s)[0][1][0].slice(4,4+order.length),order);
 const html=exportHtml(s),seed=JSON.parse(html.match(/<script id="attendanceSeed" type="application\/json">(.*?)<\/script>/s)[1]);assert.deepEqual(seed.categories,order);assert.equal(seed.displaySettings.pageSize,100);
 const files=unzip(exportXlsx(s));assert.ok(files['xl/styles.xml'].includes('applyBorder="1"'));assert.equal(exportTables(s).length,11);
});
test('xlsx colors every positive category count and leaves zeros unfilled',()=>{
 const s=sample();s.categories.push('病假','新类别');s.leaveTypes={names:['病假'],status:'ready'};s.people[0].counts['病假']=0;s.people[0].counts['新类别']=1;
 const sheet=unzip(exportXlsx(s))['xl/worksheets/sheet1.xml'];const row=sheet.match(/<row r="2">(.*?)<\/row>/s)[1];const cells=[...row.matchAll(/<c r="([A-Z]+)2" s="(\d+)"[^>]*>(.*?)<\/c>/gs)];
 const summary=exportTables(s)[0][1],categories=summary[0].slice(4,4+s.categories.length);
 categories.forEach((c,i)=>{const style=Number(cells[i+4][2]);assert.equal(style>2,(s.people[0].counts[c]||0)>0,c);});
});
