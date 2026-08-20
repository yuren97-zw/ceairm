import fs from "node:fs/promises";
import path from "node:path";
import COS from "cos-nodejs-sdk-v5";
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

const cos = new COS({ SecretId: config.secretId, SecretKey: config.secretKey });

function putObject(params) {
  return new Promise((resolve, reject) => {
    cos.putObject(params, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
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
    await putObject({
      Bucket: config.bucket,
      Region: config.region,
      Key: objectKey,
      Body: data,
      ContentType: row.type || "application/octet-stream"
    });
    await client.query("update attachments set storage='cos',path=$1 where id=$2", [objectKey, row.id]);
    console.log(`Migrated ${row.id}: ${row.name}`);
  }
} finally {
  await client.end();
}

console.log("Attachment migration complete. Local originals were retained.");
