import test from 'node:test';
import assert from 'node:assert/strict';
import {allocationArea,allocationTarget,SPECIAL_AREA} from '../allocation-areas.mjs';
import {scenarioIntents,scenarioMoveSteps} from '../scenario-intents.mjs';
import {GROUPS,calculate,normalizeConfig} from '../capability-core.mjs';
import fs from 'node:fs';

test('all six work areas can exchange people without changing administrative identity',()=>{
  const areas=[...GROUPS,SPECIAL_AREA,null];
  for(const from of areas)for(const to of areas){
    const a=allocationTarget(from),b=allocationTarget(to);
    const before=[{personId:'p',status:'ON_DUTY',administrativeGroup:'一组',workingGroup:a.targetGroup,allocationPool:a.targetPool||'WAITING',index:0}];
    const after=[{...before[0],workingGroup:b.targetGroup,allocationPool:b.targetPool||before[0].allocationPool}];
    const intents=scenarioIntents(before,after,['p']);
    assert.equal(intents.length,from===to?0:1);
    if(intents.length){const [step]=scenarioMoveSteps(before,intents);assert.equal(allocationArea({workingGroup:step.targetGroup,allocationPool:step.targetPool}),to);}
    assert.equal(after[0].administrativeGroup,'一组');
  }
});

test('pool membership does not count as four-group production or change administrative capabilities',()=>{
  const people=[{id:'p',administrativeGroup:'一组',capabilities:[]}],config=normalizeConfig([],{});
  for(const allocationPool of ['SPECIAL','WAITING']){
    const model=calculate(people,[],[{personId:'p',status:'ON_DUTY',workingGroup:null,allocationPool}],config);
    assert.equal(model.stats['一组'].administrative.length,1);
    assert.equal(GROUPS.reduce((n,g)=>n+model.stats[g].actual.length,0),0);
  }
});

test('UI routes both pools independently, accepts all on-duty origins, and previews pool-only moves',()=>{
  const source=fs.readFileSync(new URL('../capability-ui/Center.jsx',import.meta.url),'utf8');
  assert.match(source,/specialRows=rowsFor\(SPECIAL_AREA\)/);
  assert.match(source,/unassignedRows=rowsFor\(null\)/);
  assert.doesNotMatch(source,/drag\?\.personnelGroupCode===SPECIAL_GROUP_CODE/);
  assert.match(source,/move\(drag,SPECIAL_AREA\)/);
  assert.match(source,/\.\.\.allocationTarget\(target\)/);
  assert.match(source,/\[\.\.\.GROUPS,SPECIAL_AREA,null\]\.filter/);
  assert.match(source,/states.filter\(s=>allocationArea\(s\)!==allocationArea/);
});
