import fs from 'node:fs';
import http from 'node:http';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-home-browser-mbkb4ksl/synthetic.sqlite';process.env.UPLOAD_DIR='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-home-browser-mbkb4ksl/uploads';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
process.env.MUC_MAINTENANCE_V101='draft';for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED','MUC_STANDARDS_MANAGEMENT_ENABLED','MUC_STANDARDS_IMPORT_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');

const user=db.prepare("select * from users where id='54002010'").get(),stamp=new Date().toISOString();
for(let index=0;index<501;index++){
 const id='home-'+index;
 db.prepare("insert into maintenance_flights(id,date,flight_no,aircraft_no,aircraft_type,work_kind,status,created_by,created_at,updated_at) values(?,'2026-11-11',?,'B-HOME','A320','停场','已派工',?,?,?)").run(id,'HOME'+index,user.id,stamp,stamp);
 db.prepare("insert into maintenance_assignments(id,owner_type,owner_id,flight_id,person_id,user_name,role,status,assigned_by,assigned_at) values(?,'flight',?,?,?,?,'例行检查','已派工',?,?)").run('assignment-'+id,id,id,user.person_id,user.name,user.id,stamp);
}
http.createServer(measuredRoute).listen(18888,'127.0.0.1',()=>console.log('READY'));
