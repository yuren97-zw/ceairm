import {allocationArea,allocationTarget} from './allocation-areas.mjs';

// A lane's raw indexes may be sparse. Only explicit moves or changes in relative
// order are intentions; renumbering an unchanged neighbour is not a move.
export function scenarioIntents(baseline, desired, movedPersonIds) {
  const invalid=message=>Object.assign(new Error(message),{status:400});
  const before = new Map(baseline.map(s => [s.personId, s]));
  const after = new Map(desired.map(s => [s.personId, s]));
  const lane = (states, group) => states.filter(s => s.status === 'ON_DUTY' && allocationArea(s) === group)
    .sort((a,b) => a.index-b.index || a.personId.localeCompare(b.personId)).map(s => s.personId);
  const changedGroup = new Set(desired.filter(s => before.get(s.personId)?.status === 'ON_DUTY' && s.status === 'ON_DUTY' && allocationArea(before.get(s.personId)) !== allocationArea(s)).map(s => s.personId));
  const groups = new Set([...baseline, ...desired].map(allocationArea));
  const selected = new Set(changedGroup);
  if (movedPersonIds !== undefined && (!Array.isArray(movedPersonIds) || movedPersonIds.some(id => typeof id !== 'string' || !before.has(id) || !after.has(id)))) throw invalid('方案调配意向无效');
  for (const group of groups) {
    const a = lane(baseline, group).filter(id => !changedGroup.has(id));
    const b = lane(desired, group).filter(id => !changedGroup.has(id));
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (movedPersonIds !== undefined) {
      const explicit = new Set(movedPersonIds);
      // Every inversion must be explained by at least one explicitly moved card.
      if (JSON.stringify(a.filter(id => !explicit.has(id))) !== JSON.stringify(b.filter(id => !explicit.has(id)))) throw invalid('方案顺序变化缺少明确调配人员，请重新载入后调整');
      for (const id of a.filter(id => explicit.has(id))) {
        if (a.some(peer => peer !== id && (a.indexOf(peer) < a.indexOf(id)) !== (b.indexOf(peer) < b.indexOf(id)))) selected.add(id);
      }
    } else {
      // Legacy plans have no action identities: infer the minimum changed set
      // from a stable longest common subsequence, never from numeric indexes.
      const dp = Array.from({length:a.length+1}, () => Array(b.length+1).fill(0));
      for(let i=a.length-1;i>=0;i--) for(let j=b.length-1;j>=0;j--) dp[i][j]=a[i]===b[j]?1+dp[i+1][j+1]:Math.max(dp[i+1][j],dp[i][j+1]);
      const stable=new Set();let i=0,j=0;
      while(i<a.length && j<b.length){if(a[i]===b[j]){stable.add(a[i]);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}
      for(const id of b) if(!stable.has(id)) selected.add(id);
    }
  }
  return desired.filter(s => selected.has(s.personId)).map(s => ({personId:s.personId,targetGroup:s.workingGroup ?? null,targetIndex:lane(desired,allocationArea(s)).indexOf(s.personId),...(s.allocationPool!==undefined?{targetPool:s.allocationPool}:{})}));
}

// Build final lanes without intended people first, then use the next card as
// an insertion anchor. Absolute moves alone fail when another mover leaves a lane.
export function scenarioMoveSteps(current, intents) {
  const ids=new Set(intents.map(item=>item.personId));
  const groups=new Set([...current.map(allocationArea),...intents.map(s=>allocationArea({workingGroup:s.targetGroup,allocationPool:s.targetPool}))]);
  const live=new Map([...groups].map(group=>[group,current.filter(s=>s.status==='ON_DUTY'&&allocationArea(s)===group).sort((a,b)=>a.index-b.index||a.personId.localeCompare(b.personId)).map(s=>s.personId)]));
  const final=new Map([...live].map(([group,list])=>[group,list.filter(id=>!ids.has(id))]));
  for(const group of groups)for(const item of intents.filter(s=>allocationArea({workingGroup:s.targetGroup,allocationPool:s.targetPool})===group).sort((a,b)=>a.targetIndex-b.targetIndex||a.personId.localeCompare(b.personId)))final.get(group).splice(Math.min(item.targetIndex,final.get(group).length),0,item.personId);
  const steps=[];
  for(const [group,list] of final)for(let i=list.length-1;i>=0;i--){
    const id=list[i];if(!ids.has(id))continue;
    const source=[...live.values()].find(lane=>lane.includes(id));
    const prior=source?.indexOf(id);source?.splice(prior,1);
    const target=live.get(group),anchor=list[i+1],index=anchor===undefined?target.length:target.indexOf(anchor);
    if(index<0)throw new Error('方案顺序锚点无效');
    target.splice(index,0,id);const intent=intents.find(item=>item.personId===id),destination=allocationTarget(group);steps.push({personId:id,targetGroup:destination.targetGroup,targetIndex:index,...(intent.targetPool!==undefined?{targetPool:intent.targetPool}:{})});
  }
  return steps;
}
