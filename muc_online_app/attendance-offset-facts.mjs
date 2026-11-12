import {createHash} from 'node:crypto';
import {dayOf, describePunches, calculateOvertime, stamp, validPunch, plannedShift} from './attendance-rules.mjs';

// Pure derivation: no source writes and no approval/credit side effects.
export function resolveOffsetFacts(personId, input, {now = Date.now(), sourceReadAt = null} = {}) {
  const unresolved = reason => ({eligibility:'unresolved', reason, items:[]});
  if (!personId || !input.covered || input.identityIssue || input.scheduleConflict)
    return unresolved('人员或排班覆盖尚未核实');
  if (input.date > dayOf(now)) return unresolved('日期尚未发生');
  if ((input.approvals||[]).some(a=>a.approved&&!a.revoked&&['出差','外出','请假'].includes(a.kind)&&(!a.start||!a.end||['permission_denied','detail_missing'].includes(a.detailStatus))))
    return unresolved('关联审批资料尚未完整核实');
  const points = input.points || [];
  const ons = points.filter(p => p.type === 'OnDuty' && p.planned);
  const offs = points.filter(p => p.type === 'OffDuty' && p.planned);
  if (input.rest) return {eligibility:'ineligible', reason:'休息日', items:[]};
  if (!ons.length || !offs.length) return unresolved('缺少可信上下班排班');
  const first = Math.min(...ons.map(p => p.planned));
  const last = Math.max(...offs.map(p => p.planned));
  if (dayOf(first) !== input.date) return unresolved('排班归属工作日不一致');
  if (last <= first) return unresolved('排班时间冲突');
  const ordered=[...points].sort((a,b)=>a.planned-b.planned||(a.type==='OffDuty'?-1:1));
  if(ons.length!==offs.length||ordered.length!==ons.length+offs.length||ordered.some((p,i)=>p.type!==(i%2===0?'OnDuty':'OffDuty')))
    return unresolved('多段排班上下班点无法可靠配对');
  if (plannedShift(points)!=='白班')
    return {eligibility:'ineligible', reason:'夜班或24小时班不适用', items:[]};
  const readAt = stamp(sourceReadAt);
  const details = describePunches({...input, points, punches:input.punches || []}, now);
  if (details.some(p => p.status === '配对冲突')) return unresolved('打卡配对冲突');
  const items = [];
  for (const point of offs) {
    if (point.planned > now || !readAt || readAt <= point.planned)
      return unresolved('尚未完成计划点之后的权威查询');
    const matches = details.filter(p => p.type === 'OffDuty' && p.planned === point.planned && String(p.planId || '') === String(point.planId || ''));
    if (matches.length !== 1) return unresolved('计划点无法唯一匹配');
    const detail = matches[0];
    let type = null;
    if (['缺卡', '无有效打卡'].includes(detail.status)) type = 'day_off_missing';
    if (detail.status === '有效打卡' && detail.rawStatus.includes('Early')) {
      // Only a valid record paired to this point may establish early departure.
      const valid = (input.punches || []).filter(p => validPunch(p) && p.type === 'OffDuty' && p.actual === detail.actual && (point.planId && p.planId ? String(point.planId) === String(p.planId) : p.planned === point.planned));
      if(new Set(valid.map(p=>p.timeResult).filter(Boolean)).size>1)return unresolved('同一配对打卡的原始状态冲突');
      if (valid.some(p => p.timeResult === 'Early') && detail.actual < point.planned) type = 'day_off_early';
    }
    if (!type) continue;
    const logicalKey = JSON.stringify([personId, input.date, point.planId && offs.filter(p=>String(p.planId)===String(point.planId)).length===1 ? String(point.planId) : point.planned, 'OffDuty', type]);
    items.push({eventId:createHash('sha256').update(logicalKey).digest('hex'), type, workDate:input.date,
      planned:point.planned, direction:'OffDuty', evidence:detail,
      evidenceHash:createHash('sha256').update(JSON.stringify(detail)).digest('hex')});
  }
  return {eligibility:items.length?'eligible':'ineligible', reason:items.length?'可信白班独立下班异常':'无白名单异常', shift:'白班', items};
}

export function accumulatedCoverage(days, now = Date.now(), {expectedDates = null} = {}) {
  let seconds = 0;
  const unresolved = [];
  if (!expectedDates?.length) unresolved.push({date:null, reason:'未提供完整来源月日期范围'});
  for (const date of expectedDates || []) if (!days.some(d => d.date === date)) unresolved.push({date, reason:'来源日记录缺失'});
  for (const {date, input, sourceReadAt} of days) {
    if (date > dayOf(now)) { unresolved.push({date, reason:'来源月尚未结束'}); continue; }
    if (!input?.covered || input.identityIssue || input.scheduleConflict) {
      unresolved.push({date, reason:'源覆盖或身份未核实'}); continue;
    }
    if (input.rest && !(input.points || []).length) continue;
    const value = calculateOvertime({...input, points:input.points || [], punches:input.punches || []}, now);
    if (value.seconds === null || !stamp(sourceReadAt) || stamp(sourceReadAt) < value.planned) {
      unresolved.push({date, reason:value.reason || '查询时点不足'}); continue;
    }
    if(value.actual>now||!Number.isSafeInteger(seconds+value.seconds)||seconds+value.seconds>2147483647){unresolved.push({date,reason:value.actual>now?'实际打卡时间尚未发生':'累计超出当前数据库整数精度，需核对'});continue;}
    seconds += value.seconds;
  }
  return {seconds, status:unresolved.length?'pending_review':'complete', unresolved};
}

export function exchangeSeconds(seconds, thresholdSeconds, count, cap) {
  if (![seconds, thresholdSeconds, count, cap].every(Number.isSafeInteger) || seconds < 0 || thresholdSeconds <= 0 || count <= 0 || cap < 0)
    throw new Error('兑换参数必须为合法整数秒和次数');
  const earned = BigInt(seconds) / BigInt(thresholdSeconds) * BigInt(count);
  return Number(earned>BigInt(cap)?BigInt(cap):earned);
}

export {attendanceIssueDay as attendanceExceptionDay} from './public/attendance-presentation.mjs';

export function offsetDayLabel(day,{approved=0,pending=0,eligibleCount=0}={}){
 if(!approved)return pending?'申请中':'';
 if(!['缺卡','早退','待核对'].includes(day.category))return '抵消待核实';
 const abnormal=new Set(['Late','SeriousLate','Early','Absenteeism']);
 const other=(day.punchDetails||[]).some(p=>p.type==='OnDuty'&&(['缺卡','无有效打卡'].includes(p.status)||(p.rawStatus||[]).some(s=>abnormal.has(s)))||p.type==='OffDuty'&&(p.rawStatus||[]).some(s=>abnormal.has(s)&&s!=='Early'));
 return approved<eligibleCount||day.category==='待核对'||other?'部分已抵消':'已抵消';
}

export function reliableScheduledShift(input){
 if(!input?.covered||input.identityIssue||input.scheduleConflict)return null;
 const points=input.points||[];if(input.rest)return points.length?null:'休息';
 const ordered=[...points].sort((a,b)=>a.planned-b.planned||(a.type==='OffDuty'?-1:1));
 if(!ordered.length||ordered.length%2||ordered.some((p,i)=>!p.planned||p.type!==(i%2===0?'OnDuty':'OffDuty'))||ordered.at(-1).planned<=ordered[0].planned||dayOf(ordered[0].planned)!==input.date)return null;
 return plannedShift(points);
}
