import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!appDir.includes(`${path.sep}.codex${path.sep}worktrees${path.sep}`)) {
  throw new Error("start:worktree仅用于Codex隔离工作树；主工作树请使用npm start");
}

delete process.env.DATABASE_URL;
process.env.PORT = "8788";
process.env.DB_PATH = path.join(appDir, "data", "rbac-refactor-test.sqlite");
process.env.UPLOAD_DIR = path.join(appDir, "uploads-rbac-test");

console.log("准备启动Codex隔离工作树");
console.log(`端口：${process.env.PORT}`);
console.log(`数据库：${process.env.DB_PATH}`);
console.log(`附件目录：${process.env.UPLOAD_DIR}`);
await import("../server.mjs");
