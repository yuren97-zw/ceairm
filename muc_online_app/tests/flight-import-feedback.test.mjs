import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function setup(response,refreshFails=false) {
 const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',innerHTML:'',querySelectorAll:()=>[]});return elements.get(id);};
 const context=vm.createContext({$,escapeHtml:v=>String(v).replaceAll('<','&lt;'),state:{},apiRequest:async()=>response,closeDialog:()=>{context.closed=true;},refreshMaintenance:async()=>{if(refreshFails)throw new Error('offline');},renderMaintenance:()=>{}});
 for(const name of ['maintenanceFlightImportSummary','maintenanceFlightImportFeedback','runMaintenanceImport']) {
  const start=source.indexOf(`${name==='runMaintenanceImport'?'async ':''}function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
 }
 vm.runInContext(`var maintenanceImportSession={type:'flights',rows:[{flightNo:'MU-PRIVATE'}],busy:false,done:false,valid:true,requestId:'fixture'};`,context);
 return {context,$};
}
const summary={dataRows:2,total:2,matched:1,updated:0,created:1,abnormal:0};
test('successful flight import shows counts, closes and preserves success if list refresh fails',async()=>{
 for(const fail of [false,true]) {
  const {context,$}=setup({summary,created:1},fail);await context.runMaintenanceImport(true);
  assert.equal(context.closed,true);assert.match(context.state.maintenanceImportNotice,/导入成功/);
  assert.ok(!$('#maintenanceImportPreview').innerHTML.includes('MU-PRIVATE'));
  if(fail)assert.match(context.state.maintenanceImportNotice,/刷新失败/);
 }
});
test('failed flight commit keeps dialog open and disables confirmation with row errors',async()=>{
 const {context,$}=setup({});context.apiRequest=async()=>{throw Object.assign(new Error('未导入'),{details:[{rowNumber:15,field:'日期',detail:'日期无效'}],summary:{...summary,abnormal:1}});};
 await context.runMaintenanceImport(true);assert.ok(!context.closed);assert.equal($('#maintenanceImportConfirm').disabled,true);assert.match($('#maintenanceImportPreview').innerHTML,/第 15 行/);
});
