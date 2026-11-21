// Read-only aggregate of actual work identities. Technical provenance is shown separately.
const unknown=()=>({available:false,byVersion:new Map(),byStandard:new Map(),reason:'引用来源缺失或格式异常，暂不能确认引用量。'});
export const emptyStandardUsage=()=>({available:true,workItems:0,draftWorkItems:0,formalWorkItems:0,sourceTraces:0,standardImportRows:0,originWorkRecognitions:0});
export function standardUsage(snapshot,kind,id){const standardId=kind==='byStandard'?id:snapshot?.versionStandards?.get(id);return snapshot?.available&&!snapshot.unavailableStandards?.has(standardId)?{...emptyStandardUsage(),...(snapshot[kind]?.get(id)||{})}:{available:false,workItems:null,draftWorkItems:null,formalWorkItems:null,sourceTraces:null,standardImportRows:null,originWorkRecognitions:null};}
export function readStandardReferences(db){
 try{
  const versions=db.prepare('select id,standard_id,version from maintenance_standard_versions').all(),byId=new Map(versions.map(row=>[row.id,row])),byNumber=new Map(versions.map(row=>[JSON.stringify([row.standard_id,Number(row.version)]),row])),work=new Map(),traces=[],identities=new Map(),unavailableStandards=new Set();
  function ref(value){if(value===null||value===undefined)return null;if(typeof value!=='object'||Array.isArray(value))throw Error('Invalid standard reference');const standardId=value.standardId||value.id,versionId=value.versionId,number=value.standardVersion??value.version;if(!standardId&&!versionId)return null;const resolved=versionId?byId.get(versionId):byNumber.get(JSON.stringify([standardId,Number(number)]));if(!resolved||standardId&&resolved.standard_id!==standardId||number!==undefined&&Number(number)!==Number(resolved.version)){if(standardId)unavailableStandards.add(standardId);if(resolved)unavailableStandards.add(resolved.standard_id);if(!standardId&&!resolved)throw Error('Unresolved unowned reference');return null;}return resolved;}
  function parse(value){if(value===null||value===undefined||value==='')return null;return JSON.parse(value);}
  function add(identity,value,rank,formal){const version=ref(value);if(!version)return;const prior=work.get(identity);if(!prior||rank>prior.rank)work.set(identity,{version,rank,formal});else if(rank===prior.rank&&prior.version.id!==version.id){unavailableStandards.add(prior.version.standard_id);unavailableStandards.add(version.standard_id);}}
  const assessments=db.prepare("select subtask_id,standard_json from maintenance_nonroutine_assessments where source_kind='STANDARD'").all();
  for(const row of assessments){const value=parse(row.standard_json);if(!value)throw Error('Missing formal standard');add(`work:${row.subtask_id}`,value,3,true);}
  for(const table of ['maintenance_nonroutine_import_sources','maintenance_nonroutine_manual_sources']){
   for(const row of db.prepare(`select flight_id,client_id,subtask_id,state,standard_snapshot_json from ${table}`).all()){
    if(row.subtask_id){const identity=`draft:${row.flight_id}:${row.client_id}`,canonical=`work:${row.subtask_id}`;if(identities.has(identity)&&identities.get(identity)!==canonical)throw Error('Conflicting source work identity');identities.set(identity,canonical);}
    const value=parse(row.standard_snapshot_json),version=ref(value);if(!version)continue;traces.push({version,kind:'sourceTraces'});
    if(row.state!=='DELETED')add(row.subtask_id?`work:${row.subtask_id}`:`draft:${row.flight_id}:${row.client_id}`,value,2,row.state==='SUBMITTED'||Boolean(row.subtask_id));
   }
  }
  for(const row of db.prepare("select id,flight_id,payload_json from maintenance_report_drafts where report_type='nonroutine'").all()){
   const payload=parse(row.payload_json);if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.items!==undefined&&!Array.isArray(payload.items))throw Error('Invalid shared draft');
   for(const [index,item]of (payload.items||[]).entries()){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('Invalid draft item');
    const value=item.standardSnapshot||{standardId:item.standardId,standardVersion:item.standardVersion};
    const draftIdentity=`draft:${row.flight_id}:${item.clientId||`${row.id}:${index}`}`,identity=item.id?`work:${item.id}`:identities.get(draftIdentity)||draftIdentity;add(identity,value,1,identity.startsWith('work:'));
   }
  }
  for(const [table,kind]of [['maintenance_standard_import_sources','standardImportRows'],['maintenance_standard_work_sources','originWorkRecognitions']]){
   for(const row of db.prepare(`select standard_id,version_id from ${table}`).all()){const version=ref({standardId:row.standard_id,versionId:row.version_id});if(version)traces.push({version,kind});}
  }
  const byVersion=new Map(),byStandard=new Map(),get=(map,id)=>{if(!map.has(id))map.set(id,emptyStandardUsage());return map.get(id);};
  for(const item of work.values())for(const usage of [get(byVersion,item.version.id),get(byStandard,item.version.standard_id)]){usage.workItems++;usage[item.formal?'formalWorkItems':'draftWorkItems']++;}
  for(const {version,kind}of traces)for(const usage of [get(byVersion,version.id),get(byStandard,version.standard_id)])usage[kind]++;
  return {available:true,byVersion,byStandard,unavailableStandards,versionStandards:new Map(versions.map(row=>[row.id,row.standard_id])),unresolvedStandards:unavailableStandards.size};
 }catch{return unknown();}
}
