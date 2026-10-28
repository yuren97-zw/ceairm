import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const html=await fs.readFile(new URL('../public/index.html',import.meta.url),'utf8');
test('information month filter uses a scoped 760px override without shrinking desktop or other selects',()=>{
  assert.match(html,/@media\(max-width:760px\)\{\s*#infoFilters \.info-month-filter\{width:89\.5px;max-width:100%;flex:0 0 auto;column-gap:1px;padding-inline:8px\}/);
  assert.match(html,/#infoFilters \.info-month-filter #monthSelect\{flex:1 1 0;min-width:0;max-width:100%;font-size:13px!important\}/);
  assert.match(html,/<label class="select-pill info-month-filter">月份<select id="monthSelect" aria-label="月份"><\/select><\/label>/);
  assert.equal((html.match(/class="select-pill info-month-filter"/g)||[]).length,1);
  assert.match(html,/<label class="select-pill">ATA<select id="fixedAtaFilter"/);
});
