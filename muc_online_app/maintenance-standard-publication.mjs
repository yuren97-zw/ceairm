import {maintenanceStandardVersionLifecycle} from './maintenance-standards.mjs';
import {workStandardPublicationSource} from './maintenance-work-recognition-source.mjs';
import {createHash} from 'node:crypto';
import {normalizeMaintenanceStandardDefinition} from './maintenance-standard-management.mjs';
export const STANDARD_PUBLICATION_SCHEMA=`create table if not exists maintenance_standard_admissions(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null references maintenance_standard_versions(id),
  final_id text not null references maintenance_standard_review_finals(id),
  sequence integer not null check(sequence>0),
  standard_revision integer not null,
  source_digest text not null,
  decision text not null check(decision in ('INCLUDE','EXCLUDE','PENDING')),
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(version_id,sequence),
  unique(actor_id,client_id)
);
create index if not exists maintenance_standard_admission_history on maintenance_standard_admissions(version_id,sequence);
create table if not exists maintenance_standard_publications(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null unique references maintenance_standard_versions(id),
  final_id text not null references maintenance_standard_review_finals(id),
  admission_id text not null unique references maintenance_standard_admissions(id),
  standard_revision integer not null,
  source_digest text not null,
  effective_at text not null,
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(actor_id,client_id)
);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const definition=row=>normalizeMaintenanceStandardDefinition({category:row.category,chapter:row.chapter,title:row.title,workScope:row.work_scope,standardHours:Number(row.standard_hours),aircraftCodes:JSON.parse(row.aircraft_codes_json),genericAircraft:Number(row.generic_aircraft)===1});
const requiredText=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail(`${label}须明确填写且不超过${max}字`);return value.trim();};
// Authority and applicability approval come from server-owned policy, never request booleans.
// The domain does not assign roles or publish automatically; callers must provide current business authority.
export function createStandardPublication({db,transaction,can,clock,randomId,approveApplicability=()=>null,previewApplicability=()=>({ready:false,reason:'权威机型核验尚未配置。'})}){
  const authorize=user=>{if(!can(user,'maintenance.standard.publish'))throw fail('当前账户没有独立标准准入及发布授权',403);};
  function standard(id){const row=db.prepare('select * from maintenance_standards where id=?').get(id);if(!row)throw fail('未找到标准',404);return row;}
  function source(standardId,versionId){
    const version=db.prepare('select * from maintenance_standard_versions where id=? and standard_id=?').get(versionId,standardId);
    if(!version)throw fail('未找到本标准对应版本',404);
    const work=workStandardPublicationSource(db,standardId,version);if(work)return work;
    const final=version.review_final_id&&db.prepare('select * from maintenance_standard_review_finals where id=? and version_id=?').get(version.review_final_id,versionId);
    const item=final&&db.prepare('select * from maintenance_standard_review_cases where id=? and version_id=? and standard_id=?').get(final.case_id,versionId,standardId);
    if(!final||!item||item.state!=='FINALIZED')throw fail('只有独立12人评议终审锁定的版本可办理准入',409);
    const decision=JSON.parse(final.decision_json),aircraft=JSON.parse(final.aircraft_json);
    const values=normalizeMaintenanceStandardDefinition({category:decision.category,chapter:decision.chapter,title:decision.title,workScope:decision.workScope,standardHours:decision.recognizedHours,...aircraft});
    if(final.input_digest!==hash({decision,admissionDecision:final.admission_decision,reason:final.reason})||JSON.stringify(values)!==JSON.stringify(definition(version))||JSON.stringify(aircraft)!==item.aircraft_json)throw fail('版本定义或终审来源不一致，请核对，不允许发布',409);
    const snapshot={kind:'STANDARD_FINAL',standardId,versionId,caseId:item.id,finalId:final.id,decision,aircraft,reviewAdmissionIntent:final.admission_decision};
    return {version,final,snapshot,digest:hash(snapshot)};
  }
  function tables(versionId){return db.prepare('select 1 from maintenance_standard_work_sources where version_id=?').get(versionId)?{admissions:'maintenance_standard_work_admissions',publications:'maintenance_standard_work_publications'}:{admissions:'maintenance_standard_admissions',publications:'maintenance_standard_publications'};}
  function latest(versionId){return db.prepare(`select * from ${tables(versionId).admissions} where version_id=? order by sequence desc limit 1`).get(versionId)||null;}
  function genericScopeApproval(row,digest){
    if(!row)return null;
    const approval=JSON.parse(row.snapshot_json).genericScopeApproval;
    return approval?.approved===true&&approval.sourceDigest===digest&&approval.actorId===row.actor_id&&approval.reason===row.reason?approval:null;
  }
  const publicAdmission=row=>row?{id:row.id,versionId:row.version_id,finalId:row.final_id,sequence:Number(row.sequence),decision:row.decision,actorId:row.actor_id,reason:row.reason,createdAt:row.created_at,...(JSON.parse(row.snapshot_json).genericScopeApproval?{genericScopeApproval:JSON.parse(row.snapshot_json).genericScopeApproval}:{})}:null;
  const publicPublication=row=>row?{id:row.id,versionId:row.version_id,finalId:row.final_id,admissionId:row.admission_id,effectiveAt:row.effective_at,actorId:row.actor_id,reason:row.reason,createdAt:row.created_at}:null;
  function view(id,versionId,user){
    authorize(user);const parent=standard(id),current=source(id,versionId),admission=latest(versionId);
    const lifecycle=maintenanceStandardVersionLifecycle(parent,db.prepare('select * from maintenance_standard_versions where standard_id=?').all(id),clock()).get(versionId);
    const applicability=previewApplicability(current.snapshot.aircraft);
    if(current.snapshot.aircraft.genericAircraft&&!genericScopeApproval(admission,current.digest)){applicability.ready=false;applicability.reason='通用范围须由独立发布负责人在本版本准入时明确批准。';}
    const editable=parent.status!=='DISABLED'&&current.version.status==='DRAFT'&&!current.version.published_at;
    return {standard:parent,version:{id:current.version.id,version:Number(current.version.version),status:current.version.status,lifecycle},capabilities:{admit:editable,publish:editable&&admission?.decision==='INCLUDE'&&applicability.ready===true},applicability,source:current.snapshot,admission:publicAdmission(admission),admissionHistory:db.prepare(`select * from ${tables(versionId).admissions} where version_id=? order by sequence desc`).all(versionId).map(publicAdmission),publication:publicPublication(db.prepare(`select * from ${tables(versionId).publications} where version_id=?`).get(versionId))};
  }
  function list(query,user){
    authorize(user);const search=String(query?.search||'').trim(),cursor=String(query?.cursor||'');if(search.length>100||cursor.length>128)throw fail('查询或游标过长');
    const rows=db.prepare(`select v.id as version_id,v.standard_id,v.version,v.category,v.chapter,v.title,v.standard_hours,v.status as version_status,s.status as standard_status,s.revision,
      case when w.version_id is not null then 'WORK_FINAL' else 'STANDARD_FINAL' end as source_kind,
      case when w.version_id is not null then (select a.decision from maintenance_standard_work_admissions a where a.version_id=v.id order by a.sequence desc limit 1)
        else (select a.decision from maintenance_standard_admissions a where a.version_id=v.id order by a.sequence desc limit 1) end as admission_decision,
      case when w.version_id is not null then wp.id else p.id end as publication_id,
      case when w.version_id is not null then wp.effective_at else p.effective_at end as effective_at
      from maintenance_standard_versions v join maintenance_standards s on s.id=v.standard_id
      left join maintenance_standard_work_sources w on w.version_id=v.id and w.standard_id=s.id and w.work_final_id=v.review_final_id
      left join maintenance_nonroutine_review_finals wf on wf.id=w.work_final_id and wf.case_id=w.work_case_id
      left join maintenance_nonroutine_review_cases wc on wc.id=wf.case_id
      left join maintenance_standard_review_finals f on f.id=v.review_final_id and f.version_id=v.id
      left join maintenance_standard_review_cases c on c.id=f.case_id and c.version_id=v.id and c.standard_id=s.id
      left join maintenance_standard_publications p on p.version_id=v.id
      left join maintenance_standard_work_publications wp on wp.version_id=v.id
      where ((w.version_id is not null and wc.state='FINALIZED' and wf.approved_revision=1) or (w.version_id is null and c.state='FINALIZED'))
        and v.id>? and (v.title like ? or v.chapter like ?) order by v.id limit 51`).all(cursor,`%${search}%`,`%${search}%`);
    return {items:rows.slice(0,50).map(row=>({standardId:row.standard_id,versionId:row.version_id,version:Number(row.version),category:row.category,chapter:row.chapter,title:row.title,standardHours:Number(row.standard_hours),sourceKind:row.source_kind,versionStatus:row.version_status,standardStatus:row.standard_status,revision:Number(row.revision),admissionDecision:row.admission_decision||null,publicationId:row.publication_id||null,effectiveAt:row.effective_at||null})),nextCursor:rows.length>50?rows[49].version_id:null};
  }
  function request(id,action,payload,user){
    authorize(user);if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('准入发布请求须为对象');
    const allowed=['revision','versionId','clientId','reason',...(action==='ADMIT'?['decision','genericScopeApproved']:['admissionId','effectiveAt'])];
    if(Object.keys(payload).some(key=>!allowed.includes(key))||!Number.isInteger(payload.revision))throw fail('准入发布字段或版本无效');
    const clientId=requiredText(payload.clientId,'请求标识',128),reason=requiredText(payload.reason,'操作依据',2000),versionId=requiredText(payload.versionId,'版本标识',128);
    if(!/^[a-zA-Z0-9_-]{8,128}$/.test(clientId))throw fail('请求标识无效');
    if(payload.genericScopeApproved!==undefined&&typeof payload.genericScopeApproved!=='boolean')throw fail('通用范围批准须为明确勾选');
    let decision,effectiveAt,admissionId;
    if(action==='ADMIT'){decision=payload.decision;if(!['INCLUDE','EXCLUDE','PENDING'].includes(decision))throw fail('须明确选择纳入、不纳入或待定');}
    else{
      admissionId=requiredText(payload.admissionId,'准入记录',128);
      if(payload.effectiveAt==='IMMEDIATE')effectiveAt='IMMEDIATE';
      else{
        if(typeof payload.effectiveAt!=='string'||!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(payload.effectiveAt)||!Number.isFinite(Date.parse(payload.effectiveAt)))throw fail('须明确选择立即生效或带时区的未来时间');
        if(new Date(payload.effectiveAt.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==payload.effectiveAt.slice(0,10))throw fail('生效日期不存在');
        effectiveAt=new Date(payload.effectiveAt).toISOString();
      }
    }
    const normalized={standardId:id,action,revision:payload.revision,versionId,reason,...(action==='ADMIT'?{decision,...(payload.genericScopeApproved!==undefined?{genericScopeApproved:payload.genericScopeApproved}:{})}:{admissionId,effectiveAt})},digest=hash(normalized);
    // Request identities cannot silently cross admission/publication actions.
    const priors=[];
    for(const [table,kind] of [['maintenance_standard_admissions','ADMIT'],['maintenance_standard_work_admissions','ADMIT'],['maintenance_standard_publications','PUBLISH'],['maintenance_standard_work_publications','PUBLISH']]){const row=db.prepare(`select * from ${table} where actor_id=? and client_id=?`).get(user.id,clientId);if(row)priors.push({row,kind});}
    if(priors.length>1||priors.some(prior=>prior.kind!==action||prior.row.request_hash!==digest))throw fail('同一请求标识不能用于不同准入发布内容',409);
    if(priors.length)return {replayed:true,result:view(id,versionId,user)};
    const parent=standard(id),current=source(id,versionId);
    if(Number(parent.revision)!==payload.revision||parent.status==='DISABLED'||current.version.status!=='DRAFT'||current.version.published_at)throw fail('标准状态或版本已变化，请核对最新记录',409);
    const stamp=clock();if(!Number.isFinite(Date.parse(stamp)))throw fail('准入发布时钟无效',500);
    const currentAdmission=latest(versionId);
    if(currentAdmission&&(currentAdmission.source_digest!==current.digest||currentAdmission.decision!==current.version.admission_decision))throw fail('现有准入与当前认定来源不一致，请核对',409);
    if(action==='ADMIT'){
      if(current.snapshot.aircraft.genericAircraft&&decision==='INCLUDE'&&payload.genericScopeApproved!==true)throw fail('纳入通用标准须明确批准本版本的通用适用范围');
      if(payload.genericScopeApproved===true&&(!current.snapshot.aircraft.genericAircraft||decision!=='INCLUDE'))throw fail('仅纳入通用标准时可以批准通用范围');
      const admissionSnapshot={...current.snapshot,...(payload.genericScopeApproved===true?{genericScopeApproval:{approved:true,actorId:user.id,createdAt:stamp,reason,sourceDigest:current.digest}}:{})};
      db.prepare(`insert into ${tables(versionId).admissions}(id,standard_id,version_id,final_id,sequence,standard_revision,source_digest,decision,actor_id,client_id,request_hash,reason,snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(randomId('std-admit'),id,versionId,current.final.id,Number(currentAdmission?.sequence||0)+1,payload.revision,current.digest,decision,user.id,clientId,digest,reason,JSON.stringify(admissionSnapshot),stamp);
      db.prepare('update maintenance_standard_versions set admission_decision=? where id=?').run(decision,versionId);
    }else{
      if(!currentAdmission||currentAdmission.id!==admissionId||currentAdmission.decision!=='INCLUDE')throw fail('发布须明确关联本版本最新的纳入准入记录',409);
      const resolvedEffectiveAt=effectiveAt==='IMMEDIATE'?stamp:effectiveAt;
      if(Date.parse(resolvedEffectiveAt)<Date.parse(stamp))throw fail('当前受控发布不允许回溯生效，请明确本次或未来时间',409);
      if(current.snapshot.aircraft.genericAircraft&&!genericScopeApproval(currentAdmission,current.digest))throw fail('当前通用版本准入缺少明确范围批准，请重新办理准入',409);
      const approval=approveApplicability(current.snapshot.aircraft,user,current.snapshot);
      if(!approval||approval.approved!==true||typeof approval.reference!=='string'||!approval.reference.trim()||hash({aircraftCodes:approval.aircraftCodes,genericAircraft:approval.genericAircraft})!==hash(current.snapshot.aircraft))throw fail('适用机型缺少相同范围的权威审批，请先核对',409);
      const newest=db.prepare('select max(version) as version from maintenance_standard_versions where standard_id=?').get(id);
      if(Number(newest.version)!==Number(current.version.version))throw fail('存在更新标准版本，不能发布旧草稿',409);
      db.prepare(`insert into ${tables(versionId).publications}(id,standard_id,version_id,final_id,admission_id,standard_revision,source_digest,effective_at,actor_id,client_id,request_hash,reason,snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(randomId('std-pub'),id,versionId,current.final.id,admissionId,payload.revision,current.digest,resolvedEffectiveAt,user.id,clientId,digest,reason,JSON.stringify({source:current.snapshot,admissionId,applicabilityApproval:approval}),stamp);
      db.prepare("update maintenance_standard_versions set status='PUBLISHED',published_by=?,published_at=?,effective_at=? where id=?").run(user.id,stamp,resolvedEffectiveAt,versionId);
      db.prepare("update maintenance_standards set status='PUBLISHED' where id=?").run(id);
    }
    db.prepare('update maintenance_standards set revision=revision+1,updated_at=? where id=?').run(stamp,id);
    return {replayed:false,result:view(id,versionId,user)};
  }
  return {list,view,admit:(id,payload,user)=>transaction(()=>request(id,'ADMIT',payload,user)),publish:(id,payload,user)=>transaction(()=>request(id,'PUBLISH',payload,user))};
}
