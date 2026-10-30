import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import{EventEmitter}from'node:events';import{Readable}from'node:stream';import{pathToFileURL}from'node:url';
import{buildBackupRuntime}from'../scripts/build-encrypted-backup.mjs';
import{verifySnapshot}from'../scripts/verify-encrypted-backup.mjs';
import{spawnSync}from'node:child_process';
test('independent backup bundle runs without business source or node_modules and uses its dedicated service',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backup-runtime-'));try{
  const artifact=await buildBackupRuntime(path.join(dir,'runtime'));assert.equal(artifact.standalone,true);
  const bundled=await import(pathToFileURL(artifact.file));assert.equal(typeof bundled.createSnapshot,'function');
  const link=path.join(dir,'current');fs.symlinkSync(path.dirname(artifact.file),link);
  const invoked=spawnSync(process.execPath,[path.join(link,'backup-runner.mjs'),'invalid-command'],{encoding:'utf8'});
  assert.equal(invoked.status,1,'the CLI must run through the version symlink, never silently succeed');assert.match(invoked.stderr,/"ok":false/);
  const keys=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}}),envFile=path.join(dir,'env'),publicKeyFile=path.join(dir,'public.pem'),privateFile=path.join(dir,'private.pem');
  fs.writeFileSync(envFile,'DATABASE_URL=postgresql://u:p@127.0.0.1:55551/test\n',{mode:0o600});fs.writeFileSync(publicKeyFile,keys.publicKey);fs.writeFileSync(privateFile,keys.privateKey,{mode:0o600});
  const dump=()=>{const c=new EventEmitter();c.stdout=Readable.from(['PGDMP standalone test']);c.stdout.once('end',()=>setImmediate(()=>c.emit('close',0)));c.kill=()=>true;return c;};
  const {folder}=await bundled.createSnapshot({envFile,publicKeyFile,outputRoot:path.join(dir,'snapshots'),dump});assert.equal((await verifySnapshot(folder,privateFile)).results.length,2);
  const unit=fs.readFileSync(new URL('../deploy/tencent/airline-operations-center-backup.service',import.meta.url),'utf8');assert.match(unit,/scripts\/encrypted-backup\/current\/backup-runner.mjs create/);assert.ok(!unit.includes('/app/current'));
  const timer=fs.readFileSync(new URL('../deploy/tencent/airline-operations-center-backup.timer',import.meta.url),'utf8');assert.match(timer,/03:00:00 Asia\/Shanghai/);assert.match(timer,/Persistent=true/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
