// Canonical attendance model: timestamps are milliseconds, work dates are Asia/Shanghai.
export const RULE_VERSION = 'attendance-api-1.0';
export const dayOf = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
export const stamp = value => {
  if (value === null || value === undefined || value === '') return null;
  const n = /^\d+$/.test(String(value)) ? Number(value) : Date.parse(/^[\d-]+[ T][\d:.]+$/.test(String(value)) ? String(value).replace(' ', 'T') + '+08:00' : value);
  return Number.isFinite(n) && n > 0 ? n : null;
};
export function datesBetween(from, to) {
  const a = Date.parse(from + 'T00:00:00Z'), b = Date.parse(to + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || !Number.isFinite(a + b) || new Date(a).toISOString().slice(0,10) !== from || new Date(b).toISOString().slice(0,10) !== to || b < a || b-a > 366*86400000) throw Object.assign(new Error('日期范围无效（最多366天）'), {status:400});
  return Array.from({length:1+(b-a)/86400000}, (_,i) => new Date(a+i*86400000).toISOString().slice(0,10));
}
export function monthDates(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw Object.assign(new Error('月份无效'), {status:400});
  const [y,m] = month.split('-').map(Number);
  if (m<1 || m>12 || y<2026 || y>2100) throw Object.assign(new Error('月份超出支持范围'), {status:400});
  return datesBetween(month+'-01', new Date(Date.UTC(y,m,0)).toISOString().slice(0,10));
}
const unique = values => [...new Set(values)];
export function tripPurpose(reason, detailStatus = 'ok') {
  if (detailStatus !== 'ok') return {category:null, status:detailStatus, keywords:[], reason:reason ?? null};
  if (typeof reason !== 'string' || !reason.trim()) return {category:null,status:'reason_missing',keywords:[],reason:reason??null};
  const keywords = ['培训','派驻'].filter(k => reason.includes(k));
  return {category:keywords.length===1?keywords[0]:keywords.length===0?'出差':null, status:keywords.length===2?'conflict':'ok', keywords, reason};
}
export function validPunch(p) {
  return !!p.actual && p.timeResult !== 'NotSigned' && !['SYSTEM','AUTO_CHECK'].includes(p.source) && p.valid !== false && (!!p.recordId || p.source === 'USER');
}
function matchPoint(point, punches) {
  const candidates = punches.filter(p => p.type === point.type && (point.planId && p.planId ? String(point.planId) === String(p.planId) : p.planned === point.planned));
  const actual = unique(candidates.filter(validPunch).map(p => p.actual));
  return {candidates, actual:actual.length===1?actual[0]:null, conflict:actual.length>1};
}
export function describePunches(input, now=Date.now()) {
  const points=input.points||[], punches=input.punches||[], approvals=input.approvals||[];
  const future=input.date>dayOf(now);
  const rows=points.map(point=>{
    const match=matchPoint(point,punches), rawStatus=unique(match.candidates.map(p=>p.timeResult).filter(Boolean));
    const workStart=Date.parse(input.date+'T00:00:00+08:00');
    const exempt=approvals.some(a=>a.approved&&!a.revoked&&['出差','外出','请假'].includes(a.kind)&&a.start&&a.end&&a.start<workStart+86400000&&a.end>workStart&&a.start<=point.planned&&a.end>=point.planned);
    let status,reason;
    if(future){status='未来日期';reason='日期尚未发生';}
    else if(!input.covered){status='未同步';reason='接口尚未完整覆盖';}
    else if(input.scheduleConflict||match.conflict){status='配对冲突';reason=input.scheduleConflict?'同日工作与休息排班冲突':'同一计划点存在多个有效实际打卡';}
    else if(match.actual){status='有效打卡';reason='按计划点关联有效实际记录';}
    else if(point.planned>now){status='尚未到时';reason='尚未到计划打卡时间';}
    else if(exempt){status='审批免打卡';reason='有效审批覆盖该计划打卡点';}
    else if(match.candidates.length){status='无有效打卡';reason='仅有系统占位、未打卡或无效记录';}
    else{status='缺卡';reason='计划点没有对应有效打卡';}
    return {type:point.type,planId:point.planId||null,planned:point.planned||null,actual:status==='有效打卡'?match.actual:null,status,rawStatus,reason};
  });
  const seen=new Set();
  for(const p of punches){
    if(points.some(point=>matchPoint(point,[p]).candidates.length))continue;
    const key=JSON.stringify([p.type,p.planId,p.planned,p.actual,p.recordId,p.timeResult,p.source,p.valid]);if(seen.has(key))continue;seen.add(key);
    rows.push({type:p.type,planId:p.planId||null,planned:p.planned||null,actual:!future&&input.covered&&validPunch(p)?p.actual:null,status:future?'未来日期':!input.covered?'未同步':'未配对',rawStatus:p.timeResult?[p.timeResult]:[],reason:validPunch(p)?'无对应排班计划点，不参与上下班摘要':'无对应排班计划点，原始记录无效或为系统占位'});
  }
  return rows.sort((a,b)=>(a.planned||a.actual||Infinity)-(b.planned||b.actual||Infinity));
}
export function calculateOvertime(input, now=Date.now()) {
  const off = input.points.filter(p => p.type==='OffDuty' && p.planned);
  if (!off.length) return {seconds:null,status:'无法计算',reason:input.rest?'休息日无明确排班':'缺少计划下班点',planned:null,actual:null};
  const planned = Math.max(...off.map(p=>p.planned));
  if (planned>now) return {seconds:null,status:'尚未到下班时间',reason:'计划下班时间尚未到达',planned,actual:null};
  const endpoints = off.filter(p=>p.planned===planned);
  const matched = endpoints.map(p=>matchPoint(p,input.punches));
  const actuals = unique(matched.map(m=>m.actual).filter(Boolean));
  if (matched.some(m=>m.conflict) || actuals.length>1 || matched.some(m=>!m.actual)) return {seconds:null,status:'无法计算',reason:'末次计划下班点缺少有效打卡或存在配对冲突',planned,actual:null};
  const actual = actuals[0];
  return {seconds:Math.max(0,Math.floor((actual-planned)/1000)),status:'已计算',reason:'归属工作日末次计划下班点与对应有效实际打卡的差额',planned,actual};
}
export function classifyDay(input, now=Date.now()) {
  const {date, points=[], punches=[], approvals=[]} = input;
  input = {...input,points,punches,approvals};
  const issues=[];
  const result={date,category:'待核对',shift:null,purposes:[],issues,reason:'',punchDetails:describePunches(input,now),overtime:calculateOvertime(input,now),ruleVersion:RULE_VERSION};
  const finish=(category,reason)=>({...result,category,reason});
  if (date>dayOf(now)) return finish('未来日期','日期尚未发生');
  if (!input.covered) return finish('未同步',input.syncError || '接口尚未成功完整覆盖该日');
  if(input.scheduleConflict){issues.push('钉钉同日排班同时返回工作与休息标记');result.overtime={seconds:null,status:'无法计算',reason:'同日排班工作／休息标记冲突',planned:null,actual:null};return finish('待核对','排班来源冲突，请在钉钉核实后重新同步');}
  if (input.identityIssue) issues.push(input.identityIssue);
  const start=Date.parse(date+'T00:00:00+08:00'), end=start+86400000;
  const active=approvals.filter(a=>a.approved && !a.revoked && a.start && a.end && a.start<end && a.end>start);
  const trip=active.filter(a=>a.kind==='出差');
  result.purposes=trip.map(a=>({id:a.id,start:a.start,end:a.end,...tripPurpose(a.reason,a.detailStatus)}));
  for(const p of result.purposes) if(p.status!=='ok') issues.push(`出差事由${({conflict:'同时命中培训和派驻',permission_denied:'读取权限不足',reason_missing:'字段为空或未找到',detail_missing:'详情缺失'})[p.status]||'未能读取'}`);
  const exempt = p => active.some(a => ['出差','外出','请假'].includes(a.kind) && a.start<=p.planned && a.end>=p.planned);
  const due=points.filter(p=>p.planned && p.planned<=now);
  const matched=due.map(p=>({point:p,...matchPoint(p,punches)}));
  const missing=matched.filter(m=>!m.actual && !exempt(m.point));
  const conflicts=matched.some(m=>m.conflict);
  const notDue=points.some(p=>p.planned>now);
  const leaves=active.filter(a=>a.kind==='请假');
  const outs=active.filter(a=>a.kind==='外出');
  const on=points.filter(p=>p.type==='OnDuty' && p.planned), off=points.filter(p=>p.type==='OffDuty' && p.planned);
  if(on.length && off.length && !notDue && matched.length===points.length && matched.every(m=>m.actual) && !conflicts && !leaves.length && !outs.length && !input.identityIssue && !input.rest){
    const first=Math.min(...on.map(p=>p.planned)), last=Math.max(...off.map(p=>p.planned));
    result.shift=dayOf(last)>dayOf(first)?'夜班':'白班';
    const abnormal=unique(punches.filter(validPunch).map(p=>({Late:'迟到',SeriousLate:'严重迟到',Early:'早退',Absenteeism:'旷工迟到'})[p.timeResult]).filter(Boolean));
    if(abnormal.length>1) {issues.push('不同打卡异常并存');return finish('待核对','多个异常状态无法唯一归类');}
    if(abnormal.length===1) return finish(abnormal[0],'有效打卡返回异常；班次单独保留');
    return finish(result.shift,'排班及有效上下班打卡完整，班次优先于出差用途');
  }
  if(conflicts || input.identityIssue){issues.push('打卡配对或人员身份冲突');return finish('待核对','存在无法自动解决的冲突');}
  if(missing.length){issues.push('计划打卡点未被有效打卡或审批解释');return finish(notDue?'尚未到下班时间':'缺卡',notDue?'当日班次尚未完成，已有未解释打卡点':'存在未被审批解释的缺卡');}
  if(notDue) return finish('尚未到下班时间','当日班次尚未完成');
  const candidates=[];
  if(leaves.length) candidates.push(...leaves.map(a=>a.subType || '请假'));
  if(outs.length) candidates.push('外出');
  if(trip.length){
    if(result.purposes.some(p=>p.status!=='ok')) return finish('待核对','出差事由尚不完整或用途存在冲突');
    candidates.push(...result.purposes.map(p=>p.category));
  }
  const kinds=unique(candidates);
  if(kinds.length>1) {issues.push('多个审批考勤类别并存');return finish('待核对','同日审批产生多个类别');}
  if(kinds.length===1) return finish(kinds[0],'根据有效审批及出差事由确定类别');
  if(input.rest && !punches.some(validPunch)) return finish('休息','排班明确标记休息');
  if(input.rest && punches.some(validPunch)){issues.push('休息日存在有效打卡');return finish('待核对','休息与打卡并存，不能推断为出勤');}
  if(!points.length && !punches.length) return finish('无记录','接口查询成功，但未返回排班、打卡或有效审批');
  issues.push('数据不足以确定唯一类别');
  return finish('待核对','排班或打卡资料不完整');
}
export const durationText = seconds => seconds===null || seconds===undefined ? '—' : `${Math.floor(seconds/3600)}小时${Math.floor(seconds%3600/60)}分`;
