import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {Readable} from 'node:stream';
import COS from 'cos-nodejs-sdk-v5';
import {encryptBackup} from '../backup-envelope.mjs';
import {uploadEncryptedSnapshot} from '../backup-cos.mjs';

const fail=code=>Object.assign(new Error('备份未完成；请检查受控配置及访问权限'),{code});
export function backupPgEnvironment(databaseUrl,env={}){
 const u=new URL(databaseUrl),host=u.hostname.replace(/^\[|\]$/g,'');
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.search||u.hash||!host||!u.pathname.slice(1))throw fail('BACKUP_DATABASE_URL');
 const local=['localhost','127.0.0.1','::1'].includes(host),mode=env.PGSSLMODE||(local?'disable':'verify-full');
 if(!['disable','verify-full'].includes(mode)||!local&&mode!=='verify-full')throw fail('BACKUP_DATABASE_TLS');
 return {PATH:process.env.PATH,LANG:'C',PGHOST:host,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:decodeURIComponent(u.pathname.slice(1)),PGSSLMODE:mode,PGCONNECT_TIMEOUT:'15',...(env.PGSSLROOTCERT?{PGSSLROOTCERT:env.PGSSLROOTCERT}:{})};
}
async function privateFile(file){const s=await fs.promises.lstat(file);if(!s.isFile()||s.isSymbolicLink()||(s.mode&0o077))throw fail('BACKUP_FILE_PERMISSIONS');return fs.promises.readFile(file,'utf8');}
export async function createSnapshot({envFile,publicKeyFile,outputRoot,clock=()=>new Date(),dump=spawn}){
 const source=await privateFile(envFile),env=parseEnv(source),publicPem=await fs.promises.readFile(publicKeyFile,'utf8');
 // Reject accidental use of private material before starting a database process.
 if(!publicPem.includes('BEGIN PUBLIC KEY')||publicPem.includes('PRIVATE KEY'))throw fail('BACKUP_PUBLIC_KEY');
 await fs.promises.mkdir(outputRoot,{recursive:true,mode:0o700});const root=await fs.promises.lstat(outputRoot);if(!root.isDirectory()||root.isSymbolicLink()||(root.mode&0o077))throw fail('BACKUP_DIRECTORY_PERMISSIONS');
 const space=await fs.promises.statfs(outputRoot);if(Number(space.bavail)*Number(space.bsize)<512*1024**2)throw fail('BACKUP_DISK_SPACE');
 const createdAt=clock().toISOString(),snapshotId=createdAt.replace(/[-:]/g,'').slice(0,15)+'Z-'+crypto.randomBytes(8).toString('hex'),folder=path.join(outputRoot,snapshotId);
 await fs.promises.mkdir(folder,{mode:0o700});
 const child=dump('pg_dump',['--no-password','--format=custom','--no-owner','--no-privileges','--lock-wait-timeout=30s'],{env:backupPgEnvironment(env.DATABASE_URL,env),stdio:['ignore','pipe','ignore']});
 const exited=new Promise(resolve=>{child.once('error',()=>resolve(false));child.once('close',code=>resolve(code===0));});
 const timeout=setTimeout(()=>child.kill('SIGTERM'),15*60*1000);timeout.unref();
 try{
  const database=await encryptBackup(child.stdout,path.join(folder,'database.enc'),publicPem,{snapshotId,kind:'database',createdAt});
  if(!await exited)throw fail('BACKUP_PG_DUMP');
  const configuration=await encryptBackup(Readable.from([source]),path.join(folder,'configuration.enc'),publicPem,{snapshotId,kind:'configuration',createdAt,maxBytes:1024**2});
  const manifest={version:1,snapshotId,createdAt,files:[{name:'database.enc',...database},{name:'configuration.enc',...configuration}]};
  await fs.promises.writeFile(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});return {folder,manifest};
 }finally{clearTimeout(timeout);child.kill('SIGTERM');}
}
async function main(){
 const command=process.argv[2],appRoot='/opt/airline-operations-center',root=path.join(appRoot,'backups/managed-encrypted-v1');
 const settings=parseEnv(await privateFile(path.join(appRoot,'shared/backup.env')));
 if(['create','upload'].includes(command)){
  const env=parseEnv(await privateFile(path.join(appRoot,'shared/.env')));
  if(settings.BACKUP_BUCKET===env.COS_BUCKET||settings.BACKUP_BUCKET!=='ceairm-backups-1449362740'||settings.BACKUP_REGION!=='ap-beijing')throw fail('BACKUP_DESTINATION');
  const useApp=settings.BACKUP_USE_APPLICATION_IDENTITY==='true';
  const SecretId=useApp?env.COS_SECRET_ID:settings.BACKUP_COS_SECRET_ID,SecretKey=useApp?env.COS_SECRET_KEY:settings.BACKUP_COS_SECRET_KEY;
  if(!SecretId||!SecretKey)throw fail('BACKUP_IDENTITY');
  const cos=new COS({SecretId,SecretKey,Protocol:'https:',Timeout:120000,MaxRetryTimes:2});
  let folder;
  if(command==='create')folder=(await createSnapshot({envFile:path.join(appRoot,'shared/.env'),publicKeyFile:settings.BACKUP_PUBLIC_KEY_FILE,outputRoot:root})).folder;
  else{const id=process.argv[3];if(!/^\d{8}T\d{6}Z-[a-f0-9]{16}$/.test(id||''))throw fail('BACKUP_SNAPSHOT_ID');folder=path.join(root,id);const stat=await fs.promises.lstat(folder);if(!stat.isDirectory()||stat.isSymbolicLink())throw fail('BACKUP_DIRECTORY_PERMISSIONS');}
  const proof=await uploadEncryptedSnapshot({cos,folder,bucket:settings.BACKUP_BUCKET,region:settings.BACKUP_REGION});
  console.log(JSON.stringify({snapshotId:proof.snapshotId,offsiteVerified:true,localAuthenticatedDecryption:false}));
 }else throw fail('BACKUP_COMMAND');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(JSON.stringify({ok:false,code:String(e.code||'BACKUP_FAILED').replace(/[^\w.:-]/g,'').slice(0,60)}));process.exitCode=1;});
