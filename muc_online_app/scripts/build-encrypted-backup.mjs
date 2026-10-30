import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

export async function buildBackupRuntime(output){
 const root=fileURLToPath(new URL('../',import.meta.url));await fs.promises.mkdir(output,{recursive:true,mode:0o700});
 const file=path.join(output,'backup-runner.mjs');
 const result=await build({entryPoints:[path.join(root,'scripts/create-encrypted-backup.mjs')],outfile:file,bundle:true,platform:'node',format:'esm',target:'node24',metafile:true,banner:{js:'import { createRequire as __backupCreateRequire } from "node:module"; const require = __backupCreateRequire(import.meta.url);'}});
 const external=Object.values(result.metafile.outputs).flatMap(o=>o.imports).filter(i=>i.external);
 // The independent runtime must not load packages from a changing business release.
 const {builtinModules}=await import('node:module');const allowed=new Set(builtinModules.flatMap(n=>[n,'node:'+n]));
 if(external.some(i=>!allowed.has(i.path)))throw Error('Backup bundle contains external runtime packages');
 const bytes=await fs.promises.readFile(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 await fs.promises.writeFile(file+'.sha256',sha256+'  backup-runner.mjs\n',{mode:0o600});
 return {file,sha256,bytes:bytes.length,standalone:true,dependenciesBundled:true};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)buildBackupRuntime(process.argv[2]).then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('BACKUP_BUILD_FAILED');process.exitCode=1;});
