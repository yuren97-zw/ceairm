import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function setup(response,refreshFails=false) {
  const elements=new Map();const $=id=>{if(!elements.has(id))elements.set(id,{disabled:false,textContent:'',innerHTML:'',files:[{name:'test.csv',size:100,text:async()=>''}],querySelectorAll:()=>[]});return elements.get(id);};
  const context=vm.createContext({$,escapeHtml:v=>String(v).replaceAll('<','&lt;'),state:{},apiRequest:async()=>response,closeDialog:()=>{context.closed=true;},refreshMaintenance:async()=>{if(refreshFails)throw new Error('offline');},renderMaintenance:()=>{},parseCsv:()=>[],maintenanceDispatchRowsFromRows:()=>({rows:[{rowNumber:2},{rowNumber:9}]})});
  for(const name of ['maintenanceDispatchImportFeedback','runMaintenanceImport']) {
    const start=source.indexOf(`${name==='runMaintenanceImport'?'async ':''}function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
  }
  vm.runInContext(`var maintenanceImportSession={type:'dispatch',rows:[{rowNumber:2},{rowNumber:9}],results:[{ok:true},{ok:true}],busy:false,done:false,requestId:'fixture'};`,context);
  return {context,$};
}
const good={rowNumber:2,ok:true,date:'PRIVATE-DATE',assignments:[{name:'PRIVATE-NAME',role:'PRIVATE-ROLE'}]};
const bad={rowNumber:9,ok:false,error:'未找到维修机会'};
test('routine preview displays counts and only original failed rows; all failure disables commit',async()=>{
  for(const results of [[good,{...good,rowNumber:9}],[good,bad],[{...bad,rowNumber:2},bad]]) {
    const success=results.filter(r=>r.ok).length;const {context,$}=setup({results,success,failed:2-success});await context.runMaintenanceImport(false);
    const text=$('#maintenanceImportPreview').innerHTML;assert.match(text,/待导入 2 条/);assert.ok(!text.includes('PRIVATE'));assert.equal($('#maintenanceImportConfirm').disabled,!success);assert.ok(!context.closed);
    if(success<2)assert.match(text,/第 9 行/);
  }
});
test('all successful routine commits close dialog, even when list refresh fails',async()=>{
  for(const fail of [false,true]) {const {context,$}=setup({results:[good],success:1,failed:0},fail);await context.runMaintenanceImport(true);assert.equal(context.closed,true);assert.match(context.state.maintenanceImportNotice,/导入成功1条，匹配1条/);assert.ok(!$('#maintenanceImportPreview').innerHTML.includes('PRIVATE'));if(fail)assert.match(context.state.maintenanceImportNotice,/刷新失败/);}
});
test('partial or fully failed routine commits remain open and cannot silently resubmit',async()=>{
  for(const results of [[good,bad],[bad]]) {const success=results.filter(r=>r.ok).length;const {context,$}=setup({results,success,failed:1});await context.runMaintenanceImport(true);assert.ok(!context.closed);assert.match($('#maintenanceImportProgress').textContent,/只需重传失败项/);assert.equal($('#maintenanceImportConfirm').disabled,true);assert.match($('#maintenanceImportPreview').innerHTML,/第 9 行/);}
});
test('routine request failures preserve the dialog and selection for retry',async()=>{
  const {context,$}=setup({});context.apiRequest=async()=>{throw new Error('网络错误');};await context.runMaintenanceImport(true);assert.ok(!context.closed);assert.match($('#maintenanceImportProgress').textContent,/网络错误/);assert.equal($('#maintenanceImportConfirm').disabled,false);
});
