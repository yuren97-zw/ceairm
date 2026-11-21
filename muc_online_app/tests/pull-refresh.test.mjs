import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
function setup(){
 const classes=new Set(['app-ready']),timers=[],handlers=new Map(),indicator={attributes:{},setAttribute(k,v){this.attributes[k]=v;}},label={textContent:''};let refreshes=0;
 const body={style:{setProperty(){}},classList:{contains:k=>classes.has(k),add:(...keys)=>keys.forEach(k=>classes.add(k)),remove:(...keys)=>keys.forEach(k=>classes.delete(k)),toggle(k,on){on?classes.add(k):classes.delete(k);}}};
 const context=vm.createContext({document:{body,querySelector:()=>null,addEventListener:(k,v)=>handlers.set(k,v)},window:{scrollY:0,clearTimeout(){},setTimeout:f=>{timers.push(f);return timers.length;}},$:id=>id==='#pullRefreshIndicator'?indicator:id==='#pullRefreshText'?label:null,isLoggedIn:()=>true,Element:class{},renderAll:async()=>{refreshes++;},alert:()=>{}});
 vm.runInContext(source.slice(source.indexOf('const pullRefreshGesture = {'),source.indexOf('const BOTTOM_NAV_PAGES ='))+'globalThis.gesture=pullRefreshGesture;',context);
 const touch=(x,y)=>({touches:[{clientX:x,clientY:y}],composedPath:()=>[],cancelable:true,preventDefault(){this.prevented=true;}});
 return {classes,context,indicator,label,timers,refreshes:()=>refreshes,start:()=>handlers.get('touchstart')(touch(100,100)),move:(x,y)=>{const e=touch(x,y);handlers.get('touchmove')(e);return e;},end:()=>handlers.get('touchend')(),cancel:()=>handlers.get('touchcancel')(),multi:()=>handlers.get('touchmove')({touches:[{},{}]})};
}
test('tap and small finger jitter never show or settle the refresh indicator',()=>{
 for(const jitter of [false,true]){const s=setup();s.start();if(jitter)assert.equal(s.move(102,104).prevented,undefined);s.end();assert.equal(s.classes.has('pull-refresh-settling'),false);assert.equal(s.classes.has('pull-refresh-tracking'),false);assert.equal(s.indicator.attributes['aria-hidden'],'true');assert.equal(s.refreshes(),0);assert.equal(s.timers.length,0);}
});
test('intentional downward drag shows prompt and crossing threshold refreshes once',async()=>{
 const s=setup();s.start();assert.equal(s.move(100,120).prevented,true);assert.equal(s.label.textContent,'下拉刷新');assert.equal(s.indicator.attributes['aria-hidden'],'false');s.move(100,180);assert.equal(s.label.textContent,'松开刷新');s.end();s.end();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.refreshes(),1);assert.equal(s.label.textContent,'刷新完成');assert.equal(s.classes.has('pull-refresh-settling'),true);
});
test('horizontal/upward drags and cancelled or multi-touch gestures do not refresh',()=>{
 for(const action of [s=>s.move(125,105),s=>s.move(100,80),s=>s.cancel(),s=>s.multi()]){const s=setup();s.start();action(s);s.end();assert.equal(s.refreshes(),0);assert.equal(s.classes.has('pull-refresh-tracking'),false);assert.equal(s.classes.has('pull-refresh-settling'),false);}
 const s=setup();s.start();s.move(100,135);s.end();assert.equal(s.refreshes(),0);assert.equal(s.classes.has('pull-refresh-settling'),true);while(s.timers.length)s.timers.shift()();assert.equal(s.classes.has('pull-refresh-settling'),false);assert.equal(s.indicator.attributes['aria-hidden'],'true');
});
