import fs from 'node:fs';
import http from 'node:http';
const root=new URL('.',import.meta.url).pathname;
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH=root+'clean.sqlite';process.env.UPLOAD_DIR=root+'uploads';process.env.MUC_MAINTENANCE_COORDINATOR_ENABLED='1';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[key]='false';
process.env.MUC_MAINTENANCE_V101='draft';for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_FINALIZATION_ENABLED','MUC_MAINTENANCE_PERIODS_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
const server=http.createServer(measuredRoute);server.listen(18888,'127.0.0.1',()=>console.log('QA_READY'));
process.on('SIGINT',()=>server.close(async()=>{fs.writeFileSync(root+'final-db.json',JSON.stringify({assignments:db.prepare('select * from maintenance_assignments order by id').all(),drafts:db.prepare('select * from maintenance_report_drafts order by id').all(),flights:db.prepare('select * from maintenance_flights').all(),hours:db.prepare('select * from maintenance_effective_hour_results').all()},null,2));await db.close?.();process.exit(0);}));
