import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;
const uploadDir = process.env.UPLOAD_DIR;
const config = {
  secretId: String(process.env.COS_SECRET_ID || "").trim(),
  secretKey: String(process.env.COS_SECRET_KEY || "").trim(),
  bucket: String(process.env.COS_BUCKET || "").trim(),
  region: String(process.env.COS_REGION || "").trim()
};

if (!databaseUrl || !uploadDir || Object.values(config).some(value => !value)) {
  throw new Error("DATABASE_URL, UPLOAD_DIR and all COS_* variables are required");
}

function encodePath(value) {
  return `/${String(value).split("/").map(encodeURIComponent).join("/")}`;
}

function signedUrl(method, objectKey) {
  const start = Math.floor(Date.now() / 1000) - 30;
  const end = start + 900;
  const keyTime = `${start};${end}`;
  const host = `${config.bucket}.cos.${config.region}.myqcloud.com`;
  const pathname = encodePath(objectKey);
  const httpString = `${method.toLowerCase()}\n${pathname}\n\nhost=${host}\n`;
  const signKey = crypto.createHmac("sha1", config.secretKey).update(keyTime).digest("hex");
  const stringToSign = `sha1\n${keyTime}\n${crypto.createHash("sha1").update(httpString).digest("hex")}\n`;
  const signature = crypto.createHmac("sha1", signKey).update(stringToSign).digest("hex");
  const query = new URLSearchParams({
    "q-sign-algorithm": "sha1",
    "q-ak": config.secretId,
    "q-sign-time": keyTime,
    "q-key-time": keyTime,
    "q-header-list": "host",
    "q-url-param-list": "",
    "q-signature": signature
  });
  return `https://${host}${pathname}?${query}`;
}

const client = new Client({ connectionString: databaseUrl, ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false } });
await client.connect();
try {
  const result = await client.query("select * from attachments where coalesce(storage,'server')<>'cos' order by created_at,id");
  for (const row of result.rows) {
    const localPath = path.resolve(uploadDir, row.path || "");
    if (!localPath.startsWith(`${path.resolve(uploadDir)}${path.sep}`)) throw new Error(`Unsafe attachment path: ${row.path}`);
    const data = await fs.readFile(localPath);
    const objectKey = `attachments/${row.owner_type}/${row.owner_id}/${row.id}-${path.basename(row.name || row.path)}`;
    const response = await fetch(signedUrl("PUT", objectKey), {
      method: "PUT",
      headers: { "Content-Type": row.type || "application/octet-stream" },
      body: data
    });
    if (!response.ok) throw new Error(`COS upload failed for ${row.id}: ${response.status}`);
    await client.query("update attachments set storage='cos',path=$1 where id=$2", [objectKey, row.id]);
    console.log(`Migrated ${row.id}: ${row.name}`);
  }
} finally {
  await client.end();
}

console.log("Attachment migration complete. Local originals were retained.");
