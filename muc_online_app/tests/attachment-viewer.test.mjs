import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { AttachmentViewer, boundedZoom, canvasDensity } from '../public/attachment-viewer.mjs';

test('attachment zoom bounds and PDF canvas allocation stay bounded', () => {
  assert.equal(boundedZoom(.1), .5);
  assert.equal(boundedZoom(5), 3);
  assert.equal(boundedZoom(1.25), 1.25);
  const density = canvasDensity(5000, 10000, 3);
  assert.ok(5000 * 10000 * density ** 2 <= 4000001);
  assert.equal(canvasDensity(500, 700, 3), 2);
});

test('local PDF worker and download path do not rely on external viewers', async () => {
  const source = await fs.readFile(new URL('../public/attachment-viewer.mjs', import.meta.url), 'utf8');
  const app = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const packageData = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageData.dependencies['pdfjs-dist'], '6.4.299');
  assert.ok(source.includes('/vendor/pdfjs/6.4.299/'));
  assert.ok(source.includes('isEvalSupported: false'));
  assert.ok(source.includes('token !== this.serial'));
  assert.ok(source.includes('this.renderTask?.cancel()'));
  assert.ok(source.includes('task.destroy()'));
  assert.ok(app.includes('?download=1'));
});

test('closing and rapidly switching attachments aborts stale work without changing the new preview', async t => {
  const names = ['document', 'ResizeObserver', 'cancelAnimationFrame'];
  const previous = Object.fromEntries(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  t.after(() => { for (const name of names) { if (previous[name]) Object.defineProperty(globalThis, name, previous[name]); else delete globalThis[name]; } });
  const nodes = new Map();
  const node = () => ({
    style: {}, hidden: false, open: false, innerHTML: '',
    classList: { remove() {}, toggle() {} },
    addEventListener() {}, replaceChildren() { this.innerHTML = ''; },
    querySelector() { return null; }, getAttribute(name) { return this[name] || ''; },
    showModal() { this.open = true; }
  });
  globalThis.document = { body: { style: { overflow: 'auto' } }, querySelector(selector) {
    if (!nodes.has(selector)) nodes.set(selector, node());
    return nodes.get(selector);
  } };
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.cancelAnimationFrame = () => {};
  let resolveOld;
  const oldSource = new Promise(resolve => { resolveOld = resolve; });
  const signals = [];
  const viewer = new AttachmentViewer({
    source: async (file, signal) => { signals.push(signal); return file.name === 'old.txt' ? oldSource : 'new-source'; },
    preview: async file => `<p>${file.name}</p>`,
    download: file => file.name, escape: value => value
  });
  const pending = viewer.open({ name: 'old.txt' });
  await viewer.open({ name: 'new.txt' });
  resolveOld('old-source'); await pending;
  assert.equal(signals[0].aborted, true);
  assert.match(viewer.content.innerHTML, /new.txt/);
  assert.ok(!viewer.content.innerHTML.includes('old.txt'));
  assert.equal(document.body.style.overflow, 'hidden');
  viewer.close();
  assert.equal(signals[1].aborted, true);
  assert.equal(viewer.content.innerHTML, '');
  assert.equal(document.body.style.overflow, 'auto');
  viewer.zoom = .25;
  viewer.changeZoom(-.1);
  assert.equal(viewer.zoom, .25, 'shrinking a fit-to-width preview must not enlarge it');
});
