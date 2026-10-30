import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import{Readable}from'node:stream';import{EventEmitter}from'node:events';
import{createSnapshot,backupPgEnvironment}from'../scripts/create-encrypted-backup.mjs';
import{uploadEncryptedSnapshot}from'../backup-cos.mjs';import{verifySnapshot}from'../scripts/verify-encrypted-backup.mjs';
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
function context(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backup-workflow-')),envFile=path.join(dir,'app.env'),publicKeyFile=path.join(dir,'public.pem'),privateFile=path.join(dir,'private.pem'),outputRoot=path.join(dir,'snapshots');fs.writeFileSync(envFile,'DATABASE_URL=postgresql://user:private@127.0.0.1:55551/test\n',{mode:0o600});fs.writeFileSync(publicKeyFile,pair.publicKey);fs.writeFileSync(privateFile,pair.privateKey,{mode:0o600});return{dir,envFile,publicKeyFile,privateFile,outputRoot};}
function mockDump(code=0){return(name,args,opts)=>{assert.equal(name,'pg_dump');assert.ok(!args.join(' ').includes('private'));assert.equal(opts.env.PGPASSWORD,'private');assert.equal(opts.env.PGDATABASE,'test');const child=new EventEmitter();child.stdout=Readable.from([Buffer.from('PGDMP fake test database')]);child.stdout.once('end',()=>setImmediate(()=>child.emit('close',code)));child.kill=()=>true;return child;};}
function cosMock(){const objects=new Map(),calls=[];let corrupt=false,deny=false;return{objects,calls,setCorrupt:v=>corrupt=v,setDeny:v=>deny=v,
 headObject(p,cb){calls.push(['head',p.Key]);setImmediate(()=>deny?cb({statusCode:403}):objects.has(p.Key)?cb(null,{headers:{'content-length':objects.get(p.Key).length}}):cb({statusCode:404}));},
 putObject(p,cb){calls.push(['put',p.Key]);(async()=>{assert.equal(p.ServerSideEncryption,'AES256');assert.equal(p.Headers['x-cos-forbid-overwrite'],'true');const a=[];if(Buffer.isBuffer(p.Body))a.push(p.Body);else for await(const b of p.Body)a.push(b);objects.set(p.Key,Buffer.concat(a));cb(null,{});})().catch(cb);},
 getObject(p,cb){calls.push(['get',p.Key]);const b=Buffer.from(objects.get(p.Key));if(corrupt)b[0]^=1;p.Output.write(b,e=>{if(e)return cb(e);p.Output.end(()=>cb(null,{}));});}
 };}
test('snapshot streams pg_dump, protects config, verifies locally and uploads completion only after ciphertext read-back',async()=>{
 const c=context();try{
  const {folder,manifest}=await createSnapshot({...c,dump:mockDump()});assert.equal(manifest.files.length,2);assert.deepEqual(fs.readdirSync(folder).sort(),['configuration.enc','database.enc','manifest.json']);
  const local=await verifySnapshot(folder,c.privateFile);assert.ok(local.results.every(r=>r.authenticated&&r.plaintextWritten===false));
  const cos=cosMock(),opts={cos,folder,bucket:'ceairm-backups-1449362740',region:'ap-beijing'};const proof=await uploadEncryptedSnapshot(opts);assert.equal(proof.remoteCiphertextReadBack,true);assert.equal(proof.localAuthenticatedDecryption,false);assert.equal(cos.objects.size,3);
  assert.match(cos.calls.filter(c=>c[0]==='put').at(-1)[1],/complete.json$/);const count=cos.calls.filter(c=>c[0]==='put').length;await uploadEncryptedSnapshot(opts);assert.equal(cos.calls.filter(c=>c[0]==='put').length,count);
 }finally{fs.rmSync(c.dir,{recursive:true,force:true});}
});
test('permission failures and corrupted remote content never publish a completion marker',async()=>{
 const c=context();try{
  const {folder}=await createSnapshot({...c,dump:mockDump()}),cos=cosMock(),opts={cos,folder,bucket:'ceairm-backups-1449362740',region:'ap-beijing'};
  cos.setDeny(true);await assert.rejects(uploadEncryptedSnapshot(opts));assert.equal(cos.objects.size,0);
  cos.setDeny(false);cos.setCorrupt(true);await assert.rejects(uploadEncryptedSnapshot(opts),{code:'BACKUP_REMOTE_HASH'});assert.ok(![...cos.objects.keys()].some(k=>k.endsWith('complete.json')));
 }finally{fs.rmSync(c.dir,{recursive:true,force:true});}
});
test('failed dump never publishes a manifest and database credentials never enter subprocess arguments',async()=>{
 const c=context();try{
  await assert.rejects(createSnapshot({...c,dump:mockDump(1)}),{code:'BACKUP_PG_DUMP'});for(const d of fs.readdirSync(c.outputRoot))assert.ok(!fs.existsSync(path.join(c.outputRoot,d,'manifest.json')));
  assert.equal(backupPgEnvironment('postgresql://u:p%40ss@127.0.0.1:55551/db').PGPASSWORD,'p@ss');
  for(const url of ['https://cloud/db','postgresql://cloud/db?sslmode=disable'])assert.throws(()=>backupPgEnvironment(url));
  assert.throws(()=>backupPgEnvironment('postgresql://cloud/db',{PGSSLMODE:'disable'}));assert.equal(backupPgEnvironment('postgresql://cloud/db').PGSSLMODE,'verify-full');
 }finally{fs.rmSync(c.dir,{recursive:true,force:true});}
});
