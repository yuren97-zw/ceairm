import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
let current;
const ctx=vm.createContext({maintenanceWorkActiveContext:()=>current,maintenanceWorkSelectionKey:role=>`${current.key}|${role}`,maintenanceWorkRoleEditable:role=>role!=='locked',alert:()=>{}});
for(const name of ['maintenancePickerRoles','maintenancePickerChoose','maintenancePickerPersonState','maintenancePickerApply']){
 const start=source.indexOf(`function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
}
function draft(roles){return {availableRoles:roles,activeRole:roles[0],selections:new Map(roles.map(r=>[r,new Set()])),selectionOrder:new Map(roles.map(r=>[r,new Map()])),nextOrder:0,lockedRoles:new Set()};}
for(const count of [1,2,4,8,12])test(`dynamic ${count} roles, single/multiple and last-item guard`,()=>{
 const d=draft(Array.from({length:count},(_,i)=>`role-${i}`));
 ctx.maintenancePickerRoles(d);ctx.maintenancePickerChoose(d,d.activeRole,true);assert.equal(d.pickerRoles.length,1);
 for(const r of d.availableRoles.slice(1))ctx.maintenancePickerChoose(d,r,true);
 assert.equal(d.pickerRoles.length,count);ctx.maintenancePickerChoose(d,d.availableRoles.at(-1),false);assert.equal(d.pickerRoles.length,1);
});
test('partial selection fills gaps; full removal preserves outside roles and other people',()=>{
 const d=draft(['A','B','C']);d.selections.get('A').add('p');d.selections.get('C').add('p');d.selections.get('B').add('other');
 ctx.maintenancePickerChoose(d,'B',true);assert.equal(ctx.maintenancePickerPersonState(d,'p').partial,true);
 ctx.maintenancePickerApply(d,'p');assert.equal(ctx.maintenancePickerPersonState(d,'p').full,true);
 ctx.maintenancePickerApply(d,'p');assert.equal(d.selections.get('C').has('p'),true);assert.equal(d.selections.get('B').has('other'),true);
});
test('locked batch is atomic and radio release constraint is preserved',()=>{
 const d=draft(['放行','B']);ctx.maintenancePickerChoose(d,'B',true);d.lockedRoles.add('B');ctx.maintenancePickerApply(d,'p');assert.equal(d.selections.get('放行').size,0);
 d.lockedRoles.clear();d.selections.get('放行').add('old');ctx.maintenancePickerApply(d,'p');assert.deepEqual([...d.selections.get('放行')],['p']);
});
test('routine context scopes do not carry UI selection across tasks or mutate dispatch',()=>{
 const d=draft(['A','B']);current={key:'one',roles:['A','B']};for(const r of ['A','B']){d.selections.set(`one|${r}`,new Set());d.selectionOrder.set(`one|${r}`,new Map());}
 ctx.maintenancePickerChoose(d,'B',true,true);ctx.maintenancePickerApply(d,'p',true);assert.equal(d.selections.get('one|A').has('p'),true);assert.equal(d.selections.get('A').size,0);
 current={key:'two',roles:['A','B']};ctx.maintenancePickerRoles(d,true);assert.equal(d.pickerRoles.length,1);
});
test('create-nonroutine uses the same picker, preserving existing report types',()=>{
 const start=source.indexOf('function maintenanceWorkUsesPicker(');vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),ctx);
 for(const reportType of ['routine','nonroutine-create']) assert.equal(ctx.maintenanceWorkUsesPicker({reportType}),true);
 for(const reportType of ['nonroutine','finalize']) assert.equal(ctx.maintenanceWorkUsesPicker({reportType}),false);
 const d=draft(['主做','协助']);d.reportType='nonroutine-create';current={key:'new:one',roles:['主做','协助']};
 for(const role of current.roles){d.selections.set(`new:one|${role}`,new Set());d.selectionOrder.set(`new:one|${role}`,new Map());}
 ctx.maintenancePickerChoose(d,'协助',true,true);ctx.maintenancePickerApply(d,'p',true);
 assert.equal(ctx.maintenancePickerPersonState(d,'p',true).full,true);
});
