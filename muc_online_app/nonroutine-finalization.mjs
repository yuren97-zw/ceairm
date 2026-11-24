import { createHash } from 'node:crypto';
import { NONROUTINE_CATEGORY_STRATEGIES } from './maintenance-standards.mjs';
import { reviewStatistics } from './nonroutine-review.mjs';

export const NONROUTINE_FINALIZATION_SCHEMA = `create table if not exists maintenance_nonroutine_review_finals(
  id text primary key,
  case_id text not null unique references maintenance_nonroutine_review_cases(id),
  approved_revision integer not null check(approved_revision=1),
  input_digest text not null,
  decision_json text not null,
  participants_json text not null,
  policy_json text not null,
  opinion_versions_json text not null,
  statistics_json text not null,
  reason text not null,
  role_verification_reason text not null,
  admission_decision text not null check(admission_decision in ('INCLUDE','EXCLUDE','PENDING')),
  finalized_by text not null,
  created_at text not null
);
create table if not exists maintenance_nonroutine_review_sync_attempts(
  id text primary key,
  channel_id text not null references maintenance_nonroutine_review_channels(id),
  actor_id text not null,
  outcome text not null,
  detail_json text not null,
  created_at text not null
);
`;

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const permission=action=>`maintenance.nonroutine.review.${action}`;
const roles=['主做','检验','辅助'];
const pairs=people=>people.map(person=>`${person.personId}\u0000${person.role}`).sort().join('|');
const policyIdentity=policy=>JSON.stringify(Object.fromEntries(Object.entries(policy || {}).filter(([key])=>key!=='capturedAt')));

export function createNonroutineFinalization({db,transaction,can,qualifiedAccount,capturePolicy,post,clock,randomId,postingReceipt=()=>null,previewAllocation=()=>({available:false,reason:'分配预览未配置'}),sourceFacts=()=>null,currentRuleVersion=()=>null}) {
  function load(id,user,write=false) {
    const item=db.prepare('select * from maintenance_nonroutine_review_cases where id=?').get(id);
    if(!item || !can(user,permission(write?'finalize':'view'),item))throw fail('未找到可访问的非例行终审',404);
    // 终审=权限+全维修范围（用户定稿 2026-11-22），不再检查指定终审人。
    // 仅 WORK purpose 适用；STANDARD 的终审在 maintenance-standard-review.mjs 中有独立校验。
    if(write && qualifiedAccount(user.id,permission('finalize'),item)?.personId!==user.personId)throw fail('当前终审人员身份、资格或范围已失效',403);
    return item;
  }
  function view(id,user) {
    const item=load(id,user);
    const final=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(id);
    if(!final)return null;
    const channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(id);
    const sourceAttestation=db.prepare("select detail_json from maintenance_nonroutine_review_events where case_id=? and event_type='FINALIZED' order by created_at,id").all(id).map(row=>JSON.parse(row.detail_json)).find(row=>row.finalId===final.id)?.sourceFacts;
    const full=can(user,permission('opinions.view'),item) || can(user,permission('finalize'),item);
    return {id:final.id,approvedRevision:Number(final.approved_revision),canReadPrivate:Boolean(full),decision:JSON.parse(final.decision_json),
      admissionDecision:final.admission_decision,finalizedBy:final.finalized_by,createdAt:final.created_at,
      channel:channel?{id:channel.id,state:channel.state}:null,
      postingReceipt:postingReceipt(id),
      ...(full?{sourceFacts:sourceFacts(item,user),sourceFactsAttestation:sourceAttestation?{token:sourceAttestation.token,acknowledged:sourceAttestation.acknowledged,changed:sourceAttestation.changed}:null,participants:JSON.parse(final.participants_json),policy:JSON.parse(final.policy_json),reason:final.reason,
        roleVerificationReason:final.role_verification_reason,statistics:JSON.parse(final.statistics_json),opinionVersions:JSON.parse(final.opinion_versions_json),
        attempts:channel?db.prepare('select outcome,detail_json,created_at from maintenance_nonroutine_review_sync_attempts where channel_id=? order by created_at,id').all(channel.id)
          .map(row=>({outcome:row.outcome,detail:JSON.parse(row.detail_json),createdAt:row.created_at})):[]}: {})};
  }
  function normalize(payload,item) {
    const raw=payload?.decision || {};
    const decision={category:String(raw.category || '').trim(),chapter:String(raw.chapter || '').trim(),title:String(raw.title || '').trim(),
      workScope:String(raw.workScope || '').trim(),recognizedHours:raw.recognizedHours};
    if(!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,decision.category) || !decision.chapter || decision.chapter.length>200 || !decision.title || decision.title.length>500 || !decision.workScope || decision.workScope.length>4000)throw fail('终审类别、ATA、名称、范围必须完整且在长度限制内');
    if(!['number','string'].includes(typeof decision.recognizedHours) || typeof decision.recognizedHours==='string' && !decision.recognizedHours.trim())throw fail('请明确填写终审认定工时');
    decision.recognizedHours=Number(decision.recognizedHours);
    if(!Number.isFinite(decision.recognizedHours) || decision.recognizedHours<0 || decision.recognizedHours>10000 || Math.abs(decision.recognizedHours*10-Math.round(decision.recognizedHours*10))>1e-8)throw fail('认定工时须为0至10000且以0.1小时为单位');
    if(payload.participantsVerified!==true)throw fail('请核实原参与人员及本次分配角色');
    const original=JSON.parse(item.participants_json);
    const participants=(Array.isArray(payload.participants)?payload.participants:[]).map(person=>({personId:String(person?.personId || ''),role:String(person?.role || '')}));
    const originals=new Set(original.map(person=>person.personId));
    const selected=new Set(participants.map(person=>person.personId));
    if(!participants.length || selected.size!==originals.size || [...selected].some(id=>!originals.has(id)) || new Set(participants.map(person=>JSON.stringify(person))).size!==participants.length || participants.some(person=>!roles.includes(person.role) || decision.category==='拖机' && person.role!=='主做'))throw fail('终审仅可核实原参与人的合法角色，不得新增、删除人员或重复角色');
    participants.sort((left,right)=>left.personId.localeCompare(right.personId)||roles.indexOf(left.role)-roles.indexOf(right.role));
    const reason=String(payload.reason || '').trim(),roleReason=String(payload.roleVerificationReason || '').trim();
    if(reason.length>4000 || roleReason.length>2000)throw fail('终审依据或角色核实说明过长');
    const admissionDecision=payload.admissionDecision;
    if(!['INCLUDE','EXCLUDE','PENDING'].includes(admissionDecision))throw fail('请选择标准库准入意向；本次选择不会自动发布标准');
    const sourceAttestation=Object.hasOwn(payload,'sourceFactsToken')?{sourceFactsToken:payload.sourceFactsToken,sourceFactsReviewed:payload.sourceFactsReviewed===true}:{};
    if(Object.hasOwn(sourceAttestation,'sourceFactsToken')&&!/^[a-f0-9]{64}$/.test(sourceAttestation.sourceFactsToken))throw fail('评议依据版本无效，请重新预览',400);
    return {decision,participants,reason,roleReason,admissionDecision,...sourceAttestation};
  }
  function recordSync(item,final,user) {
    const channel=db.prepare('select * from maintenance_nonroutine_review_channels where case_id=?').get(item.id);
    if(!channel || channel.subtask_id!==item.subtask_id)throw fail('终审缺少合法唯一工时通道',409);
    if(Number(channel.approved_revision)!==Number(final.approved_revision))throw fail('工时通道认定版本不一致',409);
    if(['MERGED_CLOSED','ADJUSTED_CLOSED'].includes(channel.state))return;
    if(channel.state==='CANCELLED_CLOSED')throw fail('工时通道已取消，不能重新开放',409);
    if(!['APPROVED_PENDING_SYNC','NEEDS_ATTENTION'].includes(channel.state))throw fail('工时通道状态不允许同步',409);
    const result=post({item,final,channel,user});
    if(!result || !['MERGED_CLOSED','ADJUSTED_CLOSED','NEEDS_ATTENTION'].includes(result.state))throw fail('工时同步未返回明确处理结果',500);
    db.prepare('update maintenance_nonroutine_review_channels set state=?,approved_revision=?,updated_at=? where id=?')
      .run(result.state,final.approved_revision,clock(),channel.id);
    db.prepare('insert into maintenance_nonroutine_review_sync_attempts(id,channel_id,actor_id,outcome,detail_json,created_at) values(?,?,?,?,?,?)')
      .run(randomId('nrsa'),channel.id,user.id,result.state,JSON.stringify(result.detail || {}),clock());
  }
  function preview(id,payload,user){return transaction(()=>{
    const item=load(id,user,true);
    if(item.state!=='SEALED' || Number(payload?.revision)!==Number(item.revision))throw fail('须本轮封闭且版本一致后才可预览终审',409);
    const input=normalize(payload,item),policy=capturePolicy(input.decision.category,input.participants,item),original=JSON.parse(item.application_json);
    const differences=['category','chapter','title','workScope'].filter(key=>original[key]!==input.decision[key]).map(field=>({field,originalValue:original[field],proposedValue:input.decision[field]}));
    if(Number(original.requestedHours)!==input.decision.recognizedHours)differences.push({field:'recognizedHours',originalValue:original.requestedHours,proposedValue:input.decision.recognizedHours});
    // V10.1 行430/431 校验义务（2026-11-18 用户裁决A）：只读提示配置规则版本是否独立变化。
    // 计算仍 100% 用冻结快照（frozenNonroutineFinalPolicy 不读当前规则）；此字段不参与
    // policyChanged/token/入账语义，仅为终审页展示。注入的 currentRuleVersion 缺省返回
    // null（隔离夹具/无规则库），此时 configDrift=null 不提示。
    const currentVersion=currentRuleVersion();
    const frozenVersion=String(policy?.version||'');
    const configDrift=typeof currentVersion==='string'&&/^[a-f0-9]{64}$/.test(currentVersion)&&/^[a-f0-9]{64}$/.test(frozenVersion)?frozenVersion!==currentVersion:null;
    return {readOnly:true,caseRevision:Number(item.revision),decision:input.decision,policy,policyToken:createHash('sha256').update(policyIdentity(policy)).digest('hex'),differences,
      policyChanged:policyIdentity(policy)!==policyIdentity(JSON.parse(item.policy_json||'{}')),rolesChanged:pairs(input.participants)!==pairs(JSON.parse(item.participants_json)),
      configDrift,
      sourceFacts:sourceFacts(item,user),allocation:previewAllocation(item,input.decision,input.participants,policy)};
  });}
  function finalize(id,payload,user) {
    return transaction(()=>{
      const item=load(id,user,true),input=normalize(payload,item);
      const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
      const existing=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(id);
      if(existing){if(existing.input_digest!==digest)throw fail('本轮终审已锁定，不能改写或发起第二轮',409);return view(id,user);}
      if(item.state!=='SEALED' || Number(payload.revision)!==Number(item.revision))throw fail('须12份意见封闭且终审版本一致后才可裁定',409);
      const opinions=db.prepare(`select o.* from maintenance_nonroutine_review_opinions o join maintenance_nonroutine_review_seats s
        on s.case_id=o.case_id and s.person_id=o.person_id and s.account_id=o.account_id where o.case_id=? order by o.person_id`).all(id);
      if(opinions.length!==12 || new Set(opinions.map(row=>row.person_id)).size!==12 || new Set(opinions.map(row=>row.account_id)).size!==12)throw fail('本轮必须保留12名不同指定评议人的有效意见',409);
      const statistics=reviewStatistics(opinions.map(row=>Number(row.hours)));
      const policy=capturePolicy(input.decision.category,input.participants,item);
      if(payload.expectedPolicyToken!==undefined && payload.expectedPolicyToken!==createHash('sha256').update(policyIdentity(policy)).digest('hex'))throw fail('预览后分配策略已变化，请重新预览并核实',409);
      const application=JSON.parse(item.application_json);
      const fieldChanged=['category','chapter','title','workScope'].some(key=>application[key]!==input.decision[key]) || Number(application.requestedHours)!==input.decision.recognizedHours;
      if((fieldChanged || policyIdentity(policy)!==policyIdentity(JSON.parse(item.policy_json || '{}'))) && !input.reason)throw fail('终审五项或完整分配策略与申请不同，请说明裁定依据');
      if(pairs(input.participants)!==pairs(JSON.parse(item.participants_json)) && !input.roleReason)throw fail('角色核实与原快照不同，请说明核实依据');
      const facts=sourceFacts(item,user);
      if(facts&&(!facts.available||input.sourceFactsToken&&input.sourceFactsToken!==facts.token))throw fail('原评议依据已变化或不可读取，请重新预览核对',409);
      if(facts?.changed&&(input.sourceFactsToken!==facts.token||!input.sourceFactsReviewed||!input.reason))throw fail('原工作事实与提报快照不同，请预览差异、明确核实并填写本轮裁定依据',409);
      const finalId=randomId('nrf'),stamp=clock();
      db.prepare(`insert into maintenance_nonroutine_review_finals(id,case_id,approved_revision,input_digest,decision_json,participants_json,policy_json,opinion_versions_json,statistics_json,reason,role_verification_reason,admission_decision,finalized_by,created_at)
        values(?,?,1,?,?,?,?,?,?,?,?,?,?,?)`).run(finalId,id,digest,JSON.stringify(input.decision),JSON.stringify(input.participants),JSON.stringify(policy),
          JSON.stringify(opinions.map(row=>({personId:row.person_id,accountId:row.account_id,revision:Number(row.revision)}))),JSON.stringify(statistics),input.reason,input.roleReason,input.admissionDecision,user.id,stamp);
      db.prepare("update maintenance_nonroutine_review_cases set state='FINALIZED',revision=revision+1,updated_at=? where id=?").run(stamp,id);
      db.prepare("update maintenance_nonroutine_review_channels set state='APPROVED_PENDING_SYNC',approved_revision=1,updated_at=? where case_id=? and state='WAITING_REVIEW'").run(stamp,id);
      db.prepare("update maintenance_nonroutine_review_outbox set state='CANCELLED' where case_id=? and state='PENDING'").run(id);
      db.prepare('insert into maintenance_nonroutine_review_events(id,case_id,actor_id,event_type,detail_json,created_at) values(?,?,?,?,?,?)')
        .run(randomId('nre'),id,user.id,'FINALIZED',JSON.stringify({finalId,approvedRevision:1,...(facts?{sourceFacts:{token:facts.token,current:facts.current,baselineOrigin:facts.baselineOrigin,changed:facts.changed,acknowledged:input.sourceFactsReviewed===true,attestationIncluded:Object.hasOwn(input,'sourceFactsToken')}}:{})}),stamp);
      const final=db.prepare('select * from maintenance_nonroutine_review_finals where id=?').get(finalId);
      recordSync(item,final,user);
      return view(id,user);
    });
  }
  function retry(id,user) {
    return transaction(()=>{
      const item=load(id,user,true);
      const final=db.prepare('select * from maintenance_nonroutine_review_finals where case_id=?').get(id);
      if(item.state!=='FINALIZED' || !final)throw fail('须先完成合法终审',409);
      recordSync(item,final,user);return view(id,user);
    });
  }
  return {view,finalize,retry,preview};
}
