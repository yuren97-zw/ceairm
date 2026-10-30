import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import{Readable}from'node:stream';
import{encryptBackup,verifyBackup}from'../backup-envelope.mjs';
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
const snapshotId='20261030T000000Z-0123456789abcdef';
test('stream envelope authenticates snapshot, purpose and original bytes without returning plaintext',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backup-envelope-'));try{
  for(const [kind,text]of[['database','PGDMPtest fake database'],['configuration','DATABASE_URL=private\n'],['configuration','']]){
   const file=path.join(dir,crypto.randomUUID()+'.enc'),proof=await encryptBackup(Readable.from([Buffer.from(text)]),file,pair.publicKey,{snapshotId,kind});
   const verified=await verifyBackup(file,pair.privateKey,{snapshotId,kind,...proof});assert.equal(verified.authenticated,true);assert.equal(verified.plaintextWritten,false);assert.equal(verified.plainBytes,Buffer.byteLength(text));assert.equal(fs.statSync(file).mode&0o777,0o600);
   assert.ok(!fs.readFileSync(file).includes(Buffer.from('DATABASE_URL=private')));assert.ok(!('plaintext'in verified));
   await assert.rejects(verifyBackup(file,pair.privateKey,{snapshotId:snapshotId.replace('0123','abcd')}),{code:'BACKUP_INTEGRITY'});
   const original=fs.readFileSync(file);for(const index of [0,20,original.length-17,original.length-1]){const altered=Buffer.from(original);altered[index]^=1;fs.writeFileSync(file,altered);await assert.rejects(verifyBackup(file,pair.privateKey),{code:'BACKUP_INTEGRITY'});}fs.writeFileSync(file,original.subarray(0,original.length-1));await assert.rejects(verifyBackup(file,pair.privateKey),{code:'BACKUP_INTEGRITY'});
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed streams, oversize and invalid database leave no completed envelope or unfinished part',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backup-envelope-'));try{
  const file=path.join(dir,'data.enc');
  await assert.rejects(encryptBackup(Readable.from([Buffer.from('not a dump')]),file,pair.publicKey,{snapshotId,kind:'database'}));
  await assert.rejects(encryptBackup(Readable.from([Buffer.alloc(20)]),file,pair.publicKey,{snapshotId,kind:'configuration',maxBytes:10}),{code:'BACKUP_SIZE'});
  async function* broken(){yield Buffer.from('abc');throw Error('simulated producer failure');}
  await assert.rejects(encryptBackup(Readable.from(broken()),file,pair.publicKey,{snapshotId,kind:'configuration'}));assert.deepEqual(fs.readdirSync(dir),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('existing completed files cannot be replaced and wrong recovery keys fail closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'backup-envelope-'));try{
  const file=path.join(dir,'data.enc');await encryptBackup(Readable.from(['private']),file,pair.publicKey,{snapshotId,kind:'configuration'});const original=fs.readFileSync(file);
  await assert.rejects(encryptBackup(Readable.from(['replacement']),file,pair.publicKey,{snapshotId,kind:'configuration'}));assert.deepEqual(fs.readFileSync(file),original);assert.ok(!fs.existsSync(file+'.part'));
  const other=crypto.generateKeyPairSync('rsa',{modulusLength:3072,privateKeyEncoding:{type:'pkcs8',format:'pem'}});await assert.rejects(verifyBackup(file,other.privateKey),{code:'BACKUP_INTEGRITY'});
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
