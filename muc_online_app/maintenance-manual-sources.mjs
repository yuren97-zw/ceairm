import {createHash} from 'node:crypto';
export const MANUAL_NONROUTINE_SOURCES_SCHEMA=`create table if not exists maintenance_nonroutine_manual_sources(
  fingerprint text primary key,
  flight_id text not null,
  client_id text not null,
  state text not null check(state in ('ACTIVE','SUBMITTED','DELETED')),
  standard_snapshot_json text,
  subtask_id text unique,
  created_at text not null,
  updated_at text not null,
  unique(flight_id,client_id)
);
create index if not exists maintenance_manual_source_flight on maintenance_nonroutine_manual_sources(flight_id,state);`;
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
// Called inside the original draft/submission transaction after its access and CAS checks.
export function createManualNonroutineSources({db,clock,randomId,matchStandard}){
  const list=flightId=>db.prepare('select * from maintenance_nonroutine_manual_sources where flight_id=?').all(flightId);
  function prepare(flight,items,currentItems,{enabled,importClientIds=[]}={}){
    const sources=new Map(list(flight.id).map(row=>[row.client_id,row])),imports=new Set(importClientIds);
    const seen=new Set();
    const legacy=new Set(currentItems.filter(item=>!item.sourceFingerprint&&!sources.has(item.clientId)).map(item=>item.clientId));
    for(const raw of items){
      if(raw.id||imports.has(String(raw.clientId||'')))continue;
      const known=sources.get(String(raw.clientId||''));
      if(!known&&legacy.has(raw.clientId))continue;
      if(!known&&!enabled){if(raw.standardId||raw.manualManaged)throw fail('手工标准报工尚未启用');continue;}
      const clientId=String(raw.clientId||randomId('manual-draft'));
      if(!/^[a-zA-Z0-9_-]{1,120}$/.test(clientId))throw fail('手工草稿标识无效',400);
      if(seen.has(clientId))throw fail('手工草稿单项标识重复');seen.add(clientId);
      raw.clientId=clientId;
      const existing=sources.get(clientId);
      if(existing&&existing.state!=='ACTIVE')throw fail('该手工来源已删除或提报，不能通过旧请求恢复');
      let standard=existing?.standard_snapshot_json?JSON.parse(existing.standard_snapshot_json):null;
      if(Object.hasOwn(raw,'standardId')){
        if(!enabled&&String(raw.standardId||'')!==String(standard?.id||''))throw fail('手工标准选择尚未启用');
        if(raw.standardId){const match=matchStandard({standardId:raw.standardId,standardVersion:raw.standardVersion},flight.aircraft_type);if(match.status!=='MATCHED')throw fail('所选标准已失效或不适用于当前机型，请重新核对');standard=match.standard;}
        else standard=null;
      }
      const stamp=clock(),snapshot=standard?JSON.stringify(standard):null;
      if(existing){if(existing.standard_snapshot_json!==snapshot)db.prepare('update maintenance_nonroutine_manual_sources set standard_snapshot_json=?,updated_at=? where fingerprint=?').run(snapshot,stamp,existing.fingerprint);}
      else{
        const fingerprint=`manual-${createHash('sha256').update(JSON.stringify([flight.id,clientId])).digest('hex')}`;
        db.prepare("insert into maintenance_nonroutine_manual_sources(fingerprint,flight_id,client_id,state,standard_snapshot_json,created_at,updated_at) values(?,?,?,'ACTIVE',?,?,?)").run(fingerprint,flight.id,clientId,snapshot,stamp,stamp);
      }
    }
    return list(flight.id);
  }
  return {list,prepare};
}

// Similar title/category/ATA candidates do not establish an exact definition.
// Only a registered active manual source with an explicit empty standard choice
// can confirm a different definition as unlisted. Exact matches and invalid
// selected versions retain the existing authoritative matching behavior.
export function resolveManualUnlistedSubmissionMatch(source,raw,match){
 if(source?.kind==='MANUAL'&&source.state==='ACTIVE'&&!source.standard_snapshot_json&&raw?.manualManaged===true&&raw.standardId===''&&match?.status==='NEEDS_SELECTION')return {...match,status:'UNLISTED',standard:null,basis:'EXPLICIT_MANUAL_UNLISTED'};
 return match;
}
