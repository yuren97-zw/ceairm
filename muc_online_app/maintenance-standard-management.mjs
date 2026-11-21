import {standardUsage} from './maintenance-standard-references.mjs';
import crypto from 'node:crypto';
import {NONROUTINE_CATEGORY_STRATEGIES,standardAircraftCode,maintenanceStandardVersionLifecycle} from './maintenance-standards.mjs';
export const STANDARD_MANAGEMENT_SCHEMA=`create table if not exists maintenance_standard_management_events(
  id text primary key,
  standard_id text not null references maintenance_standards(id),
  version_id text not null references maintenance_standard_versions(id),
  revision integer not null,
  action text not null check(action in ('CREATED','UPDATED','WITHDRAWN','DISABLED','VERSION_DRAFT')),
  actor_id text not null,
  client_id text not null,
  request_hash text not null,
  reason text not null,
  snapshot_json text not null,
  created_at text not null,
  unique(actor_id,client_id),
  unique(standard_id,revision)
);
create index if not exists maintenance_standard_management_history on maintenance_standard_management_events(standard_id,revision);`;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail(`${label}须填写且不能超过${max}字`);return value.trim();};
export function normalizeMaintenanceStandardDefinition(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw fail('标准定义须为对象');
  const allowed=['category','chapter','title','workScope','standardHours','aircraftCodes','genericAircraft'];
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw fail('标准草稿包含不允许修改的字段');
  if(!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,input.category))throw fail('请选择有效类别');
  const hours=input.standardHours;
  if((typeof hours!=='number'&&typeof hours!=='string')||String(hours).trim()===''||!Number.isFinite(Number(hours))||Number(hours)<0||Number(hours)>10000||Math.abs(Number(hours)*10-Math.round(Number(hours)*10))>1e-8)throw fail('标准工时须为0至10000小时且最多一位小数');
  if(typeof input.genericAircraft!=='boolean'||!Array.isArray(input.aircraftCodes)||input.aircraftCodes.length>100)throw fail('须明确通用适用性及机型代码列表');
  const codes=[...new Set(input.aircraftCodes.map(code=>{if(typeof code!=='string'||!code.trim()||code.trim().length>40||!/^[A-Za-z0-9_-]+$/.test(code.trim()))throw fail('机型须为明确代码，不能使用通配符或自由说明');return standardAircraftCode(code);}))].sort();
  if(!input.genericAircraft&&!codes.length)throw fail('非通用标准须明确至少一个适用机型代码');
  return {category:input.category,chapter:text(input.chapter,'ATA',200),title:text(input.title,'工作名称',500),workScope:text(input.workScope,'工作范围',4000),standardHours:Number(hours),aircraftCodes:codes,genericAircraft:input.genericAircraft};
}
export function createStandardManagement({db,transaction,can,clock,randomId,versionUnderReview=()=>null,reviewEnabled=()=>false,referenceSnapshot=()=>null}){
  const authorize=(user,action)=>{if(!can(user,`maintenance.standard.${action}`))throw fail('当前账户没有全维修范围的标准管理权限',403);};
  const definition=normalizeMaintenanceStandardDefinition;
  function raw(id){const standard=db.prepare('select * from maintenance_standards where id=?').get(id);if(!standard)throw fail('未找到标准',404);return standard;}
  function view(id,user){authorize(user,'manage');const standard=raw(id),versions=db.prepare('select * from maintenance_standard_versions where standard_id=? order by version desc').all(id),lifecycle=maintenanceStandardVersionLifecycle(standard,versions,clock()),references=referenceSnapshot();
    return {standard,referenceWarnings:Number(references?.unresolvedStandards||0),references:standardUsage(references,'byStandard',id),versions:versions.map(({aircraft_codes_json,...row})=>{const usage=standardUsage(references,'byVersion',row.id),review=versionUnderReview(row.id),draft=!review&&standard.status!=='DISABLED'&&row.status==='DRAFT'&&!row.review_final_id&&row.admission_decision==='PENDING'&&!row.published_at;
      return {...row,references:usage,withdrawBlockReason:!draft?'只有未关联评议认定的未发布草稿可撤回':!usage.available?'引用量未核实，暂不能修改或撤回':usage.workItems?'已有工作引用，不能修改或撤回':null,lifecycle:lifecycle.get(row.id),aircraftCodes:JSON.parse(aircraft_codes_json),reviewCaseId:review?.id||null,capabilities:{viewReview:Boolean(review&&reviewEnabled()),update:draft&&usage.available&&usage.workItems===0,withdraw:draft&&usage.available&&usage.workItems===0,requestReview:reviewEnabled()&&draft&&usage.available&&usage.workItems===0&&(standard.status!=='PUBLISHED'||can(user,'maintenance.nonroutine.review.finalize')),disable:standard.status==='PUBLISHED'&&row.status==='PUBLISHED',revise:Boolean(standard.status==='PUBLISHED'&&row.status==='PUBLISHED'&&!versions.some(item=>item.status==='DRAFT')&&can(user,'maintenance.nonroutine.review.finalize'))}};}),history:db.prepare('select revision,action,actor_id,reason,snapshot_json,created_at from maintenance_standard_management_events where standard_id=? order by revision desc').all(id).map(({snapshot_json,...row})=>({...row,snapshot:JSON.parse(snapshot_json)}))};}
  function list(query,user){
    authorize(user,'manage');query=query||{};if(Object.keys(query).some(key=>!['search','cursor','category','chapter','aircraftCode','lifecycle','references'].includes(key)))throw fail('标准筛选字段无效');
    const fields=Object.fromEntries(['search','cursor','category','chapter','aircraftCode','lifecycle','references'].map(key=>[key,String(query[key]||'').trim()]));fields.aircraftCode=standardAircraftCode(fields.aircraftCode);
    if(fields.search.length>100||fields.cursor.length>128||fields.chapter.length>200||fields.aircraftCode.length>40||fields.aircraftCode&&!/^[A-Z0-9_-]+$/.test(fields.aircraftCode)||fields.category&&!Object.hasOwn(NONROUTINE_CATEGORY_STRATEGIES,fields.category)||fields.lifecycle&&!['DRAFT','EFFECTIVE','SCHEDULED','SUPERSEDED','WITHDRAWN','DISABLED','UNAVAILABLE'].includes(fields.lifecycle)||fields.references&&!['HAS_WORK','NO_WORK','UNKNOWN'].includes(fields.references))throw fail('标准筛选值无效');
    const references=referenceSnapshot(),at=clock(),groups=new Map();
    for(const row of db.prepare(`select v.*,s.status as parent_status,s.revision as parent_revision,s.created_by as parent_created_by,s.created_at as parent_created_at,s.updated_at as parent_updated_at from maintenance_standard_versions v join maintenance_standards s on s.id=v.standard_id where s.id>? order by s.id,v.version desc`).all(fields.cursor)){
      if(!groups.has(row.standard_id))groups.set(row.standard_id,[]);groups.get(row.standard_id).push(row);
    }
    const items=[];
    for(const [id,versions]of groups){const latest=versions[0],standard={id,status:latest.parent_status,revision:Number(latest.parent_revision),created_by:latest.parent_created_by,created_at:latest.parent_created_at,updated_at:latest.parent_updated_at},usage=standardUsage(references,'byStandard',id),lifecycle=maintenanceStandardVersionLifecycle(standard,versions,at);
      if(fields.references==='HAS_WORK'&&(!usage.available||usage.workItems===0)||fields.references==='NO_WORK'&&(!usage.available||usage.workItems!==0)||fields.references==='UNKNOWN'&&usage.available)continue;
      const matched=versions.filter(row=>(!fields.search||[row.title,row.chapter].some(value=>String(value).toUpperCase().includes(fields.search.toUpperCase())))&&(!fields.category||row.category===fields.category)&&(!fields.chapter||row.chapter.toUpperCase().includes(fields.chapter.toUpperCase()))&&(!fields.aircraftCode||Number(row.generic_aircraft)===1||JSON.parse(row.aircraft_codes_json).map(standardAircraftCode).includes(fields.aircraftCode))&&(!fields.lifecycle||lifecycle.get(row.id)===fields.lifecycle));
      if(!matched.length)continue;
      items.push({...standard,version_id:latest.id,version:Number(latest.version),title:latest.title,category:latest.category,version_status:latest.status,lifecycle:lifecycle.get(latest.id),references:usage,matchedVersions:matched.map(row=>({version:Number(row.version),lifecycle:lifecycle.get(row.id)}))});if(items.length===51)break;
    }
    return {referenceWarnings:Number(references?.unresolvedStandards||0),items:items.slice(0,50),nextCursor:items.length>50?items[49].id:null};
  }
  function mutate(id,action,payload,user){return transaction(()=>{
    authorize(user,'manage');if(action==='VERSION_DRAFT'&&!can(user,'maintenance.nonroutine.review.finalize'))throw fail('只有具有最终评审权限的人员可以发起已发布标准新版本草稿',403);
    if(!payload||typeof payload!=='object'||Array.isArray(payload))throw fail('管理请求须为对象');
    const allowed=['clientId','reason',...(action==='CREATED'?['definition']:action==='VERSION_DRAFT'?['revision','baseVersion','definition']:action==='UPDATED'?['revision','versionId','definition']:['revision','versionId'])];
    if(Object.keys(payload).some(key=>!allowed.includes(key)))throw fail('管理请求包含不允许的字段');
    const clientId=text(payload.clientId,'请求标识',128),reason=text(payload.reason,'操作依据',2000);
    const values=['CREATED','UPDATED','VERSION_DRAFT'].includes(action)?definition(payload.definition):null;
    const request={id:id||null,action,revision:payload.revision??null,versionId:payload.versionId??null,baseVersion:payload.baseVersion??null,definition:values,reason};
    const hash=crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
    const prior=db.prepare('select * from maintenance_standard_management_events where actor_id=? and client_id=?').get(user.id,clientId);
    if(prior){if(prior.request_hash!==hash)throw fail('同一请求标识不能用于不同管理操作',409);return {...view(prior.standard_id,user),operation:{revision:Number(prior.revision),replayed:true}};}
    const stamp=clock();let standard,version,before=null;
    if(action==='CREATED'){
      id=randomId('mst');const versionId=randomId('msv');
      db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'DRAFT',1,?,?,?)").run(id,user.id,stamp,stamp);
      insertVersion(versionId,id,1,values,stamp);standard=raw(id);version=db.prepare('select * from maintenance_standard_versions where id=?').get(versionId);
    }else{
      standard=raw(id);if(!Number.isInteger(payload.revision)||Number(standard.revision)!==payload.revision)throw fail('标准版本已变化，请读取最新记录后重试',409);
      if(standard.status==='DISABLED')throw fail('标准已停用，不能继续修改',409);
      const versions=db.prepare('select * from maintenance_standard_versions where standard_id=? order by version desc').all(id);
      before={standard,versions};
      if(action==='VERSION_DRAFT'){
        if(standard.status!=='PUBLISHED'||versions.some(row=>row.status==='DRAFT'))throw fail('须已发布且没有其他待处理版本草稿',409);
        const base=versions.find(row=>Number(row.version)===payload.baseVersion&&row.status==='PUBLISHED');if(!base)throw fail('须明确关联原已发布版本',409);
        const versionId=randomId('msv');insertVersion(versionId,id,Number(versions[0].version)+1,values,stamp);version=db.prepare('select * from maintenance_standard_versions where id=?').get(versionId);
      }else{
        version=versions.find(row=>row.id===payload.versionId);if(!version)throw fail('未找到本标准对应版本',404);
        if(action==='DISABLED'){
          if(standard.status!=='PUBLISHED'||version.status!=='PUBLISHED')throw fail('须明确已发布标准版本才能停用；未发布草稿请撤回',409);
          db.prepare("update maintenance_standards set status='DISABLED' where id=?").run(id);
        }else{
          if(versionUnderReview(version.id)||version.status!=='DRAFT'||version.review_final_id||version.admission_decision!=='PENDING'||version.published_at)throw fail('只允许修改或撤回尚未关联评议认定的未发布草稿',409);
          const usage=standardUsage(referenceSnapshot(),'byVersion',version.id);if(!usage.available||usage.workItems>0)throw fail(usage.available?'已有工作引用，不能修改或撤回此草稿':'引用量未核实，暂不能修改或撤回',409);
          if(action==='UPDATED')db.prepare('update maintenance_standard_versions set category=?,chapter=?,title=?,work_scope=?,standard_hours=?,aircraft_codes_json=?,generic_aircraft=? where id=?').run(values.category,values.chapter,values.title,values.workScope,values.standardHours,JSON.stringify(values.aircraftCodes),values.genericAircraft?1:0,version.id);
          else if(action==='WITHDRAWN'){
            db.prepare("update maintenance_standard_versions set status='WITHDRAWN' where id=?").run(version.id);
            if(standard.status==='DRAFT')db.prepare("update maintenance_standards set status='DISABLED' where id=?").run(id);
          }else throw fail('不支持的标准管理操作');
        }
      }
      db.prepare('update maintenance_standards set revision=revision+1,updated_at=? where id=?').run(stamp,id);standard=raw(id);version=db.prepare('select * from maintenance_standard_versions where id=?').get(version.id);
    }
    const after={standard,version};db.prepare('insert into maintenance_standard_management_events(id,standard_id,version_id,revision,action,actor_id,client_id,request_hash,reason,snapshot_json,created_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(randomId('msme'),id,version.id,standard.revision,action,user.id,clientId,hash,reason,JSON.stringify({before,after,request}),stamp);
    return {...view(id,user),operation:{revision:Number(standard.revision),replayed:false}};
  });}
  function insertVersion(id,standardId,version,values,stamp){db.prepare(`insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,created_at) values(?,?,?,?,?,?,?,?,?,?,'DRAFT','PENDING',?)`).run(id,standardId,version,values.category,values.chapter,values.title,values.workScope,values.standardHours,JSON.stringify(values.aircraftCodes),values.genericAircraft?1:0,stamp);}
  return {list,view,create:(payload,user)=>mutate(null,'CREATED',payload,user),update:(id,payload,user)=>mutate(id,'UPDATED',payload,user),withdraw:(id,payload,user)=>mutate(id,'WITHDRAWN',payload,user),disable:(id,payload,user)=>mutate(id,'DISABLED',payload,user),revise:(id,payload,user)=>mutate(id,'VERSION_DRAFT',payload,user)};
}
