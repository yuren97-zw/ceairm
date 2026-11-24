import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const extract=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function fixture(data, failure){
 const body={innerHTML:''};let opened=0;const errors=[];
 const context=vm.createContext({userService:{effectivePermissions:async()=>{if(failure)throw Error(failure);return data;}},$:selector=>selector==='#userDialogBody'?body:{showModal:()=>opened++},alert:message=>errors.push(message)});
 vm.runInContext(extract('function escapeHtml(', 'function sanitizeRichHtml(')+extract('async function showEffectivePermissions(', 'function personnelIdentityBadgeHtml('),context);
 return {body,errors,context,opened:()=>opened};
}
test('permission preview renders all sections and escapes API text without undeclared helpers',async()=>{
 const f=fixture({identity:{label:'<身份>',source:'职位',quality:'unknown'},roles:[{code:'worker',name:'<工作者>',permissionCount:1}],permissionCount:1,effectivePermissions:[{module:'accounts',name:'<权限>',roles:['<角色>']}],scopesByModule:{accounts:[{scopeType:'self',status:'expired',validTo:'2026-11-24',grantReason:'<原因>'}]},baseRoleIssues:['<异常>']});
 await vm.runInContext('showEffectivePermissions("id","<姓名>")',f.context);
 assert.deepEqual(f.errors,[]);assert.equal(f.opened(),1);
 for(const text of ['&lt;身份&gt;','&lt;工作者&gt;','&lt;权限&gt;','&lt;角色&gt;','&lt;原因&gt;','&lt;异常&gt;','&lt;姓名&gt;','账号角色','data-close="userDialog"'])assert.ok(f.body.innerHTML.includes(text),text);
 assert.ok(!f.body.innerHTML.includes('<姓名>'));
});
test('scope-only and empty permission previews open, request failures remain visible',async()=>{
 for(const data of [{scopesByModule:{info:[{scopeType:'all',status:'active'}]}},{}]){const f=fixture(data);await vm.runInContext('showEffectivePermissions("id","")',f.context);assert.equal(f.opened(),1);assert.deepEqual(f.errors,[]);}
 const f=fixture(null,'无权限');await vm.runInContext('showEffectivePermissions("id","")',f.context);assert.equal(f.opened(),0);assert.deepEqual(f.errors,['获取权限信息失败：无权限']);
});
