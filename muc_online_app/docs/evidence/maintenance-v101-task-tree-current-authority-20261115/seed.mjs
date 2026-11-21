import fs from 'node:fs';
import http from 'node:http';
const root=new URL('.',import.meta.url).pathname;
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=root+'synthetic.sqlite';process.env.UPLOAD_DIR=root+'uploads';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[key]='false';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
const sample=db.prepare("select p.* from personnel p join users u on u.person_id=p.id where u.id='54002010'").get();
const template=db.prepare("select * from users where id='54002010'").get();
for(const [n,name] of [[1,'实际作业甲'],[2,'复核修订乙']]){
 const person={...sample,id:'person-browser-actual-'+n,employee_no:'9997999'+n,name};db.prepare(`insert into personnel(${Object.keys(person).join(',')}) values(${Object.keys(person).map(()=>'?').join(',')})`).run(...Object.values(person));
 const user={...template,id:'browser-actual-'+n,username:'browser-actual-'+n,person_id:person.id,name,role:'receiver',status:'active'};db.prepare(`insert into users(${Object.keys(user).join(',')}) values(${Object.keys(user).map(()=>'?').join(',')})`).run(...Object.values(user));
 db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run(user.id,db.prepare("select id from rbac_roles where code='worker'").get().id,new Date().toISOString());
 db.prepare("insert into rbac_user_scopes(id,user_id,module,scope_type,scope_id,valid_from,valid_to,created_at,updated_at) values(?,?,'maintenance','all','','','',?,?)").run('scope-browser-'+n,user.id,new Date().toISOString(),new Date().toISOString());
}
db.prepare('insert into rbac_user_roles(user_id,role_id,created_at) values(?,?,?)').run('browser-actual-1',db.prepare("select id from rbac_roles where code='addon_maintenance_review'").get().id,new Date().toISOString());
db.prepare("update rbac_user_scopes set scope_type='self',scope_id='' where user_id='browser-actual-1' and module='maintenance'").run();
const server=http.createServer(measuredRoute);server.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));
process.on('SIGINT',()=>server.close(async()=>{fs.writeFileSync(root+'final-db.json',JSON.stringify({assignments:db.prepare('select * from maintenance_assignments order by id').all(),drafts:db.prepare('select * from maintenance_report_drafts order by id').all(),flights:db.prepare('select * from maintenance_flights').all(),hours:db.prepare('select * from maintenance_effective_hour_results').all()},null,2));await db.close?.();process.exit(0);}));
