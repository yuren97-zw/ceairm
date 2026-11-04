// 考勤线唯一真实执行入口（8792）。从考勤线工作树根读取 work/ 下的数据库、
// 凭据与阶段文件；默认 fail-closed，仅 stage=realtime 时开启真实事件接收。
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
delete process.env.DATABASE_URL;
process.loadEnvFile(path.join(root,'work/hybrid-validation.env'));
const stageFile=path.join(root,'work/8792-stage.json');
const stage=fs.existsSync(stageFile)?JSON.parse(fs.readFileSync(stageFile,'utf8')):{stage:'manual'};
if(!['manual','realtime'].includes(stage.stage))throw Error('8792_STAGE_INVALID');
const realtime=stage.stage==='realtime';
Object.assign(process.env,{PORT:'8792',HOST:'127.0.0.1',DB_PATH:path.join(root,'work/attendance-hybrid-stream.sqlite'),UPLOAD_DIR:path.join(root,'work/preview-uploads'),ATTENDANCE_START_DATE:'2026-10-01',ATTENDANCE_APPROVAL_PLANS_ENABLED:'true',ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED:'true',ATTENDANCE_SYNC_ENABLED:'false',ATTENDANCE_WORKER_ENABLED:'true',ATTENDANCE_EVENTS_ENABLED:String(realtime),ATTENDANCE_VALIDATION_ENABLED:'false',ATTENDANCE_MANUAL_ONLY:String(!realtime)});
delete process.env.ATTENDANCE_ENV_FILE;
await import('../server.mjs');
