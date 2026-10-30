import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import {integrationEnvironment,readIntegrationConfig,integrationDatabase} from '../integration-runtime.mjs';

const [archive,sha,mode]=process.argv.slice(2);
if(!archive||!path.isAbsolute(archive)||! /^[0-9a-f]{40}$/.test(sha)||!['--check','--serve'].includes(mode))throw Error('Usage: check-integration-package.mjs ABSOLUTE_ARCHIVE SHA --check|--serve');
const ci=process.env.CI==='true'&&process.env.ATTENDANCE_TEST_DATABASE==='true';
if(ci&&mode==='--serve')throw Error('CI cannot serve a persistent preview');
const config=ci?{databaseUrl:process.env.DATABASE_URL}:readIntegrationConfig(process.env.MUC_INTEGRATION_CONFIG);
integrationDatabase(config.databaseUrl,{ci});
const expected=(await fs.readFile(archive+'.sha256','utf8')).trim().split(/\s+/)[0];
const actual=crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex');
assert.equal(actual,expected,'Artifact checksum mismatch');
const entries=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
for(const entry of entries)if(path.posix.isAbsolute(entry)||entry.split('/').includes('..'))throw Error('Unsafe archive path');
const verbose=execFileSync('tar',['-tvzf',archive],{encoding:'utf8'});
// npm creates .bin links. Only bounded links to ordinary runtime dependency
// files are accepted; no other links, chained links, hard links or devices.
for(const line of verbose.split('\n').filter(Boolean)){
 if(['-','d'].includes(line[0]))continue;
 const link=line.match(/ (\.\/node_modules\/\.bin\/[\w-]+) -> ([\w./-]+)$/);
 if(line[0]!=='l'||!link)throw Error('Archive contains unapproved links or special files');
 const target=path.posix.normalize(path.posix.join(path.posix.dirname(link[1]),link[2]));
 if(!target.startsWith('node_modules/')||target.includes('/.bin/')||!entries.includes('./'+target))throw Error('Archive link escapes runtime dependencies');
}
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-integration-package-'));
execFileSync('tar',['-xzf',archive,'-C',root]);
const version=(await fs.readFile(path.join(root,'.release-version'),'utf8')).trim();
assert.ok(version.endsWith(sha),'Artifact version must identify the requested commit');
for(const file of ['server.mjs','backup-envelope.mjs','backup-cos.mjs','public/attendance-approval-plan-view.mjs','scripts/create-encrypted-backup.mjs'])await fs.access(path.join(root,file));
const probe=net.createServer();let port=8800;
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(ci?0:8800,'127.0.0.1',()=>{port=probe.address().port;probe.close(resolve);});});
let ciAdmin,ciDatabase,ciRole;
if(ci){
 ciAdmin=new pg.Client({connectionString:config.databaseUrl});await ciAdmin.connect();
 const suffix=crypto.randomBytes(8).toString('hex'),password=crypto.randomBytes(32).toString('base64url'),newDatabase='ceairm_artifact_'+suffix,newRole='ceairm_artifact_role_'+suffix;
 try{
 await ciAdmin.query(`create role ${newRole} login password '${password}' nosuperuser nocreatedb nocreaterole`);ciRole=newRole;
 await ciAdmin.query(`create database ${newDatabase} owner ${ciRole}`);ciDatabase=newDatabase;
 await ciAdmin.query(`revoke connect on database ${ciDatabase} from public`);await ciAdmin.query(`grant connect on database ${ciDatabase} to ${ciRole}`);
 config.databaseUrl=`postgresql://${ciRole}:${password}@127.0.0.1:5432/${ciDatabase}`;
 }catch(error){await cleanCi();throw error;}
}
async function cleanCi(){if(ciAdmin){if(ciDatabase)await ciAdmin.query(`drop database ${ciDatabase} with (force)`);if(ciRole)await ciAdmin.query(`drop role ${ciRole}`);await ciAdmin.end();}}
const env=integrationEnvironment({databaseUrl:config.databaseUrl,root,sha,port,ci,ambient:process.env,adminPassword:config.adminPassword});
try {
execFileSync(process.execPath,['scripts/run-postgres-migrations.mjs'],{cwd:root,env,stdio:'pipe'});
execFileSync(process.execPath,['scripts/run-postgres-migrations.mjs'],{cwd:root,env,stdio:'pipe'});
}catch(error){await cleanCi();throw error;}
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
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username:'54002010',password:env.INITIAL_ADMIN_PASSWORD})});
 assert.equal(login.status,200,'Synthetic integration admin login');
 const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('muc_integration_sid='));
 for(const endpoint of ['/api/me','/api/maintenance/flights','/api/attendance/status','/api/attendance/summary?month=2026-10&view=summary']){
  const response=await fetch(origin+endpoint,{headers:{cookie}});assert.equal(response.status,200,endpoint);await response.json();
 }
 await fs.writeFile(path.join(root,'acceptance.json'),JSON.stringify({sha,artifactSha256:actual,version,port,postgres:true,protectedRequests:true,authenticatedRequests:true},null,2));
 console.log(JSON.stringify({sha,artifactSha256:actual,version,port,root,passed:true}));
 if(mode==='--serve'){console.log('Isolated preview ready; Ctrl-C stops only this child.');await once(child,'exit');}
}finally{stop();if(child.exitCode===null)await once(child,'exit');await cleanCi();}
