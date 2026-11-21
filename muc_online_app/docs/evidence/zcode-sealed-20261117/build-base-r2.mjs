// build-base-r2.mjs — REVISED 2026-11-17 (v3 guard hardening after review:
// v2 string-prefix check was bypassable via /private/tmp/../../…).
// Changes v3: (1) never delete or overwrite — output file must NOT pre-exist;
// (2) validate the NORMALIZED absolute path AND the REALPATH of its parent
// directory (resolves '..' and symlink escapes) against system temp roots;
// (3) default output goes into a freshly created dedicated mkdtemp directory.
// Builds a fresh SYNTHETIC base sqlite fixture by importing the real app (DDL+seed only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const APP='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app';
function resolveOutput(raw){
  const normalized=path.resolve(raw); // collapses .. segments
  const parentReal=fs.realpathSync(path.dirname(normalized)); // resolves symlinked parents
  const finalPath=path.resolve(parentReal,path.basename(normalized));
  // Compare BOTH raw-resolved and realpath variants against BOTH raw and realpath temp roots
  // (macOS: os.tmpdir()=/var/folders/… whose realpath is /private/var/folders/…).
  const tempRoots=[...new Set([os.tmpdir(),fs.realpathSync(os.tmpdir()),'/private/tmp',fs.realpathSync('/private/tmp')])].map(root=>path.resolve(root)+path.sep);
  const inTemp=t=>{const variants=[t,path.resolve(fs.realpathSync(path.dirname(t)),path.basename(t))];return tempRoots.some(root=>variants.some(v=>v.startsWith(root)));};
  if(!inTemp(normalized)||!inTemp(finalPath)||!/[\/]base(-r2)?\.sqlite$/.test(finalPath))throw Error('refusing non-synthetic output path: '+raw+' (normalized '+normalized+')');
  if(fs.existsSync(finalPath))throw Error('refusing to overwrite existing file: '+finalPath);
  return {finalPath,dbPath:finalPath,uploadDir:finalPath.replace(/\.sqlite$/,'')+'-uploads'};
}
const requested=process.env.BASE_OUT;
const target=requested?resolveOutput(requested):(()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'muc-synth-base-'));return resolveOutput(path.join(dir,'base.sqlite'));})();
try{
 process.env.MUC_NO_LISTEN='1';process.env.NODE_ENV='test';process.env.DATABASE_URL='';
 process.env.DB_PATH=target.dbPath;process.env.UPLOAD_DIR=target.uploadDir;
 process.env.APP_VERSION='test-version';
 process.env.COS_SECRET_ID='test-secret-id';process.env.COS_SECRET_KEY='test-secret-key';process.env.COS_BUCKET='test-bucket-1234567890';process.env.COS_REGION='ap-shanghai';
 for(const k of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])process.env[k]='false';
 const {db}=await import(APP+'/server.mjs');
 const tables=db.prepare("select count(*) n from sqlite_master where type='table'").get().n;
 const user=db.prepare("select id,username,person_id from users where id='54002010'").get();
 const roles=db.prepare('select count(*) n from rbac_roles').get().n;
 if(!user||tables<130||roles<30)throw Error('fixture seed incomplete');
 await db.close?.();
 console.log(JSON.stringify({ok:true,out:target.dbPath,tables,user,roles}));
}catch(error){console.error('BUILD FAILED:',error?.message||error);process.exit(1);}
