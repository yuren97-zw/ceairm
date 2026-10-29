import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('only group detail metrics increase by 2px at desktop and mobile sizes',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.group-metrics>button\{display:flex;[^}]*font-size:12px\}/);
  assert.match(css,/\.group-metrics>button\{min-width:0;gap:4px;font-size:11px;line-height:1.3/);
  assert.match(css,/\.group-card-head>strong\{font-size:23px;line-height:1\}/);
  assert.match(css,/\.group-card-head>strong\{font-size:20px;white-space:nowrap\}/);
});

test('overview pairs actual and administrative headcounts and removes only the duplicate metric',()=>{
  const source=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  const overview=source.split('\n').find(line=>line.includes('const overview='));
  assert.match(overview,/className="group-headcount-actual"[^]*?ids:model.stats\[g\].actual\}\)\}>\{model.stats\[g\].actual.length\}<\/button>/);
  assert.match(overview,/className="group-headcount-admin"[^]*?ids:model.stats\[g\].administrative\}\)\}>\{model.stats\[g\].administrative.length\}<\/button>/);
  assert.match(overview,/<small>实际在岗\/编制<\/small>/);
  assert.doesNotMatch(overview,/\['administrative','编制'\]|headcounts|metric-spacer/);
  for(const label of ['本组在岗','支援外出','外来支援','派驻','培训','其他'])assert.ok(overview.includes(label));
  assert.match(overview,/ids:model.stats\[g\]\[k\]/);
});

test('ratio emphasizes actual count while denominator and separator stay smaller and muted',()=>{
  const css=fs.readFileSync(new URL('../capability-ui/center.css',import.meta.url),'utf8');
  assert.match(css,/\.group-card-head \.group-headcount-values\{display:inline-flex;align-items:baseline;gap:3px;white-space:nowrap\}/);
  assert.match(css,/\.group-card-head \.group-headcount-admin\{font-size:\.72em;font-weight:400;color:var\(--muted\)\}/);
  assert.match(css,/\.group-card-head \.group-headcount-divider\{font-size:\.65em;font-weight:400;color:#94a6b6\}/);
});
