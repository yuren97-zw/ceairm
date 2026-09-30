// These keys belong to existing calculation/state payloads, not display names.
export const LANE_CODES = Object.freeze({'一组':'TEAM-LINE-1','二组':'TEAM-LINE-2','三组':'TEAM-LINE-3','四组':'TEAM-LINE-4'});
export const laneKeyForCode = code => Object.keys(LANE_CODES).find(key => LANE_CODES[key] === code) || null;
export function organizationLanes(db) {
  return Object.entries(LANE_CODES).map(([key,code]) => {
    const row=db.prepare("select id,name from organization_units where code=? and unit_type='administrative_team' and status='active'").get(code);
    return {key,organizationId:row?.id||null,name:row?.name||'班组未配置'};
  });
}
export function resolveOrganizationPath(db,path,type) {
  const rows=db.prepare("select id,name,parent_id,unit_type from organization_units where status='active'").all();
  const byId=new Map(rows.map(row=>[row.id,row]));
  const label=row=>{const names=[],seen=new Set();while(row){if(seen.has(row.id))return null;seen.add(row.id);names.unshift(row.name);row=row.parent_id?byId.get(row.parent_id):null;}return names.join(' / ');};
  const matches=rows.filter(row=>row.unit_type===type&&label(row)===String(path||'').trim());
  if(matches.length!==1)throw Object.assign(new Error('指定组织路径不存在或有歧义，请使用完整中文路径（不接受组织代码）'),{status:400});
  return matches[0].id;
}
