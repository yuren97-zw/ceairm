import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
function load(ctx, name) {
  const start = source.indexOf(`function ${name}(`);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
const ctx = vm.createContext({});
load(ctx, 'maintenancePickerFitNames');
const measure = text => [...text].reduce((sum, char) => sum + (/[^\x00-\xff]/.test(char) ? 11 : 6), 0);
const fit = (names, width) => JSON.parse(JSON.stringify(ctx.maintenancePickerFitNames(names, width, measure)));
test('empty and single-person names, including an overlong first name', () => {
  assert.deepEqual(fit([], 100), {text:'未分配',suffix:''});
  assert.deepEqual(fit(['王伟'], 100), {text:'王伟',suffix:''});
  assert.deepEqual(fit(['非常长的完整姓名'], 20), {text:'非常长的完整姓名',suffix:''});
});
test('show the maximum complete names in original order, reserving count width', () => {
  const names = ['王伟','赵威','陈彦杰'];
  assert.deepEqual(fit(names, 100), {text:'王伟、赵威、陈彦杰',suffix:''});
  assert.deepEqual(fit(names, 70), {text:'王伟、赵威',suffix:'+1'});
  assert.deepEqual(fit(names, 50), {text:'王伟',suffix:'+2'});
  assert.deepEqual(fit(names, 20), {text:'王伟',suffix:'+2'});
  assert.deepEqual(fit(['王伟','赵威'], 40), {text:'王伟',suffix:'+1'});
});
test('multi-digit counts, variable length names and repeated width changes', () => {
  const names = ['Alexandria', ...Array.from({length:12},(_,i)=>`人员${i}`)];
  for (const width of [25,80,140,280,70,500,80]) {
    const result = fit(names,width);
    const hidden = result.suffix ? Number(result.suffix.slice(1)) : 0;
    const shown = names.length-hidden;
    assert.equal(result.text,names.slice(0,shown).join('、'));
    if (shown>1 || measure(result.text+result.suffix)<=width) assert.ok(measure(result.text+result.suffix)<=width);
    if(hidden && shown<names.length-1) assert.ok(measure(names.slice(0,shown+1).join('、')+`+${hidden-1}`)>width);
  }
  assert.equal(fit(names,25).suffix,'+12');
});
test('one shared observer handles renders, hidden dialogs, font events and cleanup', async () => {
  let callback, observers=0, reads=0, fontDone;
  const frames=[]; const targets=[]; const observed=new Set();
  const probe={style:{},setAttribute(){},getBoundingClientRect(){reads++;return {width:measure(this.textContent)};}};
  const sandbox=vm.createContext({
    Set, JSON, ResizeObserver:class {constructor(cb){observers++;callback=cb;} observe(t){observed.add(t);} unobserve(t){observed.delete(t);}},
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},
    getComputedStyle:()=>({font:'11px sans-serif',letterSpacing:'normal'}),
    document:{createElement:()=>probe,body:{append(){}},querySelectorAll:()=>targets,fonts:{ready:Promise.resolve(),addEventListener:(event,fn)=>{assert.equal(event,'loadingdone');fontDone=fn;}}}
  });
  load(sandbox,'maintenancePickerFitNames');load(sandbox,'syncMaintenancePickerNames');
  const makeTarget=width=>({width,isConnected:true,dataset:{maintPickerNames:JSON.stringify(['王伟','赵威','陈彦杰'])},text:{},count:{},getBoundingClientRect(){return {width:this.width};},querySelector(selector){return selector.includes('name-text')?this.text:this.count;}});
  const target=makeTarget(0);targets.push(target);
  sandbox.syncMaintenancePickerNames();await Promise.resolve();while(frames.length)frames.shift()();assert.equal(reads,0);
  target.width=70;callback();while(frames.length)frames.shift()();assert.equal(target.text.textContent,'王伟、赵威');assert.equal(target.count.textContent,'+1');
  target.width=40;callback();while(frames.length)frames.shift()();assert.equal(target.count.textContent,'+2');
  target.width=100;fontDone();while(frames.length)frames.shift()();assert.equal(target.count.textContent,'');
  target.isConnected=false;targets.splice(0,1,makeTarget(50));sandbox.syncMaintenancePickerNames();while(frames.length)frames.shift()();
  assert.equal(observers,1);assert.equal(observed.has(target),false);assert.equal(observed.size,1);
});
