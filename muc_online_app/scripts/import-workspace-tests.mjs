import assert from 'node:assert/strict';
import {AUTHORIZATION_HEADERS as H} from '../authorization-import.mjs';
export async function testImportWorkspace({request,cookie,db}) {
 const call=async(url,options={})=>(await request(url,{cookie,...options})).data;
 const people=[];
 for(const no of ['99112231','99112232'])people.push((await call('/personnel',{method:'POST',expected:201,body:{employeeNo:no,name:'暂存验收'+no}})).person);
 await call('/personnel/authorization-projects',{method:'POST',expected:201,body:{projectCode:'IW-TEST',projectName:'暂存测试项目',category:'other'}});
 const row=(p,from='2026-01-01')=>[p.employeeNo,p.name,'IW-TEST','暂存测试项目','145','测试单位',from,'2027-01-01','有效'];
 const staged=(await call('/personnel/imports',{method:'POST',expected:201,body:{type:'authorization',fileName:'workspace.xlsx',rows:[H,row(people[0]),row(people[0]),row(people[0],'2026-02-01'),row(people[1])]}})).batch;
 assert.equal(staged.summary.errors,2);
 const url=`/personnel/imports/${staged.id}/workspace`;
 let ws=(await call(url)).workspace;
 const op=async(operation,extra={},expected=200)=>{
  const result=await call(url,{method:'POST',expected,body:{operation,revision:ws.revision,reason:'测试处置',...extra}});
  if(expected===200)ws=result.workspace;
  return result;
 };
 const unchanged=db.prepare('select count(*) n from personnel_authorizations').get().n;
 await request(url,{expected:401});
 await op('edit',{rowNumber:2,values:{项目名称:'不能逐行覆盖标准名'}},400);
 const stale=ws.revision;
 await op('mergeExact');assert.equal(ws.rows.length,3);assert.equal(ws.summary.errors,1);
 await op('recheck',{revision:stale},409);
 await op('keepConflict',{rowNumber:4});assert.equal(ws.summary.errors,0);assert.equal(ws.rows.length,2);
 await op('excludePerson',{employeeNo:people[1].employeeNo});assert.equal(ws.people.length,1);
 assert.equal(db.prepare('select count(*) n from personnel_authorizations').get().n,unchanged);
 await op('restore');assert.equal(ws.rows.length,4);assert.equal(ws.summary.errors,2);
 assert.equal(JSON.parse(db.prepare('select original_rows_json from personnel_import_workspaces where batch_id=?').get(staged.id).original_rows_json).length,4);
 await op('mergeExact');await op('keepConflict',{rowNumber:4});
 await op('edit',{rowNumber:4,values:{授权日期:'invalid'}});assert.ok(ws.summary.errors>0);
 await op('edit',{rowNumber:4,values:{授权日期:'2026-02-01',工号:people[0].employeeNo}});assert.equal(ws.summary.errors,0);
 // Formal-data changes must survive ordinary rechecks and exclude/restore cycles.
 db.prepare('insert into personnel_authorization_versions(person_id,revision) values(?,1) on conflict(person_id) do update set revision=revision+1').run(people[0].id);
 await op('recheck');assert.ok(ws.conflicts.length);
 await op('excludePerson',{employeeNo:people[0].employeeNo});await op('restore');assert.ok(ws.conflicts.length);
 await op('mergeExact');await op('keepConflict',{rowNumber:4});
 await call(`/personnel/imports/${staged.id}/confirm`,{method:'POST',expected:409,body:{confirmReplacement:true,workspaceRevision:ws.summary.workspaceRevision}});
 await op('acceptVersions',{currentVersionsToken:'stale'},409);
 await op('acceptVersions',{currentVersionsToken:ws.currentVersionsToken});assert.equal(ws.conflicts.length,0);
 // Failure in audit insert rolls back rows, issues, history and revision together.
 const before=db.prepare('select * from personnel_import_batches where id=?').get(staged.id);
 db.exec("create trigger iw_fail before insert on audit_logs when new.action='resolve_personnel_import' begin select raise(abort,'workspace rollback'); end");
 await op('excludePerson',{employeeNo:people[1].employeeNo},500);
 db.exec('drop trigger iw_fail');assert.deepEqual(db.prepare('select * from personnel_import_batches where id=?').get(staged.id),before);
 await call(`/personnel/imports/${staged.id}/confirm`,{method:'POST',expected:409,body:{confirmReplacement:true}});
 await call(`/personnel/imports/${staged.id}/confirm`,{method:'POST',body:{confirmReplacement:true,workspaceRevision:ws.summary.workspaceRevision}});
 await op('recheck',{},409);
 assert.equal(db.prepare('select count(*) n from personnel_authorizations where person_id in (?,?)').get(people[0].id,people[1].id).n,2);
 console.log('通过：暂存合并/冲突选取/编辑/按人排除/恢复/版本冲突/主动重核/事务回滚/正式确认。');
}
