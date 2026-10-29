import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
test('production release has no automatic trigger and rejects unapproved, stale or failed CI commits',async()=>{
 const workflow=await fs.readFile(new URL('../../.github/workflows/release-production.yml',import.meta.url),'utf8');assert.ok(workflow.includes('workflow_dispatch:'));assert.ok(!workflow.includes('workflow_run:'));assert.ok(workflow.includes('environment: production'));assert.ok(workflow.includes('group: production-release'));
 const blocks=[...workflow.matchAll(/run: \|\n((?: {10}.*\n)+)/g)].map(m=>m[1].replace(/^ {10}/gm,''));assert.equal(blocks.length,2);for(const input of blocks)assert.equal(spawnSync('bash',['-n'],{input}).status,0);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'release-gate-'));
 try{
  await fs.writeFile(path.join(dir,'gh'),['#!/bin/sh','case "$2" in','*/commits/main) echo "$MOCK_MAIN_SHA";;','*) echo "$MOCK_CI_JSON";;','esac',''].join('\n'),{mode:0o700});
  const sha='a'.repeat(40),env={...process.env,PATH:dir+path.delimiter+process.env.PATH,GITHUB_REF:'refs/heads/main',GITHUB_REPOSITORY:'test/repo',TARGET_SHA:sha,CONFIRMATION:'DEPLOY_PRODUCTION',MOCK_MAIN_SHA:sha,MOCK_CI:'success'};
  const run=override=>spawnSync('bash',['-e','-o','pipefail','-c',blocks[0]],{env:{...env,...override,MOCK_CI_JSON:JSON.stringify({workflow_runs:[{head_sha:override.MOCK_MAIN_SHA||sha,status:'completed',conclusion:override.MOCK_CI||'success'}]})}}).status;
  assert.equal(run({}),0);for(const override of [{CONFIRMATION:''},{TARGET_SHA:'invalid'},{GITHUB_REF:'refs/heads/feature'},{MOCK_MAIN_SHA:'b'.repeat(40)},{MOCK_CI:'failure'}])assert.notEqual(run(override),0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
