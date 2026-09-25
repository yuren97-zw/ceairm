import { SCOPE_MODULES, migrateIdentity } from "./personnel-identity.mjs";

export const MODULE_LABELS = { personnel: "人员与能力", accounts: "登录账户管理", info: "信息传达", maintenance: "维修管控", hours: "工时统计", attendance: "考勤管理" };
export const SENSITIVE_FIELDS = ["actualGrade"];
export const ORGANIZATION_FIELDS = ["department", "personnelGroup", "administrativeTeam", "departmentId", "personnelGroupId", "administrativeTeamId"];
export const FIXED_ORGANIZATIONS = [
  { code:"DEPT-LINE", name:"航线维修车间", type:"department", parentCode:"" },
  { code:"GROUP-LINE-CADRE", legacyCode:"CAT-LINE-CADRE", name:"干部", type:"personnel_group", parentCode:"DEPT-LINE", maintenanceEligible:0 },
  { code:"GROUP-LINE-SPECIAL", name:"特殊班组", type:"personnel_group", parentCode:"DEPT-LINE", maintenanceEligible:1 },
  { code:"GROUP-LINE-1", legacyCode:"WS-LINE-1", name:"一车间", type:"personnel_group", parentCode:"DEPT-LINE", maintenanceEligible:1 },
  { code:"GROUP-LINE-2", legacyCode:"WS-LINE-2", name:"二车间", type:"personnel_group", parentCode:"DEPT-LINE", maintenanceEligible:1 },
  { code:"TEAM-LINE-3", name:"三组", type:"administrative_team", parentCode:"GROUP-LINE-1" },
  { code:"TEAM-LINE-4", name:"四组", type:"administrative_team", parentCode:"GROUP-LINE-1" },
  { code:"TEAM-LINE-1", name:"一组", type:"administrative_team", parentCode:"GROUP-LINE-2" },
  { code:"TEAM-LINE-2", name:"二组", type:"administrative_team", parentCode:"GROUP-LINE-2" }
];
const FIXED_CODES = new Set(FIXED_ORGANIZATIONS.flatMap(item => [item.code,item.legacyCode].filter(Boolean)));
const error = (message, status = 400, details) => Object.assign(new Error(message), { status, details });
const text = value => String(value ?? "").trim();
const unset = value => !text(value) || text(value) === "未设置";

export function scopeDate(value, end = false) {
  if (!value) return "";
  const raw = text(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const day = new Date(`${raw}T00:00:00Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== raw) throw error("范围日期无效");
    return new Date(`${raw}T${end ? "23:59:59.999" : "00:00:00.000"}+08:00`).toISOString();
  }
  if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) || !Number.isFinite(Date.parse(raw))) throw error("范围日期必须为有效日期或带时区的时间");
  const calendarDay = new Date(raw.slice(0,10)+"T00:00:00Z");
  if (!Number.isFinite(calendarDay.getTime()) || calendarDay.toISOString().slice(0,10) !== raw.slice(0,10)) throw error("范围日期无效");
  return new Date(raw).toISOString();
}

export function createPersonnelAccess({ db, hasRbac, randomId, now, audit, superAccountId }) {
  const isSuper = user => user?.id === superAccountId;
  const permission = (user, code) => { if (!hasRbac(user, code)) throw error("当前账号没有操作权限", 403, { permission: code }); };
  function activeScopes(user, module) {
    if (!SCOPE_MODULES.includes(module)) throw error("不支持的数据范围模块");
    if (isSuper(user)) return [{ module, scopeType: "all" }];
    const stamp = Date.now();
    return (user?.dataScopes || []).filter(s => s.module === module && (!s.validFrom || (Number.isFinite(Date.parse(s.validFrom)) && Date.parse(s.validFrom) <= stamp)) && (!s.validTo || (Number.isFinite(Date.parse(s.validTo)) && Date.parse(s.validTo) >= stamp)));
  }
  const hasAll = (user, module) => activeScopes(user, module).some(s => s.scopeType === "all");
  function predicate(user, module, alias = "p") {
    if (!user?.id) return { sql: "0=1", params: [] };
    const scopes = activeScopes(user, module);
    if (scopes.some(s => s.scopeType === "all")) return { sql: "1=1", params: [] };
    const actor = db.prepare("select * from personnel where id=?").get(user.personId || "");
    const parts = [], params = [];
    for (const scope of scopes) {
      let column, value;
      if (scope.scopeType === "self") { column = "id"; value = user.personId; }
      if (scope.scopeType === "administrative_team") { column = "administrative_team_id"; value = actor?.administrative_team_id; }
      if (scope.scopeType === "personnel_group") { column = "personnel_group_id"; value = actor?.personnel_group_id; }
      if (scope.scopeType === "department") { column = "department_id"; value = actor?.department_id; }
      if (scope.scopeType === "specified_teams") { column = "administrative_team_id"; value = scope.scopeId; }
      if (scope.scopeType === "specified_groups") { column = "personnel_group_id"; value = scope.scopeId; }
      if (column && value) { parts.push(`${alias}.${column}=?`); params.push(value); }
    }
    return { sql: parts.length ? `(${parts.join(" or ")})` : "0=1", params };
  }
  function allows(user, module, personId) {
    const p = predicate(user, module);
    return !!db.prepare(`select 1 from personnel p where p.id=? and (${p.sql})`).get(personId || "", ...p.params);
  }
  function requirePerson(user, module, personId, active = false) {
    const p = predicate(user, module);
    const row = db.prepare(`select p.* from personnel p where p.id=? and (${p.sql})${active ? " and p.data_status='active'" : ""}`).get(personId || "", ...p.params);
    if (!row) throw error("未找到人员", 404);
    return row;
  }
  function normalizeScopes(input, targetPersonId = "") {
    if (!Array.isArray(input)) throw error("请按模块配置数据范围");
    const seen = new Set();
    const result = input.map(s => {
      if (!s || typeof s !== "object" || !SCOPE_MODULES.includes(s.module)) throw error("数据范围必须包含有效模块，旧格式不再支持");
      const type = s.scopeType, id = text(s.scopeId);
      if (!["self","administrative_team","personnel_group","department","specified_teams","specified_groups","all"].includes(type)) throw error("数据范围类型无效");
      if (["specified_teams","specified_groups"].includes(type)) {
        const org = db.prepare("select * from organization_units where id=? and status='active'").get(id);
        const expected={specified_teams:"administrative_team",specified_groups:"personnel_group"}[type];
        if (!org || org.unit_type !== expected) throw error("请选择有效的指定组织");
      } else if (id) throw error("该范围不接受指定组织");
      const actor = db.prepare("select department_id,personnel_group_id,administrative_team_id from personnel where id=?").get(targetPersonId);
      if (type === "administrative_team" && !actor?.administrative_team_id) throw error("未归属行政班组，不能配置“本行政班组”");
      if (type === "personnel_group" && !actor?.personnel_group_id) throw error("未归属人员分组，不能配置“所属人员分组”");
      if (type === "department" && !actor?.department_id) throw error("未归属部门，不能配置“所属部门”");
      const validFrom = scopeDate(s.validFrom), validTo = scopeDate(s.validTo, true);
      if (validFrom && validTo && validFrom > validTo) throw error("范围结束日期不能早于开始日期");
      const key = `${s.module}:${type}:${id}`;
      if (seen.has(key)) throw error("同模块的数据范围重复");
      seen.add(key);
      return { module: s.module, scopeType: type, scopeId: id, validFrom, validTo };
    });
    for (const module of SCOPE_MODULES) if (!result.some(s => s.module === module)) result.push({ module, scopeType: "self", scopeId: "", validFrom: "", validTo: "" });
    return result;
  }
  function redact(user, row) {
    const value = { ...row };
    if (!hasRbac(user, "personnel.sensitive.view")) for (const field of SENSITIVE_FIELDS) delete value[field];
    if (!hasRbac(user, "personnel.qualification.view")) for (const field of ["licenseCount","authorizationCount","trainingCount"]) delete value[field];
    delete value.account;
    return value;
  }
  function organizations(user) {
    const rows = db.prepare("select id,code,name,unit_type as type,parent_id as parentId,status,maintenance_eligible as maintenanceEligible,updated_at as updatedAt from organization_units order by unit_type,name").all().map(({code,...row})=>({...row,maintenanceEligible:!!row.maintenanceEligible,fixed:FIXED_CODES.has(code)}));
    if (SCOPE_MODULES.some(m => hasAll(user, m))) return rows;
    const ids = new Set();
    for (const module of SCOPE_MODULES) {
      const p = predicate(user, module);
      for (const row of db.prepare(`select p.department_id,p.personnel_group_id,p.administrative_team_id from personnel p where ${p.sql}`).all(...p.params)) Object.values(row).filter(Boolean).forEach(id => ids.add(id));
      activeScopes(user, module).filter(s => s.scopeId).forEach(s => ids.add(s.scopeId));
    }
    for (let n = 0; n < 3; n++) rows.filter(r => ids.has(r.id) && r.parentId).forEach(r => ids.add(r.parentId));
    return rows.filter(r => ids.has(r.id));
  }
  function organizationPayload(payload, existing = {}) {
    const find = (id, name, types, parentId) => {
      types = Array.isArray(types) ? types : [types];
      if (id) { const row = db.prepare("select * from organization_units where id=? and status='active'").get(id); if (!row || !types.includes(row.unit_type)) throw error("组织编号不存在或类型错误"); return row; }
      if (unset(name)) return null;
      const marks=types.map(()=>"?").join(",");
      const rows = db.prepare(`select * from organization_units where name=? and unit_type in (${marks}) and status='active'${parentId ? " and parent_id=?" : ""}`).all(name, ...types, ...(parentId ? [parentId] : []));
      if (rows.length !== 1) throw error("组织名称不存在或无法唯一匹配，请先维护组织目录");
      return rows[0];
    };
    const supplied = ORGANIZATION_FIELDS.some(k => Object.hasOwn(payload,k));
    if (!supplied) return { department_id:existing.department_id||"", personnel_group_id:existing.personnel_group_id||"", administrative_team_id:existing.administrative_team_id||"", department:existing.department||"", home_team:existing.home_team||"" };
    let dep=find(payload.departmentId,payload.department,"department");
    let group=find(payload.personnelGroupId,payload.personnelGroup,"personnel_group");
    let team=find(payload.administrativeTeamId,payload.administrativeTeam,"administrative_team",group?.id||"");
    if(team){
      const derivedGroup=db.prepare("select * from organization_units where id=? and unit_type='personnel_group' and status='active'").get(team.parent_id);
      if(!derivedGroup)throw error("行政班组未正确隶属人员分组");
      if(group&&group.id!==derivedGroup.id)throw error("行政班组与人员分组不一致");
      group=derivedGroup;
    }
    if(group){
      const derivedDep=db.prepare("select * from organization_units where id=? and unit_type='department' and status='active'").get(group.parent_id);
      if(!derivedDep)throw error("人员分组未正确隶属部门");
      if(dep&&dep.id!==derivedDep.id)throw error("人员分组与部门不一致");
      dep=derivedDep;
    }
    return {department_id:dep?.id||"",personnel_group_id:group?.id||"",administrative_team_id:team?.id||"",department:dep?.name||"",home_team:team?.name||""};
  }
  function allowsProposed(user, module, row) {
    if (hasAll(user,module)) return true;
    const actor = db.prepare("select * from personnel where id=?").get(user.personId || "");
    return activeScopes(user,module).some(s => s.scopeType === "self" ? !!row.id && row.id === user.personId
      : s.scopeType === "administrative_team" ? !!actor?.administrative_team_id && actor.administrative_team_id === row.administrative_team_id
      : s.scopeType === "personnel_group" ? !!actor?.personnel_group_id && actor.personnel_group_id === row.personnel_group_id
      : s.scopeType === "department" ? !!actor?.department_id && actor.department_id === row.department_id
      : s.scopeType === "specified_teams" ? s.scopeId === row.administrative_team_id
      : s.scopeType === "specified_groups" ? s.scopeId === row.personnel_group_id : false);
  }
  function checkMutation(user, payload, existing = null) {
    if (existing && Object.hasOwn(payload,"employeeNo") && text(payload.employeeNo) !== existing.employee_no) throw error("工号创建后不可修改");
    if (existing) requirePerson(user,"personnel",existing.id,true); else permission(user,"personnel.profile.create");
    const keys = Object.keys(payload).filter(k => !["reason","employeeNo","id"].includes(k));
    const profileKeys = keys.filter(k => !ORGANIZATION_FIELDS.includes(k) && k !== "employmentStatus");
    if (existing && profileKeys.length) permission(user,"personnel.profile.update");
    if (existing && keys.includes("employmentStatus")) permission(user,"personnel.lifecycle.manage");
    if (keys.some(k => ORGANIZATION_FIELDS.includes(k))) permission(user,"personnel.organization.manage");
    if (keys.some(k => SENSITIVE_FIELDS.includes(k))) permission(user,"personnel.sensitive.view");
    const org = organizationPayload(payload,existing || {});
    if (!allowsProposed(user,"personnel",{ ...existing,...org })) throw error("目标组织不在可维护范围内",403);
    return org;
  }
  function saveOrganization(personId, org) {
    db.prepare("update personnel set department_id=?,personnel_group_id=?,administrative_team_id=?,department=?,home_team=? where id=?").run(org.department_id||null,org.personnel_group_id||null,org.administrative_team_id||null,org.department||"",org.home_team||"",personId);
  }
  function orgReferences(id) {
    return Number(db.prepare("select count(*) as n from personnel where department_id=? or personnel_group_id=? or administrative_team_id=?").get(id,id,id).n)
      + Number(db.prepare("select count(*) as n from organization_units where parent_id=?").get(id).n)
      + Number(db.prepare("select count(*) as n from rbac_user_scopes where scope_id=?").get(id).n)
      + Number(db.prepare("select count(*) as n from personnel_organization_history where department_id=? or personnel_group_id=? or administrative_team_id=?").get(id,id,id).n);
  }
  function mutateOrganization(user, method, id, payload) {
    permission(user,"personnel.organization.manage");
    if (!hasAll(user,"personnel")) throw error("维护组织目录需要人员模块全部范围",403);
    const reason = text(payload.reason);
    if (method !== "POST" && !reason) throw error("请填写修改或删除原因");
    db.exec("begin immediate");
    try {
      if (db.kind === "postgres") db.exec("select pg_advisory_xact_lock(54002010,31)");
      const old = id ? db.prepare("select * from organization_units where id=?").get(id) : null;
      if (id && !old) throw error("未找到组织",404);
      if(method==="DELETE"&&old&&FIXED_CODES.has(old.code))throw error("预置组织不可删除",403);
      if(method!=="DELETE"&&Object.hasOwn(payload,"code"))throw error("组织代码由后台自动管理，请勿提交代码");
      if(payload.maintenanceEligible!==undefined&&typeof payload.maintenanceEligible!=="boolean")throw error("维修调配开关必须为布尔值");
      if (method === "DELETE") {
        const references = orgReferences(id);
        if (references) throw error("组织已被引用，不能删除",409,{references});
        db.prepare("delete from organization_units where id=?").run(id);
      } else {
        const name = text(payload.name);
        if (!name) throw error("组织名称不能为空");
        if (old) {
          if ((payload.type !== undefined && payload.type !== old.unit_type) || (payload.parentId !== undefined && text(payload.parentId) !== text(old.parent_id))) throw error("组织类型和父级创建后不可修改");
          if (db.prepare("select 1 from organization_units where id<>? and unit_type=? and coalesce(parent_id,'')=? and name=?").get(id,old.unit_type,text(old.parent_id),name)) throw error("同父级组织名称重复",409);
          const maintenanceEligible=old.unit_type==="personnel_group"?(payload.maintenanceEligible===undefined?Number(old.maintenance_eligible||0):(payload.maintenanceEligible?1:0)):0;
          if(old.unit_type==="personnel_group"&&Number(old.maintenance_eligible||0)===1&&!maintenanceEligible){
            const activeAssignments=Number(db.prepare("select count(*) as n from maintenance_assignments a join maintenance_flights f on f.id=a.flight_id join personnel p on p.id=a.person_id where p.personnel_group_id=? and coalesce(f.archived_at,'')='' and coalesce(a.status,'')<>'已确认'").get(id).n);
            const activeAllocations=Number(db.prepare("select count(*) as n from capability_current_states s join personnel p on p.id=s.person_id where p.personnel_group_id=? and s.working_team_id is not null").get(id).n);
            if(activeAssignments||activeAllocations)throw error("人员分组仍有在办维修任务或当前调配人员，不能关闭维修调配",409,{activeAssignments,activeAllocations});
          }
          db.prepare("update organization_units set name=?,maintenance_eligible=?,updated_at=? where id=?").run(name,maintenanceEligible,now(),id);
          if (old.unit_type === "department") db.prepare("update personnel set department=? where department_id=?").run(name,id);
          if (old.unit_type === "administrative_team") db.prepare("update personnel set home_team=? where administrative_team_id=?").run(name,id);
          db.prepare("delete from sessions where user_id in (select u.id from users u join personnel p on p.id=u.person_id where p.department_id=? or p.personnel_group_id=? or p.administrative_team_id=?)").run(id,id,id);
        } else {
          const code = randomId("ORG"), type = payload.type, parentId = text(payload.parentId);
          if (!["department","personnel_group","administrative_team"].includes(type)) throw error("请选择有效组织类型");
          const parent = parentId ? db.prepare("select * from organization_units where id=? and status='active'").get(parentId) : null;
          const validParent=type==="department"?!parentId:type==="personnel_group"?parent?.unit_type==="department":parent?.unit_type==="personnel_group";
          if(!validParent)throw error(type==="administrative_team"?"行政班组只能隶属人员分组":"组织父级无效");
          if (db.prepare("select 1 from organization_units where code=? or (unit_type=? and coalesce(parent_id,'')=? and name=?)").get(code,type,parentId,name)) throw error("组织代码或同父级名称重复",409);
          id = randomId("org");
          db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',?,?,?)").run(id,code,name,type,parentId,type==="personnel_group"&&payload.maintenanceEligible?1:0,now(),now());
        }
      }
      audit(user,`${method.toLowerCase()}_organization`,"organization",id,JSON.stringify({reason,payload}));
      db.exec("commit");
      return {ok:true,id};
    } catch (e) { db.exec("rollback"); audit(user,"reject_organization_change","organization",id || "",e.message); throw e; }
  }
  function directory(user, purpose, params = new URLSearchParams()) {
    const config = { accounts: ["accounts",["accounts.read","accounts.create","accounts.bulk_open"]], info: ["info",["info.create","info.update.own","info.update.any"]], maintenance: ["maintenance",["maintenance.dispatch.view","maintenance.review.view","maintenance.execute.view","maintenance.hours.confirm"]] }[purpose];
    if (!config || !config[1].some(p => hasRbac(user,p))) throw error("没有查询该用途人员目录的权限",403);
    const p = predicate(user,config[0]), q = `%${text(params.get("q"))}%`;
    const size = Math.min(200,Math.max(1,Number(params.get("pageSize")) || 50)), page = Math.max(1,Number(params.get("page")) || 1);
    const where = `p.data_status='active' and p.employment_status not in ('离职','停职') and (${p.sql}) and (p.employee_no like ? or p.name like ? or d.name like ? or coalesce(t.name,g.name,'') like ?)${purpose === "info" ? " and u.id is not null and coalesce(u.status,'active')<>'disabled'" : ""}${purpose === "maintenance" ? " and g.unit_type='personnel_group' and g.maintenance_eligible=1" : ""}`;
    const args = [...p.params,q,q,q,q];
    const from = "from personnel p left join users u on u.person_id=p.id left join organization_units d on d.id=p.department_id left join organization_units g on g.id=p.personnel_group_id left join organization_units t on t.id=p.administrative_team_id left join capability_current_states cs on cs.person_id=p.id left join organization_units wt on wt.id=cs.working_team_id";
    const total = Number(db.prepare(`select count(*) as n ${from} where ${where}`).get(...args).n);
    const items = db.prepare(`select p.id as personId,p.employee_no as employeeNo,p.name,d.name as department,g.id as personnelGroupId,g.name as personnelGroupName,g.maintenance_eligible as maintenanceEligible,t.id as administrativeTeamId,t.name as administrativeTeamName,wt.id as currentWorkingTeamId,wt.name as currentWorkingTeamName,p.position_code as position,u.id as accountId,u.status as accountStatus ${from} where ${where} order by p.employee_no limit ? offset ?`).all(...args,size,(page-1)*size).map(item=>({...item,maintenanceEligible:!!item.maintenanceEligible}));
    return {items,total,page,pageSize:size};
  }
  return { isSuper, permission, activeScopes, hasAll, predicate, allows, requirePerson, normalizeScopes, redact, organizations, organizationPayload, allowsProposed, checkMutation, saveOrganization, orgReferences, mutateOrganization, directory };
}

export function preflightOrganizations(db) {
  const columns=new Set(db.prepare("pragma table_info(personnel)").all().map(row=>row.name));
  const groupColumn=columns.has("personnel_group_id")?"personnel_group_id":columns.has("organization_branch_id")?"organization_branch_id":"";
  const issues=[];
  if(groupColumn)for(const p of db.prepare(`select id,employee_no,${groupColumn} as group_id,administrative_team_id from personnel`).all()){
    if(p.group_id&&!db.prepare("select 1 from organization_units where id=? and unit_type in ('workshop','personnel_category','personnel_group')").get(p.group_id))issues.push({personId:p.id,employeeNo:p.employee_no,reason:"人员分组无法映射"});
    if(p.administrative_team_id&&!db.prepare("select 1 from organization_units where id=? and unit_type='administrative_team'").get(p.administrative_team_id))issues.push({personId:p.id,employeeNo:p.employee_no,reason:"行政班组无法映射"});
  }
  return {ok:!issues.length,issues};
}

export function migrateOrganizations(db, now, randomId, { withinTransaction = false } = {}) {
  if (db.prepare("select 1 from settings where key='personnelOrganizationsV5'").get()) return;
  const orgColumns=new Set(db.prepare("pragma table_info(organization_units)").all().map(row=>row.name));
  if(!orgColumns.has("maintenance_eligible"))db.exec("alter table organization_units add column maintenance_eligible integer not null default 0");
  const personColumns=new Set(db.prepare("pragma table_info(personnel)").all().map(row=>row.name));
  if(!personColumns.has("personnel_group_id")){
    if(personColumns.has("organization_branch_id"))db.exec("alter table personnel rename column organization_branch_id to personnel_group_id");
    else db.exec("alter table personnel add column personnel_group_id text");
  }
  db.exec("create table if not exists personnel_organization_history(id text primary key,person_id text not null,department_id text,personnel_group_id text,administrative_team_id text,changed_at text not null)");
  const historyColumns=new Set(db.prepare("pragma table_info(personnel_organization_history)").all().map(row=>row.name));
  if(!historyColumns.has("personnel_group_id")){
    if(historyColumns.has("organization_branch_id"))db.exec("alter table personnel_organization_history rename column organization_branch_id to personnel_group_id");
    else db.exec("alter table personnel_organization_history add column personnel_group_id text");
  }
  if(!historyColumns.has("administrative_team_id"))db.exec("alter table personnel_organization_history add column administrative_team_id text");
  const report = preflightOrganizations(db);
  if (!report.ok) throw error("组织迁移存在待确认归属，尚未切换",409,report);
  if (!withinTransaction) db.exec("begin immediate");
  try {
    const ids={};
    for(const item of FIXED_ORGANIZATIONS){
      const parentId=item.parentCode?ids[item.parentCode]:"";
      const row=db.prepare("select * from organization_units where code=? or code=?").get(item.code,item.legacyCode||item.code);
      if(row&&text(row.parent_id)!==parentId)throw error("预置组织代码已被其他组织占用",409,{code:item.code});
      const id=row?.id||randomId("org");ids[item.code]=id;
      if(row)db.prepare("update organization_units set code=?,unit_type=?,maintenance_eligible=?,updated_at=? where id=?").run(item.code,item.type,row.maintenance_eligible??item.maintenanceEligible??0,now(),id);
      else db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,?,?,'active',?,?,?)").run(id,item.code,item.name,item.type,parentId,item.maintenanceEligible||0,now(),now());
    }
    const dep=ids["DEPT-LINE"],cadre=ids["GROUP-LINE-CADRE"];
    db.prepare("update personnel set department_id=?,personnel_group_id=?,administrative_team_id=null,department='航线维修车间',home_team='' where employee_no='54002010'").run(dep,cadre);
    const scopes=db.prepare("select * from rbac_user_scopes").all();
    db.prepare("delete from rbac_user_scopes").run();
    const insertScope=db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,?,?,?,?,?,?,?) on conflict(user_id,module,scope_type,scope_id) do nothing");
    for (const scope of scopes) {
      const mapped={home_team:"administrative_team",managed_teams:"specified_teams",workshop:"personnel_group",personnel_category:"personnel_group",specified_workshops:"specified_groups",specified_categories:"specified_groups"}[scope.scope_type]||scope.scope_type;
      insertScope.run(scope.id,scope.user_id,scope.module,mapped,scope.scope_id||"",scopeDate(scope.valid_from),scopeDate(scope.valid_to,true),scope.created_at,scope.updated_at);
    }
    if(db.kind==="postgres")db.exec("drop table if exists rbac_user_scopes_legacy_identity_v3");
    else if(db.prepare("select 1 from sqlite_master where type='table' and name='rbac_user_scopes_legacy_identity_v3'").get())db.exec("drop table rbac_user_scopes_legacy_identity_v3");
    db.exec("drop index if exists personnel_branch_idx; create index if not exists personnel_group_idx on personnel(personnel_group_id)");
    for(const column of ["gender","age","demand_unit","highest_education","english_level","entry_channel","dispatch_flag","workshop_id","home_team_id","work_category"]){
      if(db.prepare("pragma table_info(personnel)").all().some(row=>row.name===column))db.exec(`alter table personnel drop column ${column}`);
    }
    for(const column of ["home_team_id","workshop_id"]){
      if(db.prepare("pragma table_info(personnel_organization_history)").all().some(row=>row.name===column))db.exec(`alter table personnel_organization_history drop column ${column}`);
    }
    db.prepare("delete from settings where key='personnelOrganizationsV4'").run();
    db.prepare("insert into settings(key,value,updated_at) values('personnelOrganizationsV5','true',?)").run(now());
    if (!withinTransaction) db.exec("commit");
  } catch(e) { if (!withinTransaction) db.exec("rollback"); throw e; }
}

// Existing databases may already have completed the V5 migration. Seed this
// later fixed group separately, without overwriting a subsequent admin rename.
export function ensureSpecialPersonnelGroup(db, now, randomId) {
  const department=db.prepare("select * from organization_units where code='DEPT-LINE'").get();
  if(!department)throw error("特殊班组初始化失败：航线维修车间不存在",409);
  const existing=db.prepare("select * from organization_units where code='GROUP-LINE-SPECIAL'").get();
  if(existing){
    if(existing.unit_type!=='personnel_group'||text(existing.parent_id)!==department.id)throw error("预置组织代码已被其他组织占用",409,{code:'GROUP-LINE-SPECIAL'});
    return existing;
  }
  const at=now(),id=randomId('org');
  db.prepare("insert into organization_units(id,code,name,unit_type,parent_id,status,maintenance_eligible,created_at,updated_at) values(?,?,?,'personnel_group',?,'active',1,?,?)").run(id,'GROUP-LINE-SPECIAL','特殊班组',department.id,at,at);
  return db.prepare("select * from organization_units where id=?").get(id);
}

// Identity conversion and organization/range resolution must succeed or roll back together.
export function migratePersonnelFoundation(db, now, randomId) {
  db.exec("begin immediate");
  try {
    const report = migrateIdentity(db, { withinTransaction: true });
    migrateOrganizations(db, now, randomId, { withinTransaction: true });
    ensureSpecialPersonnelGroup(db, now, randomId);
    db.exec("commit");
    return report;
  } catch (e) { db.exec("rollback"); throw e; }
}
