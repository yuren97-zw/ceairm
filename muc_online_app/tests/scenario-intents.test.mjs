import test from 'node:test';
import assert from 'node:assert/strict';
import {scenarioIntents,scenarioMoveSteps} from '../scenario-intents.mjs';
const person=(id,group,index)=>({personId:id,workingGroup:group,index,status:'ON_DUTY'});
function apply(current,steps){const states=structuredClone(current);for(const step of steps){const p=states.find(s=>s.personId===step.personId),lane=states.filter(s=>s.status==='ON_DUTY'&&s.workingGroup===step.targetGroup&&s!==p).sort((a,b)=>a.index-b.index||a.personId.localeCompare(b.personId));p.workingGroup=step.targetGroup;lane.splice(step.targetIndex,0,p);lane.forEach((s,index)=>{s.index=index;});}return states;}
const order=(states,g)=>states.filter(s=>s.workingGroup===g).sort((a,b)=>a.index-b.index||a.personId.localeCompare(b.personId)).map(s=>s.personId);
test('sparse index renumbering never includes an untouched neighbour',()=>{
  const before=[person('a','一组',0),person('untouched','一组',31),person('qa',null,32)];
  const desired=[person('a','一组',0),person('untouched','一组',1),person('qa','一组',2)];
  for(const ids of [undefined,['qa']])assert.deepEqual(scenarioIntents(before,desired,ids),[{personId:'qa',targetGroup:'一组',targetIndex:2}]);
  assert.deepEqual(scenarioIntents(before,before.map(s=>({...s,index:s.index+20})),[]),[]);
});
test('same-lane explicit reorder preserves actor identity and prunes a move reverted to origin',()=>{
  const before=['a','b','c'].map((id,i)=>person(id,null,i));
  const desired=['b','a','c'].map((id,i)=>person(id,null,i));
  assert.deepEqual(scenarioIntents(before,desired,['b']),[{personId:'b',targetGroup:null,targetIndex:0}]);
  assert.deepEqual(scenarioIntents(before,before,['b']),[]);
  assert.throws(()=>scenarioIntents(before,desired,[]),error=>error.status===400);
  assert.throws(()=>scenarioIntents(before,desired,['missing']),error=>error.status===400);
  assert.equal(scenarioIntents(before,desired).length,1);
});
test('all permutations with any explicit moved subset retain intended and untouched order',()=>{
  function permutations(list){return list.length?list.flatMap((id,i)=>permutations(list.filter((_,j)=>i!==j)).map(rest=>[id,...rest])):[[]];}
  const ids=['a','b','c','d'],before=ids.map((id,i)=>person(id,null,i*10));
  for(const target of permutations(ids))for(let mask=0;mask<16;mask++){
    const moved=ids.filter((_,i)=>mask&(1<<i));
    if(ids.filter(id=>!moved.includes(id)).join()!==target.filter(id=>!moved.includes(id)).join())continue;
    const desired=target.map((id,i)=>person(id,null,i)),intents=scenarioIntents(before,desired,moved),steps=scenarioMoveSteps(before,intents);
    assert.deepEqual(order(apply(before,steps),null),target);
    assert.ok(steps.every(step=>moved.includes(step.personId)));
  }
  for(const target of permutations(ids)){
    const desired=target.map((id,i)=>person(id,null,i));
    assert.deepEqual(order(apply(before,scenarioMoveSteps(before,scenarioIntents(before,desired))),null),target);
  }
});
test('cross-lane moves remove outgoing people without displacing unaffected neighbours',()=>{
  const before=[person('a','一组',0),person('b','一组',1),person('c','一组',2),person('d','二组',0),person('e','二组',1)];
  const desired=[person('a','二组',1),person('b','一组',0),person('c','一组',2),person('d','一组',1),person('e','二组',0)];
  const intents=scenarioIntents(before,desired,['a','d']),steps=scenarioMoveSteps(before,intents),result=apply(before,steps);
  for(const group of ['一组','二组'])assert.deepEqual(order(result,group),order(desired,group));
  assert.deepEqual(new Set(steps.map(s=>s.personId)),new Set(['a','d']));
});
