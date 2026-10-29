import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatchImportIdentity,dispatchImportAssignments} from '../maintenance-dispatch-import.mjs';
const people=[{id:'a',name:'张三',employeeNo:'1'},{id:'b',name:'李四',employeeNo:'2'},{id:'c',name:'王五',employeeNo:'3'}];
test('dispatch import strictly parses each opportunity including postflight slash format',()=>{
  assert.equal(dispatchImportIdentity({date:'2026-10-09',workKind:'短停',flightNo:' mu1/mu2 '}).departure,'MU2');
  assert.equal(dispatchImportIdentity({date:'2026-10-09',workKind:'航前',flightNo:'/MU2'}).departure,'MU2');
  assert.equal(dispatchImportIdentity({date:'2026-10-09',workKind:'航后',flightNo:'/MU1'}).arrival,'MU1');
  for(const flightNo of ['MU1','MU1/','/MU2','MU1/MU2/MU3'])assert.throws(()=>dispatchImportIdentity({date:'2026-10-09',workKind:'短停',flightNo}));
  assert.throws(()=>dispatchImportIdentity({date:'2026-02-30',workKind:'航后',flightNo:'MU1'}));
});
test('release and mechanic columns remain separate and generate exact roles',()=>{
  const expected={'短停':[['放行','例行检查','接机','送机'],['接机','送机']],'航前':[['放行','例行检查'],['勤务','送机']],'航后':[['放行','例行机外','例行发动机','例行L/G','接机'],['接机','勤务','例行机内','例行电子']]};
  for(const [workKind,[release,mechanic]] of Object.entries(expected)){
    const rows=dispatchImportAssignments({workKind,releaseNames:'张三',mechanicNames:'李四,王五,李四'},people);
    assert.deepEqual(rows.filter(r=>r.personId==='a').map(r=>r.role),release);
    for(const id of ['b','c'])assert.deepEqual(rows.filter(r=>r.personId===id).map(r=>r.role),mechanic);
  }
});
test('release person also entered as a mechanic has no duplicate person-role pairs',()=>{
  for(const workKind of ['短停','航前','航后']) {
    const result=dispatchImportAssignments({workKind,releaseNames:'张三',mechanicNames:'张三,张三,李四'},people);
    assert.equal(new Set(result.map(a=>`${a.personId}:${a.role}`)).size,result.length);
    assert.equal(result.filter(a=>a.role==='放行').length,1);
  }
});
test('missing release, ambiguity, mismatched optional numbers and out of scope names fail',()=>{
  const raw={workKind:'短停',releaseNames:'张三',mechanicNames:'李四'};
  for(const change of [{releaseNames:''},{releaseNames:'张三,李四'},{mechanicNames:'不存在'},{mechanicNumbers:'3'},{mechanicNumbers:'2,3'}])assert.throws(()=>dispatchImportAssignments({...raw,...change},people));
  const same=[...people,{id:'d',name:'李四',employeeNo:'4'}];
  assert.throws(()=>dispatchImportAssignments(raw,same),/同名/);
  assert.equal(dispatchImportAssignments({...raw,mechanicNumbers:'2'},same).filter(r=>r.personId==='b').length,2);
});
