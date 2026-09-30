import fs from "node:fs";

export function postgresConnectionOptions(databaseUrl, env = process.env) {
  const url = new URL(databaseUrl);
  if (!/^postgres(?:ql)?:$/.test(url.protocol)) throw new Error("DATABASE_URL 必须是 PostgreSQL 地址");
  if (["sslmode", "sslrootcert", "sslcert", "sslkey"].some(key => url.searchParams.has(key)))
    throw new Error("请通过 PGSSLMODE、PGSSLROOTCERT 配置数据库 TLS，不要在 DATABASE_URL 中重复配置");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const local = ["localhost", "127.0.0.1", "::1"].includes(host);
  const mode = String(env.PGSSLMODE || (local ? "disable" : "verify-full")).toLowerCase();
  if (mode === "disable") {
    if (!local) throw new Error("远程 PostgreSQL 不允许关闭 TLS 证书校验");
    return { connectionString: databaseUrl, ssl: false };
  }
  if (mode !== "verify-full") throw new Error("PGSSLMODE 仅支持本机 disable 或远程 verify-full");
  const caPath = String(env.PGSSLROOTCERT || "").trim();
  const ssl = { rejectUnauthorized: true, servername: host };
  if (caPath) ssl.ca = fs.readFileSync(caPath, "utf8");
  return { connectionString: databaseUrl, ssl };
}
