import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const start=source.indexOf('  const close = event.target.closest("[data-close]");');
const end=source.indexOf('  const more =',start);
assert.ok(start>=0&&end>start);
function click(id,target){const looked=[],closed=[];const context={event:{target:{closest:()=>id===null?null:{dataset:{close:id}}}},document:{getElementById(value){looked.push(value);return target;}},closeDialog:value=>closed.push(value)};vm.runInNewContext(source.slice(start,end),context);return {looked,closed};}
test('module-owned empty close controls do not reach global dialog handling',()=>{for(const id of [null,'',undefined])assert.deepEqual(click(id),{looked:[],closed:[]});});
test('named native dialogs still close using exact IDs without selector parsing',()=>{const dialog={id:'dialog:with.punctuation',tagName:'DIALOG'};assert.deepEqual(click(dialog.id,dialog),{looked:[dialog.id],closed:[dialog]});});
test('missing targets and non-dialog elements are ignored',()=>{for(const target of [null,{tagName:'DIV'}])assert.equal(click('not-a-dialog',target).closed.length,0);});
