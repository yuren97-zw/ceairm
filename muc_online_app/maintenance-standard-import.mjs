import {standardUsage} from './maintenance-standard-references.mjs';
import {createHash} from 'node:crypto';
import {parseMaintenanceImportGrid} from './maintenance-import-file.mjs';
import {normalizeMaintenanceStandardDefinition,createStandardManagement} from './maintenance-standard-management.mjs';
export const STANDARD_IMPORT_SCHEMA=`create table if not exists maintenance_standard_import_batches(
 id text primary key,created_by text not null,filename text not null,file_sha256 text not null,sheet_name text not null,
 revision integer not null default 1,created_at text not null,updated_at text not null
);
create table if not exists maintenance_standard_import_rows(
 batch_id text not null references maintenance_standard_import_batches(id),row_number integer not null,
 original_json text not null,source_key text not null,primary key(batch_id,row_number)
);
create table if not exists maintenance_standard_import_sources(
 source_key text primary key,batch_id text not null,row_number integer not null,
 standard_id text not null references maintenance_standards(id),version_id text not null references maintenance_standard_versions(id),
 action text not null check(action in ('CREATE_DRAFT','UPDATE_DRAFT')),actor_id text not null,reason text not null,distinct_reason text not null,
 snapshot_json text not null,created_at text not null,
 foreign key(batch_id,row_number) references maintenance_standard_import_rows(batch_id,row_number)
);
create table if not exists maintenance_standard_import_attempts(
 batch_id text not null references maintenance_standard_import_batches(id),request_id text not null,request_hash text not null,request_json text not null,
 result_json text not null,created_at text not null,primary key(batch_id,request_id)
);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const key=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
const columns={category:['类别','非例行类别','工作类别'],chapter:['ATA','章节'],title:['工作名称','名称'],workScope:['工作范围','工作内容及范围','内容范围'],standardHours:['草稿工时','标准工时','参考工时','认定工时'],aircraftCodes:['适用机型','机型代码'],genericAircraft:['通用适用','通用机型'],standardId:['标准ID'],standardVersion:['标准版本']};
export async function parseStandardImportFile(payload){
 const {grid,...meta}=await parseMaintenanceImportGrid(payload),headers=grid[0].cells.map(value=>String(value??'').trim().replace(/\s/g,''));
 if(grid[0].formula)throw fail('标准表头不允许公式');const indexes={};
 for(const [field,aliases]of Object.entries(columns)){
  const found=headers.map((header,index)=>header===field||aliases.includes(header)?index:-1).filter(index=>index>=0);
  if(found.length>1)throw fail(`标准文件存在重复列：${aliases[0]}`);indexes[field]=found[0]??-1;
 }
 if(['category','chapter','title','workScope','standardHours','aircraftCodes','genericAircraft'].some(field=>indexes[field]<0))throw fail('标准文件须含类别、ATA、工作名称、工作范围、草稿工时、适用机型及通用适用列');
 if(headers.some((header,index)=>header&&!Object.values(indexes).includes(index)))throw fail('标准文件含未支持列；维修机会、人员、比例、准入和发布不能通过本入口导入');
 return {...meta,rows:grid.slice(1).map(row=>{
  const values=Object.fromEntries(Object.entries(indexes).map(([field,index])=>[field,index<0?'':row.cells[index]??'']));
  return {...values,rowNumber:row.rowNumber,sourceCells:row.cells.map(value=>value??''),sourceError:row.formula||row.cells.some(value=>/^[\s]*[=+@]|^[\s]*-\s*[A-Za-z]/.test(value||''))?'本行含公式，请改为纯文字':null};
 })};
}
function input(raw){
 if(raw.sourceError)throw fail(raw.sourceError);
 const generic=key(raw.genericAircraft),mapping={是:true,通用:true,TRUE:true,'1':true,否:false,非通用:false,FALSE:false,'0':false};
 if(!Object.hasOwn(mapping,generic))throw fail('通用适用须明确填写是或否');
 const definition=normalizeMaintenanceStandardDefinition({category:raw.category,chapter:raw.chapter,title:raw.title,workScope:raw.workScope,standardHours:raw.standardHours,aircraftCodes:String(raw.aircraftCodes).split(/[,，、;；\s]+/).filter(Boolean),genericAircraft:mapping[generic]});
 const standardId=String(raw.standardId||'').trim(),version=String(raw.standardVersion||'').trim();
 if(standardId.length>128||Boolean(standardId)!==Boolean(version)||version&&!/^[1-9]\d*$/.test(version))throw fail('更新草稿须同时填写准确标准ID及正整数版本；新增两列均留空');
 return {definition,standardId,version:version?Number(version):null};
}
export function createStandardImport({db,transaction,can,clock,randomId,versionUnderReview=()=>null,referenceSnapshot=()=>null}){
 const authorize=user=>{if(!can(user,'maintenance.standard.manage'))throw fail('当前账户没有全维修范围标准管理权限',403);};
 function batch(id,user){authorize(user);const row=db.prepare('select * from maintenance_standard_import_batches where id=? and created_by=?').get(id,user.id);if(!row)throw fail('未找到本账户的标准导入批次',404);return row;}
 // All projections are evaluated from current catalog facts; clients cannot approve definitions or effective values.
 function context(rows){
  const keys=rows.map(row=>row.source_key),sources=keys.length?db.prepare(`select * from maintenance_standard_import_sources where source_key in (${keys.map(()=>'?').join(',')})`).all(...keys):[];
  const catalog=db.prepare('select v.*,s.status as parent_status,s.revision as parent_revision from maintenance_standard_versions v join maintenance_standards s on s.id=v.standard_id order by v.id').all();
  return {references:referenceSnapshot(),catalog,sources:new Map(sources.map(row=>[row.source_key,row]))};
 }
 function previewRow(row,allRows,user,facts){
  const raw=JSON.parse(row.original_json),prior=facts.sources.get(row.source_key),rowNumber=Number(row.row_number);
  if(prior)return {rowNumber,status:'ALREADY_IMPORTED',title:raw.title,receipt:{standardId:prior.standard_id,versionId:prior.version_id,action:prior.action}};
  try{
   const {definition,standardId,version}=input(raw);let target=null;
   if(standardId){const selected=facts.catalog.find(item=>item.standard_id===standardId&&Number(item.version)===version);if(!selected||selected.parent_status==='DISABLED'||selected.status!=='DRAFT'||selected.review_final_id||selected.admission_decision!=='PENDING'||selected.published_at||versionUnderReview(selected.id))throw fail('指定版本不是可编辑的未发布草稿；已发布标准须由终审权限发起新版本评议');const usage=standardUsage(facts.references,'byVersion',selected.id);if(!usage.available||usage.workItems>0)throw fail('指定草稿引用量未核实或已有工作引用，不能批量修改');target={standardId,versionId:selected.id,revision:Number(selected.parent_revision),version};}
   const duplicates=[];
   for(const stored of facts.catalog){
    if(stored.standard_id!==standardId&&key(stored.title)===key(definition.title))duplicates.push({source:'STANDARD',id:stored.standard_id,versionId:stored.id,version:Number(stored.version),revision:Number(stored.parent_revision),status:stored.parent_status,title:stored.title,chapter:stored.chapter,category:stored.category,workScope:stored.work_scope});
   }
   for(const other of allRows){if(Number(other.row_number)===rowNumber)continue;const value=JSON.parse(other.original_json);if(!value.standardId&&key(value.title)===key(definition.title))duplicates.push({source:'BATCH_ROW',rowNumber:Number(other.row_number),title:value.title});}
   const action=target?'UPDATE_DRAFT':'CREATE_DRAFT',snapshot={definition,target,duplicates},digest=hash(snapshot);
   return {rowNumber,status:duplicates.length?'NEEDS_REVIEW':'READY',action,title:definition.title,definition,target,duplicates,digest};
  }catch(error){return {rowNumber,status:'BLOCKED',title:raw.title,reason:error.message};}
 }
 function view(id,user){const current=batch(id,user),rows=db.prepare('select * from maintenance_standard_import_rows where batch_id=? order by row_number').all(id),facts=context(rows),items=rows.map(row=>previewRow(row,rows,user,facts));
  return {batchId:id,filename:current.filename,sheetName:current.sheet_name,fileSha256:current.file_sha256,revision:Number(current.revision),items,summary:{total:items.length,ready:items.filter(item=>item.status==='READY').length,needsReview:items.filter(item=>item.status==='NEEDS_REVIEW').length,blocked:items.filter(item=>item.status==='BLOCKED').length,imported:items.filter(item=>item.status==='ALREADY_IMPORTED').length}};
 }
 function preview(file,user){return transaction(()=>{
  authorize(user);if(!file||!Array.isArray(file.rows)||!file.rows.length||file.rows.length>1000||!/^[a-f0-9]{64}$/.test(file.fileSha256))throw fail('标准文件元数据无效');
  const id=randomId('std-import'),stamp=clock();db.prepare('insert into maintenance_standard_import_batches(id,created_by,filename,file_sha256,sheet_name,revision,created_at,updated_at) values(?,?,?,?,?,1,?,?)').run(id,user.id,file.filename,file.fileSha256,file.sheetName,stamp,stamp);
  const seen=new Set();for(const row of file.rows){if(!Number.isInteger(row.rowNumber)||row.rowNumber<1||seen.has(row.rowNumber))throw fail('标准来源行号无效或重复');seen.add(row.rowNumber);db.prepare('insert into maintenance_standard_import_rows(batch_id,row_number,original_json,source_key) values(?,?,?,?)').run(id,row.rowNumber,JSON.stringify(row),hash([file.fileSha256,file.sheetName,row.rowNumber]));}
  return view(id,user);
 });}
 function commit(id,payload,user){return transaction(()=>{
  const current=batch(id,user);
  if(!payload||Object.keys(payload).some(field=>!['revision','requestId','reason','rows'].includes(field))||!Number.isInteger(payload.revision)||typeof payload.requestId!=='string'||!/^[a-zA-Z0-9_-]{8,128}$/.test(payload.requestId||'')||typeof payload.reason!=='string'||!payload.reason.trim()||payload.reason.trim().length>2000||!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>1000)throw fail('须明确批次版本、请求标识、操作依据及所选标准行');
  const selected=payload.rows.map(row=>{if(!row||Object.keys(row).some(field=>!['rowNumber','digest','distinctReason'].includes(field))||(!Number.isInteger(row.rowNumber)||row.rowNumber<1)||typeof row.digest!=='string'||!/^[a-f0-9]{64}$/.test(row.digest)||row.distinctReason!==undefined&&(typeof row.distinctReason!=='string'||row.distinctReason.trim().length>2000))throw fail('标准行确认字段无效');return {rowNumber:row.rowNumber,digest:row.digest,distinctReason:String(row.distinctReason||'').trim()};});
  if(new Set(selected.map(row=>row.rowNumber)).size!==selected.length)throw fail('所选标准行重复');
  const normalizedRequest={revision:payload.revision,reason:payload.reason.trim(),rows:selected},requestHash=hash(normalizedRequest),prior=db.prepare('select * from maintenance_standard_import_attempts where batch_id=? and request_id=?').get(id,payload.requestId);
  if(prior){if(prior.request_hash!==requestHash)throw fail('同一请求标识不能用于不同标准导入内容',409);return {...JSON.parse(prior.result_json),replayed:true};}
  if(Number(current.revision)!==payload.revision)throw fail('标准导入批次已变化，请重新读取',409);
  const rows=db.prepare('select * from maintenance_standard_import_rows where batch_id=? order by row_number').all(id),facts=context(rows),results=[];
  // This original transaction writes only standards and provenance, never work references.
  const management=createStandardManagement({db,transaction:fn=>fn(),can,clock,randomId,versionUnderReview,referenceSnapshot:()=>facts.references});
  for(const [index,confirmation]of selected.entries()){
   const row=rows.find(item=>Number(item.row_number)===confirmation.rowNumber);if(!row){results.push({rowNumber:confirmation.rowNumber,status:'FAILED',reason:'来源行不存在'});continue;}
   const existing=facts.sources.get(row.source_key);if(existing){results.push({rowNumber:confirmation.rowNumber,status:'ALREADY_IMPORTED',standardId:existing.standard_id,versionId:existing.version_id});continue;}
   const live=previewRow(row,rows,user,facts);
   if(live.digest!==confirmation.digest){results.push({rowNumber:confirmation.rowNumber,status:'CONFLICT',reason:'标准定义、目标版本或重复项已变化，请重新核对'});continue;}
   if(live.status!=='READY'&&!(live.status==='NEEDS_REVIEW'&&confirmation.distinctReason)){results.push({rowNumber:confirmation.rowNumber,status:'NEEDS_REVIEW',reason:live.reason||'须明确核对重复项并填写不同标准的依据'});continue;}
   const savepoint=`standard_import_${index}`;db.exec(`savepoint ${savepoint}`);
   try{
    const body={definition:live.definition,reason:payload.reason.trim(),clientId:`standard-import-${row.source_key}`},updated=live.target?management.update(live.target.standardId,{...body,revision:live.target.revision,versionId:live.target.versionId},user):management.create(body,user),standardId=updated.standard.id,versionId=live.target?.versionId||updated.versions[0].id;
    db.prepare('insert into maintenance_standard_import_sources(source_key,batch_id,row_number,standard_id,version_id,action,actor_id,reason,distinct_reason,snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(row.source_key,id,confirmation.rowNumber,standardId,versionId,live.action,user.id,payload.reason.trim(),confirmation.distinctReason,JSON.stringify({preview:live,original:JSON.parse(row.original_json)}),clock());
    facts.sources.set(row.source_key,{standard_id:standardId,version_id:versionId});
    facts.catalog=facts.catalog.filter(item=>item.standard_id!==standardId).concat(updated.versions.map(item=>({...item,standard_id:standardId,parent_status:updated.standard.status,parent_revision:updated.standard.revision,aircraft_codes_json:JSON.stringify(item.aircraftCodes)}))).sort((a,b)=>a.id.localeCompare(b.id));
    db.exec(`release savepoint ${savepoint}`);results.push({rowNumber:confirmation.rowNumber,status:'SUCCESS',action:live.action,standardId,versionId});
   }catch(error){db.exec(`rollback to savepoint ${savepoint}`);db.exec(`release savepoint ${savepoint}`);results.push({rowNumber:confirmation.rowNumber,status:error.status===409?'CONFLICT':'FAILED',reason:error.message});}
  }
  db.prepare('update maintenance_standard_import_batches set revision=revision+1,updated_at=? where id=?').run(clock(),id);
  const result={batchId:id,revision:Number(current.revision)+1,replayed:false,results,summary:{success:results.filter(row=>row.status==='SUCCESS').length,imported:results.filter(row=>row.status==='ALREADY_IMPORTED').length,conflicts:results.filter(row=>row.status==='CONFLICT').length,needsReview:results.filter(row=>row.status==='NEEDS_REVIEW').length,failed:results.filter(row=>row.status==='FAILED').length}};
  db.prepare('insert into maintenance_standard_import_attempts(batch_id,request_id,request_hash,request_json,result_json,created_at) values(?,?,?,?,?,?)').run(id,payload.requestId,requestHash,JSON.stringify(normalizedRequest),JSON.stringify(result),clock());return result;
 });}
 return {preview,view,commit};
}
