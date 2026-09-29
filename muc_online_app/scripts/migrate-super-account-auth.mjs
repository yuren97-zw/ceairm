import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import pg from "pg";
import { postgresConnectionOptions } from "../postgres-connection.mjs";

const SUPER_ACCOUNT = "54002010";
const confirmation = process.env.CONFIRM_SUPER_ACCOUNT_AUTH_MIGRATION;
const sourceSqlitePath = process.env.SOURCE_SQLITE_PATH || "";
const sourceDatabaseUrl = process.env.SOURCE_DATABASE_URL || "";
const databaseUrl = process.env.DATABASE_URL;

if (confirmation !== "MIGRATE-54002010-AUTH-ONLY") {
  throw new Error("缺少超级账号认证材料迁移确认标记");
}
if (Boolean(sourceSqlitePath) === Boolean(sourceDatabaseUrl))
  throw new Error("必须且只能提供一个源库：SOURCE_SQLITE_PATH 或 SOURCE_DATABASE_URL");
if (!databaseUrl) throw new Error("DATABASE_URL 未配置");
if (sourceDatabaseUrl) {
  const source = new URL(sourceDatabaseUrl);
  const target = new URL(databaseUrl);
  if (source.host === target.host && source.pathname === target.pathname)
    throw new Error("源库和目标库不能相同");
}

let account;
if (sourceSqlitePath) {
  const sourcePath = path.resolve(sourceSqlitePath);
  if (sourcePath === path.parse(sourcePath).root) throw new Error("SOURCE_SQLITE_PATH 无效");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    const columns = new Set(source.prepare("pragma table_info(users)").all().map(row => row.name));
    const credential = columns.has("credential_version") ? "credential_version" : "1 as credential_version";
    account = source.prepare(`select id,username,name,salt,password_hash,status,${credential}
      from users where id=? and username=?`).get(SUPER_ACCOUNT, SUPER_ACCOUNT);
  } finally {
    source.close();
  }
} else {
  const source = new pg.Client(postgresConnectionOptions(sourceDatabaseUrl));
  await source.connect();
  try {
    await source.query("begin read only");
    const columns = await source.query("select column_name from information_schema.columns where table_name='users'");
    const names = new Set(columns.rows.map(row => row.column_name));
    for (const required of ["id", "username", "name", "salt", "password_hash", "status"])
      if (!names.has(required)) throw new Error(`源库 users 缺少 ${required}`);
    const credential = names.has("credential_version") ? "credential_version" : "1 as credential_version";
    const result = await source.query(`select id,username,name,salt,password_hash,status,${credential}
      from users where id=$1 and username=$1`, [SUPER_ACCOUNT]);
    account = result.rows[0];
    await source.query("rollback");
  } finally {
    await source.end();
  }
}

if (!account) throw new Error("源库未找到唯一超级账号54002010");
if (account.status !== "active") throw new Error("源库超级账号不是启用状态");
if (!String(account.salt || "").trim() || !String(account.password_hash || "").trim()) {
  throw new Error("源库超级账号认证材料不完整");
}

const client = new pg.Client(postgresConnectionOptions(databaseUrl));

await client.connect();
try {
  await client.query("begin");
  const target = await client.query(`
    select id,username,person_id from users where id=$1 and username=$1 for update
  `, [SUPER_ACCOUNT]);
  if (target.rowCount !== 1 || !target.rows[0].person_id) {
    throw new Error("目标库超级账号或人员关联异常");
  }
  const person = await client.query(`
    select id from personnel where id=$1 and employee_no=$2 and data_status='active'
  `, [target.rows[0].person_id, SUPER_ACCOUNT]);
  if (person.rowCount !== 1) throw new Error("目标库超级账号人员主档异常");

  await client.query(`
    update users
       set name=$2,
           salt=$3,
           password_hash=$4,
           status='active',
           must_change_password=0,
           credential_version=$5,
           updated_at=$6
     where id=$1 and username=$1
  `, [
    SUPER_ACCOUNT,
    String(account.name || "赵威"),
    String(account.salt),
    String(account.password_hash),
    Math.max(1, Number(account.credential_version || 1)),
    new Date().toISOString()
  ]);
  await client.query("delete from sessions where user_id=$1", [SUPER_ACCOUNT]);

  const role = await client.query(`
    select count(*)::integer as count
      from rbac_user_roles ur
      join rbac_roles r on r.id=ur.role_id
     where ur.user_id=$1 and r.code='system_admin'
  `, [SUPER_ACCOUNT]);
  const scopes = await client.query(`
    select count(distinct module)::integer as count
      from rbac_user_scopes
     where user_id=$1 and scope_type='all'
  `, [SUPER_ACCOUNT]);
  if (Number(role.rows[0]?.count) !== 1 || Number(scopes.rows[0]?.count) < 1) {
    throw new Error("目标库超级账号RBAC初始化不完整");
  }
  await client.query("commit");
  console.log(JSON.stringify({
    ok: true,
    account: SUPER_ACCOUNT,
    retainedPassword: true,
    sessionsInvalidated: true,
    systemAdminRole: true,
    allScopeModules: Number(scopes.rows[0].count)
  }));
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
