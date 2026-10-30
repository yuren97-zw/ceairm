import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {integrationEnvironment,readIntegrationConfig} from '../integration-runtime.mjs';

const [archive,sha,mode]=process.argv.slice(2);
if(!archive||!path.isAbsolute(archive)||! /^[0-9a-f]{40}$/.test(sha)||!['--check','--serve'].includes(mode))throw Error('Usage: check-integration-package.mjs ABSOLUTE_ARCHIVE SHA --check|--serve');
const ci=process.env.CI==='true'&&process.env.ATTENDANCE_TEST_DATABASE==='true';
if(ci&&mode==='--serve')throw Error('CI cannot serve a persistent preview');
const config=ci?{databaseUrl:process.env.DATABASE_URL}:readIntegrationConfig(process.env.MUC_INTEGRATION_CONFIG);
const expected=(await fs.readFile(archive+'.sha256','utf8')).trim().split(/\s+/)[0];
const actual=crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
assert.equal(actual,expected,'Artifact checksum mismatch');
const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
for(const entry of entries)if(path.posix.isAbsolute(entry)||entry.split('/').includes('..'))throw Error('Unsafe archive path');
const verbose=execFileSync('tar',['-tvzf',archive],{encoding:'utf8'});
// Runtime archives must not contain links or device files; npm runtime deps are regular files.
if(verbose.split('\n').filter(Boolean).some(line=>!['-','d'].includes(line[0])))throw Error('Archive contains links or special files');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-integration-package-'));
execFileSync('tar',['-xzf',archive,'-C',root]);
const version=(await fs.readFile(path.join(root,'.release-version'),'utf8')).trim();
assert.ok(version.endsWith(sha),'Artifact version must identify the requested commit');
for(const file of ['server.mjs','backup-envelope.mjs','backup-cos.mjs','public/attendance-approval-plan-view.mjs','scripts/create-encrypted-backup.mjs'])await fs.access(path.join(root,file));
const probe=net.createServer();let port=8800;
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(ci?0:8800,'127.0.0.1',()=>{port=probe.address().port;probe.close(resolve);});});
const env=integrationEnvironment({databaseUrl:config.databaseUrl,root,sha,port,ci,ambient:process.env,adminPassword:config.adminPassword});
execFileSync(process.execPath,['scripts/run-postgres-migrations.mjs'],{cwd:root,env,stdio:'pipe'});
execFileSync(process.execPath,['scripts/run-postgres-migrations.mjs'],{cwd:root,env,stdio:'pipe'});
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,stdio:['ignore','pipe','pipe']});
// Do not forward application output: it can contain initialization/account information.
let diagnostic='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-1000);});
const stop=()=>{if(child.exitCode===null)child.kill('SIGTERM');};
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,stop);
try {
 let ready=false;for(let i=0;i<200;i++){
  if(child.exitCode!==null)throw Error('Integration package exited before readiness; inspect isolated runtime, not production');
  try{const response=await fetch(`http://127.0.0.1:${port}/api/health`);const health=await response.json();if(response.ok&&health.status==='ok'){assert.equal(health.database,'postgres');assert.equal(health.buildSha,sha);ready=true;break;}}catch(error){if(error.code==='ERR_ASSERTION')throw error;}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.ok(ready,'Integration package readiness timeout');
 const origin=`http://127.0.0.1:${port}`;
 for(const endpoint of ['/api/attendance/status','/api/maintenance/flights','/api/records'])assert.equal((await fetch(origin+endpoint)).status,401,endpoint+' authentication');
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'54002010',password:env.INITIAL_ADMIN_PASSWORD})});
 assert.equal(login.status,200,'Synthetic integration admin login');
 const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('muc_integration_sid='));
 for(const endpoint of ['/api/me','/api/maintenance/flights','/api/attendance/status','/api/attendance/summary?month=2026-10&view=summary']){
  const response=await fetch(origin+endpoint,{headers:{cookie}});assert.equal(response.status,200,endpoint);await response.json();
 }
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify({sha,artifactSha256:actual,version,port,postgres:true,protectedRequests:true,authenticatedRequests:true},null,2));
 console.log(JSON.stringify({sha,artifactSha256:actual,version,port,root,passed:true}));
 if(mode==='--serve'){console.log('Isolated preview ready; Ctrl-C stops only this child.');await once(child,'exit');}
}finally{stop();if(child.exitCode===null)await once(child,'exit');}
