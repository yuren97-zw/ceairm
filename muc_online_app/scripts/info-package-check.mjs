import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const archive=process.argv[2];if(!archive?.startsWith('/private/tmp/ceairm-info-'))throw new Error('仅验收本次临时发布包');
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ceairm-info-package-'));
execFileSync('tar',['-xzf',archive,'-C',root]);
await fs.access(path.join(root,'info-sync.mjs'));await fs.access(path.join(root,'migrations/020_info_realtime.sql'));
const listener=net.createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
assert.ok(![5432,8787,8788].includes(port));
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,MUC_NO_LISTEN:'0',NODE_ENV:'test',PORT:String(port),HOST:'127.0.0.1',DB_PATH:path.join(root,'data/test.sqlite'),UPLOAD_DIR:path.join(root,'test-uploads'),DATABASE_URL:'',COS_SECRET_ID:'',COS_SECRET_KEY:'',COS_BUCKET:'',COS_REGION:''},stdio:'ignore'});
const origin=`http://127.0.0.1:${port}`;
try{
  let health;
  for(let i=0;i<50;i++){try{const response=await fetch(origin+'/api/health');if(response.ok){health=await response.json();break;}}catch{}if(child.exitCode!==null)throw new Error('独立发布包启动失败');await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(health?.ok,true);assert.equal(health.database,'sqlite');assert.equal(health.cos,'disabled');
  const response=await fetch(origin+'/dashboard');assert.equal(response.status,200);
  const index=await response.text(),script=index.match(/src="(\/app\.[a-f0-9]+\.js)"/)[1];
  const js=await fetch(origin+script);assert.equal(js.status,200);assert.match(await js.text(),/function startInfoSync/);
  const denied=await fetch(origin+'/api/info/sync',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify({knownIds:[]})});assert.equal(denied.status,401);
  console.log(JSON.stringify({ok:true,standalone:true,health:'passed',newModule:'included',migration:'included',hashedFrontend:'passed',protectedApi:'passed',root}));
}finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
