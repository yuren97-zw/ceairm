export const attendanceExcludedCategories=['新冠关爱假'];
export const attendanceCategoryAllowed=name=>!attendanceExcludedCategories.includes(String(name??'').trim());
export const attendanceTones={
 day:{key:'day',foreground:'#15566c',background:'#cdeaf5'},
 night:{key:'night',foreground:'#344b82',background:'#d5dcf2'},
 rest:{key:'rest',foreground:'#376953',background:'#e2efdf'},
 training:{key:'training',foreground:'#166453',background:'#bfe7da'},
 deployed:{key:'deployed',foreground:'#215c79',background:'#bad8ed'},
 trip:{key:'trip',foreground:'#28636c',background:'#cce5e8'},
 outing:{key:'outing',foreground:'#3d685e',background:'#d9e8cd'},
 leave:{key:'leave',foreground:'#385e76',background:'#dce9f2'},
 late:{key:'late',foreground:'#785000',background:'#ffe0a3',border:'#c58a22'},
 seriousLate:{key:'seriousLate',foreground:'#793b08',background:'#ffc784',border:'#b97122'},
 early:{key:'early',foreground:'#8a4323',background:'#ffd3b6',border:'#c17c52'},
 absenteeismLate:{key:'absenteeismLate',foreground:'#812e20',background:'#f5b8a1',border:'#b65e43'},
 absent:{key:'absent',foreground:'#7c211f',background:'#ed9e97',border:'#ac4943'},
 missing:{key:'missing',foreground:'#8a322b',background:'#f8c5bd',border:'#bd7065'},
 review:{key:'review',foreground:'#785619',background:'#f6e4ad',border:'#b3974c'},
 neutral:{key:'neutral',foreground:'#5f6f80',background:'#edf0f3'}
};
// Stable name hash: the same leave keeps its color across people, months and exports.
const leavePalette=[['#234f69','#bfd9eb'],['#245e50','#c1e1ce'],['#305c74','#deedf5'],['#355c52','#deead2'],['#165d66','#b7dfe2'],['#3c5277','#d0d9ed'],['#30694f','#d5e9df'],['#385b6a','#d1e5e7']];
leavePalette.forEach(([foreground,background],i)=>{attendanceTones['leave'+i]={key:'leave'+i,foreground,background};});
export const attendanceAbnormal=['迟到','严重迟到','早退','旷工迟到','旷工','缺卡','待核对'];
export function legalLeaveCategories(data){return [...new Set([...(data.leaveTypes?.names||[]),...data.people.flatMap(p=>(p.days||[]).flatMap(d=>(d.input?.approvals||[]).filter(a=>a.kind==='请假'&&a.approved&&!a.revoked).map(a=>a.subType||'请假')))])].filter(attendanceCategoryAllowed);}
export function attendanceTone(category,leaves=[]){
 const key=({'白班':'day','夜班':'night','24小时班':'night','休息':'rest','培训':'training','派驻':'deployed','出差':'trip','外出':'outing','跟班':'outing','迟到':'late','严重迟到':'seriousLate','旷工迟到':'absenteeismLate','早退':'early','缺卡':'missing','旷工':'absent','待核对':'review'})[category];
 if(key)return attendanceTones[key];
 if(leaves.includes(category)){let hash=0;for(const c of category)hash=(hash*31+c.codePointAt(0))>>>0;return attendanceTones['leave'+hash%leavePalette.length];}
 return attendanceTones.neutral;
}
export const attendanceFixedCategoryOrder=['白班','休息','夜班','24小时班','待核对','未同步','缺卡','外出','跟班','出差','派驻','培训','早退','迟到','调休','公休假','婚假','山东省育儿假','病假','事假','陪产假','探亲假','产假','丧假','例假','父母护理假','产检假','产前假','女工哺乳假','非固定班制公休假','固定班制公休假','公休假（2025年度延长）','工伤假','无记录','未来日期'];
export function attendanceOrderedCategories(categories){
 const available=new Set(categories.filter(attendanceCategoryAllowed)),known=new Set(attendanceFixedCategoryOrder);
 const extra=[...available].filter(c=>!known.has(c)).sort((a,b)=>a.localeCompare(b,'zh-CN')||(a<b?-1:a>b?1:0));
 return [...attendanceFixedCategoryOrder.slice(0,-2).filter(c=>available.has(c)),...extra,...attendanceFixedCategoryOrder.slice(-2).filter(c=>available.has(c))];
}
export function attendanceRefreshColumns(categories,previousCategories,selected,newMonth=false){
 return new Set(categories.filter(attendanceCategoryAllowed).filter(c=>newMonth||!previousCategories.has(c)||selected.has(c)));
}
export function punchSummary(day){
 const details=(day.punchDetails||[]).filter(p=>p.planned&&!['未配对'].includes(p.status));
 const endpoint=(type,last)=>{
  const ps=details.filter(p=>p.type===type);
  if(!ps.length)return {planned:null,actual:null,status:'无排班',reason:'没有对应计划打卡点'};
  const planned=(last?Math.max:Math.min)(...ps.map(p=>p.planned)),rows=ps.filter(p=>p.planned===planned);
  const actuals=[...new Set(rows.map(p=>p.actual).filter(Boolean))];
  return {planned,actual:actuals.length===1&&rows.every(p=>p.actual)?actuals[0]:null,status:actuals.length>1?'配对冲突':[...new Set(rows.map(p=>p.status))].join('；'),reason:[...new Set(rows.map(p=>p.reason))].join('；')};
 };
 return {on:endpoint('OnDuty',false),off:endpoint('OffDuty',true),multiple:['OnDuty','OffDuty'].some(type=>new Set(details.filter(p=>p.type===type).map(p=>p.planned)).size>1)};
}
export const attendanceRawStatus=value=>({Normal:'正常',Late:'迟到',SeriousLate:'严重迟到',Early:'早退',Absenteeism:'旷工迟到',NotSigned:'未打卡'})[value]||value;
export function attendanceNeighborDays(person,date,{offline=false,today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'})}={}){
 const known=new Map([...(person.contextDays||[]),...person.days].map(d=>[d.date,d]));
 const center=Date.parse(date+'T00:00:00Z');
 return Array.from({length:7},(_,index)=>{
  const workDate=new Date(center+(index-3)*86400000).toISOString().slice(0,10);
  if(workDate<'2026-09-01')return {date:workDate,category:'不在同步范围',contextMissing:true,punchDetails:[],input:{covered:false},reason:'同步范围从2026-09-01开始'};
  if(known.has(workDate))return known.get(workDate);
  return {date:workDate,category:workDate>today?'未来日期':offline?'快照未包含':'未同步',contextMissing:true,punchDetails:[],input:{covered:false},reason:offline?'本快照未包含该日资料':'该日尚无成功同步数据'};
 });
}
// A full or empty column selection leaves the base personnel scope unchanged.
export function attendanceCategorySelection(categories,selected){
 const chosen=categories.filter(c=>selected.has(c));
 return chosen.length&&chosen.length<categories.length?chosen:[];
}
export function attendanceMatchesCategories(person,categories=[]){
 return !categories.length||categories.some(c=>((person.counts?.[c]??0)>0||(person.pendingCounts?.[c]??0)>0));
}

export function attendanceLeaveCatalogText(catalog){
 if(!catalog)return '';
 const visibleNames=(catalog.names||[]).filter(attendanceCategoryAllowed);
 const names=visibleNames.length?visibleNames.join('、'):'暂无已知假种';
 if(catalog.status==='ready')return `假期列按钉钉企业目录固定展示（含历史审批假种）：${names}。0表示当月最终归入该类别的已知天数为0，不代表缺失日期已核实。`;
 if(catalog.status==='stale')return `假期目录本次未更新，保留上次成功目录及历史审批假种：${names}。${catalog.error||''}；目录完整性待刷新。`;
 return `完整假期目录尚未读取，暂展示已同步审批中出现过的假种：${names}。${catalog.error||'请在同步状态中刷新假期目录'}。`;
}
