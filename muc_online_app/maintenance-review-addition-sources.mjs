import {createHash} from 'node:crypto';
export const MAINTENANCE_REVIEW_ADDITION_SOURCES_SCHEMA=`create table if not exists maintenance_review_addition_sources(
 flight_id text not null,
 client_id text not null,
 subtask_id text not null unique,
 source_kind text not null check(source_kind in ('REVIEW_ADDITION','ARCHIVE_ADDITION')),
 anonymous integer not null check(anonymous in (0,1)),
 payload_sha256 text not null check(length(payload_sha256)=64),
 snapshot_json text not null,
 created_by text not null,
 created_at text not null,
 primary key(flight_id,client_id)
);`;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(value).digest('hex');
const compare=(a,b)=>a<b?-1:a>b?1:0;
const canonical=snapshot=>JSON.stringify({definition:snapshot.definition,participants:snapshot.participants.map(p=>({personId:p.personId,role:p.role})).sort((a,b)=>compare(a.personId,b.personId)||compare(a.role,b.role))});
// Internal provenance only. Both methods run inside the caller's original,
// currently authorized review transaction; there is no historical backfill.
export function createReviewAdditionSources({db,clock,randomId}){
 function prepare({flightId,clientId,snapshot}){
  const supplied=String(clientId??'').trim(),anonymous=supplied?0:1;
  if(supplied.length>512||/[\x00-\x1f\x7f]/.test(supplied))throw fail('补录来源标识格式无效',400);
  const key=supplied||randomId('legacy-review-source');
  const content=canonical(snapshot),digest=hash(content),previous=db.prepare('select * from maintenance_review_addition_sources where flight_id=? and client_id=?').get(flightId,key);
  if(previous){
   if(hash(previous.snapshot_json)!==previous.payload_sha256)throw fail('原补录来源记录不完整，请核对');
   if(canonical(JSON.parse(previous.snapshot_json))!==content)throw fail('同一补录来源标识不能用于不同事实，请在原项更正或确认独立新来源');
   if(!db.prepare('select id from maintenance_subtasks where id=? and flight_id=?').get(previous.subtask_id,flightId))throw fail('该补录来源对应原工作已删除或不可用，不能重新创建');
  }
  return {flightId,clientId:key,anonymous,content,digest,previous:previous||null,replayed:Boolean(previous)};
 }
 function record(source,subtaskId,sourceKind,user){
  if(source.replayed||hash(source.content)!==source.digest||!user?.id)throw fail('补录来源保存上下文无效',500);
  db.prepare('insert into maintenance_review_addition_sources(flight_id,client_id,subtask_id,source_kind,anonymous,payload_sha256,snapshot_json,created_by,created_at) values(?,?,?,?,?,?,?,?,?)').run(source.flightId,source.clientId,subtaskId,sourceKind,source.anonymous,source.digest,source.content,user.id,clock());
 }
 return {prepare,record};
}
