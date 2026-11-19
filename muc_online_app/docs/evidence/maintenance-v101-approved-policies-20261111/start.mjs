import fs from 'node:fs';
import http from 'node:http';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-generic-consent-ui-qjsgyijh/synthetic.sqlite';process.env.UPLOAD_DIR='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-generic-consent-ui-qjsgyijh/uploads';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
process.env.MUC_MAINTENANCE_V101='draft';for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
const stamp=new Date().toISOString(),user=db.prepare("select * from users where id='54002010'").get(),person=db.prepare('select * from personnel where id=?').get(user.person_id);
db.prepare("insert into maintenance_flights(id,date,flight_no,aircraft_no,aircraft_type,work_kind,status,created_by,created_at,updated_at) values('qa-manual-flight','2026-11-10','QA901','B-QA','A320','停场','已派工',?,?,?)").run(user.id,stamp,stamp);
db.prepare("insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,role,status,assigned_by,assigned_at) values('qa-manual-assignment','flight','qa-manual-flight','qa-manual-flight',?,?,'例行检查','已派工',?,?)").run(user.person_id,user.name,user.id,stamp);
for(const [index,code]of ['A320','B737'].entries()){const id='qa-manual-standard-'+index;db.prepare("insert into maintenance_standards(id,status,revision,created_by,created_at,updated_at) values(?,'PUBLISHED',1,?,?,?)").run(id,user.id,stamp,stamp);db.prepare("insert into maintenance_standard_versions(id,standard_id,version,category,chapter,title,work_scope,standard_hours,aircraft_codes_json,generic_aircraft,status,admission_decision,effective_at,published_by,published_at,created_at) values(?,?,1,'试车','995',?,'机型精确匹配及合法0测试范围',0,?,0,'PUBLISHED','INCLUDE',?,?,?,?)").run(id+'-v1',id,'手工浏览器零工时'+code,JSON.stringify([code]),stamp,user.id,stamp,stamp);}
fs.writeFileSync(new URL('./person-id.txt',import.meta.url),user.person_id);
console.log('QA_PERSON '+user.person_id);const insert=(table,row)=>db.prepare(`insert into ${table}(${Object.keys(row).join(',')}) values(${Object.keys(row).map(()=>'?').join(',')})`).run(...Object.values(row));
insert('personnel',{...person,id:'qa-publisher-person',employee_no:'88009999',name:'测试独立发布负责人'});
insert('users',{...user,id:'qa-publisher',username:'88009999',person_id:'qa-publisher-person',name:'测试独立发布负责人',role:'receiver'});
for(const code of ['worker','addon_maintenance_standard_publisher'])insert('rbac_user_roles',{user_id:'qa-publisher',role_id:db.prepare('select id from rbac_roles where code=?').get(code).id,created_at:stamp});
insert('rbac_user_scopes',{user_id:'qa-publisher',module:'maintenance',scope_type:'all',scope_id:'',valid_from:'',valid_to:'',created_at:stamp,updated_at:stamp});
db.prepare("insert into settings(key,value,updated_at) values('maintenance_aircraft_hours_v1',?,?) on conflict(key) do update set value=excluded.value,updated_at=excluded.updated_at").run(JSON.stringify({version:1,groups:[{id:'qa-exact-a320',name:'测试精确机型',codes:['A320'],enabled:true,hours:{}}]}),stamp);
const {publicationFixture}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/tests/fixtures/maintenance-standard-publication.mjs');
const fixture=publicationFixture({after(){}},{db,accounts:{publisher:{id:'qa-publisher',personId:'qa-publisher-person'},finalizer:{id:user.id,personId:user.person_id}},genericAircraft:true,aircraftCodes:[]});
fs.writeFileSync(new URL('./publication-source.json',import.meta.url),JSON.stringify({standardId:fixture.id,versionId:fixture.versionId}));

http.createServer(measuredRoute).listen(18888,'127.0.0.1',()=>console.log('QA_READY'));
