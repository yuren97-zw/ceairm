import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(appRoot, "public");
const outputDir = path.resolve(process.argv[2] || path.join(appRoot, "dist-public"));

await fs.rm(outputDir, { recursive: true, force: true });
await fs.cp(sourceDir, outputDir, { recursive: true });

const appSource = await fs.readFile(path.join(sourceDir, "app.js"));
const hash = crypto.createHash("sha256").update(appSource).digest("hex").slice(0, 16);
const hashedName = `app.${hash}.js`;
await fs.writeFile(path.join(outputDir, hashedName), appSource);
await fs.rm(path.join(outputDir, "app.js"), { force: true });

const indexPath = path.join(outputDir, "index.html");
let index = await fs.readFile(indexPath, "utf8");
const styleBlocks = Array.from(index.matchAll(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>/gi));
let styleName = "";
if (styleBlocks.length) {
  const stylesheet = styleBlocks.map(match => match[1].trim()).join("\n");
  const styleHash = crypto.createHash("sha256").update(stylesheet).digest("hex").slice(0, 16);
  styleName = `styles.${styleHash}.css`;
  await fs.writeFile(path.join(outputDir, styleName), stylesheet);
  index = index.replace(/<style(?:\s[^>]*)?>[\s\S]*?<\/style>/gi, "")
    .replace("</head>", `  <link rel="stylesheet" href="/${styleName}">\n</head>`);
}
index = index.replace(/<script src="app\.js(?:\?[^\"]*)?"><\/script>/, `<script src="/${hashedName}"></script>`);
await fs.writeFile(indexPath, index);

const releaseVersion = String(process.env.RELEASE_VERSION || hash).replace(/[^a-zA-Z0-9._-]/g, "-");
const workerPath = path.join(outputDir, "sw.js");
const worker = (await fs.readFile(workerPath, "utf8"))
  .replace(/const CACHE_NAME = "[^"]+";/, `const CACHE_NAME = "airline-operations-center-${releaseVersion}";`)
  .replace(/"\/app\.js(?:\?[^\"]*)?"/, `"/${hashedName}"`)
  .replace('  "/manifest.webmanifest",', `${styleName ? `  "/${styleName}",\n` : ""}  "/manifest.webmanifest",`);
await fs.writeFile(workerPath, worker);

process.stdout.write(`${JSON.stringify({ outputDir, hashedName, releaseVersion })}\n`);
