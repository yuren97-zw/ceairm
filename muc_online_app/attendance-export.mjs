import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {durationText} from './attendance-rules.mjs';
import {attendanceTones,attendanceTone,attendanceAbnormal,legalLeaveCategories,punchSummary,attendanceRawStatus,attendanceLeaveCatalogText,attendanceOrderedCategories} from './public/attendance-presentation.mjs';
const xml=v=>String(v??'').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const local=v=>v?new Date(v).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}):'';
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(b){let crc=0xffffffff;for(const v of b)crc=crcTable[(crc^v)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
function zip(entries){
 const chunks=[],central=[];let offset=0;
 for(const [path,content] of entries){const name=Buffer.from(path),raw=Buffer.from(content),data=deflateRawSync(raw),crc=crc32(raw),h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);chunks.push(h,name,data);const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(8,10);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);c.writeUInt32LE(offset,42);central.push(c,name);offset+=h.length+name.length+data.length;}
 const c=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(c.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...chunks,c,end]);
}
export function exportTables(snapshot,{changes=[],runs=[]}={}){
 const {people,dates}=snapshot;
 const categories=attendanceOrderedCategories(snapshot.categories);
 const summary=[['姓名','工号','部门','班组',...categories,'天数合计','累计分钟','累计小时','累计时长','已计算天数','无法计算天数'],...people.map(p=>[p.name,p.employeeNo,p.department,p.team,...categories.map(c=>p.counts[c]||0),p.days.length,p.overtimeSeconds===null?null:p.overtimeSeconds/60,p.overtimeSeconds===null?null:p.overtimeSeconds/3600,{duration:p.overtimeSeconds},p.computedDays,p.uncomputableDays])];
 const matrix=[['姓名','工号','班组',...dates],...people.map(p=>[p.name,p.employeeNo,p.team,...p.days.map(d=>d.category)])];
 const detail=[['姓名','工号','部门','班组','工作日','最终类别','班次','出差用途','出差事由','命中关键词','审批实例ID','审批有效期间','分类依据','问题','源同步时间','规则版本','计划上班','有效实际上班','上班状态','计划下班','有效实际下班','下班状态','全部上下班打卡']];
 const overtime=[['姓名','工号','工作日','计划下班','有效实际下班','秒','分钟','小时','累计格式时长','计算状态','计算依据','计划上班','有效实际上班','上班状态','下班状态']];
 const raw=[['姓名','工号','工作日','类型','原始状态（必要字段）']];
 const issues=[['姓名','工号','工作日','类别','原因','问题','同步错误']];
 const coverage=[['姓名','工号','工作日','数据覆盖','最近成功时间','最近错误','当前使用旧数据','历史说明']];
 const night=[['姓名','工号',...dates,'夜班金额合计','班组'],...people.map(p=>{const vals=p.days.map(d=>d.category==='夜班'?25:['派驻','缺卡','旷工'].includes(d.category)?d.category:null);return [p.name,p.employeeNo,...vals,p.days.filter(d=>d.category==='夜班').length*25,p.team];})];
 for(const p of people)for(const d of p.days){
  const {on,off}=punchSummary(d);
  const allPunches=(d.punchDetails||[]).map(v=>`${v.type==='OnDuty'?'上班':v.type==='OffDuty'?'下班':v.type} | 计划：${local(v.planned)||'—'} | 有效实际：${local(v.actual)||'—'} | ${v.status} | ${(v.rawStatus||[]).map(attendanceRawStatus).join('、')} | ${v.reason}`).join('\n');
  detail.push([p.name,p.employeeNo,p.department,p.team,d.date,d.category,d.shift,d.purposes.map(a=>a.category||a.status).join('；'),d.purposes.map(a=>a.reason??'').join('；'),d.purposes.flatMap(a=>a.keywords).join('；'),d.purposes.map(a=>a.id).join('；'),d.purposes.map(a=>local(a.start)+' 至 '+local(a.end)).join('；'),d.reason,d.issues.join('；'),d.updatedAt,snapshot.ruleVersion,local(on.planned),local(on.actual),on.status,local(off.planned),local(off.actual),off.status,allPunches]);
  const o=d.overtime;overtime.push([p.name,p.employeeNo,d.date,local(o.planned),local(o.actual),o.seconds,o.seconds===null?null:o.seconds/60,o.seconds===null?null:o.seconds/3600,{duration:o.seconds},o.status,o.reason,local(on.planned),local(on.actual),on.status,off.status]);
  for(const kind of ['points','punches','approvals'])for(const v of d.input[kind]||[])raw.push([p.name,p.employeeNo,d.date,kind,JSON.stringify(v)]);
  if(!['未同步','未来日期','尚未到下班时间'].includes(d.category)&&(d.category==='待核对'||d.category==='缺卡'||d.issues.length||d.syncError))issues.push([p.name,p.employeeNo,d.date,d.category,d.reason,d.issues.join('；'),d.syncError]);
  coverage.push([p.name,p.employeeNo,d.date,d.input.covered?'已读取':'未覆盖',d.updatedAt,d.syncError,d.stale?'是':'否',snapshot.historyWarning]);
 }
 const names=new Map(people.map(p=>[p.personId,p]));
 const history=[['姓名','工号','工作日','变更前','变更后','变更时间','同步批次'],...changes.filter(c=>names.has(c.person_id)).map(c=>[names.get(c.person_id).name,names.get(c.person_id).employeeNo,c.work_date,c.before_json,c.after_json,c.changed_at,c.run_id])];
 const jobs=[['批次','开始日期','结束日期','状态','任务计数','错误','更新时间'],...runs.map(r=>[r.id,r.from,r.to,r.status,JSON.stringify(r.counts),r.error,r.updatedAt])];
 const rules=[['项目','说明'],['月份',snapshot.month],['导出人数',people.length],['导出范围',snapshot.exportScope||'当前筛选人员'],['筛选条件',JSON.stringify(snapshot.filters||{})],['假期目录',attendanceLeaveCatalogText(snapshot.leaveTypes)],['假期目录最近更新',snapshot.leaveTypes?.lastSyncedAt||'尚未成功读取'],['类别筛选',snapshot.filters?.categories?.length?'以下类别任一整月数量大于0：'+snapshot.filters.categories.join('、'):'未限制类别；显示符合基础条件的全部人员'],['生成时间',snapshot.generatedAt],['导出时间',snapshot.exportedAt||snapshot.generatedAt],['最后数据同步时间',snapshot.lastSyncedAt],['规则版本',snapshot.ruleVersion],['历史覆盖',snapshot.historyWarning],['分类','每人每天唯一分类；明确白班／夜班优先于出差用途；培训和派驻只匹配出差事由字段。'],['关键词','培训、派驻；同时命中标为用途冲突，未命中保留出差，事由缺失不等于未命中。'],['加班',snapshot.overtimeNote],['时间精度','按秒累计，不逐日取整，不扣用餐，不设门槛；空值不等于零。'],['夜班金额','最终类别为夜班的日期每次25元；派驻、缺卡、旷工仅标识。自动结果，覆盖不足时不代表完整应发金额。'],['打卡展示','摘要为首个计划上班点、末次计划下班点及各自配对的有效实际打卡；逐日明细保留全部点。空值及审批免打卡不表示真实打卡。'],['颜色','蓝绿色：正常出勤、休息及合法审批；琥珀至赭红：异常或待核对；灰色：未同步、无记录、未到时及未知类别。'],['来源','钉钉API；源数据修正后重新同步；人员与能力状态接口首期不启用。']];
 return [['人员汇总',summary],['逐日明细（横版）',matrix],['逐日明细',detail],['原始状态核对',raw],['异常清单',issues],['夜班值班统计表',night],['加班明细',overtime],['同步覆盖',coverage],['源数据变更记录',history],['同步任务',jobs],['统计规则',rules]];
}
export function exportXlsx(snapshot,options){
 snapshot={...snapshot,categories:attendanceOrderedCategories(snapshot.categories)};
 const tones=Object.values(attendanceTones),leaves=legalLeaveCategories(snapshot);
 const toneIndex=category=>3+tones.findIndex(t=>t.key===attendanceTone(category,leaves).key);
 const tables=exportTables(snapshot,options),ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',entries=[];
 entries.push(['[Content_Types].xml',`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
 entries.push(['_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
 entries.push(['xl/workbook.xml',`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${tables.map(([name],i)=>`<sheet name="${xml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`]);
 entries.push(['xl/_rels/workbook.xml.rels',`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
 entries.push(['xl/styles.xml',`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="[h]:mm:ss"/></numFmts><fonts count="${2+tones.length}"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft YaHei"/></font>${tones.map(t=>`<font><sz val="11"/><color rgb="FF${t.foreground.slice(1)}"/><name val="Microsoft YaHei"/></font>`).join('')}</fonts><fills count="${3+tones.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234E70"/></patternFill></fill>${tones.map(t=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${t.background.slice(1)}"/></patternFill></fill>`).join('')}</fills><borders count="${1+tones.length}"><border/>${tones.map(t=>`<border>${['left','right','top','bottom'].map(side=>t.border?`<${side} style="thin"><color rgb="FF${t.border.slice(1)}"/></${side}>`:`<${side}/>`).join('')}</border>`).join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${3+tones.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>${tones.map((t,i)=>`<xf numFmtId="0" fontId="${i+2}" fillId="${i+3}" borderId="${i+1}" xfId="0" applyBorder="1" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]);
 tables.forEach(([name,rows],i)=>{
  const columns=Math.max(...rows.map(r=>r.length)),last=column(columns-1)+rows.length;
  const cells=rows.map((row,r)=>`<row r="${r+1}"${r===0?' ht="42" customHeight="1"':''}>${row.map((value,c)=>{let v=value,style=r===0?1:0;
    if(r===0&&name==='人员汇总'&&c>=4&&c<4+snapshot.categories.length&&attendanceAbnormal.includes(snapshot.categories[c-4]))style=toneIndex(snapshot.categories[c-4]);
    if(r>0){
     if(name==='人员汇总'&&c>=4&&c<4+snapshot.categories.length&&Number(v)>0)style=toneIndex(snapshot.categories[c-4]);
     if(name==='逐日明细（横版）'&&c>=3)style=toneIndex(v);
     if(name==='逐日明细'&&c===5||name==='异常清单'&&c===3)style=toneIndex(v);
    }
    if(v&&typeof v==='object'&&'duration'in v){v=v.duration===null?null:v.duration/86400;style=2;}const ref=column(c)+(r+1);return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}" s="${style}"><v>${v}</v></c>`:`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;}).join('')}</row>`).join('');
  entries.push([`xl/worksheets/sheet${i+1}.xml`,`<worksheet xmlns="${ns}"><dimension ref="A1:${last}"/><sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="1" topLeftCell="C2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews><cols>${Array.from({length:columns},(_,c)=>`<col min="${c+1}" max="${c+1}" width="${c<2?15:columns>25?12:24}" customWidth="1"/>`).join('')}</cols><sheetData>${cells}</sheetData><autoFilter ref="A1:${last}"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`]);
 });
 return zip(entries);
}
export function exportHtml(snapshot){
 snapshot={...snapshot,categories:attendanceOrderedCategories(snapshot.categories)};
 const css=fs.readFileSync(new URL('./public/attendance.css',import.meta.url),'utf8');
 const presentation=fs.readFileSync(new URL('./public/attendance-presentation.mjs',import.meta.url),'utf8').replace(/^export /gm,'');
 const view=fs.readFileSync(new URL('./public/attendance-view.mjs',import.meta.url),'utf8').replace(/^import .*?;\n/gm,'').replace(/^export /gm,'');
 const seed=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>考勤只读快照 ${xml(snapshot.month)}</title><style>${css}</style></head><body><main id="attendanceHost" class="attendance"></main><script id="attendanceSeed" type="application/json">${seed}</script><script>${presentation}\n${view}\nconst data=JSON.parse(document.getElementById('attendanceSeed').textContent);mountAttendanceView(document.getElementById('attendanceHost'),data,{offline:true});</script></body></html>`;
}
