// V10.1 §19.4 (5) / P0-57: single overnight-check fact + multi-opportunity relation.
// One real check covering several opportunities is stored ONCE and referenced by links —
// never duplicated. Mounting rides the real non-settlement extension register path
// (extension_overnight_feedback, resultType CHECK_RESULT) and therefore never writes hours,
// sorties, reviews or batches. A recorded applicability basis is mandatory (real business
// rules, not inferred from tail/flight numbers). Idempotent by clientId: the deterministic
// instance key lets a replayed record complete any mounts that failed earlier.
// transactions are NOT nested: the fact+links unit commits first, then each mount runs in
// the register path's own transaction.
import {createHash} from 'node:crypto';

export const MAINTENANCE_OVERNIGHT_FEEDBACK_SCHEMA=`create table if not exists maintenance_overnight_facts(
  id text primary key,
  client_id text not null unique,
  checked_at text not null,
  station text not null,
  summary text not null,
  evidence_ref text,
  applicability_basis text not null,
  inspector_account_id text not null,
  created_by text not null,
  created_at text not null
);
create table if not exists maintenance_overnight_fact_opportunities(
  fact_id text not null references maintenance_overnight_facts(id),
  opportunity_id text not null,
  linked_by text not null,
  created_at text not null,
  primary key(fact_id,opportunity_id)
);
create index if not exists maintenance_overnight_fact_opportunity on maintenance_overnight_fact_opportunities(opportunity_id);`;

export const OVERNIGHT_MODULE={moduleTypeCode:'extension_overnight_feedback',moduleVersion:1,resultType:'CHECK_RESULT'};
const instanceKeyOf=clientId=>'mof_'+createHash('sha256').update(clientId).digest('hex').slice(0,32);
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};

export function createMaintenanceOvernightFeedback({db,transaction,clock,randomId,authorize,audit,mountInstance}){
  if([transaction,clock,randomId,authorize].some(fn=>typeof fn!=='function'))throw TypeError('Missing overnight feedback authority');
  function linksOf(factId){return db.prepare('select opportunity_id as opportunityId,linked_by as linkedBy,created_at as createdAt from maintenance_overnight_fact_opportunities where fact_id=? order by opportunity_id').all(factId);}
  function recordFact(payload,user){
    authorize(user);
    const clientId=String(payload?.clientId||'').trim();
    if(!/^[A-Za-z0-9:_-]{4,200}$/.test(clientId))fail('过夜检查事实请求标识无效');
    const existing=db.prepare('select * from maintenance_overnight_facts where client_id=?').get(clientId);
    if(!existing){
      const checkedAt=String(payload.checkedAt||'').trim(),station=String(payload.station||'').trim(),summary=String(payload.summary||'').trim(),evidenceRef=String(payload.evidence||'').trim()||null,basis=String(payload.applicabilityBasis||'').trim();
      if(!checkedAt||!station||!summary)fail('检查时间、航站与检查摘要必须完整');
      if(!basis)fail('必须记录适用条件核实依据（真实业务规则，不能只凭机号/航班号推断）');
      const opportunityIds=[...new Set(Array.isArray(payload.opportunityIds)?payload.opportunityIds.map(id=>String(id||'').trim()).filter(Boolean):[])];
      if(!opportunityIds.length)fail('一次过夜检查至少关联一个维修机会');
      for(const opportunityId of opportunityIds)if(!db.prepare('select 1 from maintenance_flights where id=?').get(opportunityId))fail('关联的维修机会不存在：'+opportunityId,404);
      transaction(()=>{
        const id=randomId('mof'),stamp=clock();
        db.prepare('insert into maintenance_overnight_facts(id,client_id,checked_at,station,summary,evidence_ref,applicability_basis,inspector_account_id,created_by,created_at) values(?,?,?,?,?,?,?,?,?,?)')
          .run(id,clientId,checkedAt,station,summary,evidenceRef,basis,String(user.id),String(user.id),stamp);
        for(const opportunityId of opportunityIds){
          db.prepare('insert into maintenance_overnight_fact_opportunities(fact_id,opportunity_id,linked_by,created_at) values(?,?,?,?)').run(id,opportunityId,String(user.id),stamp);
          audit(user,{action:'overnight_feedback_fact',opportunityId,factId:id,clientId,checkedAt,station,definition:OVERNIGHT_MODULE,reason:basis});
        }
      });
    }
    const fact=db.prepare('select * from maintenance_overnight_facts where client_id=?').get(clientId),links=linksOf(fact.id),mounted=[];
    if(payload.mount===true&&mountInstance){
      const reason='过夜检查事实关联 '+fact.id+'：'+fact.applicability_basis;
      for(const link of links)mounted.push(mountInstance(link.opportunityId,instanceKeyOf(clientId),reason,user));
    }
    return {replayed:Boolean(existing),fact:{...fact,links},mounted};
  }
  function listByOpportunity(opportunityId,user){
    authorize(user);
    return {facts:db.prepare(`select f.* from maintenance_overnight_facts f join maintenance_overnight_fact_opportunities l on l.fact_id=f.id where l.opportunity_id=? order by f.checked_at,f.id`).all(opportunityId).map(fact=>({...fact,links:linksOf(fact.id)}))};
  }
  function view(factId,user){
    authorize(user);
    const fact=db.prepare('select * from maintenance_overnight_facts where id=?').get(factId);
    if(!fact)fail('未找到该过夜检查事实',404);
    return {fact:{...fact,links:linksOf(factId)},module:OVERNIGHT_MODULE};
  }
  return {recordFact,listByOpportunity,view};
}
