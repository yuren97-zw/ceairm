import crypto from 'node:crypto';
import {LANE_CODES,laneKeyForCode,organizationLanes} from './organization-lanes.mjs';
import { GROUPS,STATUS_LABELS,category,normalizeConfig,calculate,today,days } from './capability-core.mjs';
import { preflightCapabilityIntegrity } from './capability-integrity.mjs';

export const CAPABILITY_VIEW_PERMISSIONS = [
  'capability.overview.view', 'capability.allocation.view', 'capability.status.view',
  'capability.history.view', 'capability.scenario.view', 'capability.report.view'
];
const parse=(v,f={})=>{try{return JSON.parse(v);}catch{return f;}};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
const stamp=()=>new Date().toISOString();
const uid=()=>crypto.randomUUID();
const trim=v=>String(v??'').trim();
const valid=v=>['是','有效','true','1'].includes(trim(v).toLowerCase());
const workspace=p=>p.department_id&&p.department_status==='active'&&p.department_type==='department'&&p.group_type==='personnel_group'&&p.group_status==='active'&&Number(p.maintenance_eligible)===1?`department:${p.department_id}`:null;
function date(value,optional=false){if(!value&&optional)return '';if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')||!Number.isFinite(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw fail('日期无效');return value;}
const assertNumber=v=>{if(!Number.isSafeInteger(v)||v<0||v>10000)throw fail('目标必须为0至10000的整数');};

export function createCapabilityService({db,hasRbac,personnelAccess,audit,resolveActor=()=>null,superAccountId='54002010'}) {
  const listeners=new Set();
  let ready=true,readinessIssue='';
  function init(){db.exec(`
    create table if not exists capability_meta(id integer primary key,revision integer not null,fingerprint text not null,master_revision integer not null default 0,source_marker text not null default '');
    insert into capability_meta(id,revision,fingerprint,master_revision,source_marker) values(1,0,'',0,'') on conflict(id) do nothing;
    create table if not exists capability_current_states(person_id text primary key,status text not null,working_group text,workspace text not null,administrative_group text,sort_index integer not null,record_id text,updated_at text not null,working_team_id text,administrative_team_id text);
    create table if not exists capability_supports(id text primary key,person_id text not null,workspace text not null,source_group text,target_group text,started_at text not null,ended_at text);
    create table if not exists capability_deployment_locations(id text primary key,workspace text not null,name text not null,status text not null default 'active',created_by text,created_at text not null,updated_by text,updated_at text not null,unique(workspace,name));
    create table if not exists capability_other_status_options(id text primary key,workspace text not null,name text not null,status text not null default 'active',created_by text,created_at text not null,updated_by text,updated_at text not null,unique(workspace,name));
    create table if not exists capability_status_records(id text primary key,person_id text not null,workspace text not null,kind text not null,label text not null,start_date text,end_date text,phase text not null,remark text,created_at text not null,updated_at text not null,replaces_record_id text,deployment_location_id text,data_status text not null default 'active',deleted_at text,deleted_by text,deletion_reason text);
    create table if not exists capability_history(id text primary key,person_id text,workspace text not null,type text not null,actor_id text,occurred_at text not null,payload text not null);
    create table if not exists capability_scenarios(id text primary key,workspace text not null,name text not null,base_revision integer not null,payload text not null,created_by text,updated_at text not null,effective_at text,schedule_status text not null default 'saved',baseline_payload text,conflict_payload text,applied_at text);
    create table if not exists capability_configuration(workspace text primary key,payload text not null);
    create table if not exists capability_events(id text primary key,revision integer not null,type text not null,occurred_at text not null);
    create table if not exists capability_commands(id text primary key,actor_id text not null,request_hash text not null,response text not null);
    create index if not exists capability_status_person_idx on capability_status_records(person_id,phase);
    create index if not exists capability_history_workspace_idx on capability_history(workspace,occurred_at);
  `);
    const columns=new Set(db.prepare('pragma table_info(capability_meta)').all().map(row=>row.name));
    if(!columns.has('master_revision'))db.exec("alter table capability_meta add column master_revision integer not null default 0");
    if(!columns.has('source_marker'))db.exec("alter table capability_meta add column source_marker text not null default ''");
    const stateColumns=new Set(db.prepare('pragma table_info(capability_current_states)').all().map(row=>row.name));
    if(!stateColumns.has('working_team_id'))db.exec("alter table capability_current_states add column working_team_id text");
    if(!stateColumns.has('administrative_team_id'))db.exec("alter table capability_current_states add column administrative_team_id text");
    const statusColumns=new Set(db.prepare('pragma table_info(capability_status_records)').all().map(row=>row.name));
    if(!statusColumns.has('replaces_record_id'))db.exec("alter table capability_status_records add column replaces_record_id text");
    if(!statusColumns.has('deployment_location_id'))db.exec("alter table capability_status_records add column deployment_location_id text");
    if(!statusColumns.has('other_status_option_id'))db.exec("alter table capability_status_records add column other_status_option_id text");
    if(!statusColumns.has('data_status'))db.exec("alter table capability_status_records add column data_status text not null default 'active'");
    if(!statusColumns.has('deleted_at'))db.exec("alter table capability_status_records add column deleted_at text");
    if(!statusColumns.has('deleted_by'))db.exec("alter table capability_status_records add column deleted_by text");
    if(!statusColumns.has('deletion_reason'))db.exec("alter table capability_status_records add column deletion_reason text");
    const scenarioColumns=new Set(db.prepare('pragma table_info(capability_scenarios)').all().map(row=>row.name));
    if(!scenarioColumns.has('effective_at'))db.exec('alter table capability_scenarios add column effective_at text');
    if(!scenarioColumns.has('schedule_status'))db.exec("alter table capability_scenarios add column schedule_status text not null default 'saved'");
    if(!scenarioColumns.has('baseline_payload'))db.exec('alter table capability_scenarios add column baseline_payload text');
    if(!scenarioColumns.has('conflict_payload'))db.exec('alter table capability_scenarios add column conflict_payload text');
    if(!scenarioColumns.has('applied_at'))db.exec('alter table capability_scenarios add column applied_at text');
    db.exec('create index if not exists capability_scenarios_due_idx on capability_scenarios(schedule_status,effective_at)');
    const invalidLocations=db.prepare("select id from capability_status_records where kind='DEPLOYED' and trim(coalesce(label,''))='' limit 1").get();
    if(invalidLocations)throw fail('存在空派驻地点记录，无法建立标准地点目录',409);
    const legacyLocations=db.prepare("select workspace,trim(label) as name,min(created_at) as created_at from capability_status_records where kind='DEPLOYED' and deployment_location_id is null group by workspace,trim(label)").all();
    for(const item of legacyLocations)db.prepare("insert into capability_deployment_locations(id,workspace,name,status,created_by,created_at,updated_by,updated_at) values(?,?,?,'active','migration',?,'migration',?) on conflict(workspace,name) do nothing").run(uid(),item.workspace,item.name,item.created_at||stamp(),stamp());
    for(const item of legacyLocations){const location=db.prepare('select id from capability_deployment_locations where workspace=? and name=?').get(item.workspace,item.name);db.prepare("update capability_status_records set deployment_location_id=? where kind='DEPLOYED' and workspace=? and trim(label)=? and deployment_location_id is null").run(location.id,item.workspace,item.name);}
    const invalidOther=db.prepare("select id from capability_status_records where kind='OTHER' and trim(coalesce(label,''))='' limit 1").get();
    if(invalidOther)throw fail('存在空其他状态记录，无法建立标准状态目录',409);
    const legacyOther=db.prepare("select workspace,trim(label) as name,min(created_at) as created_at from capability_status_records where kind='OTHER' and other_status_option_id is null group by workspace,trim(label)").all();
    if(legacyOther.length)tx(()=>{
      for(const item of legacyOther)db.prepare("insert into capability_other_status_options(id,workspace,name,status,created_by,created_at,updated_by,updated_at) values(?,?,?,'active','migration',?,'migration',?) on conflict(workspace,name) do nothing").run(uid(),item.workspace,item.name,item.created_at||stamp(),stamp());
      for(const item of legacyOther){const option=db.prepare('select id from capability_other_status_options where workspace=? and name=?').get(item.workspace,item.name);db.prepare("update capability_status_records set other_status_option_id=? where kind='OTHER' and workspace=? and trim(label)=? and other_status_option_id is null").run(option.id,item.workspace,item.name);}
    });
    const meta=db.prepare('select * from capability_meta where id=1').get();
    if(!meta.source_marker){
      const existing=['capability_current_states','capability_supports','capability_status_records','capability_history','capability_scenarios','capability_configuration'].reduce((sum,table)=>sum+Number(db.prepare(`select count(*) as n from ${table}`).get().n),0);
      const marker=existing?'legacy-unverified':'center-master-v1';
      db.prepare('update capability_meta set source_marker=? where id=1').run(marker);
    }
    const marker=db.prepare('select source_marker from capability_meta where id=1').get().source_marker;
    const integrity=preflightCapabilityIntegrity(db),blocking=integrity.issues.filter(item=>item.severity==='error');
    ready=marker==='center-master-v1'&&!blocking.length;
    readinessIssue=marker!=='center-master-v1'?'检测到未核实的旧能力业务数据，正式能力配置已停止；请先归档并执行中心主数据基线初始化':blocking.length?`人员唯一身份或能力数据预检失败（${blocking.length}项），正式能力配置已停止` : '';
    if(ready){installIdentityGuards();syncMaster();}
  }
  const revision=()=>Number(db.prepare('select revision from capability_meta where id=1').get().revision);
  const masterRevision=()=>Number(db.prepare('select master_revision from capability_meta where id=1').get().master_revision);
  function assertReady(){if(!ready)throw fail(readinessIssue,409);}
  function tx(fn){db.exec('begin immediate');try{if(db.kind==='postgres')db.exec('lock table capability_meta in exclusive mode');const result=fn();db.exec('commit');return result;}catch(e){db.exec('rollback');throw e;}}
  function event(type){const next=revision()+1;db.prepare('update capability_meta set revision=? where id=1').run(next);db.prepare('insert into capability_events values(?,?,?,?)').run(uid(),next,type,stamp());return next;}
  function publish(){for(const fn of listeners)try{fn(revision());}catch{listeners.delete(fn);}}
  function log(personId,space,type,actor,payload){const id=uid();db.prepare('insert into capability_history values(?,?,?,?,?,?,?)').run(id,personId,space,type,actor?.id||'system',stamp(),JSON.stringify(payload));return id;}
  function source(){return db.prepare("select p.*,t.code as team_code,t.name as team_name,t.status as team_status,t.unit_type as team_type,g.code as group_code,g.name as group_name,g.status as group_status,g.unit_type as group_type,g.maintenance_eligible,d.name as department_name,d.status as department_status,d.unit_type as department_type from personnel p left join organization_units t on t.id=p.administrative_team_id left join organization_units g on g.id=p.personnel_group_id left join organization_units d on d.id=p.department_id order by p.employee_no").all();}
  const eligible=p=>p.data_status==='active'&&!['离职','停职'].includes(p.employment_status);
  const adminGroup=p=>p.administrative_team_id&&p.team_status==='active'&&p.team_type==='administrative_team'?laneKeyForCode(p.team_code)||null:null;
  const organizationReady=p=>!!workspace(p)&&(!p.administrative_team_id||(p.team_status==='active'&&p.team_type==='administrative_team'));
  function installIdentityGuards(){
    const unavailable="not exists(select 1 from personnel p where p.id=new.person_id and p.data_status='active' and p.employment_status not in ('离职','停职'))";
    for(const table of ['capability_current_states','capability_supports','capability_status_records']){
      const name=`${table}_person_guard`;
      const condition=table==='capability_current_states'?`${unavailable} and not exists(select 1 from capability_current_states where person_id=new.person_id)`:unavailable;
      if(db.kind==='postgres')db.exec(`create or replace function guard_${name}() returns trigger language plpgsql as $$ begin if ${condition} then raise exception '人员不存在或已失效，不能写入能力状态'; end if; return new; end $$; drop trigger if exists ${name} on ${table}; create trigger ${name} before insert on ${table} for each row execute function guard_${name}();`);
      else db.exec(`drop trigger if exists ${name}; create trigger ${name} before insert on ${table} when ${condition} begin select raise(abort,'人员不存在或已失效，不能写入能力状态'); end;`);
    }
    db.exec("create unique index if not exists capability_one_active_support on capability_supports(person_id) where ended_at is null");
    db.exec("drop index if exists capability_one_active_status;create unique index capability_one_active_status on capability_status_records(person_id) where phase='ACTIVE' and data_status='active'");
    db.exec("drop index if exists capability_one_replacement;create unique index capability_one_replacement on capability_status_records(replaces_record_id) where replaces_record_id is not null and data_status='active'");
    const invalidReplacement="new.replaces_record_id is not null and (new.kind<>'DEPLOYED' or new.id=new.replaces_record_id or not exists(select 1 from capability_status_records prior where prior.id=new.replaces_record_id and prior.kind='DEPLOYED' and prior.workspace=new.workspace and prior.data_status='active'))";
    if(db.kind==='postgres')db.exec(`create or replace function guard_capability_status_replacement() returns trigger language plpgsql as $$ begin if ${invalidReplacement} then raise exception '派驻交接关系无效'; end if; return new; end $$; drop trigger if exists capability_status_replacement_guard on capability_status_records; create trigger capability_status_replacement_guard before insert or update of replaces_record_id,kind,workspace on capability_status_records for each row execute function guard_capability_status_replacement();`);
    else db.exec(`drop trigger if exists capability_status_replacement_insert_guard; create trigger capability_status_replacement_insert_guard before insert on capability_status_records when ${invalidReplacement} begin select raise(abort,'派驻交接关系无效'); end; drop trigger if exists capability_status_replacement_update_guard; create trigger capability_status_replacement_update_guard before update of replaces_record_id,kind,workspace on capability_status_records when ${invalidReplacement} begin select raise(abort,'派驻交接关系无效'); end;`);
    const invalidLocation="(new.kind='DEPLOYED' and (new.deployment_location_id is null or not exists(select 1 from capability_deployment_locations location where location.id=new.deployment_location_id and location.workspace=new.workspace))) or (new.kind<>'DEPLOYED' and new.deployment_location_id is not null)";
    if(db.kind==='postgres')db.exec(`create or replace function guard_capability_deployment_location() returns trigger language plpgsql as $$ begin if ${invalidLocation} then raise exception '派驻地点关联无效'; end if; return new; end $$; drop trigger if exists capability_deployment_location_guard on capability_status_records; create trigger capability_deployment_location_guard before insert or update of deployment_location_id,kind,workspace on capability_status_records for each row execute function guard_capability_deployment_location();`);
    else db.exec(`drop trigger if exists capability_deployment_location_insert_guard; create trigger capability_deployment_location_insert_guard before insert on capability_status_records when ${invalidLocation} begin select raise(abort,'派驻地点关联无效'); end; drop trigger if exists capability_deployment_location_update_guard; create trigger capability_deployment_location_update_guard before update of deployment_location_id,kind,workspace on capability_status_records when ${invalidLocation} begin select raise(abort,'派驻地点关联无效'); end;`);
    const invalidOther="(new.kind='OTHER' and (new.other_status_option_id is null or not exists(select 1 from capability_other_status_options option where option.id=new.other_status_option_id and option.workspace=new.workspace))) or (new.kind<>'OTHER' and new.other_status_option_id is not null)";
    if(db.kind==='postgres')db.exec(`create or replace function guard_capability_other_status_option() returns trigger language plpgsql as $$ begin if ${invalidOther} then raise exception '其他状态目录关联无效'; end if; return new; end $$; drop trigger if exists capability_other_status_option_guard on capability_status_records; create trigger capability_other_status_option_guard before insert or update of other_status_option_id,kind,workspace on capability_status_records for each row execute function guard_capability_other_status_option();`);
    else db.exec(`drop trigger if exists capability_other_status_option_insert_guard; create trigger capability_other_status_option_insert_guard before insert on capability_status_records when ${invalidOther} begin select raise(abort,'其他状态目录关联无效'); end; drop trigger if exists capability_other_status_option_update_guard; create trigger capability_other_status_option_update_guard before update of other_status_option_id,kind,workspace on capability_status_records when ${invalidOther} begin select raise(abort,'其他状态目录关联无效'); end;`);
  }
  function stateRow(row){return {personId:row.person_id,status:row.status,workingGroup:row.working_group,currentWorkingTeamId:row.working_team_id||null,administrativeGroup:row.administrative_group,administrativeTeamId:row.administrative_team_id||null,workspace:row.workspace,index:row.sort_index,recordId:row.record_id,updatedAt:row.updated_at};}
  function getState(id){const row=db.prepare('select * from capability_current_states where person_id=?').get(id);return row?stateRow(row):null;}
  function put(s){db.prepare(`insert into capability_current_states(person_id,status,working_group,workspace,administrative_group,sort_index,record_id,updated_at,working_team_id,administrative_team_id) values(?,?,?,?,?,?,?,?,?,?) on conflict(person_id) do update set status=excluded.status,working_group=excluded.working_group,workspace=excluded.workspace,administrative_group=excluded.administrative_group,sort_index=excluded.sort_index,record_id=excluded.record_id,updated_at=excluded.updated_at,working_team_id=excluded.working_team_id,administrative_team_id=excluded.administrative_team_id`).run(s.personId,s.status,s.workingGroup,s.workspace,s.administrativeGroup,s.index,s.recordId||null,stamp(),s.currentWorkingTeamId||null,s.administrativeTeamId||null);}
  function closeSupport(id){db.prepare('update capability_supports set ended_at=? where person_id=? and ended_at is null').run(stamp(),id);}
  function syncMaster(){
    assertReady();
    const rows=source();
    const signature=hash([rows,db.prepare('select * from personnel_authorizations order by id').all(),db.prepare('select * from personnel_licenses order by id').all(),db.prepare('select * from personnel_training_records order by id').all(),db.prepare('select * from capability_catalog order by project_code').all()]);
    if(db.prepare('select fingerprint from capability_meta where id=1').get().fingerprint===signature)return false;
    tx(()=>{
      for(const p of rows){const before=getState(p.id);const administrativeGroup=adminGroup(p);const space=workspace(p);
        if(!eligible(p)){if(before?.workingGroup){closeSupport(p.id);put({...before,workingGroup:null,currentWorkingTeamId:null});log(p.id,before.workspace,'PERSON_UNAVAILABLE',null,{before,reason:'主档停用或离职'});}continue;}
        if(!organizationReady(p)){if(before&&before.status==='ON_DUTY'&&before.workingGroup){closeSupport(p.id);put({...before,workingGroup:null,currentWorkingTeamId:null,administrativeGroup:null,administrativeTeamId:null});log(p.id,before.workspace,'ORGANIZATION_REVIEW_REQUIRED',null,{before});}continue;}
        if(!before){put({personId:p.id,status:'ON_DUTY',workingGroup:administrativeGroup,currentWorkingTeamId:p.administrative_team_id,administrativeGroup,administrativeTeamId:p.administrative_team_id,workspace:space,index:Number(db.prepare('select coalesce(max(sort_index),-1)+1 as n from capability_current_states where workspace=?').get(space).n)});log(p.id,space,'MASTER_BASELINE',null,{administrativeGroup});}
        else if(before.administrativeGroup!==administrativeGroup||before.workspace!==space){
          const supported=before.status==='ON_DUTY'&&before.workingGroup&&before.workingGroup!==before.administrativeGroup;
          const next={...before,administrativeGroup,administrativeTeamId:p.administrative_team_id,workspace:before.status!=='ON_DUTY'||supported?before.workspace:space,workingGroup:before.status==='ON_DUTY'&&!supported?administrativeGroup:before.workingGroup,currentWorkingTeamId:before.status==='ON_DUTY'&&!supported?p.administrative_team_id:before.currentWorkingTeamId};put(next);log(p.id,space,'ADMINISTRATIVE_UPDATED',null,{before,after:next});
        }
      }
      db.prepare('update capability_meta set fingerprint=?,master_revision=master_revision+1 where id=1').run(signature);event('MASTER_DATA_UPDATED');
    });publish();return true;
  }
  function readable(actor,p){return personnelAccess.allows(actor,'personnel',p.id);}
  function requirePermission(actor,permission){if(!hasRbac(actor,permission))throw fail('没有此能力配置权限',403);}
  function requireAnyPermission(actor,permissions){if(!permissions.some(permission=>hasRbac(actor,permission)))throw fail('没有此能力配置页面的查看权限',403);}
  const isSuper=actor=>actor?.id===superAccountId;
  function organizationIssues(actor){return source().filter(p=>eligible(p)&&readable(actor,p)&&(!p.personnel_group_id||(Number(p.maintenance_eligible)===1&&!organizationReady(p)))).map(p=>({personId:p.id,employeeNo:p.employee_no,name:p.name,reason:!p.personnel_group_id?'未分配人员分组':'组织不存在、已停用或类型不正确'}));}
  function nonParticipants(actor){const rows=source().filter(p=>readable(actor,p));const disabled=rows.filter(p=>eligible(p)&&p.personnel_group_id&&Number(p.maintenance_eligible)!==1);return {cadreName:db.prepare("select name from organization_units where code='GROUP-LINE-CADRE'").get()?.name||'不参与调配',cadre:disabled.filter(p=>p.group_code==='GROUP-LINE-CADRE').length,groupDisabled:disabled.filter(p=>p.group_code!=='GROUP-LINE-CADRE').length,unclassified:rows.filter(p=>eligible(p)&&!p.personnel_group_id).length,unavailable:rows.filter(p=>p.data_status==='active'&&!eligible(p)).length,deleted:rows.filter(p=>p.data_status==='deleted').length,total:rows.filter(p=>!eligible(p)||!organizationReady(p)).length};}
  function spaces(actor){assertReady();requireAnyPermission(actor,CAPABILITY_VIEW_PERMISSIONS);return [...new Map(source().filter(p=>eligible(p)&&organizationReady(p)&&readable(actor,p)).map(p=>[workspace(p),{id:workspace(p),name:p.department_name}])).values()];}
  function context(actor,space){assertReady();requireAnyPermission(actor,CAPABILITY_VIEW_PERMISSIONS);const all=source().filter(p=>eligible(p)&&organizationReady(p)&&(workspace(p)===space||getState(p.id)?.workspace===space));const visible=all.filter(p=>readable(actor,p));const historyScope=source().filter(p=>organizationReady(p)&&(workspace(p)===space||getState(p.id)?.workspace===space));if(!visible.length&&!historyScope.some(p=>readable(actor,p)))throw fail('没有该范围的访问权限',403);return {all,visible,complete:historyScope.length>0&&historyScope.every(p=>readable(actor,p))};}
  function location(space,id,{active=false}={}){const row=db.prepare('select * from capability_deployment_locations where id=? and workspace=?').get(id,space);if(!row)throw fail('派驻地点不存在或不属于当前工作范围',404);if(active&&row.status!=='active')throw fail('派驻地点已停用，请重新选择',409);return row;}
  function locations(space){return db.prepare(`select l.*,
    (select count(*) from capability_status_records r where r.deployment_location_id=l.id) as reference_count,
    (select count(*) from capability_status_records r where r.deployment_location_id=l.id and r.phase='ACTIVE' and r.data_status='active') as active_record_count,
    (select count(*) from capability_status_records r where r.deployment_location_id=l.id and r.phase='PLANNED' and r.data_status='active') as planned_record_count
    from capability_deployment_locations l where l.workspace=? order by l.status asc,l.name asc`).all(space).map(row=>({id:row.id,name:row.name,status:row.status,referenceCount:Number(row.reference_count),activeRecordCount:Number(row.active_record_count),plannedRecordCount:Number(row.planned_record_count),createdAt:row.created_at,updatedAt:row.updated_at}));}
  function otherOption(space,id,{active=false}={}){if(typeof id!=='string'||!id)throw fail('请选择其他状态目录项',400);const row=db.prepare('select * from capability_other_status_options where id=? and workspace=?').get(id,space);if(!row)throw fail('其他状态不存在或不属于当前工作范围',404);if(active&&row.status!=='active')throw fail('其他状态已停用，请重新选择',409);return row;}
  function otherOptions(space){return db.prepare(`select o.*,
    (select count(*) from capability_status_records r where r.other_status_option_id=o.id) as reference_count,
    (select count(*) from capability_status_records r where r.other_status_option_id=o.id and r.phase='ACTIVE' and r.data_status='active') as active_record_count,
    (select count(*) from capability_status_records r where r.other_status_option_id=o.id and r.phase='PLANNED' and r.data_status='active') as planned_record_count
    from capability_other_status_options o where o.workspace=? order by o.status asc,o.name asc`).all(space).map(row=>({id:row.id,name:row.name,status:row.status,referenceCount:Number(row.reference_count),activeRecordCount:Number(row.active_record_count),plannedRecordCount:Number(row.planned_record_count),createdAt:row.created_at,updatedAt:row.updated_at}));}
  function projectsAndPeople(rows,config){
    const catalog=new Map(db.prepare('select * from capability_catalog').all().map(c=>[c.project_code,c]));
    const ids=new Set(rows.map(p=>p.id)); const auth=db.prepare("select * from personnel_authorizations where coalesce(data_status,'active')='active'").all().filter(a=>ids.has(a.person_id));
    const license=db.prepare("select * from personnel_licenses where coalesce(data_status,'active')='active'").all().filter(l=>ids.has(l.person_id)&&valid(l.is_valid));
    const projects=new Map();const byPerson=new Map();
    for(const a of auth){if(trim(a.authorization_status)!=='有效')continue;const c=catalog.get(a.project_code),projectCategory=category(c?.project_category);if(!c||c.status!=='active'||!trim(c.project_name)||!projectCategory)continue;const name=c.project_name;
      const key=JSON.stringify(['project',a.project_code]);
      const project={key,code:a.project_code,name,shortName:name.replaceAll('A319/A320/A321','A320系列'),unit:'',category:projectCategory};
      projects.set(key,project);if(!byPerson.has(a.person_id))byPerson.set(a.person_id,new Map());const caps=byPerson.get(a.person_id);const existing=caps.get(key);caps.set(key,{...project,sourceRecords:(existing?.sourceRecords||0)+1,authorizationTypes:[...new Set([...(existing?.authorizationTypes||[]),a.authorization_type].filter(Boolean))],authorizationUnits:[...new Set([...(existing?.authorizationUnits||[]),a.authorization_unit].filter(Boolean))]});
    }
    const people=rows.map(p=>{const licenses=license.filter(l=>l.person_id===p.id).map(l=>({type:l.license_type||'',number:l.license_no||'',english:l.license_english_level||'',remark:l.remark||''}));return {id:p.id,employeeNo:p.employee_no,name:p.name,personnelGroup:p.group_name,personnelGroupCode:p.group_code,administrativeGroup:adminGroup(p),administrativeTeamId:p.administrative_team_id,administrativeUnit:p.team_name||(p.group_code==='GROUP-LINE-SPECIAL'?p.group_name:'待调配'),workspace:workspace(p),hasLicense:!!licenses.length,licenses,english:licenses.find(l=>l.english)?.english||licenses.map(l=>l.remark).join(' ').match(/英语等级\s*[：:]\s*([1-6])/)?.[1]||'—',capabilities:[...(byPerson.get(p.id)?.values()||[])]};});
    return {people,projects:[...projects.values()].sort((a,b)=>a.code.localeCompare(b.code)||a.unit.localeCompare(b.unit))};
  }
  function rawConfig(space){return parse(db.prepare('select payload from capability_configuration where workspace=?').get(space)?.payload);}
  function snapshot(actor,space){
    const ctx=context(actor,space), raw=rawConfig(space);
    const {people,projects}=projectsAndPeople(ctx.visible,raw),config=normalizeConfig(projects,raw);
    const states=people.map(p=>getState(p.id)).filter(Boolean).map(s=>s.workspace===space?s:{...s,workingGroup:null});
    for(const p of people){if(p.workspace!==space)p.administrativeGroup=null;p.requiresWorkspaceReview=getState(p.id)?.workspace!==p.workspace;}
    const historicalRows=source().filter(p=>(workspace(p)===space||getState(p.id)?.workspace===space)&&readable(actor,p));
    const historicalIds=new Set(historicalRows.map(p=>p.id));
    const statusHistoryAllowed=['capability.status.view','capability.history.view','capability.report.view'].some(permission=>hasRbac(actor,permission));
    const supportHistoryAllowed=['capability.history.view','capability.report.view'].some(permission=>hasRbac(actor,permission));
    const historicalPeople=statusHistoryAllowed?historicalRows.filter(p=>!eligible(p)).map(p=>({id:p.id,employeeNo:p.employee_no,name:p.name,administrativeUnit:p.team_name||p.department_name,employmentStatus:p.employment_status,licenses:[],capabilities:[],english:'—'})):[];
    return {
      lanes:organizationLanes(db),workspace:space,revision:revision(),capabilityVersion:revision(),masterDataVersion:masterRevision(),dataVersion:`${masterRevision()}:${revision()}`,partial:!ctx.complete,people,historicalPeople,projects,states,config,deploymentLocations:locations(space),otherStatusOptions:otherOptions(space),isSuperAdministrator:isSuper(actor),qualificationVisible:hasRbac(actor,'personnel.qualification.view'),
      permissions:{
        overview:hasRbac(actor,'capability.overview.view'),
        allocationView:hasRbac(actor,'capability.allocation.view'),
        allocate:hasRbac(actor,'capability.allocation.submit'),
        simulate:hasRbac(actor,'capability.allocation.simulate'),
        statusView:hasRbac(actor,'capability.status.view'),
        'status.manage':hasRbac(actor,'capability.status.manage'),
        historyView:hasRbac(actor,'capability.history.view'),
        scenarioView:hasRbac(actor,'capability.scenario.view'),
        'scenario.manage':hasRbac(actor,'capability.scenario.manage'),
        scenarioApply:hasRbac(actor,'capability.scenario.apply'),
        reportView:hasRbac(actor,'capability.report.view'),
        export:hasRbac(actor,'capability.report.export'),
        'config.manage':hasRbac(actor,'capability.config.manage')
      },
      records:db.prepare(`select r.*,case when r.kind='DEPLOYED' then coalesce(l.name,r.label) when r.kind='OTHER' then coalesce(o.name,r.label) else r.label end as label_current from capability_status_records r left join capability_deployment_locations l on l.id=r.deployment_location_id left join capability_other_status_options o on o.id=r.other_status_option_id where r.workspace=? and r.data_status='active' order by r.created_at desc`).all(space).filter(r=>historicalIds.has(r.person_id)&&(statusHistoryAllowed||['ACTIVE','PLANNED'].includes(r.phase))).map(r=>({...r,label_snapshot:r.label,label:r.label_current})),
      supports:db.prepare('select * from capability_supports where workspace=? order by started_at desc').all(space).filter(r=>historicalIds.has(r.person_id)&&(supportHistoryAllowed||!r.ended_at)),
      history:hasRbac(actor,'capability.history.view')?db.prepare('select * from capability_history where workspace=? order by occurred_at desc').all(space).filter(r=>!r.person_id?ctx.complete:historicalIds.has(r.person_id)).map(r=>({...r,payload:parse(r.payload)})):[],
      scenarios:hasRbac(actor,'capability.scenario.view')&&ctx.complete?db.prepare('select * from capability_scenarios where workspace=? order by updated_at desc').all(space).map(s=>({...s,payload:parse(s.payload),baseline:parse(s.baseline_payload)?.states||[],conflicts:parse(s.conflict_payload,[])})):[],
      ...calculate(people,projects,states,config)
    };
  }
  function ensurePerson(actor,space,id){const p=source().find(p=>p.id===id&&workspace(p)===space&&eligible(p)&&organizationReady(p)&&readable(actor,p));if(!p)throw fail('未找到可操作人员，或人员组织尚未核实',404);return p;}
  function ensureRecordedPerson(actor,space,id){const p=source().find(p=>p.id===id&&eligible(p)&&readable(actor,p));const state=getState(id);if(!p||state?.workspace!==space)throw fail('未找到可操作人员',404);return p;}
  function personAuthorizations(actor,space,personId,requestedCategory='',requestedQuery=''){
    assertReady();requireAnyPermission(actor,CAPABILITY_VIEW_PERMISSIONS);if(!hasRbac(actor,'personnel.qualification.view'))throw fail('没有查看授权明细的权限',403);ensureRecordedPerson(actor,space,personId);
    const categories=['release','test_run','maintenance','special','third_party','other'],categoryValue=trim(requestedCategory);if(categoryValue&&!categories.includes(categoryValue))throw fail('授权项目分类无效');
    const query=trim(requestedQuery);if(query.length>100)throw fail('搜索关键词过长');
    const pattern=`%${query.toLowerCase().replace(/[\\%_]/g,'\\$&')}%`;
    const base=`from personnel_authorizations a join capability_catalog c on c.project_code=a.project_code where a.person_id=? and coalesce(a.data_status,'active')='active' and trim(a.authorization_status)='有效' and c.status='active' and c.project_category in ('release','test_run','maintenance','special','third_party','other')${query?" and (lower(c.project_name) like ? escape '\\' or lower(c.project_code) like ? escape '\\')":''}`;
    const params=query?[personId,pattern,pattern]:[personId];
    const counts=Object.assign(Object.fromEntries(categories.map(key=>[key,0])),Object.fromEntries(db.prepare(`select c.project_category as category,count(*) as count ${base} group by c.project_category`).all(...params).map(row=>[row.category,Number(row.count)])));
    if(!categoryValue)return {counts};
    const items=db.prepare(`select a.id,c.project_code as projectCode,c.project_name as projectName,c.project_category as category,coalesce(c.third_party_company,'') as thirdPartyCompany,a.authorization_type as authorizationType,a.authorization_unit as authorizationUnit,a.authorized_at as authorizedAt,a.authorization_expires_at as authorizationExpiresAt,a.authorization_status as authorizationStatus ${base} and c.project_category=? order by c.third_party_company,c.project_name,c.project_code,a.authorization_type,a.authorization_unit`).all(...params,categoryValue);
    return {counts,items};
  }
  function ensureTarget(actor,space,group){if(group!==null&&!GROUPS.includes(group))throw fail('工作班组无效');const ctx=context(actor,space);const members=ctx.all.filter(p=>adminGroup(p)===group||getState(p.id)?.workingGroup===group);if(members.some(p=>!readable(actor,p))||(!members.length&&!ctx.complete))throw fail('没有目标班组完整调配权限',403);}
  function move(actor,space,id,group,index,reason='调配'){
    ensurePerson(actor,space,id);ensureTarget(actor,space,group);const before=getState(id);if(before.workspace!==workspace(source().find(p=>p.id===id)))throw fail('人员正式组织已变化，请刷新后再调配',409);if(before.status!=='ON_DUTY')throw fail('仅在岗人员可以调配',409);
    before.index=db.prepare("select person_id from capability_current_states where workspace=? and status='ON_DUTY' order by sort_index,person_id").all(space).filter(s=>getState(s.person_id).workingGroup===before.workingGroup).findIndex(s=>s.person_id===id);if(before.workingGroup!==group){closeSupport(id);if(group&&group!==before.administrativeGroup)db.prepare('insert into capability_supports values(?,?,?,?,?,?,?)').run(uid(),id,space,before.administrativeGroup,group,stamp(),null);}
    const order=db.prepare("select * from capability_current_states where workspace=? and status='ON_DUTY' order by sort_index,person_id").all(space).filter(s=>s.working_group===group&&s.person_id!==id);
    const at=index==null?order.length:Math.max(0,Math.min(order.length,index));if(index!=null&&!Number.isSafeInteger(index))throw fail('排序位置无效');order.splice(at,0,{person_id:id});order.forEach((s,i)=>db.prepare('update capability_current_states set sort_index=? where person_id=?').run(i,s.person_id));
    const targetTeam=group?db.prepare("select id from organization_units where unit_type='administrative_team' and status='active' and code=?").get(LANE_CODES[group]):null;
    if(group&&!targetTeam)throw fail('工作班组未在正式组织目录中配置',409);
    const next={...before,workingGroup:group,currentWorkingTeamId:targetTeam?.id||null,index:at};put(next);return log(id,space,before.workingGroup===group?'PERSON_ORDER_CHANGED':'PERSON_WORKING_GROUP_CHANGED',actor,{before,after:next,reason});
  }
  function overlap(id,start,end,except){return db.prepare("select * from capability_status_records where person_id=? and phase in ('PLANNED','ACTIVE') and data_status='active'").all(id).some(r=>r.id!==except&&(!r.start_date||!end||r.start_date<=end)&&(!r.end_date||r.end_date>=start));}
  function activate(r,actor){const before=getState(r.person_id);if(!before||before.status!=='ON_DUTY')throw fail('人员已有其他主状态',409);closeSupport(r.person_id);put({...before,status:r.kind,workingGroup:null,currentWorkingTeamId:null,recordId:r.id});db.prepare("update capability_status_records set phase='ACTIVE',updated_at=? where id=?").run(stamp(),r.id);log(r.person_id,r.workspace,'PERSON_STATUS_CHANGED',actor,{before,record:r});}
  function endRecord(r,actor,end=today()){
    const before=getState(r.person_id);if(end>today())throw fail('结束操作不能使用未来日期，请修改计划结束日期');if(r.start_date&&end<r.start_date)throw fail('结束日期早于开始日期');
    db.prepare("update capability_status_records set phase='ENDED',end_date=?,updated_at=? where id=?").run(end,stamp(),r.id);
    if(before?.recordId===r.id){const master=source().find(p=>p.id===r.person_id);put({...before,status:'ON_DUTY',workingGroup:master&&eligible(master)&&organizationReady(master)?adminGroup(master):null,currentWorkingTeamId:master&&eligible(master)&&organizationReady(master)?master.administrative_team_id:null,workspace:master&&workspace(master)?workspace(master):before.workspace,recordId:null});log(r.person_id,r.workspace,'PERSON_STATUS_ENDED',actor,{before,recordId:r.id,endDate:end});}
  }
  const activeSuccessor=id=>db.prepare("select * from capability_status_records where replaces_record_id=? and data_status='active'").get(id);
  function deploymentChain(record){
    const found=new Map([[record.id,record]]);let current=record;
    while(current.replaces_record_id){const prior=db.prepare("select * from capability_status_records where id=? and data_status='active'").get(current.replaces_record_id);if(!prior||found.has(prior.id))break;found.set(prior.id,prior);current=prior;}
    current=record;while(true){const next=activeSuccessor(current.id);if(!next||found.has(next.id))break;found.set(next.id,next);current=next;}
    return [...found.values()];
  }
  function restoreDeletedActiveRecord(r,actor){
    const before=getState(r.person_id);if(before?.recordId!==r.id)return;const master=source().find(p=>p.id===r.person_id),usable=master&&eligible(master)&&organizationReady(master);
    put({...before,status:'ON_DUTY',workingGroup:usable?adminGroup(master):null,currentWorkingTeamId:usable?master.administrative_team_id:null,workspace:usable?workspace(master):before.workspace,recordId:null});log(r.person_id,r.workspace,'DELETED_ACTIVE_STATUS_RESTORED',actor,{before,recordId:r.id});
  }
  function scenarioTime(value){
    if(!value)return null;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw fail('生效时间无效');
    const normalized=new Date(value).toISOString();
    if(value!==normalized)throw fail('生效时间无效');
    if(Date.parse(normalized)<=Date.now())throw fail('生效时间必须晚于当前时间');
    return normalized;
  }
  function scenarioIntents(baseline,desired){
    const before=new Map(baseline.map(s=>[s.personId,s]));
    return desired.filter(target=>{const prior=before.get(target.personId);return prior?.status==='ON_DUTY'&&target.status==='ON_DUTY'&&(prior.workingGroup!==target.workingGroup||prior.index!==target.index);}).map(target=>({personId:target.personId,targetGroup:target.workingGroup??null,targetIndex:target.index}));
  }
  const scenarioStatusLabel=status=>({DEPLOYED:'派驻',TRAINING:'培训',OTHER:'其他状态'}[status]||status||'未知状态');
  function runScheduledScenarios(){
    const due=db.prepare("select id from capability_scenarios where schedule_status='pending' and effective_at<=? order by effective_at,updated_at,id").all(stamp());
    for(const item of due){let changed=false;
      try{tx(()=>{
        const scenario=db.prepare("select * from capability_scenarios where id=? and schedule_status='pending'").get(item.id);
        if(!scenario||scenario.effective_at>stamp())return;
        const scenarioPayload=parse(scenario.payload),desired=scenarioPayload?.states||[],baseline=parse(scenario.baseline_payload)?.states||[],intents=Array.isArray(scenarioPayload?.intents)?scenarioPayload.intents:scenarioIntents(baseline,desired),conflicts=[];
        const actor=resolveActor(scenario.created_by);
        let current=[];
        try{
          if(!actor||!hasRbac(actor,'capability.scenario.manage')||!hasRbac(actor,'capability.scenario.apply'))throw fail('方案创建人已无方案管理或应用权限',403);
          const ctx=context(actor,scenario.workspace);
          if(!ctx.complete)throw fail('方案创建人已无当前范围完整数据权限',403);
          current=ctx.visible.map(p=>getState(p.id)).filter(Boolean);
          if(!baseline.length||!desired.length)throw fail('方案缺少保存时的人员基准',409);
          const currentMap=new Map(current.map(s=>[s.personId,s]));
          for(const intent of intents){
            if(!GROUPS.includes(intent.targetGroup)&&intent.targetGroup!==null){conflicts.push({personId:intent.personId,reason:'方案目标班组无效'});continue;}
            if(!Number.isSafeInteger(intent.targetIndex)||intent.targetIndex<0){conflicts.push({personId:intent.personId,reason:'方案人员顺序无效'});continue;}
            const live=currentMap.get(intent.personId);
            if(!live){conflicts.push({personId:intent.personId,reason:'人员已停职、离职、删除、组织失效或超出执行范围'});continue;}
            if(live.workspace!==scenario.workspace){conflicts.push({personId:intent.personId,reason:'人员工作范围已变化'});continue;}
            if(live.status!=='ON_DUTY')conflicts.push({personId:intent.personId,status:live.status,recordId:live.recordId||null,reason:`人员当前处于${scenarioStatusLabel(live.status)}状态`});
          }
        }catch(error){conflicts.push({reason:error.message||'方案复核失败'});}
        if(conflicts.length){db.prepare("update capability_scenarios set schedule_status='conflict',conflict_payload=?,updated_at=? where id=?").run(JSON.stringify(conflicts),stamp(),scenario.id);log(null,scenario.workspace,'SCENARIO_SCHEDULED_CONFLICT',actor,{scenarioId:scenario.id,conflicts});audit(actor||{id:'system'},'capability_scheduled_scenario_conflict','capability',scenario.workspace,JSON.stringify({scenarioId:scenario.id,conflicts}));}
        else{
          for(const targetGroup of [null,...GROUPS])for(const intent of intents.filter(item=>item.targetGroup===targetGroup).sort((a,b)=>a.targetIndex-b.targetIndex||a.personId.localeCompare(b.personId))){const live=getState(intent.personId);if(live.workingGroup!==targetGroup||live.index!==intent.targetIndex)move(actor,scenario.workspace,intent.personId,targetGroup,intent.targetIndex,'定时应用方案 '+scenario.id);}
          db.prepare("update capability_scenarios set schedule_status='applied',applied_at=?,conflict_payload=null,updated_at=? where id=?").run(stamp(),stamp(),scenario.id);
          log(null,scenario.workspace,'SCENARIO_SCHEDULED_APPLIED',actor,{scenarioId:scenario.id,effectiveAt:scenario.effective_at,intents});
          audit(actor,'capability_scheduled_scenario_applied','capability',scenario.workspace,JSON.stringify({scenarioId:scenario.id}));
        }
        event(conflicts.length?'SCENARIO_SCHEDULED_CONFLICT':'SCENARIO_SCHEDULED_APPLIED');changed=true;
      });}catch(error){
        tx(()=>{const scenario=db.prepare("select * from capability_scenarios where id=? and schedule_status='pending'").get(item.id);if(!scenario)return;const conflicts=[{reason:error.message||'定时应用失败，未修改实时配置'}];db.prepare("update capability_scenarios set schedule_status='conflict',conflict_payload=?,updated_at=? where id=?").run(JSON.stringify(conflicts),stamp(),item.id);log(null,scenario.workspace,'SCENARIO_SCHEDULED_CONFLICT',null,{scenarioId:item.id,conflicts});event('SCENARIO_SCHEDULED_CONFLICT');changed=true;});
      }
      if(changed)publish();
    }
  }
  function schedule(){assertReady();let changed=false;const due=db.prepare("select * from capability_status_records where phase in ('PLANNED','ACTIVE') and data_status='active'").all().filter(r=>(r.phase==='PLANNED'&&r.start_date&&r.start_date<=today())||(r.phase==='ACTIVE'&&r.end_date&&r.end_date<today()));due.sort((a,b)=>(a.phase==='ACTIVE'?0:1)-(b.phase==='ACTIVE'?0:1));
    if(due.length){tx(()=>{for(const candidate of due){const r=db.prepare("select * from capability_status_records where id=? and data_status='active'").get(candidate.id);if(!r||!['PLANNED','ACTIVE'].includes(r.phase))continue;const p=source().find(p=>p.id===r.person_id);if(!p||!eligible(p))continue;if(r.phase==='ACTIVE'&&r.end_date&&r.end_date<today()){endRecord(r,null,r.end_date);changed=true;}else if(r.phase==='PLANNED'&&r.end_date&&r.end_date<today()){db.prepare("update capability_status_records set phase='ENDED',updated_at=? where id=?").run(stamp(),r.id);log(r.person_id,r.workspace,'PLANNED_PERIOD_ELAPSED',null,{record:r});changed=true;}else if(r.phase==='PLANNED'&&r.start_date&&r.start_date<=today()&&organizationReady(p)&&getState(r.person_id)?.status==='ON_DUTY'){activate(r,null);changed=true;}}if(changed)event('PERSON_STATUS_CHANGED');});if(changed)publish();}
    runScheduledScenarios();
  }
  function command(actor,space,operation,payload){
    const permission={move:'capability.allocation.submit',restore:'capability.allocation.submit',compensate:'capability.allocation.submit',status:'capability.status.manage',replaceDeployment:'capability.status.manage',end:'capability.status.manage',updateStatus:'capability.status.manage',deleteStatus:'capability.status.manage',config:'capability.config.manage',createDeploymentLocation:'capability.config.manage',updateDeploymentLocation:'capability.config.manage',setDeploymentLocationStatus:'capability.config.manage',deleteDeploymentLocation:'capability.config.manage',createOtherStatusOption:'capability.config.manage',updateOtherStatusOption:'capability.config.manage',setOtherStatusOptionStatus:'capability.config.manage',deleteOtherStatusOption:'capability.config.manage',saveScenario:'capability.scenario.manage',deleteScenario:'capability.scenario.manage',cancelScenario:'capability.scenario.manage',rescheduleScenario:'capability.scenario.apply',applyScenario:'capability.scenario.apply'}[operation];
    if(!permission)throw fail('未知操作');requirePermission(actor,permission);
    if(!payload.requestId||typeof payload.requestId!=='string'||payload.requestId.length>100)throw fail('缺少请求标识');const requestHash=hash({space,operation,payload});
    const prior=db.prepare('select * from capability_commands where id=?').get(payload.requestId);if(prior){if(prior.actor_id!==actor.id||prior.request_hash!==requestHash)throw fail('请求标识冲突',409);return JSON.parse(prior.response);}
    let result;try{result=tx(()=>{let historyId=null;const retry=db.prepare('select * from capability_commands where id=?').get(payload.requestId);if(retry){if(retry.actor_id!==actor.id||retry.request_hash!==requestHash)throw fail('请求标识冲突',409);return JSON.parse(retry.response);}
      if(payload.revision!==revision())throw fail('数据已更新，请刷新并重新检查影响',409);const ctx=context(actor,space);
      if(['config','restore','createDeploymentLocation','updateDeploymentLocation','setDeploymentLocationStatus','deleteDeploymentLocation','createOtherStatusOption','updateOtherStatusOption','setOtherStatusOptionStatus','deleteOtherStatusOption','saveScenario','deleteScenario','cancelScenario','rescheduleScenario','applyScenario'].includes(operation)&&!ctx.complete)throw fail('该操作需要当前范围完整权限',403);
      if(operation==='move')historyId=move(actor,space,payload.personId,payload.targetGroup??null,payload.targetIndex);
      if(operation==='restore')for(const p of ctx.visible){const s=getState(p.id);if(s.status==='ON_DUTY'&&s.workingGroup!==s.administrativeGroup)move(actor,space,p.id,s.administrativeGroup,undefined,'恢复行政班组');}
      if(operation==='compensate'){
        const h=db.prepare('select * from capability_history where id=? and workspace=?').get(payload.historyId,space);if(!h)throw fail('历史记录不存在',404);if(h.actor_id!==actor.id)throw fail('只能补偿本人调配记录',403);const v=parse(h.payload);if(!['PERSON_ORDER_CHANGED','PERSON_WORKING_GROUP_CHANGED'].includes(h.type)||!v.before||!v.after)throw fail('此记录不支持调配补偿');const s=getState(h.person_id);if(s.workingGroup!==v.after.workingGroup||s.index!==v.after.index)throw fail('人员后续已变化，不能直接撤销',409);historyId=move(actor,space,h.person_id,v.before.workingGroup,v.before.index,'补偿 '+h.id);
      }
      if(operation==='status'){
        ensurePerson(actor,space,payload.personId);const kind=payload.kind;if(!['DEPLOYED','TRAINING','OTHER'].includes(kind))throw fail('状态类型无效');const start=date(payload.startDate),end=date(payload.endDate,true);if(end&&end<start)throw fail('结束日期早于开始日期');if(end&&end<today())throw fail('已结束的历史请通过迁移核实，不创建当前状态');if(overlap(payload.personId,start,end))throw fail('人员状态时段重叠',409);const deployment=kind==='DEPLOYED'?location(space,payload.deploymentLocationId,{active:true}):null,other=kind==='OTHER'?otherOption(space,payload.otherStatusOptionId,{active:true}):null,label=deployment?.name||other?.name||trim(payload.label);if(!label)throw fail('请填写培训项目');
        const r={id:uid(),person_id:payload.personId,workspace:space,kind,label,start_date:start,end_date:end,phase:'PLANNED',remark:trim(payload.remark),created_at:stamp(),updated_at:stamp(),replaces_record_id:null,deployment_location_id:deployment?.id||null,other_status_option_id:other?.id||null};db.prepare('insert into capability_status_records(id,person_id,workspace,kind,label,start_date,end_date,phase,remark,created_at,updated_at,replaces_record_id,deployment_location_id,other_status_option_id) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(r));if(start<=today())activate(r,actor);else log(r.person_id,space,'STATUS_PLANNED',actor,{record:r});
      }
      if(operation==='replaceDeployment'){
        const incoming=ensurePerson(actor,space,payload.personId),deployment=location(space,payload.deploymentLocationId,{active:true}),label=deployment.name,start=date(payload.startDate),end=date(payload.endDate,true);
        if(end&&end<start)throw fail('结束日期早于开始日期');if(end&&end<today())throw fail('已结束的历史请通过迁移核实，不创建当前状态');
        const outgoing=db.prepare("select * from capability_status_records where id=? and workspace=? and data_status='active'").get(payload.replacesRecordId,space);
        if(!outgoing||outgoing.kind!=='DEPLOYED'||!['ACTIVE','PLANNED'].includes(outgoing.phase))throw fail('被替换人员已不在进行中或计划派驻，请刷新后重新确认',409);
        ensureRecordedPerson(actor,space,outgoing.person_id);if(incoming.id===outgoing.person_id)throw fail('接班人员不能替换自己');if(outgoing.deployment_location_id!==deployment.id)throw fail('派驻地点已变化，请刷新后重新确认',409);if(outgoing.start_date&&start<outgoing.start_date)throw fail('接班日期不能早于原派驻开始日期');
        if(activeSuccessor(outgoing.id))throw fail('该派驻记录已有接班人员',409);if(overlap(incoming.id,start,end))throw fail('接班人员状态时段重叠',409);if(overlap(outgoing.person_id,outgoing.start_date,start,outgoing.id))throw fail('原派驻人员在交接日期前已有其他状态计划',409);
        const createdAt=stamp(),record={id:uid(),person_id:incoming.id,workspace:space,kind:'DEPLOYED',label,start_date:start,end_date:end,phase:'PLANNED',remark:trim(payload.remark),created_at:createdAt,updated_at:createdAt,replaces_record_id:outgoing.id,deployment_location_id:deployment.id};
        db.prepare('update capability_status_records set end_date=?,updated_at=? where id=?').run(start,createdAt,outgoing.id);
        db.prepare('insert into capability_status_records(id,person_id,workspace,kind,label,start_date,end_date,phase,remark,created_at,updated_at,replaces_record_id,deployment_location_id) values(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(record));
        log(outgoing.person_id,space,'DEPLOYMENT_REPLACED',actor,{recordId:outgoing.id,replacedByRecordId:record.id,previousEndDate:outgoing.end_date||'',endDate:start,location:label});
        historyId=log(record.person_id,space,'DEPLOYMENT_REPLACEMENT_CREATED',actor,{record,replaces:{recordId:outgoing.id,personId:outgoing.person_id,previousEndDate:outgoing.end_date||'',endDate:start}});
        if(start<=today())activate(record,actor);
      }
      if(['end','updateStatus','deleteStatus'].includes(operation)){
        const r=db.prepare("select * from capability_status_records where id=? and workspace=? and data_status='active'").get(payload.recordId,space);if(!r)throw fail('记录不存在或已删除',404);ensureRecordedPerson(actor,space,r.person_id);const superAdmin=isSuper(actor);if(operation==='deleteStatus'&&!superAdmin)throw fail('仅唯一超级管理员可以删除状态记录',403);if(operation!=='deleteStatus'&&!['ACTIVE','PLANNED'].includes(r.phase)&&!superAdmin)throw fail('记录已结束',409);
        if(operation==='end'){if(r.phase==='PLANNED'){db.prepare("update capability_status_records set phase='CANCELLED',updated_at=? where id=?").run(stamp(),r.id);log(r.person_id,space,'STATUS_CANCELLED',actor,{record:r});}else endRecord(r,actor,date(payload.endDate||today()));}
        else if(operation==='deleteStatus'){const reason=trim(payload.reason);if(!reason)throw fail('请填写删除原因');restoreDeletedActiveRecord(r,actor);db.prepare("update capability_status_records set data_status='deleted',deleted_at=?,deleted_by=?,deletion_reason=?,updated_at=? where id=? and data_status='active'").run(stamp(),actor.id,reason,stamp(),r.id);historyId=log(r.person_id,space,'STATUS_SAFE_DELETED',actor,{record:r,reason,previousRecordId:r.replaces_record_id||null,nextRecordId:activeSuccessor(r.id)?.id||null});}
        else {const reason=trim(payload.reason);if(!['ACTIVE','PLANNED'].includes(r.phase)&&!reason)throw fail('修改历史记录必须填写原因');const start=date(payload.startDate),requestedEnd=date(payload.endDate,true);if(requestedEnd&&requestedEnd<start)throw fail('结束日期早于开始日期');if(r.phase==='ACTIVE'&&start>today())throw fail('已生效记录不能改为未来开始');if(overlap(r.person_id,start,requestedEnd,r.id))throw fail('人员状态时段重叠',409);const previous=r.replaces_record_id?db.prepare("select * from capability_status_records where id=? and data_status='active'").get(r.replaces_record_id):null,next=activeSuccessor(r.id);if(next&&requestedEnd!==next.start_date)throw fail(`本记录已由下一位人员于${next.start_date}接班，结束日期必须与之一致`,409);const deployment=r.kind==='DEPLOYED'?location(space,payload.deploymentLocationId,{active:payload.deploymentLocationId!==r.deployment_location_id}):null,other=r.kind==='OTHER'?otherOption(space,payload.otherStatusOptionId,{active:payload.otherStatusOptionId!==r.other_status_option_id}):null,label=deployment?.name||other?.name||trim(payload.label);if(!label)throw fail('地点或项目不能为空');const chain=r.kind==='DEPLOYED'?deploymentChain(r):[r],locationChanged=deployment&&deployment.id!==r.deployment_location_id;if(locationChanged&&chain.length>1&&!superAdmin)throw fail('交接链地点不能单独修改',403);if(locationChanged&&chain.length>1&&!payload.confirmChainLocation)throw fail(`修改地点将同步更新交接链中${chain.length}条记录，请确认`,409);const changedAt=stamp();if(locationChanged&&chain.length>1)for(const linked of chain)db.prepare('update capability_status_records set label=?,deployment_location_id=?,updated_at=? where id=?').run(label,deployment.id,changedAt,linked.id);db.prepare('update capability_status_records set label=?,start_date=?,end_date=?,remark=?,deployment_location_id=?,other_status_option_id=?,updated_at=? where id=?').run(label,start,requestedEnd,trim(payload.remark),deployment?.id||null,other?.id||null,changedAt,r.id);if(previous){if(previous.start_date&&start<previous.start_date)throw fail('交接日期不能早于上一段开始日期');db.prepare('update capability_status_records set end_date=?,updated_at=? where id=?').run(start,changedAt,previous.id);}const fresh=db.prepare('select * from capability_status_records where id=?').get(r.id);if(fresh.phase==='ACTIVE'&&fresh.end_date&&fresh.end_date<today())endRecord(fresh,actor,fresh.end_date);else if(fresh.phase==='PLANNED'&&fresh.end_date&&fresh.end_date<today())db.prepare("update capability_status_records set phase='ENDED',updated_at=? where id=?").run(changedAt,fresh.id);else if(fresh.phase==='PLANNED'&&fresh.start_date<=today()&&getState(fresh.person_id)?.status==='ON_DUTY')activate(fresh,actor);log(r.person_id,space,'STATUS_UPDATED',actor,{before:r,after:{...payload,label},reason,chainLocationCount:locationChanged?chain.length:0});}
      }
      if(operation==='createDeploymentLocation'){
        const name=trim(payload.name);if(!name)throw fail('请填写派驻地点名称');if(name.length>100)throw fail('派驻地点名称不能超过100字');if(db.prepare('select id from capability_deployment_locations where workspace=? and name=?').get(space,name))throw fail('当前工作范围已有同名派驻地点',409);const id=uid(),now=stamp();db.prepare("insert into capability_deployment_locations values(?,?,?,'active',?,?,?,?)").run(id,space,name,actor.id,now,actor.id,now);historyId=log(null,space,'DEPLOYMENT_LOCATION_CREATED',actor,{id,name});
      }
      if(operation==='updateDeploymentLocation'){
        const before=location(space,payload.locationId),name=trim(payload.name),reason=trim(payload.reason);if(!name)throw fail('请填写派驻地点名称');if(name.length>100)throw fail('派驻地点名称不能超过100字');if(!reason)throw fail('请填写修改原因');const duplicate=db.prepare('select id from capability_deployment_locations where workspace=? and name=? and id<>?').get(space,name,before.id);if(duplicate)throw fail('当前工作范围已有同名派驻地点',409);db.prepare('update capability_deployment_locations set name=?,updated_by=?,updated_at=? where id=?').run(name,actor.id,stamp(),before.id);historyId=log(null,space,'DEPLOYMENT_LOCATION_UPDATED',actor,{id:before.id,beforeName:before.name,afterName:name,reason});
      }
      if(operation==='setDeploymentLocationStatus'){
        const before=location(space,payload.locationId),status=payload.status,reason=trim(payload.reason);if(!['active','inactive'].includes(status))throw fail('派驻地点状态无效');if(!reason)throw fail('请填写状态变更原因');const counts=locations(space).find(item=>item.id===before.id);if(status==='inactive'&&(counts.activeRecordCount+counts.plannedRecordCount)>0&&!payload.confirmImpact)throw fail(`该地点有${counts.activeRecordCount}条进行中、${counts.plannedRecordCount}条计划派驻，请确认后停用`,409);db.prepare('update capability_deployment_locations set status=?,updated_by=?,updated_at=? where id=?').run(status,actor.id,stamp(),before.id);historyId=log(null,space,status==='active'?'DEPLOYMENT_LOCATION_ACTIVATED':'DEPLOYMENT_LOCATION_DEACTIVATED',actor,{id:before.id,name:before.name,reason,activeRecordCount:counts.activeRecordCount,plannedRecordCount:counts.plannedRecordCount});
      }
      if(operation==='deleteDeploymentLocation'){
        const before=location(space,payload.locationId),reason=trim(payload.reason);if(!reason)throw fail('请填写删除或停用原因');const counts=locations(space).find(item=>item.id===before.id);if(counts.referenceCount===0){db.prepare('delete from capability_deployment_locations where id=?').run(before.id);historyId=log(null,space,'DEPLOYMENT_LOCATION_DELETED',actor,{id:before.id,name:before.name,reason});}else{if((counts.activeRecordCount+counts.plannedRecordCount)>0&&!payload.confirmImpact)throw fail(`该地点已被引用，其中${counts.activeRecordCount}条进行中、${counts.plannedRecordCount}条计划派驻；确认后将停用而不是删除`,409);db.prepare("update capability_deployment_locations set status='inactive',updated_by=?,updated_at=? where id=?").run(actor.id,stamp(),before.id);historyId=log(null,space,'DEPLOYMENT_LOCATION_DELETE_REJECTED_AND_DEACTIVATED',actor,{id:before.id,name:before.name,reason,referenceCount:counts.referenceCount});}
      }
      if(operation==='createOtherStatusOption'){
        const name=trim(payload.name);if(!name)throw fail('请填写其他状态名称');if(name.length>200)throw fail('其他状态名称不能超过200字');if(db.prepare('select id from capability_other_status_options where workspace=? and name=?').get(space,name))throw fail('当前工作范围已有同名其他状态',409);const id=uid(),now=stamp();db.prepare("insert into capability_other_status_options values(?,?,?,'active',?,?,?,?)").run(id,space,name,actor.id,now,actor.id,now);historyId=log(null,space,'OTHER_STATUS_OPTION_CREATED',actor,{id,name});
      }
      if(operation==='updateOtherStatusOption'){
        const before=otherOption(space,payload.optionId),name=trim(payload.name),reason=trim(payload.reason);if(!name)throw fail('请填写其他状态名称');if(name.length>200)throw fail('其他状态名称不能超过200字');if(!reason)throw fail('请填写修改原因');if(db.prepare('select id from capability_other_status_options where workspace=? and name=? and id<>?').get(space,name,before.id))throw fail('当前工作范围已有同名其他状态',409);db.prepare('update capability_other_status_options set name=?,updated_by=?,updated_at=? where id=?').run(name,actor.id,stamp(),before.id);historyId=log(null,space,'OTHER_STATUS_OPTION_UPDATED',actor,{id:before.id,beforeName:before.name,afterName:name,reason});
      }
      if(operation==='setOtherStatusOptionStatus'){
        const before=otherOption(space,payload.optionId),status=payload.status,reason=trim(payload.reason);if(!['active','inactive'].includes(status))throw fail('其他状态目录项状态无效');if(!reason)throw fail('请填写状态变更原因');const counts=otherOptions(space).find(item=>item.id===before.id);if(status==='inactive'&&(counts.activeRecordCount+counts.plannedRecordCount)>0&&!payload.confirmImpact)throw fail(`该状态有${counts.activeRecordCount}条进行中、${counts.plannedRecordCount}条计划记录，请确认后停用`,409);db.prepare('update capability_other_status_options set status=?,updated_by=?,updated_at=? where id=?').run(status,actor.id,stamp(),before.id);historyId=log(null,space,status==='active'?'OTHER_STATUS_OPTION_ACTIVATED':'OTHER_STATUS_OPTION_DEACTIVATED',actor,{id:before.id,name:before.name,reason,activeRecordCount:counts.activeRecordCount,plannedRecordCount:counts.plannedRecordCount});
      }
      if(operation==='deleteOtherStatusOption'){
        const before=otherOption(space,payload.optionId),reason=trim(payload.reason);if(!reason)throw fail('请填写删除或停用原因');const counts=otherOptions(space).find(item=>item.id===before.id);if(counts.referenceCount===0){db.prepare('delete from capability_other_status_options where id=?').run(before.id);historyId=log(null,space,'OTHER_STATUS_OPTION_DELETED',actor,{id:before.id,name:before.name,reason});}else{if((counts.activeRecordCount+counts.plannedRecordCount)>0&&!payload.confirmImpact)throw fail(`该状态已被引用，其中${counts.activeRecordCount}条进行中、${counts.plannedRecordCount}条计划记录；确认后将停用而不是删除`,409);db.prepare("update capability_other_status_options set status='inactive',updated_by=?,updated_at=? where id=?").run(actor.id,stamp(),before.id);historyId=log(null,space,'OTHER_STATUS_OPTION_DELETE_REJECTED_AND_DEACTIVATED',actor,{id:before.id,name:before.name,reason,referenceCount:counts.referenceCount});}
      }
      if(operation==='config'){
        const snap=snapshot(actor,space);const input=payload.config;if(!input||!Array.isArray(input.priority))throw fail('配置格式无效');const keys=new Set(snap.projects.map(p=>p.key));if(snap.projects.length&&!input.priority.length)throw fail('至少保留一个重点项目');if(input.priority.some(k=>!keys.has(k)))throw fail('重点项目无效');
        if(input.labels!=null&&(!Array.isArray(input.labels)||input.labels.some(k=>!keys.has(k))))throw fail('卡片标签无效');for(const values of Object.values(input.targets||{}))for(const [g,v] of Object.entries(values)){if(!GROUPS.includes(g))throw fail('门限班组无效');assertNumber(v);}for(const [g,v] of Object.entries(input.headcounts||{})){if(!GROUPS.includes(g))throw fail('人数班组无效');assertNumber(v);}
        const config=normalizeConfig(snap.projects,input);db.prepare('insert into capability_configuration values(?,?) on conflict(workspace) do update set payload=excluded.payload').run(space,JSON.stringify(config));log(null,space,'CONFIGURATION_CHANGED',actor,{before:snap.config,after:config});
      }
      if(operation==='saveScenario'){
        if(!trim(payload.name))throw fail('请填写方案名称');if(payload.baseRevision!==revision())throw fail('方案基准已过期',409);validateScenario(actor,space,payload.states);
        const effectiveAt=scenarioTime(payload.effectiveAt);if(effectiveAt)requirePermission(actor,'capability.scenario.apply');
        const baseline=snapshot(actor,space).states,intents=scenarioIntents(baseline,payload.states),id=uid();db.prepare('insert into capability_scenarios(id,workspace,name,base_revision,payload,created_by,updated_at,effective_at,schedule_status,baseline_payload) values(?,?,?,?,?,?,?,?,?,?)').run(id,space,trim(payload.name),payload.baseRevision,JSON.stringify({states:payload.states,intents}),actor.id,stamp(),effectiveAt,effectiveAt?'pending':'saved',JSON.stringify({states:baseline}));log(null,space,'SCENARIO_SAVED',actor,{id,name:payload.name,effectiveAt,intents});
      }
      if(operation==='deleteScenario'){const s=db.prepare('select * from capability_scenarios where id=? and workspace=?').get(payload.scenarioId,space);if(!s)throw fail('方案不存在',404);if(s.schedule_status==='pending')throw fail('请先取消待生效的定时方案',409);db.prepare('delete from capability_scenarios where id=?').run(s.id);log(null,space,'SCENARIO_DELETED',actor,{scenario:s});}
      if(operation==='cancelScenario'){const s=db.prepare('select * from capability_scenarios where id=? and workspace=?').get(payload.scenarioId,space);if(!s)throw fail('方案不存在',404);if(s.schedule_status!=='pending')throw fail('只有待生效方案可以取消',409);db.prepare("update capability_scenarios set schedule_status='cancelled',updated_at=? where id=?").run(stamp(),s.id);log(null,space,'SCENARIO_SCHEDULE_CANCELLED',actor,{scenarioId:s.id,effectiveAt:s.effective_at});}
      if(operation==='rescheduleScenario'){const s=db.prepare('select * from capability_scenarios where id=? and workspace=?').get(payload.scenarioId,space);if(!s)throw fail('方案不存在',404);if(!['pending','cancelled'].includes(s.schedule_status))throw fail('该方案不能改期；冲突方案需重新保存',409);const effectiveAt=scenarioTime(payload.effectiveAt);if(!effectiveAt)throw fail('请选择生效时间');db.prepare("update capability_scenarios set effective_at=?,schedule_status='pending',conflict_payload=null,updated_at=? where id=?").run(effectiveAt,stamp(),s.id);log(null,space,'SCENARIO_RESCHEDULED',actor,{scenarioId:s.id,before:s.effective_at,effectiveAt});}
      if(operation==='applyScenario'){
        const s=payload.scenarioId?db.prepare('select * from capability_scenarios where id=? and workspace=?').get(payload.scenarioId,space):null;if(payload.scenarioId&&!s)throw fail('方案不存在',404);
        const sourceScenario=payload.sourceScenarioId?db.prepare('select * from capability_scenarios where id=? and workspace=?').get(payload.sourceScenarioId,space):null;if(payload.sourceScenarioId&&!sourceScenario)throw fail('原方案不存在',404);
        const states=s?parse(s.payload).states:payload.states;const base=s?Number(s.base_revision):payload.baseRevision;if(base!==revision())throw fail('方案基准已过期，需重新计算',409);validateScenario(actor,space,states);
        for(const target of states.filter(s=>s.status==='ON_DUTY').sort((a,b)=>a.index-b.index))move(actor,space,target.personId,target.workingGroup,target.index,'应用方案');if(s||sourceScenario)db.prepare("update capability_scenarios set schedule_status='applied',applied_at=?,updated_at=? where id=?").run(stamp(),stamp(),(s||sourceScenario).id);log(null,space,'SCENARIO_APPLIED',actor,{scenarioId:s?.id||sourceScenario?.id||null,modifiedFromSaved:!!sourceScenario&&hash(states)!==hash(parse(sourceScenario.payload).states)});
      }
      const beforeRevision=revision();const next=['saveScenario','deleteScenario'].includes(operation)?beforeRevision:event('CAPABILITY_UPDATED');const result={ok:true,revision:next,historyId};db.prepare('insert into capability_commands values(?,?,?,?)').run(payload.requestId,actor.id,requestHash,JSON.stringify(result));audit(actor,'capability_'+operation,'capability',space,JSON.stringify({revision:next,...(operation==='replaceDeployment'?{incomingPersonId:payload.personId,replacesRecordId:payload.replacesRecordId,handoverDate:payload.startDate,deploymentLocationId:payload.deploymentLocationId}:{}),...(['updateStatus','deleteStatus'].includes(operation)?{recordId:payload.recordId,reason:trim(payload.reason)}:{})}));return result;
    });}catch(error){if(operation.endsWith('DeploymentLocation'))audit(actor,'capability_'+operation+'_rejected','capability',space,JSON.stringify({status:error.status||500,error:error.message,locationId:payload.locationId||null}));throw error;}publish();return result;
  }
  function validateScenario(actor,space,states){if(!Array.isArray(states))throw fail('方案状态无效');const people=context(actor,space).visible;const map=new Map(states.map(s=>[s.personId,s]));if(map.size!==people.length||states.length!==people.length)throw fail('方案人员与当前范围不一致');for(const p of people){const target=map.get(p.id),live=getState(p.id);if(!target||target.status!==live.status||target.recordId!==live.recordId)throw fail('方案状态已变化，需重新计算',409);ensureTarget(actor,space,target.workingGroup);if(!Number.isSafeInteger(target.index)||target.index<0)throw fail('方案顺序无效');if(target.status!=='ON_DUTY'&&target.workingGroup!==live.workingGroup)throw fail('非在岗人员不能调配');}}
  function report(actor,space){requirePermission(actor,'capability.report.export');return {...snapshot(actor,space),exportedAt:stamp(),schemaVersion:2,source:'center-master'};}
  return {init,revision,masterRevision,readiness:()=>({ready,issue:readinessIssue,source:'center-master'}),organizationIssues,nonParticipants,syncMaster,schedule,spaces,snapshot,personAuthorizations,command,report,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
}
