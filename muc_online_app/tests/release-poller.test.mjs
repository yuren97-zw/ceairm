import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../deploy/tencent/release-poller.sh',import.meta.url));
const version='production-'+'a'.repeat(40),body='official-release-body',sha=crypto.createHash('sha256').update(body).digest('hex');
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'release-poller-'));fs.mkdirSync(root+'/bin');fs.mkdirSync(root+'/scripts');fs.mkdirSync(root+'/app');fs.symlinkSync('/previous',root+'/app/current');
 fs.writeFileSync(root+'/agent.env','GITHUB_REPOSITORY=test/repo\nGITHUB_TOKEN=secret-token-canary\n',{mode:0o600});
 const json={tag_name:version,assets:[{id:1,name:'airline-operations-center.tar.gz',url:'https://api.github.com/repos/test/repo/releases/assets/1',size:body.length,digest:'sha256:'+sha},{id:2,name:'airline-operations-center.tar.gz.sha256',url:'https://api.github.com/repos/test/repo/releases/assets/2'}]};
 fs.writeFileSync(root+'/release.json',JSON.stringify(json));
 fs.writeFileSync(root+'/bin/flock','#!/bin/sh\nexit 0\n',{mode:0o700});
 fs.writeFileSync(root+'/bin/curl',`#!/usr/bin/env node
import fs from 'node:fs';
const root=process.env.APP_ROOT,args=process.argv.slice(2),url=args.find(a=>a.startsWith('https://')),out=args[args.indexOf('-o')+1];
fs.appendFileSync(root+'/calls',JSON.stringify(args)+'\\n');
const header=args.find(a=>a.startsWith('@'));if(header)fs.appendFileSync(root+'/headers',header.slice(1)+'\\n');
if(url.endsWith('/latest')){process.stdout.write(fs.readFileSync(root+'/release.json'));process.exit(0);}
if(url.endsWith('/2')){fs.writeFileSync(out,process.env.BAD_MANIFEST?'../unsafe\\n':'${sha}  airline-operations-center.tar.gz\\n');process.exit(0);}
const body='${body}',existing=fs.existsSync(out)?fs.readFileSync(out,'utf8'):'';
if(process.env.PARTIAL==='true'&&!existing){fs.writeFileSync(out,body.slice(0,6));process.exit(28);}
if(process.env.CORRUPT==='true')fs.writeFileSync(out,'x'.repeat(body.length));
else if(existing){if(!args.includes('--continue-at'))process.exit(1);fs.appendFileSync(out,body.slice(existing.length));}
else fs.writeFileSync(out,body);
`,{mode:0o700});
 fs.writeFileSync(root+'/scripts/deploy.sh','#!/bin/sh\nprintf "%s\\n" "$1" "$2" >> "$APP_ROOT/deployed"\n',{mode:0o700});
 const env={...process.env,APP_ROOT:root,DEPLOY_AGENT_ENV:root+'/agent.env',PATH:root+'/bin'+path.delimiter+process.env.PATH};
 return {root,json,work:root+'/cache/approved-releases/'+version,run(extra={}){return spawnSync('bash',[script],{env:{...env,...extra},encoding:'utf8',timeout:20000});},save(){fs.writeFileSync(root+'/release.json',JSON.stringify(json));},close(){fs.rmSync(root,{recursive:true,force:true});}};
}
test('approved download is bounded, verified and hides authentication from process arguments',()=>{
 const f=fixture();try{const r=f.run();assert.equal(r.status,0,r.stderr);assert.equal(fs.readFileSync(f.work+'/airline-operations-center.tar.gz','utf8'),body);assert.ok(fs.existsSync(f.root+'/deployed'));
 const calls=fs.readFileSync(f.root+'/calls','utf8');assert.ok(!calls.includes('secret-token-canary'));assert.ok(calls.includes('--max-time'));assert.ok(calls.includes('--connect-timeout'));assert.ok(calls.includes('--speed-time'));assert.ok(calls.includes('--continue-at'));
 for(const h of fs.readFileSync(f.root+'/headers','utf8').trim().split('\n'))assert.equal(fs.existsSync(h),false);
 const archiveCalls=()=>fs.readFileSync(f.root+'/calls','utf8').split('\n').filter(l=>l.includes('assets/1')).length;assert.equal(archiveCalls(),1);assert.equal(f.run().status,0);assert.equal(archiveCalls(),1);
 }finally{f.close();}
});
test('interrupted transfer retains bytes and the next timer invocation resumes the same official asset',()=>{
 const f=fixture();try{assert.notEqual(f.run({PARTIAL:'true'}).status,0);assert.equal(fs.readFileSync(f.work+'/airline-operations-center.tar.gz.part','utf8'),body.slice(0,6));assert.equal(fs.existsSync(f.root+'/deployed'),false);assert.equal(f.run({PARTIAL:'true'}).status,0);assert.equal(fs.readFileSync(f.work+'/airline-operations-center.tar.gz','utf8'),body);}finally{f.close();}
});
test('changed immutable asset identity and malformed checksum cannot deploy or discard partial bytes',()=>{
 const f=fixture();try{f.run({PARTIAL:'true'});f.json.assets[0].id=3;f.json.assets[0].url=f.json.assets[0].url.replace('/1','/3');f.save();assert.notEqual(f.run().status,0);assert.equal(fs.readFileSync(f.work+'/airline-operations-center.tar.gz.part','utf8'),body.slice(0,6));assert.equal(fs.existsSync(f.root+'/deployed'),false);}finally{f.close();}
 const g=fixture();try{assert.notEqual(g.run({BAD_MANIFEST:'true'}).status,0);assert.equal(fs.existsSync(g.root+'/deployed'),false);}finally{g.close();}
});
test('unsafe tags, external URLs, duplicate assets and corrupt content fail closed',()=>{
 for(const change of [f=>f.json.tag_name='production-../../unsafe',f=>f.json.assets[0].url='https://example.invalid/1',f=>f.json.assets.push(f.json.assets[0])]){const f=fixture();try{change(f);f.save();assert.notEqual(f.run().status,0);assert.equal(fs.existsSync(f.root+'/deployed'),false);}finally{f.close();}}
 const f=fixture();try{assert.notEqual(f.run({CORRUPT:'true'}).status,0);assert.equal(fs.existsSync(f.root+'/deployed'),false);}finally{f.close();}
});
test('same active version performs no asset download and never redeploys',()=>{
 const f=fixture();try{fs.unlinkSync(f.root+'/app/current');fs.symlinkSync('/'+version,f.root+'/app/current');assert.equal(f.run().status,0);assert.equal(fs.existsSync(f.root+'/deployed'),false);assert.equal(fs.readFileSync(f.root+'/calls','utf8').trim().split('\n').length,1);}finally{f.close();}
});
