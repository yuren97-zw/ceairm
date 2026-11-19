import fs from 'node:fs';
import http from 'node:http';
process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';process.env.DB_PATH='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-v101-standard-import-ui-6fgnfln8/synthetic.sqlite';process.env.UPLOAD_DIR='/var/folders/h0/tmqh6fwn08b5y8ct0nn3w7q80000gn/T/muc-v101-standard-import-ui-6fgnfln8/uploads';
for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED'])process.env[key]='false';
process.env.MUC_MAINTENANCE_V101='draft';for(const key of ['MUC_NONROUTINE_REVIEW_ENABLED','MUC_NONROUTINE_SUBMISSION_ENABLED','MUC_NONROUTINE_MANUAL_ENABLED','MUC_STANDARDS_REVIEW_ENABLED','MUC_STANDARDS_PUBLICATION_ENABLED','MUC_STANDARDS_MANAGEMENT_ENABLED','MUC_STANDARDS_IMPORT_ENABLED'])process.env[key]='1';
const {db,measuredRoute}=await import('/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/server.mjs');
http.createServer(measuredRoute).listen(18888,'127.0.0.1',()=>console.log('QA_RESUME_READY'));
