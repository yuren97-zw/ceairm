// Deployment requests retirement only after the existing tow/standard migration
// has been reconciled. Readiness is diagnostic, never permission to fall back to
// writing the retired monetary key when the new chain becomes unavailable.
export function maintenanceTowTransition({requested=false,manualReady=false,finalizationReady=false,publishedTowCount=0,legacyDefaultHours}){
 requested=requested===true;
 return {mode:requested?'STANDARD_ONLY':'LEGACY',requested:requested===true,ready:manualReady===true&&finalizationReady===true&&publishedTowCount>0,
  legacyDefaultHours,legacyAmountWritable:requested!==true,publishedTowCount,
  requirements:{manualReady:manualReady===true,finalizationReady:finalizationReady===true,publishedTowAvailable:publishedTowCount>0}};
}
export function assertLegacyTowCreation(policy,category,{existingCategory=null,managed=false}={}){
 if(policy.mode==='STANDARD_ONLY'&&category==='拖机'&&!managed&&existingCategory!=='拖机')throw Object.assign(new Error('新拖机工作请在执行页选择有效标准，或新增未收录工作进入评议；旧金额入口已停止新写入'),{status:409});
}
export function assertLegacyTowRuleWrites(policy,rows){
 if(policy.mode==='STANDARD_ONLY'&&rows.some(row=>String(row?.rule_type||row?.ruleType||'').trim()==='nonroutineCategoryHours'&&String(row?.name||'').trim()==='拖机'))throw Object.assign(new Error('拖机旧默认金额已停止维护，请使用标准库；未保存任何修改'),{status:409});
}
