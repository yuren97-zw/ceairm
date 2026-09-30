import crypto from 'node:crypto';
import { AUTHORIZATION_HEADERS } from './authorization-import.mjs';

export const IMPORT_WORKSPACE_SCHEMA = `create table if not exists personnel_import_workspaces(
 batch_id text primary key, original_rows_json text not null, original_summary_json text not null,
 history_json text not null, revision integer not null default 0
);`;
const parse = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };
const hash = v => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const key = r => JSON.stringify(['工号','项目代码','授权类型','授权单位'].map(k => String(r[k] || '').trim()));
const same = (a,b) => AUTHORIZATION_HEADERS.every(k => String(a[k] ?? '') === String(b[k] ?? ''));

export function createImportWorkspace({db, permission, hasAll, visible, employeeNo, findPerson, analyze, validateAccess, preview, projects, audit, now, insertIssues}) {
  const getState = id => db.prepare('select * from personnel_import_workspaces where batch_id=?').get(id);
  const revision = (b,w) => hash([b.rows_json,b.summary_json,b.status,w?.revision || 0]);
  function load(id,user,{write=false}={}) {
    permission(user,write?'personnel.import.execute':'personnel.import.view');
    const b = db.prepare('select * from personnel_import_batches where id=?').get(id), w = getState(id);
    if (!b || !visible(b,user)) throw fail('未找到可处理的导入批次',404);
    if (b.created_by !== user.id && !hasAll(user)) throw fail('仅批次创建者或人员全部范围的导入管理员可以处理',403);
    if (b.import_type !== 'personnel') { if(write)permission(user,'personnel.qualification.manage'); permission(user,'personnel.qualification.view'); }
    // Original input and every historical edit must remain within the caller's current scope.
    const historical = w ? [parse(w.original_rows_json,[]), ...parse(w.history_json,[]).flatMap(h=>[h.before,h.after])] : [];
    if (historical.some(rows => !visible({...b,rows_json:JSON.stringify(rows)},user))) throw fail('批次历史包含当前范围外资料',404);
    return {b,w,rows:parse(b.rows_json,[]),summary:parse(b.summary_json,{})};
  }
  function view(id,user) {
    const {b,w,rows,summary} = load(id,user);
    const current = b.import_type === 'authorization' ? preview(rows) : null;
    const conflicts = current ? Object.entries(current.versions).filter(([id,v])=>summary.replacement?.versions?.[id] !== v).map(([id])=>id) : [];
    const groups = new Map();
    if (current) for (const row of rows) { const k=key(row); if(!groups.has(k))groups.set(k,[]); groups.get(k).push(row); }
    const duplicates = [...groups.values()].filter(g=>g.length>1).map(g=>({rowNumbers:g.map(r=>r.__importRowNumber),exact:g.every(r=>same(g[0],r))}));
    const people = current ? Object.keys(current.versions).map(personId=>{
      const p=db.prepare('select employee_no,name from personnel where id=?').get(personId);
      const old=db.prepare(`select a.project_code as 项目代码,coalesce(c.project_name,a.project_name) as 项目名称,a.authorization_type as 授权类型,a.authorization_unit as 授权单位,a.authorized_at as 授权日期,a.authorization_expires_at as 授权有效期,a.authorization_status as 授权状态
        from personnel_authorizations a left join capability_catalog c on c.project_code=a.project_code where a.person_id=? order by a.id`).all(personId);
      const incoming=rows.filter(r=>employeeNo(r)===p.employee_no);
      const projectKey=r=>JSON.stringify(['项目代码','授权类型','授权单位'].map(k=>String(r[k]||'').trim()));
      const keys=new Set(incoming.map(projectKey));
      return {employeeNo:p.employee_no,name:p.name,old,incoming,removed:old.filter(r=>!keys.has(projectKey(r)))};
    }) : [];
    return {id:b.id,importType:b.import_type,fileName:b.file_name,status:b.status,rows,summary,
      revision:revision(b,w),duplicates,people,conflicts,currentVersionsToken:current?hash(current.versions):'',
      issues:db.prepare('select row_number as rowNumber,severity,detail from personnel_import_issues where batch_id=? order by row_number,id').all(id),
      history:parse(w?.history_json,[]).map(({before,after,...h})=>h)};
  }
  function mutate(id,payload,user) {
    db.exec('begin immediate');
    try {
      if(db.kind==='postgres')db.exec('select pg_advisory_xact_lock(54002010,31)');
      const {b,w,rows:before,summary} = load(id,user,{write:true});
      if(b.status!=='pending')throw fail('只有待确认批次可处理',409);
      if(payload.revision!==revision(b,w))throw fail('暂存内容已更新，请重新打开处理区',409);
      const reason=String(payload.reason||'').trim(); if(!reason)throw fail('请填写处置原因');
      let rows=structuredClone(before);
      const original=parse(w?.original_rows_json || b.rows_json,[]);
      const op=payload.operation;
      if(op==='edit') {
        const row=rows.find(r=>r.__importRowNumber===Number(payload.rowNumber)); if(!row)throw fail('未找到原始行');
        const values=payload.values;
        if(!values||Array.isArray(values)||typeof values!=='object')throw fail('修改内容无效');
        const allowed=b.import_type==='authorization'?AUTHORIZATION_HEADERS:Object.keys(row).filter(k=>k!=='__importRowNumber');
        for(const [k,v] of Object.entries(values)) { if(!allowed.includes(k)||k==='项目名称'&&b.import_type==='authorization')throw fail('不允许修改字段：'+k); if(typeof v!=='string'||v.length>2000)throw fail('字段内容无效'); row[k]=v.trim(); }
        if(b.import_type==='authorization') {
          const p=findPerson(employeeNo(row));
          if(p&&visible({...b,rows_json:JSON.stringify([row])},user))row['姓名']=p.name;
          const project=projects.getByCode(row['项目代码']); if(projects.configured(project))row['项目名称']=project.project_name;
        }
      } else if(op==='mergeExact') {
        if(b.import_type!=='authorization')throw fail('完全重复合并仅适用于授权九字段');
        rows=rows.filter((r,i)=>!rows.slice(0,i).some(a=>same(a,r)));
      } else if(op==='keepConflict') {
        if(b.import_type!=='authorization')throw fail('仅适用于授权冲突');
        const keep=rows.find(r=>r.__importRowNumber===Number(payload.rowNumber));if(!keep)throw fail('未找到保留行');
        if(rows.filter(r=>key(r)===key(keep)).length<2)throw fail('该行没有重复组合');
        rows=rows.filter(r=>key(r)!==key(keep)||r===keep);
      } else if(op==='excludePerson') {
        const no=String(payload.employeeNo||'').trim();if(!no||!rows.some(r=>employeeNo(r)===no))throw fail('请指定本批工号');
        rows=rows.filter(r=>employeeNo(r)!==no);
      } else if(op==='restore') rows=structuredClone(original);
      else if(!['recheck','acceptVersions'].includes(op))throw fail('不支持的处置操作');
      if(!visible({...b,rows_json:JSON.stringify(rows)},user))throw fail('修改后的人员或字段超出可访问范围',403);
      const accessIssues=[];
      try{validateAccess(b.import_type,rows,user);}catch(e){
        if(!e.details?.issues)throw e;
        accessIssues.push(...e.details.issues.map(i=>({...i,severity:'error',issueType:'access_validation'})));
      }
      const bad=new Set(accessIssues.map(i=>i.rowNumber));
      const checked=analyze(b.import_type,rows.filter(r=>!bad.has(r.__importRowNumber)));
      checked.issues.push(...accessIssues);
      if(!rows.length)checked.issues.push({rowNumber:0,severity:'error',issueType:'empty_batch',detail:'本批已无记录，不能生效；可恢复原始暂存或取消批次'});
      const current=b.import_type==='authorization'?preview(rows):null;
      let replacement=current;
      if(current){
        const baseline=summary.workspaceBaselines||summary.replacement?.versions||{};
        if(op==='acceptVersions') {
          if(payload.currentVersionsToken!==hash(current.versions))throw fail('正式授权再次变化，请重新查看差异',409);
        } else replacement={...current,versions:Object.fromEntries(Object.entries(current.versions).map(([id,v])=>[id,baseline[id]??v]))};
      }
      const next={total:rows.length,valid:rows.length-new Set(checked.issues.filter(i=>i.severity==='error'&&i.rowNumber).map(i=>i.rowNumber)).size,
        errors:checked.issues.filter(i=>i.severity==='error').length,warnings:checked.issues.filter(i=>i.severity==='warning').length,...(replacement?{replacement,workspaceBaselines:{...(summary.workspaceBaselines||summary.replacement?.versions||{}),...replacement.versions}}:{}),workspaceRevision:(w?.revision||0)+1};
      const history=parse(w?.history_json,[]);
      history.push({operation:op,reason,operatorId:user.id,operatorName:user.name,at:now(),before,after:rows});
      db.prepare(`insert into personnel_import_workspaces(batch_id,original_rows_json,original_summary_json,history_json,revision) values(?,?,?,?,?)
        on conflict(batch_id) do update set history_json=excluded.history_json,revision=excluded.revision`).run(id,w?.original_rows_json||b.rows_json,w?.original_summary_json||b.summary_json,JSON.stringify(history),next.workspaceRevision);
      db.prepare('update personnel_import_batches set rows_json=?,summary_json=?,updated_at=? where id=?').run(JSON.stringify(rows),JSON.stringify(next),now(),id);
      db.prepare('delete from personnel_import_issues where batch_id=?').run(id);insertIssues(id,checked.issues);
      audit(user,'resolve_personnel_import','personnelImport',id,JSON.stringify({operation:op,reason,revision:next.workspaceRevision,before,after:rows}));
      const result=view(id,user);
      db.exec('commit');return result;
    }catch(e){db.exec('rollback');throw e;}
  }
  return {view,mutate};
}
