import fs from 'node:fs';
import crypto from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';

const MAGIC=Buffer.from('CEABK1\n');
const MAX_HEADER=16384;
const fail=()=>Object.assign(new Error('备份格式或完整性校验失败'),{code:'BACKUP_INTEGRITY'});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fingerprint=key=>sha(crypto.createPublicKey(key).export({type:'spki',format:'der'}));
const kinds=new Set(['database','configuration']);

// Only public keys enter production. Authenticated metadata binds each file to its snapshot and purpose.
export async function encryptBackup(input,destination,publicPem,{snapshotId,kind,createdAt=new Date().toISOString(),maxBytes=2*1024**3}={}){
 if(!kinds.has(kind)||!/^\d{8}T\d{6}Z-[a-f0-9]{16}$/.test(snapshotId||'')||!Number.isFinite(Date.parse(createdAt)))throw fail();
 const publicKey=crypto.createPublicKey(publicPem);
 if(publicKey.asymmetricKeyType!=='rsa'||publicKey.asymmetricKeyDetails.modulusLength<3072)throw fail();
 const key=crypto.randomBytes(32),iv=crypto.randomBytes(12),part=destination+'.part';let opened=false;
 const header=Buffer.from(JSON.stringify({version:1,algorithm:'AES-256-GCM/RSA-OAEP-SHA256',snapshotId,kind,createdAt,keyId:fingerprint(publicPem),iv:iv.toString('base64'),wrappedKey:crypto.publicEncrypt({key:publicKey,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},key).toString('base64')}));
 const length=Buffer.alloc(4);length.writeUInt32BE(header.length);const aad=Buffer.concat([MAGIC,length,header]);
 let bytes=0,first=Buffer.alloc(0);const plainHash=crypto.createHash('sha256');
 const meter=new Transform({transform(chunk,encoding,done){
  bytes+=chunk.length;if(bytes>maxBytes)return done(Object.assign(new Error('备份超出安全容量限制'),{code:'BACKUP_SIZE'}));
  plainHash.update(chunk);if(first.length<5)first=Buffer.concat([first,chunk.subarray(0,5-first.length)]);done(null,chunk);
 }});
 const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);
 try{
  const file=await fs.promises.open(part,'wx',0o600);opened=true;
  try{await file.writeFile(aad);}finally{await file.close();}
  await pipeline(input,meter,cipher,fs.createWriteStream(part,{flags:'r+',start:aad.length}));
  const finish=await fs.promises.open(part,'r+');try{await finish.write(cipher.getAuthTag(),0,16,aad.length+bytes);await finish.sync();}finally{await finish.close();}
  if(kind==='database'&&first.toString()!=='PGDMP')throw fail();
  // link is exclusive: never silently replace an already completed snapshot.
  await fs.promises.link(part,destination);await fs.promises.unlink(part);opened=false;
  const hashes=await backupFileHashes(destination);
  return {kind,snapshotId,keyId:fingerprint(publicPem),plainBytes:bytes,plainSha256:plainHash.digest('hex'),...hashes};
 }catch(e){input.destroy?.();if(opened)await fs.promises.unlink(part).catch(()=>{});throw e;}
 finally{key.fill(0);first.fill(0);}
}

export async function backupFileHashes(file){
 const sha256=crypto.createHash('sha256'),md5=crypto.createHash('md5');let cipherBytes=0;
 for await(const b of fs.createReadStream(file)){cipherBytes+=b.length;sha256.update(b);md5.update(b);}
 return {cipherBytes,cipherSha256:sha256.digest('hex'),contentMD5:md5.digest('base64')};
}

// Verifies in memory while streaming. Unauthenticated plaintext is never written or returned.
export async function verifyBackup(file,privatePem,{kind,snapshotId,plainSha256,cipherSha256}={}){
 const f=await fs.promises.open(file,'r');let key;
 try{
  const stat=await f.stat();const prefix=Buffer.alloc(MAGIC.length+4);await f.read(prefix,0,prefix.length,0);
  if(!prefix.subarray(0,MAGIC.length).equals(MAGIC))throw fail();
  const size=prefix.readUInt32BE(MAGIC.length);if(size<2||size>MAX_HEADER||stat.size<prefix.length+size+16)throw fail();
  const h=Buffer.alloc(size);await f.read(h,0,size,prefix.length);let header;try{header=JSON.parse(h);}catch{throw fail();}
  if(header.version!==1||header.algorithm!=='AES-256-GCM/RSA-OAEP-SHA256'||!kinds.has(header.kind)||kind&&header.kind!==kind||snapshotId&&header.snapshotId!==snapshotId||header.keyId!==fingerprint(crypto.createPublicKey(privatePem).export({type:'spki',format:'pem'})))throw fail();
  const iv=Buffer.from(header.iv||'','base64'),wrapped=Buffer.from(header.wrappedKey||'','base64');if(iv.length!==12||!wrapped.length)throw fail();
  key=crypto.privateDecrypt({key:privatePem,oaepHash:'sha256',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},wrapped);if(key.length!==32)throw fail();
  const dec=crypto.createDecipheriv('aes-256-gcm',key,iv),tag=Buffer.alloc(16);dec.setAAD(Buffer.concat([prefix,h]));await f.read(tag,0,16,stat.size-16);dec.setAuthTag(tag);
  const digest=crypto.createHash('sha256');let plainBytes=0,first=Buffer.alloc(0);
  const consume=b=>{plainBytes+=b.length;digest.update(b);if(first.length<5)first=Buffer.concat([first,b.subarray(0,5-first.length)]);b.fill(0);};
  if(stat.size>prefix.length+size+16)for await(const b of fs.createReadStream(file,{start:prefix.length+size,end:stat.size-17}))consume(dec.update(b));
  consume(dec.final());const actual=digest.digest('hex');if(plainSha256&&plainSha256!==actual||header.kind==='database'&&first.toString()!=='PGDMP')throw fail();
  const hashes=await backupFileHashes(file);if(cipherSha256&&hashes.cipherSha256!==cipherSha256)throw fail();
  return {kind:header.kind,snapshotId:header.snapshotId,keyId:header.keyId,plainBytes,plainSha256:actual,...hashes,authenticated:true,plaintextWritten:false};
 }catch{throw fail();}finally{key?.fill(0);await f.close();}
}
