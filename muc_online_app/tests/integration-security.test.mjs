import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {safeAttachmentMime,isInlineSafeName,validateUploadContent} from '../attachment-policy.mjs';

test('attachment response MIME is owned by the server and PPTX remains download-safe',()=>{
  assert.match(safeAttachmentMime('note.txt'),/^text\/plain/);
  assert.equal(safeAttachmentMime('unknown.html'),'application/octet-stream');
  assert.match(safeAttachmentMime('slides.PPTX'),/presentationml/);
  assert.equal(isInlineSafeName('slides.pptx'),false);
  assert.equal(isInlineSafeName('note.txt'),true);
  for(const name of ['picture.png','slides.pptx','file.pdf'])assert.throws(()=>validateUploadContent(name,Buffer.from('<html>bad</html>')),e=>e.status===415);
  validateUploadContent('slides.pptx',Buffer.from([0x50,0x4b,3,4]));
});

test('saved login migrates legacy plaintext to an account-only preference',async()=>{
  const source=await fs.readFile(new URL('../public/app.js',import.meta.url),'utf8');
  const saved=source.slice(source.indexOf('function savedLogin()'),source.indexOf('function fillLoginForm()'));
  const values=new Map([['login',JSON.stringify({username:'sample',password:'test-only-value',rememberPassword:true,autoLogin:true})]]);
  const ctx={LOGIN_STORAGE_KEY:'login',localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}};
  vm.createContext(ctx);vm.runInContext(saved+'; savedLogin();',ctx);
  assert.deepEqual(JSON.parse(values.get('login')),{username:'sample',rememberAccount:true});
  vm.runInContext("persistLoginPreference('another',true)",ctx);
  assert.deepEqual(JSON.parse(values.get('login')),{username:'another',rememberAccount:true});
  vm.runInContext("persistLoginPreference('another',false)",ctx);assert.equal(values.has('login'),false);
  assert.ok(!source.includes('AUTO_LOGIN_SKIP_KEY'));
});

test('migration versions are unique and release includes every root runtime module',async()=>{
  const names=(await fs.readdir(new URL('../migrations/',import.meta.url))).filter(x=>/^\d+_.+\.sql$/.test(x));
  assert.equal(new Set(names.map(x=>x.split('_')[0])).size,names.length);
  const release=await fs.readFile(new URL('../deploy/tencent/build-release.sh',import.meta.url),'utf8');
  assert.ok(release.includes('cp ./*.mjs package.json package-lock.json'));
  const poller=await fs.readFile(new URL('../deploy/tencent/release-poller.sh',import.meta.url),'utf8');
  assert.ok(!poller.includes('--header "Authorization: Bearer $GITHUB_TOKEN"'));
});
