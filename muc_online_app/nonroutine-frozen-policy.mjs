import {NONROUTINE_CATEGORY_STRATEGIES} from './maintenance-standards.mjs';
const roleOrder=['主做','检验','辅助'];
const combination=roles=>roleOrder.filter(role=>roles.includes(role)).join('+');

// Business policy: an in-flight review uses the submission snapshot. Never read
// current configuration to fill a missing historical combination.
export function frozenNonroutineFinalPolicy(item,category,participants){
 let frozen;
 try { frozen=JSON.parse(item.policy_json); } catch { throw Object.assign(new Error('原提报分配快照无法解析，请核对历史来源'),{status:409}); }
 if(!frozen||typeof frozen!=='object'||Array.isArray(frozen))throw Object.assign(new Error('原提报分配快照缺失，请核对历史来源'),{status:409});
 if(!['ROLE_COMBINATION','EQUAL','UNDECIDED'].includes(frozen.strategy)||!['number','string'].includes(typeof frozen.version)||!String(frozen.version).trim())throw Object.assign(new Error('原提报分配策略或版本缺失，不能以当前规则补填'),{status:409});
 const strategy=NONROUTINE_CATEGORY_STRATEGIES[category]||'UNDECIDED';
 if(strategy!=='ROLE_COMBINATION')return {...frozen,strategy,category};
 const key=combination(participants.map(person=>person.role));
 const bank=frozen.combinations||frozen.roleCombinationSnapshot?.combinations;
 const originalKey=frozen.combination||combination(Object.keys(frozen.ratios||{}));
 const ratios=bank?.[key]||(originalKey===key?frozen.ratios:null);
 const valid=Boolean(key&&ratios&&key.split('+').every(role=>typeof ratios[role]==='number'&&Number.isFinite(ratios[role])&&ratios[role]>=0&&ratios[role]<=1)&&Math.abs(key.split('+').reduce((sum,role)=>sum+ratios[role],0)-1)<1e-8);
 return {...frozen,strategy,category,combination:key,ratios:ratios||{},...(bank?{combinations:bank}:{}),valid,
  version:frozen.roleCombinationSnapshot?.version||frozen.version,
  ...(!valid?{unavailableReason:'原提报快照缺少本次角色组合的有效比例，不能以当前配置补填'}:{})};
}
