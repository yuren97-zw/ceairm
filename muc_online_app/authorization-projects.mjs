// Authorization names and project categories have one current source. Record-level
// names remain source history and never override the catalog.
export const PROJECT_CATEGORIES = Object.freeze({
  release: "放行",
  test_run: "试车",
  maintenance: "维修",
  special: "专项",
  third_party: "三方",
  other: "其他"
});

// One-time reviewed mapping for the 39 third-party projects present when the
// category catalog was introduced. Runtime grouping never guesses a company
// from the editable display name.
export const INITIAL_THIRD_PARTY_COMPANIES = Object.freeze({
  "1-A01-19": "新加坡航空", "1-A03-01": "酷航", "10-A04-01": "马来西亚亚航", "10-A04-03": "马来西亚亚航",
  "2-08-01": "Aero_k", "2-A01-01": "济州航空", "2-A01-02": "济州航空", "2-A02-02": "韩亚航空", "2-A02-03": "韩亚航空",
  "2-A03-01": "大韩航空", "2-A03-06": "大韩航空", "2-A03-09": "大韩航空", "2-A03-10": "大韩航空", "2-A03-12": "大韩航空", "2-A03-13": "大韩航空",
  "2-A04-01": "真航空", "2-A04-03": "真航空", "2-A05-01": "釜山航空", "2-A05-02": "釜山航空", "2-A06-01": "德威航空", "2-A06-02": "德威航空", "2-A06-03": "德威航空",
  "2-A07-01": "仁川航空", "2-A09-01": "易斯达航空", "2-A09-02": "易斯达航空", "3-A01-01": "泰亚航", "3-A01-02": "泰亚航", "3-A01-03": "泰亚航",
  "4-06-01": "美国联邦快递", "4-06-02": "美国联邦快递", "5-A02-01": "越南捷运", "5-A02-02": "越南捷运", "5-A02-03": "越南捷运",
  "5-A04-01": "越竹航空", "5-A04-02": "越竹航空", "5-A04-03": "越竹航空", "5-A04-04": "越竹航空", "7-A04-01": "澳门航空", "7-A04-02": "澳门航空"
});

export function createAuthorizationProjects({ db, now, randomId, audit }) {
  const fail = (message, status = 400, details) => Object.assign(new Error(message), { status, details });
  const lock = () => { if (db.kind === "postgres") db.exec("lock table capability_catalog in share row exclusive mode"); };
  function transaction(fn) {
    db.exec("begin immediate");
    try { lock(); const result = fn(); db.exec("commit"); return result; }
    catch (error) { db.exec("rollback"); throw error; }
  }
  const getByCode = code => db.prepare("select * from capability_catalog where project_code=?").get(code);
  const validCategory = value => Object.hasOwn(PROJECT_CATEGORIES, String(value || ""));
  const configured = row => !!row && row.status === "active" && !!row.project_name.trim() && validCategory(row.project_category);
  const displayName = row => configured(row) ? row.project_name : `待配置名称（${row.project_code}）`;
  const references = code => Number(db.prepare("select count(*) as count from personnel_authorizations where project_code=?").get(code).count);
  const candidates = code => db.prepare("select distinct trim(project_name) as name from personnel_authorizations where project_code=? and trim(coalesce(project_name,''))<>'' order by name").all(code).map(row => row.name);
  function publicProject(row) {
    return { id: row.id, projectCode: row.project_code, projectName: row.project_name,
      category: row.project_category || "", categoryLabel: PROJECT_CATEGORIES[row.project_category] || "待分类",
      thirdPartyCompany: row.third_party_company || "",
      categorySource: row.category_source || "", categoryUpdatedAt: row.category_updated_at || "",
      configured: configured(row), candidateNames: configured(row) ? [] : candidates(row.project_code),
      referenceCount: references(row.project_code), updatedAt: row.updated_at };
  }
  function migrate() {
    transaction(() => {
      const columns = new Set(db.prepare("pragma table_info(capability_catalog)").all().map(row => row.name));
      if (!columns.has("project_category")) db.exec("alter table capability_catalog add column project_category text not null default ''");
      if (!columns.has("category_source")) db.exec("alter table capability_catalog add column category_source text not null default ''");
      if (!columns.has("category_updated_by")) db.exec("alter table capability_catalog add column category_updated_by text not null default ''");
      if (!columns.has("category_updated_at")) db.exec("alter table capability_catalog add column category_updated_at text not null default ''");
      if (!columns.has("third_party_company")) db.exec("alter table capability_catalog add column third_party_company text not null default ''");
      db.exec("create index if not exists idx_personnel_authorizations_project_code on personnel_authorizations(project_code)");
      db.exec("create index if not exists idx_capability_catalog_category on capability_catalog(project_category)");
      db.exec("create index if not exists idx_capability_catalog_third_party_company on capability_catalog(third_party_company)");
      const unassignedThirdParty = db.prepare("select id,project_code from capability_catalog where project_category='third_party' and trim(coalesce(third_party_company,''))=''").all();
      const unmapped = unassignedThirdParty.filter(row => !INITIAL_THIRD_PARTY_COMPANIES[row.project_code]);
      if (unmapped.length) throw fail(`三方项目公司无法明确回填：${unmapped.map(row => row.project_code).join("、")}`, 409);
      for (const row of unassignedThirdParty) db.prepare("update capability_catalog set third_party_company=? where id=?").run(INITIAL_THIRD_PARTY_COMPANIES[row.project_code], row.id);
      const missing = db.prepare("select distinct a.project_code from personnel_authorizations a left join capability_catalog c on c.project_code=a.project_code where c.id is null").all();
      for (const { project_code: code } of missing) {
        const names = candidates(code), stamp = now();
        db.prepare("insert into capability_catalog(id,project_code,project_name,project_category,status,created_at,updated_at) values(?,?,?,?,?,?,?)")
          .run(randomId("cap"), code, names.length === 1 ? names[0] : "", "", "pending", stamp, stamp);
      }
    });
  }
  function list(params) {
    const positive = (value, fallback) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
    const pageSize = Math.min(100, positive(params.get("pageSize"), 20));
    // Escape wildcard characters so a search for a literal code remains literal.
    const q = String(params.get("q") || "").trim().toLowerCase().replace(/[!%_]/g, "!$&");
    const category = String(params.get("category") || "").trim();
    if (category && !validCategory(category)) throw fail("授权项目分类无效");
    const where = `where (lower(project_code) like ? escape '!' or lower(project_name) like ? escape '!' or lower(coalesce(third_party_company,'')) like ? escape '!')${category ? " and project_category=?" : ""}`;
    const pattern = `%${q}%`;
    const args = category ? [pattern, pattern, pattern, category] : [pattern, pattern, pattern];
    const total = Number(db.prepare(`select count(*) as count from capability_catalog ${where}`).get(...args).count);
    const page = Math.min(positive(params.get("page"), 1), Math.max(1, Math.ceil(total / pageSize)));
    const items = db.prepare(`select * from capability_catalog ${where} order by project_code limit ? offset ?`).all(...args, pageSize, (page - 1) * pageSize).map(publicProject);
    return { items, total, page, pageSize, categories: PROJECT_CATEGORIES };
  }
  function required(value, label) {
    if (typeof value !== "string" || !value.trim()) throw fail(`${label}不能为空`);
    return value.trim();
  }
  function checkPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw fail("请提交有效的项目资料");
  }
  function category(value) {
    const result = String(value || "").trim();
    if (!validCategory(result)) throw fail("请选择有效的授权项目分类");
    return result;
  }
  function thirdPartyCompany(value, projectCategory, fallback = "") {
    const supplied = String(value ?? fallback ?? "").trim();
    if (projectCategory === "third_party" && !supplied) throw fail("三方项目必须填写三方公司");
    if (projectCategory !== "third_party") return "";
    return supplied;
  }
  function create(payload, user) {
    checkPayload(payload);
    const code = required(payload.projectCode, "项目代码"), name = required(payload.projectName, "项目名称"), projectCategory = category(payload.category), company = thirdPartyCompany(payload.thirdPartyCompany, projectCategory);
    return transaction(() => {
      if (getByCode(code)) throw fail("项目代码已存在", 409);
      const id = randomId("cap"), stamp = now();
      db.prepare("insert into capability_catalog(id,project_code,project_name,project_category,third_party_company,category_source,category_updated_by,category_updated_at,status,created_at,updated_at) values(?,?,?,?,?,?,?,?,'active',?,?)")
        .run(id, code, name, projectCategory, company, "manual", user?.id || "", stamp, stamp, stamp);
      audit(user, "create_authorization_project", "authorizationProject", id, JSON.stringify({ projectCode: code, projectName: name, category: projectCategory, thirdPartyCompany: company }));
      return publicProject(getByCode(code));
    });
  }
  function update(id, payload, user) {
    checkPayload(payload);
    if (["projectCode", "project_code", "code"].some(key => key in payload)) throw fail("项目代码创建后不可修改");
    const reason = required(payload.reason, "修改原因");
    return transaction(() => {
      const row = db.prepare("select * from capability_catalog where id=?").get(id);
      if (!row) throw fail("未找到授权项目", 404);
      const name = Object.hasOwn(payload, "projectName") ? required(payload.projectName, "项目名称") : row.project_name;
      const projectCategory = Object.hasOwn(payload, "category") ? category(payload.category) : row.project_category;
      const company = thirdPartyCompany(payload.thirdPartyCompany, projectCategory, projectCategory === row.project_category ? row.third_party_company : "");
      if (name === row.project_name && projectCategory === row.project_category && company === (row.third_party_company || "")) throw fail("项目名称、分类和三方公司均未发生变化");
      const stamp = now(), categoryChanged = projectCategory !== row.project_category;
      db.prepare(`update capability_catalog set project_name=?,project_category=?,third_party_company=?,category_source=?,category_updated_by=?,category_updated_at=?,status='active',updated_at=? where id=?`)
        .run(name, projectCategory, company, categoryChanged ? "manual" : row.category_source, categoryChanged ? (user?.id || "") : row.category_updated_by, categoryChanged ? stamp : row.category_updated_at, stamp, id);
      audit(user, "update_authorization_project", "authorizationProject", id, JSON.stringify({ projectCode: row.project_code, previousName: row.project_name, projectName: name, previousCategory: row.project_category, category: projectCategory, previousThirdPartyCompany: row.third_party_company || "", thirdPartyCompany: company, reason }));
      return publicProject(getByCode(row.project_code));
    });
  }
  function updateCategories(payload, user) {
    checkPayload(payload);
    const ids = Array.isArray(payload.projectIds) ? payload.projectIds.map(value => String(value || "").trim()) : [];
    if (!ids.length || ids.some(value => !value) || new Set(ids).size !== ids.length) throw fail("请选择不重复的授权项目");
    const projectCategory = category(payload.category), reason = required(payload.reason, "修改原因"), company = thirdPartyCompany(payload.thirdPartyCompany, projectCategory);
    return transaction(() => {
      const rows = ids.map(id => db.prepare("select * from capability_catalog where id=?").get(id));
      if (rows.some(row => !row)) throw fail("所选授权项目已发生变化，请刷新后重试", 409);
      const stamp = now();
      for (const row of rows) {
        if (row.project_category === projectCategory && (row.third_party_company || "") === company) continue;
        db.prepare("update capability_catalog set project_category=?,third_party_company=?,category_source='manual',category_updated_by=?,category_updated_at=?,updated_at=? where id=?")
          .run(projectCategory, company, user?.id || "", stamp, stamp, row.id);
        audit(user, "bulk_update_authorization_project_category", "authorizationProject", row.id, JSON.stringify({ projectCode: row.project_code, previousCategory: row.project_category, category: projectCategory, previousThirdPartyCompany: row.third_party_company || "", thirdPartyCompany: company, reason }));
      }
      return { updated: rows.filter(row => row.project_category !== projectCategory || (row.third_party_company || "") !== company).length, category: projectCategory, categoryLabel: PROJECT_CATEGORIES[projectCategory], thirdPartyCompany: company };
    });
  }
  function remove(id, user) {
    try {
      return transaction(() => {
        const row = db.prepare("select * from capability_catalog where id=?").get(id);
        if (!row) throw fail("未找到授权项目", 404);
        const referenceCount = references(row.project_code);
        if (referenceCount) throw fail(`项目“${row.project_code}”被 ${referenceCount} 条授权记录引用（含已作废），不能删除`, 409, { referenceCount, projectCode: row.project_code });
        db.prepare("delete from capability_catalog where id=?").run(id);
        audit(user, "delete_authorization_project", "authorizationProject", id, JSON.stringify({ projectCode: row.project_code, projectName: row.project_name }));
        return { ok: true };
      });
    } catch (error) {
      // Record denials outside the rolled-back transaction as well.
      audit(user, "reject_delete_authorization_project", "authorizationProject", id, JSON.stringify({ error: error.message, ...error.details }));
      throw error;
    }
  }
  function dictionaries() {
    return db.prepare("select * from capability_catalog order by project_code").all().map(row => ({ category: "authorization_project", code: row.project_code, value: displayName(row), status: configured(row) ? "active" : "pending", sourceBatchId: "", updatedAt: row.updated_at }));
  }
  return { migrate, list, create, update, updateCategories, remove, getByCode, configured, dictionaries, lock };
}
