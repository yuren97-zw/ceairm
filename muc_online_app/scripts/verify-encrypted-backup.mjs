import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyBackup} from '../backup-envelope.mjs';
export async function verifySnapshot(folder,keyFile){
 const manifest=JSON.parse(await fs.promises.readFile(path.join(folder,'manifest.json'),'utf8'));
 if(manifest.version!==1||!/^\d{8}T\d{6}Z-[a-f0-9]{16}$/.test(manifest.snapshotId||'')||manifest.files?.length!==2||new Set(manifest.files.map(f=>f.name)).size!==2)throw Error('Invalid manifest');
 const stat=await fs.promises.lstat(keyFile);if(!stat.isFile()||stat.isSymbolicLink()||(stat.mode&0o077))throw Error('Invalid key permissions');
 const privatePem=await fs.promises.readFile(keyFile,'utf8');const results=[];
 for(const file of manifest.files){
  if(!['database.enc','configuration.enc'].includes(file.name)||file.kind!==file.name.slice(0,-4)||file.snapshotId!==manifest.snapshotId)throw Error('Invalid manifest file');
  const result=await verifyBackup(path.join(folder,file.name),privatePem,{...file,snapshotId:manifest.snapshotId});
  results.push({kind:result.kind,authenticated:true,hashMatches:true,plaintextWritten:false});
 }
 const proof={snapshotId:manifest.snapshotId,verifiedAt:new Date().toISOString(),privateKeyRemainedLocal:true,results};
 await fs.promises.writeFile(path.join(folder,'verification.json'),JSON.stringify(proof,null,2),{mode:0o600});return proof;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)verifySnapshot(process.argv[2],process.argv[3]).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error(JSON.stringify({ok:false,code:'BACKUP_VERIFICATION_FAILED'}));process.exitCode=1;});
