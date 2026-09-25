import crypto from 'node:crypto';

export const AUTHORIZATION_HEADERS=['工号','姓名','项目代码','项目名称','授权类型','授权单位','授权日期','授权有效期','授权状态'];
export const AUTHORIZATION_REMOVED=['申请单位','符合要求','执照号码','证书号码','授权人','培训到限日期','授权备注','评估备注'];
export const AUTHORIZATION_SCHEMA=`create table if not exists personnel_authorizations(
 id text primary key,person_id text not null,employee_no text not null,project_code text not null,
 project_name text,authorization_type text not null,authorization_unit text not null,
 authorized_at text,authorization_expires_at text,authorization_status text not null,
 source_batch_id text,created_at text not null,updated_at text not null,data_status text default 'active',
 unique(person_id,project_code,authorization_type,authorization_unit)
)`;
const fail=(message,status=400,details)=>Object.assign(new Error(message),{status,details});
const text=v=>String(v??'').trim();
const key=r=>JSON.stringify([r.project_code,r.authorization_type,r.authorization_unit]);

export function authorizationDate(value){
 const s=text(value);if(!s)return '';
 // Excel serial dates and ISO/calendar dates; no locale-dependent Date.parse guesses.
 if(/^\d+(\.0+)?$/.test(s)){
   const n=Number(s);if(n>=1&&n<2958466)return new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10);
 }
 const m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
 if(!m)throw fail('日期须为YYYY-MM-DD或有效Excel日期');
 const normalized=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
 const parsed=new Date(normalized+'T00:00:00Z');
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==normalized)throw fail('日期不存在');
 return normalized;
}

export function migrateAuthorizationNine(db,{now,randomId,audit,allowReset=false,backupPath=''}){
 if(db.prepare("select 1 from settings where key='authorizationNineV1'").get())return;
 const legacy=db.prepare('pragma table_info(personnel_authorizations)').all().some(c=>c.name==='certificate_no');
 const count=Number(db.prepare('select count(*) as n from personnel_authorizations').get().n);
 const batchCount=Number(db.prepare("select count(*) as n from personnel_import_batches where import_type='authorization'").get().n);
 if((legacy||count||batchCount)&&!allowReset)throw fail('授权九字段迁移需要先备份并显式启用授权专属清理',409);
 db.exec('begin immediate');
 try{
  if(db.kind==='postgres')db.exec("select pg_advisory_xact_lock(54002010,31)");
  const deleted={};
  const remove=(table,where)=>{deleted[table]=Number(db.prepare('select count(*) as n from '+table+' where '+where).get().n);db.prepare('delete from '+table+' where '+where).run();};
  const batches="select id from personnel_import_batches where import_type='authorization'";
  remove('personnel_import_issues','batch_id in ('+batches+')');
  remove('personnel_change_logs',"field_name like 'authorization.%' or source_batch_id in ("+batches+')');
  remove('personnel_field_overrides',"field_name like 'authorization.%'");
  remove('master_data_dictionary_values',"category in ('application_unit','meets_requirements') or (category in ('authorization_type','authorization_unit','authorization_status') and source_batch_id in ("+batches+'))');
  remove('personnel_import_batches',"import_type='authorization'");
  deleted.personnel_authorizations=count;
  db.exec('drop table personnel_authorizations');
  db.exec(AUTHORIZATION_SCHEMA);
  db.exec('create index personnel_authorization_person_idx on personnel_authorizations(person_id);create index idx_personnel_authorizations_project_code on personnel_authorizations(project_code)');
  db.exec('create table if not exists personnel_authorization_versions(person_id text primary key,revision integer not null default 0)');
  db.prepare("insert into settings(key,value,updated_at) values('authorizationNineV1',?,?)").run(JSON.stringify({at:now(),deleted,backupPath}),now());
  audit({id:'54002010',name:'系统迁移'},'authorization_nine_reset','personnelAuthorization','all',JSON.stringify({deleted,backupPath}));
  db.exec('commit');
 }catch(e){db.exec('rollback');throw e;}
}

export function createAuthorizationImport({db,now,randomId,audit}){
 const records=id=>db.prepare('select * from personnel_authorizations where person_id=? order by id').all(id);
 const version=id=>crypto.createHash('sha256').update(JSON.stringify([db.prepare('select revision from personnel_authorization_versions where person_id=?').get(id)?.revision||0,records(id)])).digest('hex');
 const bump=id=>db.prepare('insert into personnel_authorization_versions(person_id,revision) values(?,1) on conflict(person_id) do update set revision=personnel_authorization_versions.revision+1').run(id);
 function preview(rows){
  const persons=new Map();
  for(const r of rows){const p=db.prepare('select id,employee_no from personnel where employee_no=?').get(text(r['工号']));if(p)persons.set(p.id,p);}
  let oldCount=0,removedCount=0;const versions={};
  for(const [id,p] of persons){
   const old=records(id),incoming=new Set(rows.filter(r=>text(r['工号'])===p.employee_no).map(r=>JSON.stringify([text(r['项目代码']),text(r['授权类型']),text(r['授权单位'])])));
   oldCount+=old.length;removedCount+=old.filter(r=>!incoming.has(key(r))).length;versions[id]=version(id);
  }
  return {personCount:persons.size,oldCount,newCount:rows.length,removedCount,versions};
 }
 function validate(rows){
  const issues=[],seen=new Map();
  rows.forEach((r,i)=>{
   const rowNumber=Number(r.__importRowNumber)||i+2,employeeNo=text(r['工号']);
   const add=detail=>issues.push({rowNumber,employeeNo,issueType:'authorization_validation',severity:'error',detail});
   const unknown=Object.keys(r).filter(k=>k!=='__importRowNumber'&&!AUTHORIZATION_HEADERS.includes(k));
   if(unknown.length)add('授权模板不支持列：'+unknown.join('、'));
   for(const k of ['工号','姓名','项目代码','授权类型','授权单位','授权状态'])if(!text(r[k]))add(k+'不能为空');
   const k=JSON.stringify([employeeNo,text(r['项目代码']),text(r['授权类型']),text(r['授权单位'])]);
   if(seen.has(k))add('同一人员、项目、授权类型和授权单位与第'+seen.get(k)+'行重复');else seen.set(k,rowNumber);
   try{const start=authorizationDate(r['授权日期']),end=authorizationDate(r['授权有效期']);if(start&&end&&end<start)add('授权有效期不得早于授权日期');}catch(e){add(e.message);}
  });
  return issues;
 }
 function replace(batch,rows,user,expected){
  if(!expected?.versions)throw fail('旧授权批次缺少版本信息，请重新上传',409);
  const current=preview(rows);
  if(JSON.stringify(Object.keys(current.versions).sort())!==JSON.stringify(Object.keys(expected.versions).sort())||Object.entries(current.versions).some(([id,v])=>v!==expected.versions[id]))throw fail('这些人员的授权已发生变化，请重新上传检查，旧批次未生效',409);
  const insert=db.prepare('insert into personnel_authorizations(id,person_id,employee_no,project_code,project_name,authorization_type,authorization_unit,authorized_at,authorization_expires_at,authorization_status,source_batch_id,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for(const id of Object.keys(current.versions)){
   const old=records(id),p=db.prepare('select employee_no from personnel where id=?').get(id);
   const selected=rows.filter(r=>text(r['工号'])===p.employee_no);
   db.prepare('delete from personnel_authorizations where person_id=?').run(id);
   for(const r of selected)insert.run(randomId('authz'),id,p.employee_no,text(r['项目代码']),text(r['项目名称']),text(r['授权类型']),text(r['授权单位']),authorizationDate(r['授权日期']),authorizationDate(r['授权有效期']),text(r['授权状态']),batch.id,now(),now());
   bump(id);
   db.prepare("insert into personnel_change_logs(id,person_id,field_name,field_label,old_value,new_value,source_type,source_batch_id,reason,operator_id,operator_name,created_at) values(?,?,'authorization.replace','整人授权替换',?,?,'import',?,'以新文件为准',?,?,?)").run(randomId('pchange'),id,JSON.stringify(old),JSON.stringify(records(id)),batch.id,user.id,user.name,now());
  }
  audit(user,'replace_personnel_authorizations','personnelImport',batch.id,JSON.stringify({personCount:current.personCount,deleted:current.oldCount,created:rows.length,removed:current.removedCount}));
  return {created:rows.length,updated:0,skipped:0,deleted:current.oldCount,removed:current.removedCount,personCount:current.personCount};
 }
 return {validate,preview,replace,bump};
}
