// Publishing is a separately granted business authority, including for a system administrator.
export function standardPublicationAuthorized({db,hasAll},user){
  if(!user?.id||user.status!=='active'||!user.personId)return false;
  const grant=db.prepare(`select 1 from users u join personnel p on p.id=u.person_id
    join rbac_user_roles ur on ur.user_id=u.id join rbac_roles r on r.id=ur.role_id
    join rbac_role_permissions rp on rp.role_id=r.id join rbac_permissions permission on permission.id=rp.permission_id
    where u.id=? and u.person_id=? and coalesce(u.status,'active')='active'
      and p.data_status='active' and coalesce(p.employment_status,'') not in ('离职','停职')
      and r.status='active' and r.code<>'system_admin' and permission.code='maintenance.standard.publish' limit 1`).get(user.id,user.personId);
  return Boolean(grant&&hasAll(user,'maintenance'));
}

export function standardPublicationApplicability(aircraft,config){
  const denied=reason=>({ready:false,reason});
  if(aircraft?.genericAircraft===true){
    if(!Array.isArray(aircraft.aircraftCodes)||aircraft.aircraftCodes.length)return denied('通用范围不能同时包含精确机型。');
    return {ready:true,requiresExplicitGenericApproval:true,reference:'generic-scope-policy-v1',aircraftCodes:[],genericAircraft:true};
  }
  if(!aircraft||aircraft.genericAircraft!==false)return denied('请明确精确机型或通用范围。');
  if(!Array.isArray(aircraft.aircraftCodes)||!aircraft.aircraftCodes.length||new Set(aircraft.aircraftCodes).size!==aircraft.aircraftCodes.length)return denied('须明确无重复的精确机型范围。');
  if(!Number.isSafeInteger(config?.version)||config.version<1||!Array.isArray(config.groups))return denied('权威机型配置尚未就绪，请先维护现有机型配置。');
  const groups=[];
  for(const code of aircraft.aircraftCodes){
    if(typeof code!=='string'||code!==code.trim().toUpperCase())return denied('机型代码须与规范精确代码一致。');
    const matches=config.groups.filter(group=>group.enabled!==false&&Array.isArray(group.codes)&&group.codes.includes(code));
    if(matches.length!==1||typeof matches[0].id!=='string'||!matches[0].id.trim())return denied(`机型 ${code} 未在当前有效配置中唯一登记，请先核对。`);
    groups.push({code,groupId:matches[0].id});
  }
  return {ready:true,reference:`maintenance_aircraft_hours_v1:${config.version}`,dictionaryVersion:config.version,aircraftCodes:[...aircraft.aircraftCodes],genericAircraft:false,groups};
}
