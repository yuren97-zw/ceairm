import test from 'node:test';
import assert from 'node:assert/strict';
import {createActionTaskRealtimeClient} from '../public/action-task-realtime.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({unsupported=false,refresh:customRefresh}={}){
 let now=0,nextId=0,identity='a',reads=0,revoked=0;const timers=new Map(),sockets=[];
 const doc={hidden:false,listeners:new Map(),addEventListener(k,v){this.listeners.set(k,v);},removeEventListener(k){this.listeners.delete(k);}},win={...doc,listeners:new Map()};
 class Source{
  constructor(url){this.url=url;this.listeners=new Map();sockets.push(this);}
  addEventListener(k,v){this.listeners.set(k,v);}
  close(){this.closed=true;}
  emit(k){if(k==='open')this.onopen?.();else if(k==='error')this.onerror?.();else this.listeners.get(k)?.({data:'{}'});}
 }
 const later=(fn,delay,interval=0)=>{const id=++nextId;timers.set(id,{fn,due:now+delay,interval});return id;};
 const client=createActionTaskRealtimeClient({url:'/events',getIdentity:()=>identity,document:doc,window:win,EventSourceClass:unsupported?null:Source,clock:()=>now,random:()=>0,setTimeout:later,clearTimeout:id=>timers.delete(id),setInterval:(fn,n)=>later(fn,n,n),clearInterval:id=>timers.delete(id),refresh:async valid=>{reads++;return customRefresh?customRefresh(valid):true;},onAccessRevoked:()=>revoked++});
 async function advance(ms){const end=now+ms;while(true){const entry=[...timers].filter(([,t])=>t.due<=end).sort((a,b)=>a[1].due-b[1].due)[0];if(!entry)break;const [id,t]=entry;now=t.due;if(t.interval)t.due+=t.interval;else timers.delete(id);t.fn();await flush();}now=end;await flush();}
 return {client,doc,win,sockets,advance,setIdentity:id=>identity=id,get reads(){return reads;},get revoked(){return revoked;},get timers(){return timers.size;}};
}
test('bursts coalesce; healthy streams avoid count polling; reconnect always refreshes missed changes',async()=>{
 const f=fixture();f.client.start();f.client.start();assert.equal(f.sockets.length,1);f.sockets[0].emit('open');for(let i=0;i<20;i++)f.sockets[0].emit('tasks');await f.advance(60);assert.equal(f.reads,1);
 await f.advance(25000);f.sockets[0].emit('ping');await f.advance(25000);f.sockets[0].emit('ping');assert.equal(f.reads,1);
 f.sockets[0].emit('error');assert.equal(f.client.connected,false);await f.advance(3000);assert.equal(f.sockets.length,2);f.sockets[1].emit('open');await f.advance(60);assert.equal(f.reads,2);f.client.destroy();assert.equal(f.timers,0);
});
test('hidden/logout/identity switches close streams; late old events cannot refresh a new account',async()=>{
 const f=fixture();f.client.start();const old=f.sockets[0];old.emit('open');f.setIdentity('b');f.client.start();old.emit('tasks');await f.advance(60);assert.equal(f.reads,0);
 f.sockets[1].emit('open');await f.advance(60);assert.equal(f.reads,1);f.doc.hidden=true;f.doc.listeners.get('visibilitychange')();assert.equal(f.timers,0);assert.equal(f.client.connected,false);
 f.doc.hidden=false;f.doc.listeners.get('visibilitychange')();f.sockets.at(-1).emit('open');await f.advance(60);assert.equal(f.reads,2);f.setIdentity(null);f.client.start();assert.equal(f.timers,0);f.client.destroy();
});
test('unsupported EventSource falls back to polling and transient HTTP failures retry even with a healthy stream',async()=>{
 const old=fixture({unsupported:true});old.client.start();await old.advance(60);assert.equal(old.reads,1);await old.advance(30000);assert.equal(old.reads,2);old.client.destroy();
 let success=false;const f=fixture({refresh:()=>success});f.client.start();f.sockets[0].emit('open');await f.advance(60);assert.equal(f.reads,1);success=true;f.sockets[0].emit('ping');await f.advance(30000);assert.equal(f.reads,2);f.client.destroy();
});
test('revoked access clears the connection, while changes during an in-flight read produce one follow-up',async()=>{
 let finish;const f=fixture({refresh:()=>new Promise(resolve=>finish=resolve)});f.client.start();f.sockets[0].emit('open');await f.advance(60);f.sockets[0].emit('tasks');await f.advance(60);assert.equal(f.reads,1);finish(true);await flush();await f.advance(60);assert.equal(f.reads,2);
 f.sockets[0].emit('access-revoked');assert.equal(f.revoked,1);assert.equal(f.client.connected,false);finish(true);await flush();assert.equal(f.timers,0);f.client.destroy();
});
