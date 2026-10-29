import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
test('all information roles omit read filter and normalize stale selection to all',()=>{
  const constants=source.slice(source.indexOf('const receiverStatusFilters'),source.indexOf('\n',source.indexOf('const adminStatusFilters')));
  const fn=source.slice(source.indexOf('function renderStatusControls()'),source.indexOf('\nfunction ',source.indexOf('function renderStatusControls()')+1));
  for(const permission of ['receiver','publisher','admin']){
    const node={innerHTML:''},context=vm.createContext({state:{statusFilter:'已读',activeMonth:'全部'},$:()=>node,hasRbac:p=>permission==='admin'||permission==='publisher'&&p==='info.create',escapeHtml:x=>x});
    vm.runInContext(constants+'\n'+fn+'\nrenderStatusControls();',context);
    assert.equal(context.state.statusFilter,'全部');assert.ok(!node.innerHTML.includes('data-status="已读"'));assert.ok(node.innerHTML.includes('data-status="未读"'));
  }
});
test('return target is below end date, permission controlled, retained on edit and exported',async()=>{
  const ui=await fs.readFile(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  const form=ui.slice(ui.indexOf('function StatusForm'),ui.indexOf('function StatusManagement'));
  assert.ok(form.indexOf('结束日期（可留空）')<form.indexOf('到期返回（选填）'));
  assert.match(form,/useState\(r\?\.return_target\|\|''\)/);
  assert.match(form,/disabled=\{!snap.permissions.allocate\|\|historical\}/);
  assert.match(ui,/到期返回:returnTargetLabel\(r.return_target\)/);
  assert.match(ui,/返回：\{returnTargetLabel\(r.return_target\)\}/);
});
