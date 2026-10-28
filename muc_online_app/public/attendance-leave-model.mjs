export const leaveGroups=['公休假','山东省育儿假','婚假','陪产假'];
export const publicLeaveNames=['公休假','固定班制公休假','非固定班制公休假','公休假（2025年度延长）'];
export const leaveGroup=name=>publicLeaveNames.includes(name)?'公休假':leaveGroups.includes(name)?name:null;
export const leaveNote='按钉钉额度扣减口径，不等同已实际休假天数；包含平台已扣减的未来已批准休假。年度以钉钉额度周期为准，不从假种名称推断。';
export function normalizeLeaveData(quotas,records,code,userId){
 const qmap=new Map(),rmap=new Map();
 for(const q of quotas){
  if(String(q.userid)!==userId||String(q.leave_code)!==code||!q.quota_id||!/^\d{4}$/.test(String(q.quota_cycle)))throw Error('额度人员、假种或年度字段不完整');
  const values=[];
  for(const [unit,suffix] of [['天','day'],['小时','hour']])if(q['quota_num_per_'+suffix]!==undefined){
   const quota=Number(q['quota_num_per_'+suffix]),used=Number(q['used_num_per_'+suffix]);
   if(!Number.isSafeInteger(quota)||!Number.isSafeInteger(used))throw Error('额度或扣减数缺失');
   values.push({unit,quota:quota/100,used:used/100,remaining:(quota-used)/100});
  }
  if(!values.length)throw Error('额度单位无法识别');
  const value={id:String(q.quota_id),code,year:Number(q.quota_cycle),start:q.start_time??null,end:q.end_time??null,values};
  if(qmap.has(value.id)&&JSON.stringify(qmap.get(value.id))!==JSON.stringify(value))throw Error('同一额度ID数据冲突');qmap.set(value.id,value);
 }
 for(const r of records){
  if(String(r.userId)!==userId||String(r.leaveCode)!==code||!r.recordId)throw Error('变更记录人员或假种不匹配');
  const values=[];for(const [unit,suffix] of [['天','Day'],['小时','Hour']])if(r['recordNumPer'+suffix]!==undefined){const n=Number(r['recordNumPer'+suffix]);if(!Number.isSafeInteger(n))throw Error('变更数量无效');values.push({unit,amount:n/100});}
  const v={id:String(r.recordId),code,quotaId:r.quotaId?String(r.quotaId):null,type:String(r.leaveRecordType||'unknown'),status:String(r.leaveStatus||'unknown'),operation:r.calType||null,start:r.startTime??null,end:r.endTime??null,modified:r.gmtModified??null,values,reason:typeof r.leaveReason==='string'?r.leaveReason:null,approvalId:r.processInstanceId||null};
  const old=rmap.get(v.id);if(!old||Number(v.modified||0)>=Number(old.modified||0))rmap.set(v.id,v);
 }
 return {quotas:[...qmap.values()],records:[...rmap.values()]};
}
export function leaveCell(sources,year,group,now=Date.now()){
 const relevant=sources.filter(s=>leaveGroup(s.name)===group),quotaMap=new Map(),records=new Map(),issues=[];
 for(const s of relevant){for(const q of s.quotas){if(q.year!==year)continue;const prior=quotaMap.get(q.id);if(prior){if(JSON.stringify(prior.values)!==JSON.stringify(q.values)||prior.start!==q.start||prior.end!==q.end)issues.push('共享额度数据冲突：'+q.id);prior.names=[...new Set([...prior.names,s.name])];}else quotaMap.set(q.id,{...q,names:[s.name]});}
  for(const r of s.records){const previous=records.get(r.id);if(previous&&JSON.stringify(previous.values)!==JSON.stringify(r.values))issues.push('重复记录数据冲突：'+r.id);else records.set(r.id,{...r,name:s.name});}
 }
 const quotas=[...quotaMap.values()].map(q=>({...q,availability:q.end!==null&&q.end<now?'expired':q.start!==null&&q.start>now?'future':'active'}));
 const units=new Map();for(const q of quotas)for(const v of q.values){if(!units.has(v.unit))units.set(v.unit,{unit:v.unit,quota:0,used:0,remaining:0,unavailable:0});const u=units.get(v.unit);u.quota+=Math.round(v.quota*100);u.used+=Math.round(v.used*100);u.remaining+=Math.round(v.remaining*100);if(q.availability!=='active')u.unavailable+=Math.round(v.remaining*100);}
 const allQuotaIds=new Set(sources.flatMap(s=>s.quotas.map(q=>q.id))),ids=new Set(quotas.map(q=>q.id));
 const detail=[...records.values()].filter(r=>ids.has(r.quotaId)).map(r=>({...r,period:r.type!=='leave'?'额度调整':r.status==='abort'?'已撤销／退回':r.start>now?'未来已批准占用':r.end<=now?'已发生休假':'进行中'}));
 const unassigned=[...records.values()].filter(r=>!r.quotaId||!allQuotaIds.has(r.quotaId));
 if(unassigned.length)issues.push(`${unassigned.length}条记录无法可靠归属额度年度，另列待核对，不参与年度明细合计`);
 for(const u of units.values()){
  const used=detail.filter(r=>r.type==='leave'&&r.status==='success').reduce((n,r)=>n+Math.round((r.values.find(v=>v.unit===u.unit)?.amount||0)*100),0);
  if(used!==u.used)issues.push(`${u.unit}：可关联的有效消费明细与平台扣减数不一致；以平台汇总为准`);
 }
 return {group,year,units:issues.some(i=>i.includes('数据冲突'))?[]:[...units.values()].map(u=>Object.fromEntries(Object.entries(u).map(([k,v])=>[k,k==='unit'?v:v/100]))),quotas,records:detail,unassigned,issues,status:relevant.length?quotas.length?'ready':'no_quota':'not_synced'};
}
export function leaveValueText(cell){return cell.units.length?cell.units.map(v=>`${v.used} / ${v.quota} · ${v.remaining}${v.unit}${v.unavailable?`（其中${v.unavailable}${v.unit}已过期或未生效）`:''}`).join('；'):cell.issues.some(i=>i.includes('数据冲突'))?'待核对':cell.status==='no_quota'?'未返回该年度额度':'未同步';}
