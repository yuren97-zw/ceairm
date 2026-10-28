import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function setup(response,refreshFails=false) {
  const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',innerHTML:'',files:[{name:'test.csv',size:100}],querySelectorAll:()=>[]});return elements.get(id);};
  const context=vm.createContext({$,escapeHtml:v=>String(v).replaceAll('<','&lt;'),state:{},apiRequest:async()=>response,closeDialog:()=>{context.closed=true;},refreshMaintenance:async()=>{if(refreshFails)throw new Error('offline');},renderMaintenance:()=>{},maintenanceSubtaskRowsFromFile:async()=>({rows:[{rowNumber:2,title:'PRIVATE-TITLE'},{rowNumber:9}]})});
  for(const name of ['maintenanceSubtaskImportSummary','maintenanceSubtaskImportFeedback','runMaintenanceImport']) {
    const start=source.indexOf(`${name==='runMaintenanceImport'?'async ':''}function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  }
  vm.runInContext(`var maintenanceImportSession={type:'subtasks',rows:[{rowNumber:2,title:'PRIVATE-TITLE'},{rowNumber:9}],busy:false,done:false,valid:true,requestId:'fixture'};`,context);
  return {context,$};
}
const summary={total:2,matched:2,created:1,skipped:1,abnormal:0};
test('additional preview only displays counts, and any failure disables whole-batch confirmation',async()=>{
  for(const valid of [true,false]) {
    const {context,$}=setup({valid,summary:valid?summary:{...summary,matched:1,abnormal:1},errors:valid?[]:[{rowNumber:9,detail:'未找到维修机会'}]});await context.runMaintenanceImport(false);
    assert.ok(!$('#maintenanceImportPreview').innerHTML.includes('PRIVATE'));assert.equal($('#maintenanceImportConfirm').disabled,!valid);assert.ok(!context.closed);if(!valid)assert.match($('#maintenanceImportPreview').innerHTML,/第 9 行/);
  }
});
test('additional success closes and shows saved counts even if refresh fails',async()=>{
  for(const fail of [false,true]) {const {context,$}=setup({summary},fail);await context.runMaintenanceImport(true);assert.equal(context.closed,true);assert.match(context.state.maintenanceImportNotice,/导入成功/);assert.match(context.state.maintenanceImportNotice,/重复跳过 1 条/);if(fail)assert.match(context.state.maintenanceImportNotice,/刷新失败/);}
});
test('additional failed commits preserve modal, disable confirm and display original row errors',async()=>{
  const {context,$}=setup({});context.apiRequest=async()=>{throw Object.assign(new Error('未导入'),{details:[{rowNumber:17,detail:'标准工时不一致'}],summary:{...summary,abnormal:1}});};await context.runMaintenanceImport(true);assert.ok(!context.closed);assert.equal($('#maintenanceImportConfirm').disabled,true);assert.match($('#maintenanceImportPreview').innerHTML,/第 17 行/);
});
