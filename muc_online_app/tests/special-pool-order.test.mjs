import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {specialPoolDropIndex} from '../capability-ui/special-pool-order.js';
const people=['s1','u1','s2','u2','s3'].map(id=>({id}));
function drop(source,anchor,after){const list=people.filter(p=>p.id!==source);list.splice(specialPoolDropIndex(people,source,anchor,after),0,{id:source});return list.map(p=>p.id);}
test('special pool horizontal insertion maps full unassigned indices and preserves other-pool order',()=>{
  assert.deepEqual(drop('s3','s1',false),['s3','s1','u1','s2','u2']);
  assert.deepEqual(drop('s1','s3',true),['u1','s2','u2','s3','s1']);
  assert.deepEqual(drop('s1','s2',true),['u1','s2','s1','u2','s3']);
  for(const [s,a,after] of [['s3','s1',false],['s1','s3',true],['s1','s2',true]])assert.deepEqual(drop(s,a,after).filter(id=>id.startsWith('u')),['u1','u2']);
  // s2 may be hidden by capability filtering; anchor still uses full list.
  assert.equal(specialPoolDropIndex(people,'s1','s3',false),3);
  assert.equal(specialPoolDropIndex(people,'s1','missing',true),null);
});
const source=await fs.readFile(new URL('../capability-ui/StaffPersonCard.jsx',import.meta.url),'utf8');
function hover(dragged=null){let value=null,time=0,seq=0;const timers=new Map();
 const context=vm.createContext({useState:()=>[null,v=>{value=v;}],useRef:()=>({current:null}),useEffect:fn=>{fn();},window:{innerWidth:1000,innerHeight:800,setTimeout:(fn,ms)=>{timers.set(++seq,{fn,at:time+ms});return seq;},clearTimeout:id=>timers.delete(id)},PERSON_HOVER_DELAY_MS:800});
 const start=source.indexOf('export function usePersonHover('),end=source.indexOf('\n}',start)+2;vm.runInContext(source.slice(start,end).replace('export ',''),context);
 return {api:context.usePersonHover(dragged),value:()=>value,tick:ms=>{time+=ms;for(const [id,t] of [...timers])if(t.at<=time){timers.delete(id);t.fn();}}};
}
const event={currentTarget:{getBoundingClientRect:()=>({left:10,right:90,top:100})}};
test('mouse hover waits 800ms, switching restarts delay, departure and drag cancel',()=>{
  assert.match(source,/PERSON_HOVER_DELAY_MS = 800/);
  const h=hover();h.api.open(event,{id:'a'});h.tick(799);assert.equal(h.value(),null);h.tick(1);assert.equal(h.value().person.id,'a');
  h.api.open(event,{id:'b'});h.tick(500);h.api.open(event,{id:'c'});h.tick(799);assert.equal(h.value().person.id,'a');h.tick(1);assert.equal(h.value().person.id,'c');
  h.api.closeNow();h.api.open(event,{id:'d'});h.api.closeLater();h.tick(1000);assert.equal(h.value(),null);
  h.api.open(event,{id:'e'});h.api.closeNow();h.tick(1000);assert.equal(h.value(),null);
  const drag=hover({id:'drag'});drag.api.open(event,{id:'a'});drag.tick(1000);assert.equal(drag.value(),null);
});
test('sandbox cards never auto-open on pointer or focus; explicit activation and drag remain',()=>{
  const card=source.slice(source.indexOf('export function StaffPersonCard'),source.indexOf('export function PersonHoverDetail'));
  assert.doesNotMatch(card,/on(?:MouseEnter|PointerEnter|PointerLeave|Focus|Blur)=/);
  assert.match(card,/onClick=\{\(\) => onOpen\(person\)\}/);
  assert.match(card,/onDragStart=/);assert.match(card,/type="button"/);
});
