import { GROUPS } from './capability-core.mjs';

import {laneKeyForCode} from './organization-lanes.mjs';

const columns=(db,table)=>db.prepare(`pragma table_info(${table})`).all().map(row=>row.name);
const has=(db,table)=>columns(db,table).length>0;
const issue=(severity,type,detail,extra={})=>({severity,type,detail,...extra});

// Read-only and fail-closed.  It never imports, repairs, merges or guesses a person.
export function preflightCapabilityIntegrity(db,{superEmployeeNo='54002010'}={}){
  const issues=[];
  if(!has(db,'personnel'))return {ok:false,issues:[issue('error','missing_table','缺少人员主数据表')]};
  for(const row of db.prepare("select employee_no,count(*) as n from personnel group by employee_no having count(*)>1").all())issues.push(issue('error','duplicate_employee_no',`工号 ${row.employee_no} 对应 ${row.n} 条人员主档`,{employeeNo:row.employee_no}));
  if(has(db,'users'))for(const row of db.prepare("select person_id,count(*) as n from users where person_id is not null and trim(person_id)<>'' group by person_id having count(*)>1").all())issues.push(issue('error','duplicate_account_person','一个人员关联了多个账户',{personId:row.person_id,count:row.n}));
  for(const table of ['personnel_licenses','personnel_authorizations','personnel_training_records'])if(has(db,table)){
    for(const row of db.prepare(`select q.id,q.person_id,q.employee_no,p.employee_no as master_employee_no from ${table} q left join personnel p on p.id=q.person_id where p.id is null or q.employee_no<>p.employee_no`).all())issues.push(issue('error',row.master_employee_no?'qualification_employee_mismatch':'orphan_qualification',row.master_employee_no?`资质记录工号 ${row.employee_no} 与人员主档 ${row.master_employee_no} 不一致`:'资质记录关联了不存在的人员',{table,recordId:row.id,personId:row.person_id}));
  }
  const people=db.prepare("select p.id,p.employee_no,p.name,p.data_status,p.employment_status,p.personnel_group_id,p.administrative_team_id,t.code as team_code,t.name as team_name,t.status as team_status,t.unit_type as team_type,g.status as group_status,g.unit_type as group_type,g.maintenance_eligible from personnel p left join organization_units t on t.id=p.administrative_team_id left join organization_units g on g.id=p.personnel_group_id where p.data_status='active' and p.employment_status not in ('离职','停职')").all();
  for(const p of people){
    const ready=p.personnel_group_id&&p.group_status==='active'&&p.group_type==='personnel_group'&&Number(p.maintenance_eligible)===1&&(!p.administrative_team_id||(p.team_status==='active'&&p.team_type==='administrative_team'));
    if(!ready)issues.push(issue('warning','organization_unresolved',`${p.name}未归属可参与维修调配的人员分组，已排除生产统计`,{personId:p.id,employeeNo:p.employee_no,isCenterAdministrator:p.employee_no===superEmployeeNo}));
    else if(!laneKeyForCode(p.team_code))issues.push(issue('warning','non_production_team',`${p.name}不属于一至四组，保留为待调配候选`,{personId:p.id,employeeNo:p.employee_no,team:p.team_name}));
  }
  if(has(db,'capability_meta')){
    const meta=db.prepare('select * from capability_meta where id=1').get();
    if(columns(db,'capability_meta').includes('source_marker')&&meta?.source_marker&&meta.source_marker!=='center-master-v1')issues.push(issue('error','unverified_capability_source','检测到未核实的旧能力业务数据，禁止正式启用'));
  }
  if(has(db,'capability_current_states')){
    for(const row of db.prepare("select s.person_id,s.status,s.working_group,s.workspace,p.id as master_id,p.data_status,p.employment_status,p.personnel_group_id from capability_current_states s left join personnel p on p.id=s.person_id where p.id is null or p.data_status<>'active' or p.employment_status in ('离职','停职')").all())issues.push(issue(row.master_id?'warning':'error',row.master_id?'inactive_current_state_person':'orphan_current_state','人员当前状态关联人员不存在或已失效，已排除生产统计',{personId:row.person_id}));
    for(const row of db.prepare('select person_id,status,working_group,workspace from capability_current_states').all()){
      if(!['ON_DUTY','DEPLOYED','TRAINING','OTHER'].includes(row.status))issues.push(issue('error','invalid_person_status','人员当前状态值无效',{personId:row.person_id,status:row.status}));
      if(row.working_group&&!GROUPS.includes(row.working_group))issues.push(issue('error','invalid_working_group','人员当前工作班组无效',{personId:row.person_id,workingGroup:row.working_group}));
    }
  }
  if(has(db,'capability_supports')){
    for(const row of db.prepare('select person_id,count(*) as n from capability_supports where ended_at is null group by person_id having count(*)>1').all())issues.push(issue('error','multiple_active_supports','人员存在多条有效支援记录',{personId:row.person_id,count:row.n}));
    for(const row of db.prepare('select id,person_id,source_group,target_group from capability_supports where ended_at is null').all())if(!GROUPS.includes(row.target_group)||row.source_group&&!GROUPS.includes(row.source_group))issues.push(issue('error','invalid_active_support_group','有效支援记录班组无效',{recordId:row.id,personId:row.person_id}));
  }
  if(has(db,'capability_status_records'))for(const row of db.prepare("select person_id,count(*) as n from capability_status_records where phase='ACTIVE' and coalesce(data_status,'active')='active' group by person_id having count(*)>1").all())issues.push(issue('error','multiple_active_statuses','人员存在多个当前主状态',{personId:row.person_id,count:row.n}));
  return {ok:!issues.some(item=>item.severity==='error'),issues,summary:{errors:issues.filter(i=>i.severity==='error').length,warnings:issues.filter(i=>i.severity==='warning').length,people:people.length}};
}
