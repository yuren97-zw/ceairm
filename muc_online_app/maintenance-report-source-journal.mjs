import {createHash} from 'node:crypto';
import {reportParticipantSource} from './maintenance-report-participant-source.mjs';
export const MAINTENANCE_REPORT_SOURCE_JOURNAL_SCHEMA=`
create table if not exists maintenance_report_source_journal(
 id text primary key,batch_id text not null,batch_version integer not null check(batch_version>0),
 flight_id text not null,report_type text not null check(report_type in ('routine','release','nonroutine')),
 snapshot_json text not null,snapshot_sha256 text not null check(length(snapshot_sha256)=64),
 observation_mode text not null check(observation_mode in ('AT_WRITE','FIRST_OBSERVATION')),
 actor_id text not null,qualification_json text not null,reason text not null,observed_at text not null,
 unique(batch_id,batch_version)
);
`;
const error=(status,message)=>Object.assign(new Error(message),{status});
const sha=value=>createHash('sha256').update(value).digest('hex');
// Internal service only. The caller supplies current authorization and the original transaction.
// No source is inferred from an old result ID or current dispatch, and no old history is backfilled.
export function createReportSourceJournal({db,transaction,authorize,clock,randomId}) {
 if(!db||![transaction,authorize,clock,randomId].every(value=>typeof value==='function'))throw Error('Source journal requires transaction and current authorization');
 function capture(batchId,actor,{mode='FIRST_OBSERVATION',reason}={}){
  return transaction(()=>{
   const batch=db.prepare('select * from maintenance_report_batches where id=?').get(batchId);
   if(!batch)throw error(404,'未找到原报工批次');
   const qualification=authorize(actor,batch);
   if(!qualification||!actor?.id)throw error(403,'当前来源留存资格已失效');
   if(!['AT_WRITE','FIRST_OBSERVATION'].includes(mode)||typeof reason!=='string'||!reason.trim())throw error(400,'来源观察方式或依据缺失');
   const entries=db.prepare('select * from maintenance_report_entries where batch_id=? order by id').all(batchId);
   const subtasks=db.prepare('select id,flight_id from maintenance_subtasks where flight_id=? order by id').all(batch.flight_id);
   const source=reportParticipantSource({batch,entries,subtasks});
   // Status/updated_at advance within a version; the immutable participant facts do not.
   const snapshot={batchId:batch.id,flightId:batch.flight_id,reportType:batch.report_type,version:Number(batch.version),submittedBy:batch.submitted_by??null,submittedByName:batch.submitted_by_name??null,submittedAt:batch.submitted_at??null,feedback:batch.feedback??null,entryProvenance:entries.map(item=>({entryId:item.id,source:item.source??null,createdAt:item.created_at??null})),participants:source.participants.map(({status,...item})=>item)};
   const content=JSON.stringify(snapshot),digest=sha(content),existing=db.prepare('select * from maintenance_report_source_journal where batch_id=? and batch_version=?').get(batch.id,source.version);
   if(existing){if(existing.snapshot_sha256!==sha(existing.snapshot_json)||existing.snapshot_sha256!==digest||existing.snapshot_json!==content)throw error(409,'同一报工来源版本存在不同内容，请核对合法修订');return {id:existing.id,batchId:batch.id,version:source.version,digest:existing.snapshot_sha256,observationMode:existing.observation_mode,replayed:true};}
   const id=randomId('reportsource');
   db.prepare('insert into maintenance_report_source_journal(id,batch_id,batch_version,flight_id,report_type,snapshot_json,snapshot_sha256,observation_mode,actor_id,qualification_json,reason,observed_at) values(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,batch.id,source.version,batch.flight_id,batch.report_type,content,digest,mode,actor.id,JSON.stringify(qualification),reason.trim(),clock());
   return {id,batchId:batch.id,version:source.version,digest,observationMode:mode,replayed:false};
  });
 }
 return Object.freeze({capture});
}
