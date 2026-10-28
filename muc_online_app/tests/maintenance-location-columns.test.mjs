import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
const context=vm.createContext({URLSearchParams,escapeHtml:String,inputDateValue:String,hasRbac:()=>false,sortMaintenanceFlights:rows=>rows,maintenanceFlightCard:f=>`[${f.id}]`,maintenanceStatusMenuHtml:()=>'',maintenanceLocationMenuHtml:side=>`location-${side}`,maintenanceSortOptionsHtml:()=>'',maintenanceOpportunityMenuHtml:()=>''});
for(const name of ['maintenanceDispatchLoadLocations','renderMaintenanceDispatch']) {
 const start=source.indexOf(`function ${name}(`);vm.runInContext(source.slice(start,source.indexOf('\n}',start)+2),context);
}
vm.runInContext(`var state={maintenanceTab:'dispatch',maintenanceLeftLocations:new Set(),maintenanceRightLocations:new Set(),maintenanceLeftStatuses:new Set(['未派工']),maintenanceRightStatuses:new Set(['已派工']),maintenanceFlights:[{id:'left-a',locationId:'a',status:'未派工'},{id:'left-b',locationId:'b',status:'未派工'},{id:'right-a',locationId:'a',status:'已派工'},{id:'right-b',locationId:'b',status:'已派工'}],maintenanceDispatchOpenNonroutineIds:new Set(),maintenanceFlightSearch:'',maintenanceStartDate:'',maintenanceEndDate:'',maintenanceNextCursor:''};`,context);
const locations=()=>Array.from(context.maintenanceDispatchLoadLocations());
test('dispatch load uses union unless either independent column is all locations',()=>{
 assert.deepEqual(locations(),[]);
 vm.runInContext(`state.maintenanceLeftLocations.add('a')`,context);assert.deepEqual(locations(),[]);
 vm.runInContext(`state.maintenanceRightLocations.add('b')`,context);assert.deepEqual(locations(),['a','b']);
 vm.runInContext(`state.maintenanceRightLocations=new Set(['a'])`,context);assert.deepEqual(locations(),['a']);
 vm.runInContext(`state.maintenanceLeftLocations.clear()`,context);assert.deepEqual(locations(),[]);
});
test('columns render their own locations without changing statuses or the peer selection',()=>{
 vm.runInContext(`state.maintenanceLeftLocations=new Set(['a']);state.maintenanceRightLocations=new Set(['b']);`,context);
 let html=context.renderMaintenanceDispatch();assert.ok(html.includes('[left-a]'));assert.ok(html.includes('[right-b]'));assert.ok(!html.includes('[left-b]'));assert.ok(!html.includes('[right-a]'));
 vm.runInContext(`state.maintenanceLeftLocations.clear()`,context);html=context.renderMaintenanceDispatch();assert.ok(html.includes('[left-b]'));assert.ok(html.includes('[right-b]'));assert.ok(!html.includes('[right-a]'));
 assert.deepEqual(Array.from(context.state.maintenanceRightLocations),['b']);
 assert.ok(!source.includes('maintenanceDispatchLocations'));
});
