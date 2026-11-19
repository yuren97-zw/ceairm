import assert from 'node:assert/strict';
import test from 'node:test';
import { standardCandidatePickerHtml, openStandardCandidatePicker } from '../public/maintenance-standard-picker.mjs';
const escape = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const original = { title:'<原工作>',category:'单项工作',chapter:'29',reportExplanation:'原范围\n完整文本' };
const candidates = [{id:'std-one',version:3,title:'<候选>',category:'单项工作',chapter:'29',workScope:'候选范围\n全部显示',aircraftCodes:['A320'],standardHours:1.2}];

test('candidate drawer renders complete scope, aircraft and version with no automatic selection', () => {
  const html = standardCandidatePickerHtml({ title:'选择标准',original,candidates,escapeHtml:escape });
  assert.match(html,/&lt;原工作>/); assert.match(html,/&lt;候选>/);
  assert.ok(html.includes('候选范围\n全部显示'));
  assert.match(html,/A320 · 1.2小时 · V3/);
  assert.ok(!html.includes(' checked'));
  assert.match(html,/data-standard-picker-confirm disabled/);
});

test('drawer matches parent width, retains context on failure and restores focus after confirmed selection', async t => {
  const beforeDocument = globalThis.document, beforeWindow = globalThis.window;
  t.after(() => { globalThis.document = beforeDocument; globalThis.window = beforeWindow; });
  const listeners = {}, confirm = {}, message = {}, radio = {};
  let removed = false, focused = false, opened = false, accepted = false, expectedVersion=3;
  const opener = { isConnected:true,focus(){focused=true;} };
  const dialog = {
    style:{},setAttribute(){},innerHTML:'',
    addEventListener(name,callback){listeners[name]=callback;},
    querySelector(selector){return selector==='[data-standard-picker-confirm]'?confirm:message;},
    querySelectorAll(){return [confirm,radio];},
    showModal(){opened=true;},close(){listeners.close();},remove(){removed=true;},
    getBoundingClientRect(){return {left:0,right:390,top:100,bottom:700};}
  };
  globalThis.window={innerWidth:390};
  globalThis.document={activeElement:opener,createElement:()=>dialog,body:{append(){}}};
  const picker=openStandardCandidatePicker({parent:{getBoundingClientRect:()=>({width:550})},original,candidates,escapeHtml:escape,onSelect:async standard=>{assert.equal(standard.version,expectedVersion);return accepted;}});
  assert.equal(dialog.style.width,'390px'); assert.equal(opened,true);
  listeners.change({target:{name:'standard-candidate',value:'0'}});
  assert.equal(confirm.disabled,false);
  const event={target:{closest:selector=>selector==='[data-standard-picker-confirm]'?{}:null}};
  await listeners.click(event);
  assert.equal(removed,false); assert.match(message.textContent,/选择未保存/);
  expectedVersion=4;picker.setCandidates([{...candidates[0],version:4}]);assert.equal(confirm.disabled,true);
  listeners.change({target:{name:'standard-candidate',value:'0'}});accepted=true; await listeners.click(event);
  assert.equal(removed,true); assert.equal(focused,true);
});
