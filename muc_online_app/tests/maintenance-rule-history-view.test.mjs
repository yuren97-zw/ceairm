import assert from 'node:assert/strict';
import test from 'node:test';
import {renderRuleHistory,createRuleHistoryView} from '../public/maintenance-rule-history-view.mjs';
const escape=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const item={id:'one',revision:1,actorId:'actor',reason:'<reason>',createdAt:'t',continuity:'FIRST_OBSERVATION',writeMode:'LEGACY_UNVERSIONED',changes:[{ruleType:'roleRatio',name:'zero',beforeValue:null,value:0},{ruleType:'routineRatio',name:'real-zero',beforeValue:0,value:1}]};
test('history renders actual zero separately from missing, escapes text and states its known-history boundary',()=>{
 const html=renderRuleHistory({items:[item],loaded:true},escape);assert.match(html,/未设置 → 0/);assert.match(html,/0 → 1/);assert.match(html,/&lt;reason>/);assert.ok(!html.includes('<reason>'));assert.match(html,/此前历史未知/);assert.match(html,/未携带版本/);
});
test('lazy history read and paging only replace the history region, and revoked access clears previously visible rows',async()=>{
 const handlers=new Map(),editor={value:'UNSAVED-RULE'},root={innerHTML:'',isConnected:true,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};let calls=0,deny=false;
 const controller=createRuleHistoryView({root,escapeHtml:escape,accountId:'user',currentAccount:()=> 'user',api:async path=>{calls++;if(deny)throw Object.assign(Error('denied'),{status:403});return {version:{hasUnjournaledChanges:false},items:[{...item,id:path.includes('?')?'two':'one'}],nextCursor:path.includes('?')?null:'1'};}});
 const click=attr=>handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name===attr})}});assert.equal(calls,0);await click('data-rule-history-query');assert.equal(calls,1);assert.match(root.innerHTML,/变更版本/);await click('data-rule-history-more');assert.equal(calls,2);assert.equal(editor.value,'UNSAVED-RULE');deny=true;await click('data-rule-history-query');assert.ok(!root.innerHTML.includes('&lt;reason>'));controller.destroy();assert.equal(root.innerHTML,'');
});
test('late history responses cannot repopulate a switched account or destroyed region',async()=>{
 const handlers=new Map(),root={innerHTML:'',isConnected:true,addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:name=>handlers.delete(name)};let account='first',resolve;
 const controller=createRuleHistoryView({root,escapeHtml:escape,accountId:'first',currentAccount:()=>account,api:()=>new Promise(done=>{resolve=done;})});
 const pending=handlers.get('click')({target:{closest:()=>({hasAttribute:name=>name==='data-rule-history-query'})}});account='second';controller.destroy();resolve({version:{},items:[item],nextCursor:null});await pending;assert.equal(root.innerHTML,'');
});
