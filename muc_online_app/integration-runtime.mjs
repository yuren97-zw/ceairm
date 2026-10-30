import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export function integrationDatabase(url,{ci=false}={}) {
  const parsed=new URL(url);
  if(!['postgres:','postgresql:'].includes(parsed.protocol)||parsed.hostname!=='127.0.0.1'||parsed.search||parsed.hash)throw Error('Only an explicit loopback integration database is allowed');
  const expected=ci?['5432','/airline_operations']:['55432','/ceairm_integration'];
  if(parsed.port!==expected[0]||parsed.pathname!==expected[1]||!parsed.username||!parsed.password)throw Error('Integration database identity mismatch');
  return parsed.href;
}

export function integrationEnvironment({databaseUrl,root,sha,port=8800,ambient={},ci=false,adminPassword=crypto.randomBytes(32).toString('base64url')}) {
  integrationDatabase(databaseUrl,{ci});
  if(!path.isAbsolute(root)||! /^[0-9a-f]{40}$/.test(sha)||!Number.isInteger(port)||port<1024||[5432,55432,8787,8788,8792].includes(port))throw Error('Unsafe integration runtime identity');
  const safe=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TZ','TMPDIR'].filter(k=>typeof ambient[k]==='string').map(k=>[k,ambient[k]]));
  return {...safe,NODE_ENV:'test',HOST:'127.0.0.1',PORT:String(port),MUC_INTEGRATION:'true',MUC_BUILD_SHA:sha,APP_VERSION:'integration-'+sha,APP_ORIGIN:`http://127.0.0.1:${port}`,COOKIE_SECURE:'false',DATABASE_URL:databaseUrl,PGSSLMODE:'disable',DB_PATH:path.join(root,'unused.sqlite'),UPLOAD_DIR:path.join(root,'uploads'),ATTENDANCE_ENV_FILE:'',ATTENDANCE_SYNC_ENABLED:'false',ATTENDANCE_WORKER_ENABLED:'false',ATTENDANCE_EVENTS_ENABLED:'false',ATTENDANCE_APPROVAL_PLANS_ENABLED:'false',ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED:'false',ATTENDANCE_VALIDATION_ENABLED:'false',ATTENDANCE_MANUAL_ONLY:'true',INITIAL_ADMIN_PASSWORD:adminPassword};
}

export function readIntegrationConfig(file) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.nlink!==1||(stat.mode&0o077))throw Error('Integration credentials must be a private regular file');
  const config=JSON.parse(fs.readFileSync(file,'utf8'));
  integrationDatabase(config.databaseUrl);
  return config;
}
