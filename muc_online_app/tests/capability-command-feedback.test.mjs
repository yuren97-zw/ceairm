import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
function commandContext(request){const errors=[],reloads=[],generalErrors=[];const context=vm.createContext({commandEpoch:{current:0},busyRef:{current:false},snapshotRef:{current:{revision:4,masterDataVersion:2}},lastCommandErrorRef:{current:''},space:'test',createRequestId:()=> 'test',setBusy:()=>{},setError:value=>generalErrors.push(value),setCommandError:value=>errors.push(value),request,reload:async version=>{reloads.push(version);}});const start=source.indexOf('  async function command('),end=source.indexOf('\n  if(!snap)',start);vm.runInContext(source.slice(start,end),context);return {context,errors,reloads,generalErrors};}
test('saving/deleting forces a snapshot even if personnel revision is unchanged',async()=>{
  for(const operation of ['saveScenario','deleteScenario']){const c=commandContext(async()=>({ok:true,revision:4}));assert.equal((await c.context.command(operation)).ok,true);assert.deepEqual(c.reloads,[null]);}
  const c=commandContext(async()=>({ok:true,revision:5}));await c.context.command('move');assert.equal(c.reloads[0].revision,5);
});
test('conflict refresh preserves rejection and modal displays it without losing the form',async()=>{
  const c=commandContext(async()=>{throw Object.assign(new Error('人员状态重叠'),{status:409});});
  assert.equal(await c.context.command('status'),false);assert.deepEqual(c.errors,['','人员状态重叠']);assert.equal(c.reloads.length,1);assert.equal(c.context.busyRef.current,false);
  const callback=source.slice(source.indexOf('onSnapshot:result=>'),source.indexOf('refreshRef.current={workspace:space'));
  assert.ok(!callback.includes("setError('')"));
  assert.match(source,/const commandError=React.useContext\(CommandErrorContext\)/);
  assert.match(source,/commandError&&<div className="error" role="alert">\{commandError\}/);
});
test('new or closed modal clears only the previous operation error, not connection errors',()=>{
  const c=commandContext(async()=>({ok:true}));let modal;
  c.context.updateModal=value=>{modal=value;};
  const start=source.indexOf('  function setModal('),end=source.indexOf('\n',start);
  vm.runInContext(source.slice(start,end),c.context);
  c.context.lastCommandErrorRef.current='旧日期错误';
  c.context.setModal({type:'status',kind:'OTHER'});
  assert.equal(modal.kind,'OTHER');assert.deepEqual(c.errors,['']);assert.deepEqual(c.generalErrors,[]);
  assert.equal(c.context.lastCommandErrorRef.current,'');
  c.context.setModal(null);assert.equal(modal,null);assert.equal(c.context.commandEpoch.current,2);
});
test('late rejection from an abandoned operation cannot contaminate a new form',async()=>{
  let reject;const c=commandContext(()=>new Promise((_,no)=>{reject=no;}));
  const pending=c.context.command('status');c.context.commandEpoch.current++;
  reject(Object.assign(new Error('旧请求错误'),{status:409}));
  assert.equal(await pending,false);assert.deepEqual(c.errors,['']);assert.equal(c.reloads.length,1);
  assert.equal(c.context.lastCommandErrorRef.current,'');
});
test('simulation undo keeps explicit identities and referenced directories only offer one disable action',()=>{
  assert.match(source,/setUndo\(u=>\[\.\.\.u,clone\(sim\)\]\)/);
  assert.match(source,/setSim\(previous\)/);
  assert.match(source,/disabled=\{busy\|\|item.referenceCount>0\}/);
  assert.ok(!source.includes("{item.referenceCount?'停用':'删除'}"));
});
