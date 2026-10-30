import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Writable} from 'node:stream';
import {backupFileHashes} from './backup-envelope.mjs';

const failure=code=>Object.assign(new Error('备份上传或校验未完成'),{code});
const call=(cos,method,p)=>new Promise((resolve,reject)=>cos[method](p,(e,r)=>e?reject(e):resolve(r)));
const snapshotPattern=/^\d{8}T\d{6}Z-[a-f0-9]{16}$/;
export async function uploadEncryptedSnapshot({cos,folder,bucket,region}){
 if(!/^[a-z0-9][a-z0-9-]*-\d+$/.test(bucket||'')||!/^ap-[a-z]+(?:-[a-z]+)?$/.test(region||''))throw failure('BACKUP_DESTINATION');
 const manifest=JSON.parse(await fs.promises.readFile(path.join(folder,'manifest.json'),'utf8'));
 if(manifest.version!==1||!snapshotPattern.test(manifest.snapshotId||'')||manifest.files?.length!==2||new Set(manifest.files.map(f=>f.name)).size!==2||!manifest.files.every(f=>['database.enc','configuration.enc'].includes(f.name)&&/^[a-f0-9]{64}$/.test(f.cipherSha256||'')))throw failure('BACKUP_MANIFEST');
 const prefix='encrypted/v1/'+manifest.snapshotId+'/',verified=[];
 async function verifyRemote(key,hashes){
  const hash=crypto.createHash('sha256');let bytes=0;
  const output=new Writable({write(chunk,encoding,done){bytes+=chunk.length;if(bytes>hashes.cipherBytes)return done(failure('BACKUP_REMOTE_SIZE'));hash.update(chunk);done();}});
  await call(cos,'getObject',{Bucket:bucket,Region:region,Key:key,Output:output});
  if(bytes!==hashes.cipherBytes||hash.digest('hex')!==hashes.cipherSha256)throw failure('BACKUP_REMOTE_HASH');
 }
 async function send(key,hashes,body){
  let existing=false;try{const h=await call(cos,'headObject',{Bucket:bucket,Region:region,Key:key});existing=true;if(Number(h.headers?.['content-length'])!==hashes.cipherBytes)throw failure('BACKUP_REMOTE_SIZE');}catch(e){if(Number(e.statusCode)!==404)throw e;}
  if(!existing){const input=body();try{await call(cos,'putObject',{Bucket:bucket,Region:region,Key:key,Body:input,ContentLength:hashes.cipherBytes,ContentMD5:hashes.contentMD5,ContentType:'application/octet-stream',ServerSideEncryption:'AES256',Headers:{'x-cos-forbid-overwrite':'true'}});}finally{input.destroy?.();}}
  await verifyRemote(key,hashes);
 }
 for(const entry of manifest.files){
  const file=path.join(folder,entry.name),stat=await fs.promises.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())throw failure('BACKUP_FILE');
  const hashes=await backupFileHashes(file);if(hashes.cipherSha256!==entry.cipherSha256||hashes.cipherBytes!==entry.cipherBytes)throw failure('BACKUP_LOCAL_HASH');
  await send(prefix+entry.name,hashes,()=>fs.createReadStream(file));verified.push(entry.name);
 }
 // A completion marker is published only after both complete encrypted objects were read back.
 const bytes=Buffer.from(JSON.stringify(manifest)),hashes={cipherBytes:bytes.length,cipherSha256:crypto.createHash('sha256').update(bytes).digest('hex'),contentMD5:crypto.createHash('md5').update(bytes).digest('base64')};
 await send(prefix+'complete.json',hashes,()=>bytes);
 const proof={version:1,snapshotId:manifest.snapshotId,bucket,region,prefix,verifiedAt:new Date().toISOString(),files:verified,remoteCiphertextReadBack:true,localAuthenticatedDecryption:false};
 await fs.promises.writeFile(path.join(folder,'upload-proof.json'),JSON.stringify(proof,null,2),{mode:0o600});return proof;
}
