import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { aircraftCodes, normalizeAircraftHours, resolveAircraftHours } from '../maintenance-aircraft-hours.mjs';

test('aircraft groups normalize separators, uppercase and duplicate codes with exact matching', () => {
  assert.deepEqual(aircraftCodes('32n 320，32N、325\n320'), ['32N', '320', '325']);
  const config = { version: 2, ...normalizeAircraftHours({ groups: [{ id: 'one', name: '窄体', codes: '32n 320 32N 325', hours: { 航前: 2 } }] }, ['航前']) };
  for (const code of ['32n', '320', '325']) assert.equal(resolveAircraftHours(config, code, '航前').baseHours, 2);
  assert.equal(resolveAircraftHours(config, 'A320', '航前').baseHours, 0);
  assert.equal(resolveAircraftHours(config, '', '航前').baseHours, 0);
  assert.equal(resolveAircraftHours(config, '320', '航后').baseHours, 0);
  config.groups.push({ id: 'wide', name: '宽体', codes: ['333'], enabled: true, hours: { 航前: 5 } });
  assert.equal(resolveAircraftHours(config, '333', '航前').baseHours, 5);
  assert.equal(resolveAircraftHours(config, '320', '航前').baseHours, 2);
  config.groups[0].enabled = false;
  assert.equal(resolveAircraftHours(config, '320', '航前').baseHours, 0);
});

test('duplicate aircraft across groups and invalid hours reject the full configuration', () => {
  const group = { id: 'one', name: '一', codes: '320', hours: { 航前: 1 } };
  assert.throws(() => normalizeAircraftHours({ groups: [group, { ...group, id: 'two', name: '二' }] }, ['航前']), /多个/);
  for (const hours of [0, -1, Infinity, 'abc', 1.123]) assert.throws(() => normalizeAircraftHours({ groups: [{ ...group, hours: { 航前: hours } }] }, ['航前']), /工时/);
});

test('legacy hour reference is absent and only the person modal search gets the mobile zoom fix', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /原标准工时|const standardRules\s*=/);
  const css = await readFile(new URL('../capability-ui/center.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(max-width:750px\)\{\s*\.overlay[^\n]+\n\s*\/\*[^]*?\*\/\s*\.person-detail-modal>header \.person-detail-authorization-search\{font-size:16px;min-width:0;max-width:100%\}/);
  assert.match(css, /\.modal-close\{[^}]*width:44px;[^}]*height:44px/);
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:[" ,])/);
});
