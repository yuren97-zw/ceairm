import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCOPE_MODULES } from "../personnel-identity.mjs";

const dbPath=path.resolve(process.env.DB_PATH||"");
const uploadDir=path.resolve(process.env.UPLOAD_DIR||"");
const backupPath=path.resolve(process.env.RESET_BACKUP_PATH||"");
if(process.env.CONFIRM_8788_TEST_RESET!=="RESET-8788-ONLY")throw new Error("缺少8788测试库重置确认标记");
if(path.basename(dbPath)!=="rbac-refactor-test.sqlite")throw new Error("只允许重置 rbac-refactor-test.sqlite");
if(!fs.existsSync(dbPath)||!fs.statSync(dbPath).isFile())throw new Error("8788测试数据库不存在");
if(!backupPath||backupPath===path.parse(backupPath).root||!fs.existsSync(backupPath))throw new Error("必须提供已存在的备份目录 RESET_BACKUP_PATH");
if(!uploadDir||uploadDir===path.parse(uploadDir).root)throw new Error("上传目录无效");

const db=new DatabaseSync(dbPath);db.exec("pragma foreign_keys=on");
const hasTable=name=>!!db.prepare("select 1 from sqlite_master where type='table' and name=?").get(name);
const columns=name=>new Set(db.prepare(`pragma table_info(${name})`).all().map(row=>row.name));
if(!columns("personnel").has("personnel_group_id"))throw new Error("数据库尚未完成统一人员分组迁移，禁止重置");
const admin=db.prepare("select * from users where username='54002010'").get();
const person=db.prepare("select * from personnel where employee_no='54002010'").get();
if(!admin||!person||admin.person_id!==person.id)throw new Error("超级管理员账户与人员关联异常，禁止重置");
const systemRole=db.prepare("select id from rbac_roles where code='system_admin'").get();
const department=db.prepare("select id from organization_units where code='DEPT-LINE' and unit_type='department'").get();
const cadre=db.prepare("select id from organization_units where code='GROUP-LINE-CADRE' and unit_type='personnel_group'").get();
if(!systemRole||!department||!cadre)throw new Error("RBAC或固定组织目录不完整，禁止重置");

const attachmentPaths=hasTable("attachments")?db.prepare("select path from attachments where coalesce(path,'')<>''").all().map(row=>String(row.path)) : [];
const cleared={};
const clear=table=>{
  if(!hasTable(table))return;
  const count=Number(db.prepare(`select count(*) as n from ${table}`).get().n);
  db.prepare(`delete from ${table}`).run();cleared[table]=count;
};
const businessTables=[
  "personnel_licenses","personnel_authorizations","personnel_authorization_versions","personnel_training_records","personnel_change_logs",
  "personnel_field_overrides","personnel_organization_history","personnel_identity_migrations",
  "personnel_import_issues","personnel_import_workspaces","personnel_import_batches","course_catalog",
  "record_recipients","read_receipts","favorites","attachments","records","fixed_projects",
  "maintenance_feedback","maintenance_hour_results","maintenance_sortie_results","maintenance_work_report_entries",
  "maintenance_work_reports","maintenance_report_entries","maintenance_report_batches","maintenance_report_drafts",
  "maintenance_assignments","maintenance_subtasks","maintenance_flights","maintenance_logs",
  "capability_commands","capability_events","capability_current_states","capability_supports",
  "capability_status_records","capability_history","capability_scenarios"
];

const stamp=new Date().toISOString();
db.exec("begin immediate");
try{
  if(hasTable("master_data_dictionary_values")){
    const count=Number(db.prepare("select count(*) as n from master_data_dictionary_values where coalesce(source_batch_id,'')<>''").get().n);
    db.prepare("delete from master_data_dictionary_values where coalesce(source_batch_id,'')<>''").run();cleared.master_data_dictionary_values=count;
  }
  for(const table of businessTables)clear(table);
  if(hasTable("maintenance_sync_state")){
    clear("maintenance_sync_state");
    db.prepare("insert into maintenance_sync_state(id,version,updated_at) values(1,0,?)").run(stamp);
  }
  if(hasTable("capability_meta")){
    clear("capability_meta");
    db.prepare("insert into capability_meta(id,revision,fingerprint,master_revision,source_marker) values(1,0,'',0,'center-master-v1')").run();
  }
  db.prepare("delete from sessions").run();
  db.prepare("delete from rbac_user_roles").run();
  db.prepare("insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)").run(admin.id,systemRole.id,stamp);
  db.prepare("delete from rbac_user_scopes").run();
  const insertScope=db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,'all','',null,null,?,?)");
  for(const module of SCOPE_MODULES)insertScope.run(`scope-${crypto.randomUUID()}`,admin.id,module,stamp,stamp);
  db.prepare("delete from users where id<>?").run(admin.id);
  db.prepare("delete from personnel where id<>?").run(person.id);
  db.prepare("update personnel set name='赵威',department='航线维修车间',home_team='',department_id=?,personnel_group_id=?,administrative_team_id=null,employment_status='在职',data_status='active',deleted_at='',deleted_by='',delete_reason='',source_batch_id=null,updated_at=? where id=?").run(department.id,cadre.id,stamp,person.id);
  db.prepare("update users set username='54002010',name='赵威',department='航线维修车间',team='干部',status='active',person_id=?,updated_at=? where id=?").run(person.id,stamp,admin.id);
  if(hasTable("people"))db.exec("drop table people");
  if(hasTable("rbac_user_scopes_legacy_identity_v3"))db.exec("drop table rbac_user_scopes_legacy_identity_v3");
  clear("audit");clear("audit_logs");
  const detail=JSON.stringify({backupPath,cleared,retainedEmployeeNo:"54002010"});
  db.prepare("insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)").run(`audit-${crypto.randomUUID()}`,admin.id,"赵威","test_environment_reset","system","8788",detail,stamp);

  const assertions={
    personnel:Number(db.prepare("select count(*) as n from personnel").get().n),
    activePersonnel:Number(db.prepare("select count(*) as n from personnel where data_status='active'").get().n),
    users:Number(db.prepare("select count(*) as n from users").get().n),
    nonAdminRoles:Number(db.prepare("select count(*) as n from rbac_user_roles where user_id<>?").get(admin.id).n),
    nonAdminScopes:Number(db.prepare("select count(*) as n from rbac_user_scopes where user_id<>?").get(admin.id).n),
    adminAllScopes:Number(db.prepare("select count(*) as n from rbac_user_scopes where user_id=? and scope_type='all'").get(admin.id).n)
  };
  if(assertions.personnel!==1||assertions.activePersonnel!==1||assertions.users!==1||assertions.nonAdminRoles!==0||assertions.nonAdminScopes!==0||assertions.adminAllScopes!==SCOPE_MODULES.length)throw new Error(`重置断言失败: ${JSON.stringify(assertions)}`);
  for(const table of businessTables)if(hasTable(table)&&Number(db.prepare(`select count(*) as n from ${table}`).get().n)!==0)throw new Error(`${table} 未清空`);
  db.exec("commit");
}catch(error){db.exec("rollback");db.close();throw error;}
db.close();

const removedFiles=[];
for(const stored of attachmentPaths){
  const absolute=path.resolve(uploadDir,stored);
  if(absolute!==uploadDir&&!absolute.startsWith(uploadDir+path.sep))throw new Error(`附件路径越界，数据库已重置但文件未删除: ${stored}`);
  if(fs.existsSync(absolute)&&fs.statSync(absolute).isFile()){fs.unlinkSync(absolute);removedFiles.push(stored);}
}
console.log(JSON.stringify({ok:true,dbPath,backupPath,cleared,removedFiles},null,2));
