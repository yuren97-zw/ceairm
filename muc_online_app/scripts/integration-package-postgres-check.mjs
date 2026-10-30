// Temporary local acceptance only. Credentials are inherited, never written to logs or archives.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
const archive=process.argv[2];
if(!archive?.startsWith('/private/tmp/ceairm-info-')||!process.env.DATABASE_URL)throw Error('Requires the isolated integration archive and PostgreSQL database');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-pg-package-'));
execFileSync('tar',['-xzf',archive,'-C',root]);
for(const file of ['allocation-areas.mjs','attachment-policy.mjs','deployment-handover.mjs','attendance-service.mjs','backup-envelope.mjs','backup-cos.mjs','scripts/create-encrypted-backup.mjs','scripts/verify-encrypted-backup.mjs','public/attendance-approval-plan-view.mjs','public/pptx-worker.mjs','migrations/026_capability_allocation_pools.sql'])await fs.access(path.join(root,file));
const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));assert.ok(![5432,8787,8788].includes(port));
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,MUC_NO_LISTEN:'0',NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),DB_PATH:path.join(root,'unused.sqlite'),UPLOAD_DIR:path.join(root,'uploads'),ATTENDANCE_SYNC_ENABLED:'false',ATTENDANCE_ENV_FILE:'',COS_SECRET_ID:'',COS_SECRET_KEY:'',COS_BUCKET:'',COS_REGION:''},stdio:'ignore'});
try{
 let health;for(let i=0;i<100;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){health=await r.json();break;}}catch{}if(child.exitCode!==null)throw Error('PostgreSQL package startup failed');await new Promise(r=>setTimeout(r,100));}
 assert.equal(health?.ok,true);assert.equal(health.database,'postgres');
 assert.equal((await fetch(`http://127.0.0.1:${port}/api/attendance/status`)).status,401);
 console.log(JSON.stringify({standalone:true,postgres:true,protectedAttendance:true,allRuntimeModules:true,root}));
}finally{child.kill('SIGTERM');if(child.exitCode===null)await new Promise(r=>child.once('exit',r));}
