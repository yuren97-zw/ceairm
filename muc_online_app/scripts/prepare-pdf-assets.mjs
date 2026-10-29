import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(await fs.readFile(path.join(root, 'node_modules/pdfjs-dist/package.json'), 'utf8'));
const destination = path.join(root, 'public/vendor/pdfjs', pkg.version);
await fs.mkdir(destination, { recursive: true });
for (const name of ['pdf.mjs', 'pdf.worker.mjs']) {
  await fs.copyFile(path.join(root, 'node_modules/pdfjs-dist/legacy/build', name), path.join(destination, name));
}
for (const name of ['cmaps', 'standard_fonts', 'wasm']) {
  await fs.cp(path.join(root, 'node_modules/pdfjs-dist', name), path.join(destination, name), { recursive: true });
}
await fs.copyFile(path.join(root, 'node_modules/pdfjs-dist/LICENSE'), path.join(destination, 'LICENSE'));
