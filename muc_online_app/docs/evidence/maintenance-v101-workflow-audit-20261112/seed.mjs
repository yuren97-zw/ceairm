import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const root=new URL('.',import.meta.url).pathname;
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=root+'synthetic-audit.sqlite';process.env.UPLOAD_DIR=root+'uploads';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
for(const key of ['MUC_WORKFLOW_TASKS_ENABLED','MUC_WORKFLOW_SIMULATION_ENABLED','MUC_NONSETTLEMENT_MODULES_ENABLED','MUC_MAINTENANCE_MODULE_INSTANCES_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
const stamp=new Date().toISOString(),template=db.prepare("select * from users where id='54002010'").get(),group=db.prepare("select id,parent_id from organization_units where unit_type='personnel_group' and maintenance_eligible=1 order by code limit 1").get(),team=db.prepare("select id from organization_units where unit_type='administrative_team' and parent_id=? order by code limit 1").get(group.id);
for(const [index,kind] of ['manager','worker','other'].entries()){
 const id='workflow-ui-'+kind,personId='person-'+id,name={manager:'模拟流程负责人',worker:'模拟任务甲',other:'模拟任务乙'}[kind];
 if(db.prepare('select id from users where id=?').get(id))continue;
 db.prepare("insert into personnel(id,employee_no,name,department,home_team,employment_status,data_status,department_id,personnel_group_id,administrative_team_id,created_at,updated_at) values(?,?,?,?,?,'在职','active',?,?,?,?,?)").run(personId,'9900000'+index,name,'维修部','一组',group.parent_id,group.id,team.id,stamp,stamp);
 const row={...template,id,username:id,name,role:'receiver',status:'active',person_id:personId};db.prepare(`insert into users(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
 for(const code of ['worker',...(kind==='manager'?['addon_maintenance_module_manager','addon_maintenance_workflow_manager']:['addon_maintenance_workflow_participant'])])db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(id,db.prepare('select id from rbac_roles where code=?').get(code).id,stamp);
 db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,'maintenance',?,'','','',?,?)").run('scope-'+id,id,kind==='manager'?'all':'self',stamp,stamp);
}
const server=http.createServer(measuredRoute);await new Promise(resolve=>server.listen(18888,'127.0.0.1',resolve));
const request=async(path,body,cookie)=>{const r=await fetch('http://127.0.0.1:18888'+path,{method:body?'POST':'GET',headers:{origin:'http://127.0.0.1:18888',...(body?{'content-type':'application/json'}:{}),...(cookie?{cookie}:{})},body:body?JSON.stringify(body):undefined});const payload=await r.json();assert.ok(r.ok,JSON.stringify({path,status:r.status,payload}));return {payload,cookie:r.headers.get('set-cookie')?.split(';')[0]};};
const admin=await request('/api/login',{username:'54002010',password:'muc2026'}),manager=await request('/api/login',{username:'workflow-ui-manager',password:'muc2026'});
const created=await request('/api/maintenance/flights',{date:'2026-11-12',flightNo:'SIMUI001',aircraftNo:'B-SIMUI',aircraftType:'A320',workKind:'停场'},admin.cookie),flightId=created.payload.flight.id;
const identity=await request(`/api/maintenance/flights/${flightId}/extension-modules`,null,manager.cookie);
const registration=await request(`/api/maintenance/flights/${flightId}/extension-modules`,{moduleTypeCode:'extension_workflow_simulation',moduleVersion:1,resultType:'CHECK_RESULT',instanceKey:'browser_new',expectedRuleSnapshot:identity.payload.ruleSnapshotSha256,reason:'独立浏览器模拟验证'},manager.cookie);
fs.writeFileSync(root+'metadata.json',JSON.stringify({syntheticOnly:true,flightId,moduleInstanceId:registration.payload.module.moduleInstanceId,originalFlight:db.prepare('select * from maintenance_flights where id=?').get(flightId),originalHours:db.prepare('select * from maintenance_effective_hour_results order by id').all()},null,2));
console.log('QA_READY');
process.on('SIGINT',()=>server.close(async()=>{fs.writeFileSync(root+'final-db.json',JSON.stringify({flight:db.prepare('select * from maintenance_flights where id=?').get(flightId),hours:db.prepare('select * from maintenance_effective_hour_results order by id').all(),workflows:db.prepare('select * from maintenance_workflow_instances').all(),tasks:db.prepare('select * from maintenance_workflow_tasks').all(),events:db.prepare('select * from maintenance_workflow_events').all()},null,2));await db.close?.();process.exit(0);}));
