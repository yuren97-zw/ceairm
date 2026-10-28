export const PEOPLE_CATEGORIES=[['release','放行'],['maintenance','维修'],['other','其他']];
const collator=new Intl.Collator('zh-CN');
export function peopleCategory(person){
  const categories=new Set((person?.capabilities||[]).map(item=>item.category));
  return categories.has('release')?'release':categories.has('maintenance')?'maintenance':'other';
}
export function sortedPeople(ids,byId){
  const rank=Object.fromEntries(PEOPLE_CATEGORIES.map(([key],index)=>[key,index]));
  return [...new Set(ids)].sort((a,b)=>{
    const pa=byId[a],pb=byId[b];
    return rank[peopleCategory(pa)]-rank[peopleCategory(pb)]||
      collator.compare(pa?.name||String(a),pb?.name||String(b))||
      collator.compare(String(pa?.employeeNo||''),String(pb?.employeeNo||''))||
      String(a).localeCompare(String(b));
  });
}
