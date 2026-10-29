import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
function harness(apiRequest,overrides={}){
  const nodes=new Map(),events=new Map();let renders=0;
  const node=()=>({style:{},children:[],append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},after(bar){nodes.set('#infoSyncBar',bar);}});
  nodes.set('#resultStatus',node());
  const context=vm.createContext({state:{user:{id:'reader'},activePage:'infoPage',activeSubpage:'infoListSubpage',records:[],receipts:[]},
    $:id=>nodes.get(id),apiRequest,isLoggedIn:()=>true,hasRbac:()=>true,enrichRecord:r=>r,
    document:{hidden:false,createElement:node,createTextNode:t=>t,querySelectorAll:()=>[],querySelector:()=>null,addEventListener:(name,handler)=>events.set(name,handler)},
    window:{scrollY:0,scrollX:0,scrollTo(){},addEventListener(){}},CSS:{escape:x=>x},
    renderRecords:()=>renders++,renderHome(){},renderStats(){},isAuthExpired:()=>false,handleAuthExpired(){},
    setInterval,clearInterval,setTimeout,clearTimeout,queueMicrotask,API_BASE_URL:'/api',...overrides});
  vm.runInContext(source.slice(source.indexOf('const infoRealtime='),source.indexOf('\nconst receiptService =')),context);
  vm.runInContext('globalThis.infoTest={infoRealtime,syncInformation,stopInfoSync,startInfoSync,infoSyncStatus};',context);
  return {context,nodes,events,api:context.infoTest,renders:()=>renders};
}
const empty=()=>({cursor:'next',reset:false,records:[],receipts:[],updates:[],removed:[]});
test('normal sync has no row or manual link; errors and new information remain visible',()=>{
  const h=harness(async()=>empty());
  for(const status of ['实时同步','自动同步','连接中'])h.api.infoSyncStatus(status);
  assert.equal(h.nodes.has('#infoSyncBar'),false);
  h.api.infoSyncStatus('连接中断，自动重试');const bar=h.nodes.get('#infoSyncBar');
  assert.equal(bar.hidden,false);assert.equal(bar.style.display,'flex');assert.equal(bar.children.length,1);
  h.api.infoSyncStatus('实时同步');assert.equal(bar.hidden,true);assert.equal(bar.style.display,'none');assert.equal(bar.children.length,0);
  h.api.infoRealtime.newIds.add('new');h.api.infoSyncStatus('实时同步');
  assert.equal(bar.hidden,false);assert.equal(bar.children.length,1);assert.equal(bar.children[0].textContent,'有 1 条新信息');
  bar.children[0].onclick();assert.equal(h.api.infoRealtime.newIds.size,0);assert.equal(bar.hidden,true);
});
test('information UI has one in-flight sync and coalesces follow-up requests',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r);
  const h=harness(async()=>{calls++;return calls===1?gate:empty();});
  const first=h.api.syncInformation();await h.api.syncInformation();await h.api.syncInformation();assert.equal(calls,1);
  release(empty());await first;await new Promise(r=>setImmediate(r));assert.equal(calls,2);
});
test('open drafts defer refresh and a draft opened during loading is never replaced',async()=>{
  let release,calls=0;const gate=new Promise(r=>release=r),h=harness(async()=>{calls++;return gate;});
  h.nodes.set('#entryDialog',{open:true});await h.api.syncInformation();assert.equal(calls,0);assert.equal(h.api.infoRealtime.deferred,true);
  h.nodes.get('#entryDialog').open=false;const loading=h.api.syncInformation();h.nodes.get('#entryDialog').open=true;
  release({...empty(),records:[{id:'new',date:'2026-10-09'}]});await loading;assert.equal(h.context.state.records.length,0);assert.equal(h.renders(),0);
});
test('account/page epoch changes discard stale responses and new information does not jump the reader',async()=>{
  let release;const h=harness(()=>new Promise(r=>release=r));const loading=h.api.syncInformation();h.api.stopInfoSync();
  release({...empty(),records:[{id:'stale'}]});await loading;assert.equal(h.context.state.records.length,0);
  const reader=harness(async()=>({...empty(),records:[{id:'new',date:'2026-10-09'}]}));reader.context.window.scrollY=300;
  await reader.api.syncInformation();assert.equal(reader.api.infoRealtime.newIds.has('new'),true);
});

test('publication preempts receipt coalescing instead of waiting two seconds',()=>{
  const timers=new Map();let sequence=0;
  class Source{listeners=new Map();addEventListener(name,callback){this.listeners.set(name,callback);}close(){}}
  const h=harness(async()=>empty(),{EventSource:Source,setInterval:()=>99,clearInterval:()=>{},setTimeout:(callback,ms)=>{const id=++sequence;timers.set(id,{callback,ms});return id;},clearTimeout:id=>timers.delete(id)});
  h.api.startInfoSync();const source=h.api.infoRealtime.source;
  source.listeners.get('info')({data:JSON.stringify({kind:'receipt'})});assert.equal([...timers.values()][0].ms,2000);
  source.listeners.get('info')({data:JSON.stringify({kind:'content'})});assert.equal(timers.size,1);assert.equal([...timers.values()][0].ms,50);
  h.api.stopInfoSync();
});
