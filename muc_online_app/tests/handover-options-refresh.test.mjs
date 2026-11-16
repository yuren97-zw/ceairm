import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const refresh=extract('function refreshHandoverView(', 'function panelRenderHandover(');
const load=extract('async function handoverLoadOptions(', 'function paintHandover(');
function setup(){
 const editor={needsInit:false,otherItems:'保留事项',opportunities:[{flightId:'old',note:'保留说明'}]};
 const ui={epoch:0,tab:'create',view:{mode:'list'},editor,options:[]};
 let items=[{id:'new',aircraftNo:'3243',workKind:'航前'}],paints=0;
 const context=vm.createContext({handoverUi:ui,handoverBegin:()=>++ui.epoch,handoverValid:t=>t===ui.epoch,handoverRepaint:()=>paints++,apiRequest:async()=>({items})});
 vm.runInContext(load+'\n'+refresh,context);
 return {ui,editor,context,setItems:value=>{items=value;},paints:()=>paints};
}
test('returning to create refreshes candidates without replacing the draft',async()=>{
 const f=setup();vm.runInContext('refreshHandoverView()',f.context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.ui.options[0].aircraftNo,'3243');
 assert.equal(f.ui.editor,f.editor);
 assert.equal(f.ui.editor.opportunities[0].note,'保留说明');
 assert.equal(f.ui.editor.otherItems,'保留事项');
 assert.equal(f.paints(),1);
 f.setItems([{id:'newer',aircraftNo:'B2345'}]);
 vm.runInContext('refreshHandoverView()',f.context);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.ui.options[0].aircraftNo,'B2345');
});
test('obsolete candidate responses are discarded after navigation',async()=>{
 const f=setup();vm.runInContext('refreshHandoverView()',f.context);f.ui.epoch++;
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.ui.options.length,0);assert.equal(f.paints(),0);
});
