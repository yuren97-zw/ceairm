import assert from 'node:assert/strict';
import {resolveOrganizationPath} from '../organization-lanes.mjs';
import {migrateOrganizations} from '../personnel-access.mjs';

export async function testOrganizationMaintenance({request,cookie,db,personnelAccess}) {
  const call=async(url,options={})=>(await request(url,{cookie,...options})).data;
  const actor=(await call('/me')).user;
  const team=db.prepare("select * from organization_units where code='TEAM-LINE-4'").get();
  const group=db.prepare("select * from organization_units where code='GROUP-LINE-1'").get();
  const put=(id,body,expected=200)=>call('/personnel/organizations/'+id,{method:'PUT',body,expected});
  const snapshot=()=>JSON.stringify([
    db.prepare('select * from rbac_user_scopes order by id').all(),
    db.prepare('select id,department_id,personnel_group_id,administrative_team_id from personnel order by id').all(),
    db.prepare('select * from maintenance_assignments order by id').all()
  ]);
  const before=snapshot();
  await put(team.id,{name:'第四维修组',reason:'验证改名'});
  assert.equal(snapshot(),before);
  assert.equal(db.prepare('select code from organization_units where id=?').get(team.id).code,team.code);
  assert.equal(resolveOrganizationPath(db,'航线维修车间 / 一车间 / 第四维修组','administrative_team'),team.id);
  assert.throws(()=>resolveOrganizationPath(db,team.code,'administrative_team'),/中文路径/);
  assert.throws(()=>resolveOrganizationPath(db,'第四维修组','administrative_team'),/中文路径/);
  assert.throws(()=>resolveOrganizationPath(db,'航线维修车间 / 一车间 / 第四维修组','personnel_group'),/中文路径/);
  await put(team.id,{name:'无效',code:team.code,reason:'测试'},400);
  await put(team.id,{name:'无效',type:'personnel_group',reason:'测试'},400);
  await put(team.id,{name:'无效',parentId:'missing',reason:'测试'},400);
  await put(team.id,{name:'',reason:'测试'},400);
  await put(team.id,{name:'三组',reason:'测试'},409);
  await call('/personnel/organizations/'+team.id,{method:'DELETE',body:{reason:'测试'},expected:403});
  assert.throws(()=>personnelAccess.mutateOrganization({id:'no-rights',rbacPermissions:[],dataScopes:[]},'PUT',team.id,{name:'无效',reason:'测试'}),e=>e.status===403);
  await call('/personnel/organizations',{method:'POST',body:{code:'MANUAL',name:'不允许代码',type:'department'},expected:400});
  const custom=await call('/personnel/organizations',{method:'POST',body:{name:'自动代码测试部门',type:'department'},expected:201});
  const saved=db.prepare('select code from organization_units where id=?').get(custom.id);
  assert.match(saved.code,/^ORG-/);
  assert.ok((await call('/personnel/organizations')).organizations.every(o=>!Object.hasOwn(o,'code')));
  await call('/personnel/organizations/'+custom.id,{method:'DELETE',body:{reason:'删除未引用测试节点'}});
  await put(group.id,{name:group.name,maintenanceEligible:false,reason:'测试关闭'});
  migrateOrganizations(db,()=>new Date().toISOString(),()=>crypto.randomUUID());
  assert.equal(db.prepare('select name from organization_units where id=?').get(team.id).name,'第四维修组');
  assert.equal(db.prepare('select maintenance_eligible from organization_units where id=?').get(group.id).maintenance_eligible,0);
  await put(group.id,{name:group.name,maintenanceEligible:true,reason:'恢复测试配置'});
  await put(team.id,{name:team.name,reason:'恢复测试名称'});
  assert.equal(snapshot(),before);
  const importPerson=await call('/personnel',{method:'POST',body:{employeeNo:'89000001',name:'组织路径开户测试'},expected:201});
  const row={员工工号:'89000001',登录账号:'org-path-test',初始密码:'123456',角色:'工作者',人员与能力范围:'指定行政班组:航线维修车间 / 一车间 / 四组'};
  for(const invalid of ['指定行政班组:TEAM-LINE-4','指定行政班组:四组','指定人员分组:航线维修车间 / 一车间 / 四组']){
    const rejected=await call('/admin/accounts/bulk-open',{method:'POST',body:{rows:[{...row,人员与能力范围:invalid}]},expected:400});
    assert.equal(rejected.errors[0].rowNumber,2);
    assert.match(rejected.errors[0].detail,/中文路径/);
    assert.equal(db.prepare("select count(*) as n from users where username='org-path-test'").get().n,0);
  }
  await call('/admin/accounts/bulk-open',{method:'POST',body:{rows:[row]},expected:201});
  const account=db.prepare("select id from users where username='org-path-test'").get();
  assert.equal(db.prepare("select scope_id from rbac_user_scopes where user_id=? and module='personnel'").get(account.id).scope_id,team.id);
  console.log('通过：预置改名、不可删除/改类型/改父级、代码自动化、中文路径、权限隔离、重启初始化保留配置。');
}
