// One-time, fail-closed migration. Runtime code never guesses whether an ID is a person or account.
export const PERSON_TABLES = ["maintenance_assignments", "maintenance_feedback", "maintenance_hour_results", "maintenance_sortie_results", "maintenance_work_report_entries", "maintenance_report_entries"];
export const SCOPE_MODULES = ["personnel", "accounts", "info", "maintenance", "hours", "attendance"];
const columns = (db, table) => db.prepare(`pragma table_info(${table})`).all().map(row => row.name);
const fail = details => Object.assign(new Error("人员身份迁移预检失败，必须先处理映射或唯一键冲突"), { details, status: 409 });

export function preflightIdentity(db) {
  const people = db.prepare("select id,employee_no from personnel").all();
  const accounts = db.prepare("select id,person_id from users").all();
  const personIds = new Set(people.map(p => p.id));
  const accountMap = new Map(accounts.filter(a => personIds.has(a.person_id)).map(a => [a.id, a.person_id]));
  const issues = [], mappings = [], tables = [];
  function resolve(value, location) {
    const candidates = new Set([personIds.has(value) ? value : null, accountMap.get(value)].filter(Boolean));
    if (candidates.size !== 1) { issues.push({ location, identity: value, reason: candidates.size ? "身份映射歧义" : "无法匹配人员" }); return null; }
    return [...candidates][0];
  }
  for (const table of PERSON_TABLES) {
    const cols = columns(db, table);
    if (!cols.length || cols.includes("person_id")) continue;
    const rows = db.prepare(`select * from ${table}`).all();
    const keys = new Set();
    rows.forEach(row => {
      const personId = resolve(row.user_id, `${table}:${row.id || row.flight_id}`);
      const unique = table === "maintenance_report_entries" ? [row.batch_id,row.owner_type,row.owner_id,row.role,personId]
        : table === "maintenance_work_report_entries" ? [row.flight_id,row.role,personId] : null;
      if (unique) { const key = JSON.stringify(unique); if (keys.has(key)) issues.push({ location: table, reason: "迁移后业务唯一键冲突", key }); keys.add(key); }
      if (personId) mappings.push({ table, oldId: row.user_id, personId });
    });
    tables.push({ table, count: rows.length });
  }
  const drafts = [];
  function transform(value, location) {
    if (Array.isArray(value)) return value.map((item, index) => transform(item, `${location}[${index}]`));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => ["userId","releaseUserId"].includes(key) ? [key === "userId" ? "personId" : "releasePersonId", item ? resolve(item, location) : ""] : [key, transform(item, `${location}.${key}`)]));
  }
  // A completed migration has already converted JSON; do not remap it on every restart.
  if (columns(db, "maintenance_assignments").includes("user_id")) {
    for (const row of db.prepare("select id,payload_json from maintenance_report_drafts").all()) {
      try { drafts.push({ id: row.id, payload: transform(JSON.parse(row.payload_json), `draft:${row.id}`) }); }
      catch { issues.push({ location: `draft:${row.id}`, reason: "草稿JSON损坏" }); }
    }
  }
  const recipients = [];
  if (!columns(db, "record_recipients").includes("person_id")) {
    for (const row of db.prepare("select record_id,user_id from record_recipients").all()) {
      const personId = resolve(row.user_id, `record_recipients:${row.record_id}`);
      if (!accountMap.has(row.user_id)) issues.push({ location: `record_recipients:${row.record_id}`, identity: row.user_id, reason: "历史接收账户无法明确匹配，不能转移回执" });
      recipients.push({ ...row, personId });
    }
  }
  return { ok: issues.length === 0, issues, tables, mappings, drafts, recipients };
}

export function migrateIdentity(db, { withinTransaction = false } = {}) {
  const report = preflightIdentity(db);
  if (!report.ok) throw fail(report);
  if (!withinTransaction) db.exec("begin immediate");
  try {
    db.exec("create table if not exists personnel_identity_migrations(table_name text not null,legacy_identity text not null,person_id text not null,migrated_at text not null,primary key(table_name,legacy_identity))");
    for (const table of PERSON_TABLES) {
      if (!columns(db, table).includes("user_id")) continue;
      if (table === "maintenance_assignments") {
        if (db.kind === "postgres") db.exec("drop trigger if exists assignments_no_deleted_insert on maintenance_assignments; drop trigger if exists assignments_no_deleted_update on maintenance_assignments");
        else db.exec("drop trigger if exists assignments_no_deleted_insert; drop trigger if exists assignments_no_deleted_update");
      }
      db.exec(`alter table ${table} rename column user_id to person_id`);
      const mappings = new Map(report.mappings.filter(m => m.table === table).map(m => [m.oldId, m.personId]));
      for (const [oldId, personId] of mappings) {
        db.prepare(`update ${table} set person_id=? where person_id=?`).run(personId, oldId);
        db.prepare("insert into personnel_identity_migrations values(?,?,?,?) on conflict(table_name,legacy_identity) do nothing").run(table, oldId, personId, new Date().toISOString());
      }
    }
    for (const table of PERSON_TABLES) db.exec(`create index if not exists ${table}_person_idx on ${table}(person_id)`);
    for (const draft of report.drafts) db.prepare("update maintenance_report_drafts set payload_json=? where id=?").run(JSON.stringify(draft.payload), draft.id);
    if (!columns(db, "record_recipients").includes("person_id")) {
      db.exec("alter table record_recipients add column person_id text");
      for (const row of report.recipients) db.prepare("update record_recipients set person_id=? where record_id=? and user_id=?").run(row.personId, row.record_id, row.user_id);
    }
    db.exec("create index if not exists record_recipients_person_idx on record_recipients(person_id)");
    if (!columns(db, "rbac_user_scopes").includes("module")) {
      const oldScopes = db.prepare("select * from rbac_user_scopes").all();
      db.exec("alter table rbac_user_scopes rename to rbac_user_scopes_legacy_identity_v3");
      // A distinct initial name also avoids PostgreSQL's retained legacy PK/index names.
      db.exec("create table rbac_user_scopes_v3(id text primary key,user_id text not null,module text not null,scope_type text not null,scope_id text not null default '',valid_from text,valid_to text,created_at text not null,updated_at text not null,unique(user_id,module,scope_type,scope_id))");
      const insert = db.prepare("insert into rbac_user_scopes_v3 values(?,?,?,?,?,?,?,?,?)");
      for (const row of oldScopes) for (const module of SCOPE_MODULES) insert.run(`${row.id}-${module}`, row.user_id, module, row.scope_type, row.scope_id || "", row.valid_from || "", row.valid_to || "", row.created_at, row.updated_at);
      db.exec("alter table rbac_user_scopes_v3 rename to rbac_user_scopes");
    }
    if (report.tables.length) db.prepare("delete from sessions").run();
    if (!withinTransaction) db.exec("commit");
    return report;
  } catch (error) { if (!withinTransaction) db.exec("rollback"); throw error; }
}
