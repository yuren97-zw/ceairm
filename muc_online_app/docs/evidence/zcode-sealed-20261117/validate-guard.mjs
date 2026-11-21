// Counter-validation for build-base-r2 v3 guard: bypass attempts must be rejected.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const script='/Users/zhaowei/.codex/worktrees/maintenance-personnel-8788/MUC收集信息/muc_online_app/docs/evidence/zcode-sealed-20261117/build-base-r2.mjs';
const results=[];
const run=(label,env)=>{const r=spawnSync(process.execPath,[script],{env:{...process.env,...env},encoding:'utf8'});results.push({label,rejected:r.status!==0&&!r.stdout.includes('"ok":true'),stdout:r.stdout.trim().slice(0,120),stderr:r.stderr.trim().slice(0,160)});};
// 1) dot-dot traversal escape
run('dot-dot escape',{BASE_OUT:'/private/tmp/../../Users/zhaowei/Documents/base.sqlite'});
// 2) symlinked parent escape: link inside /private/tmp pointing at Documents
const link='/private/tmp/zcode-sealed-20261117/guard-escape-link';
try{fs.symlinkSync('/Users/zhaowei/Documents',link,'dir');}catch{}
run('symlink parent escape',{BASE_OUT:link+'/base.sqlite'});
// 3) existing-file overwrite refusal (legit temp location, pre-create the file)
const existing=path.join(os.tmpdir(),'muc-guard-existing-base.sqlite');fs.writeFileSync(existing,'sentinel');
run('existing overwrite',{BASE_OUT:existing});
const sentinelIntact=fs.readFileSync(existing,'utf8')==='sentinel';fs.rmSync(existing);
// 4) legit fresh path must SUCCEED (dedicated fresh dir + whitelisted filename)
const freshDir=fs.mkdtempSync(path.join(os.tmpdir(),'muc-guard-ok-'));const fresh=path.join(freshDir,'base.sqlite');
const ok=spawnSync(process.execPath,[script],{env:{...process.env,BASE_OUT:fresh},encoding:'utf8'});
results.push({label:'legit fresh path',rejected:ok.status!==0,stdout:ok.stdout.trim().slice(0,120)});
try{fs.rmSync(freshDir,{force:true,recursive:true});}catch{}try{fs.unlinkSync(link);}catch{}
console.log(JSON.stringify({results,sentinelIntact},null,1));
const allGood=results.filter(r=>r.label!=='legit fresh path').every(r=>r.rejected)&&!results.at(-1).rejected&&sentinelIntact;
process.exitCode=allGood?0:1;
