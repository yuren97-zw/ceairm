import test from 'node:test';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {requireDevelopmentBranch,validateDevelopmentPaths} from '../local-development.mjs';
import {LOCAL_DEVELOPMENT_PROFILES,localProfileForBranch,localDevelopmentEnvironment,approvedLocalDevelopment,localSessionCookieName} from '../local-development.mjs';
const app='/Users/developer/.codex/worktrees/development/project/muc_online_app';
test('each development branch has its own fixed port and no inherited credentials',()=>{
 for(const [key,profile] of Object.entries(LOCAL_DEVELOPMENT_PROFILES)){
  const env=localDevelopmentEnvironment(app,key,{PATH:'/usr/bin',HOME:'/Users/developer',DATABASE_URL:'forbidden',ATTENDANCE_ENV_FILE:'/private/config',DINGTALK_APP_SECRET:'forbidden',COS_SECRET_KEY:'forbidden',WECHAT_APP_SECRET:'forbidden',NODE_OPTIONS:'--require forbidden',INITIAL_ADMIN_PASSWORD:'forbidden'});
  assert.equal(localProfileForBranch(profile.branch),key);assert.equal(localProfileForBranch(profile.branch+'-feature'),key);assert.equal(localProfileForBranch(profile.branch+'/feature'),key);assert.equal(env.PORT,String(profile.port));assert.equal(env.HOST,'127.0.0.1');assert.equal(approvedLocalDevelopment(app,env),true);
  for(const key of ['DINGTALK_APP_SECRET','COS_SECRET_KEY','WECHAT_APP_SECRET','NODE_OPTIONS','INITIAL_ADMIN_PASSWORD'])assert.equal(env[key],undefined);
 }
 assert.equal(localProfileForBranch('main'),null);assert.equal(localProfileForBranch('codex/info-rbacx'),null);assert.equal(localProfileForBranch(null),null);for(const key of ['unknown','toString','__proto__'])assert.throws(()=>localDevelopmentEnvironment(app,key),/未知/);
});
test('production, LAN, remote database, external configuration and inherited secrets fail closed',()=>{
 const base=localDevelopmentEnvironment(app,'info-rbac');
 for(const change of [{NODE_ENV:'production'},{HOST:'0.0.0.0'},{PORT:'8788'},{DATABASE_URL:'postgresql://remote/production'},{ATTENDANCE_ENV_FILE:'/private/config'},{DINGTALK_APP_SECRET:'secret'},{COS_SECRET_ID:'secret'},{WECHAT_APP_ID:'secret'},{INITIAL_ADMIN_PASSWORD:'secret'},{MUC_LOCAL_DEVELOPMENT_PROFILE:'unknown'}])assert.equal(approvedLocalDevelopment(app,{...base,...change}),false);
 assert.equal(approvedLocalDevelopment('/Users/developer/Documents/project/muc_online_app',base),false);assert.equal(approvedLocalDevelopment(app,{...base,MUC_LOCAL_DEVELOPMENT_PROFILE:'toString'}),false);
});
test('every real synchronizer and non-local runtime path must remain disabled',()=>{
 const base=localDevelopmentEnvironment(app,'attendance-leave');
 for(const key of ['ATTENDANCE_SYNC_ENABLED','ATTENDANCE_WORKER_ENABLED','ATTENDANCE_EVENTS_ENABLED','ATTENDANCE_APPROVAL_PLANS_ENABLED','ATTENDANCE_APPROVAL_PLAN_DUE_ENABLED','ATTENDANCE_VALIDATION_ENABLED'])assert.equal(approvedLocalDevelopment(app,{...base,[key]:'true'}),false);
 for(const change of [{ATTENDANCE_MANUAL_ONLY:'false'},{DB_PATH:'/private/old.sqlite'},{UPLOAD_DIR:'/private/original-uploads'}])assert.equal(approvedLocalDevelopment(app,{...base,...change}),false);
});
test('server still refuses legacy 8787 startup and rejects unsafe profiles before loading a private env file',()=>{
 const server=fileURLToPath(new URL('../server.mjs',import.meta.url)),env={PATH:process.env.PATH,HOME:process.env.HOME,NODE_ENV:'test',HOST:'127.0.0.1',PORT:'8787',DB_PATH:'/private/tmp/unused-development-guard.sqlite',UPLOAD_DIR:'/private/tmp/unused-development-guard-uploads'};
 const guard=new URL('../local-development.mjs',import.meta.url).href;
 const legacy=spawnSync(process.execPath,['--input-type=module','-e',`import {validateDevelopmentRuntime} from ${JSON.stringify(guard)};validateDevelopmentRuntime(${JSON.stringify(app)},process.env);`],{env,encoding:'utf8',timeout:15000});assert.notEqual(legacy.status,0);assert.match(legacy.stderr,/本机开发配置不安全/);
 const unsafe=spawnSync(process.execPath,[server],{env:{...env,NODE_ENV:'production',MUC_LOCAL_DEVELOPMENT_PROFILE:'info-rbac',ATTENDANCE_ENV_FILE:'/private/this-file-must-not-be-read'},encoding:'utf8',timeout:15000});assert.notEqual(unsafe.status,0);assert.match(unsafe.stderr,/本机开发配置不安全/);assert.ok(!unsafe.stderr.includes('ENOENT'));
});
test('unknown branches cannot bypass binding and LAN requires an explicit opt-in',()=>{
 assert.throws(()=>requireDevelopmentBranch('codex/unregistered','maintenance-personnel'),/未知/);
 assert.throws(()=>requireDevelopmentBranch('codex/info-rbac','maintenance-personnel'),/不一致/);
 const env=localDevelopmentEnvironment(app,'maintenance-personnel',{MUC_DEV_LAN:'true'});assert.equal(env.HOST,'0.0.0.0');assert.ok(approvedLocalDevelopment(app,env));
 assert.equal(approvedLocalDevelopment(app,{...env,MUC_DEV_LAN:'false'}),false);
 assert.throws(()=>localDevelopmentEnvironment(app,'maintenance-personnel',{MUC_DEV_LAN:'yes'}));
});
test('data guards reject hard links, symbolic links and permissive database files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ceairm-path-guard-'));fs.mkdirSync(path.join(root,'data'),{mode:0o700});fs.mkdirSync(path.join(root,'uploads'),{mode:0o700});
 const env={DB_PATH:path.join(root,'data/test.sqlite'),UPLOAD_DIR:path.join(root,'uploads')};
 try {
  fs.writeFileSync(env.DB_PATH,'test',{mode:0o600});validateDevelopmentPaths(root,env);
  fs.linkSync(env.DB_PATH,path.join(root,'linked.sqlite'));assert.throws(()=>validateDevelopmentPaths(root,env),/硬链接/);fs.unlinkSync(path.join(root,'linked.sqlite'));
  fs.chmodSync(env.DB_PATH,0o644);assert.throws(()=>validateDevelopmentPaths(root,env),/权限/);fs.chmodSync(env.DB_PATH,0o600);
  for(const suffix of ['-wal','-shm','-journal']){fs.symlinkSync(env.DB_PATH,env.DB_PATH+suffix);assert.throws(()=>validateDevelopmentPaths(root,env),/链接/);fs.unlinkSync(env.DB_PATH+suffix);}
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('three local profiles have different cookies without changing normal production cookies',()=>{
 const names=Object.keys(LOCAL_DEVELOPMENT_PROFILES).map(p=>localSessionCookieName(app,localDevelopmentEnvironment(app,p)));assert.equal(new Set(names).size,3);assert.deepEqual(names,['muc_dev_sid_8787','muc_dev_sid_8788','muc_dev_sid_8792']);assert.equal(localSessionCookieName(app,{NODE_ENV:'production'}),'muc_sid');assert.equal(localSessionCookieName(app,{}),'muc_sid');
});
