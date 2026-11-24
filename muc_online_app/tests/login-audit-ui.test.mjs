import test from 'node:test';
import assert from 'node:assert/strict';
import {mountLoginAudit} from '../public/login-audit.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
function host(){return {isConnected:true,innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};}
function button(name){return {disabled:false,hasAttribute:key=>key===name};}
test('login audit UI renders loading, failure, retry, rows and page query without cross-page effects',async()=>{
 const root=host(),calls=[];let fail=true;
 const api=async url=>{calls.push(url);if(fail)throw Error('读取失败');return {total:21,rows:[{name:'<img>',username:'账号',loginAt:'2026-11-24T00:00:00Z',result:'登录成功'}]};};
 mountLoginAudit({root,api,escapeHtml,canExport:false,accountId:'ui-reader'});assert.match(root.innerHTML,/正在读取登录记录/);await tick();assert.match(root.innerHTML,/读取失败/);assert.match(root.innerHTML,/data-retry/);
 fail=false;await root.handlers.click({target:{closest:()=>button('data-retry')}});await tick();assert.match(root.innerHTML,/&lt;img>/);assert.doesNotMatch(root.innerHTML,/<img>/);assert.doesNotMatch(root.innerHTML,/data-export/);assert.match(root.innerHTML,/2026-11-24 08:00:00/);
 await root.handlers.click({target:{closest:()=>button('data-next')}});await tick();assert.match(calls.at(-1),/page=2/);assert.match(root.innerHTML,/第 2 \/ 2 页/);
 root.isConnected=false;const html=root.innerHTML;await root.handlers.click({target:{closest:()=>button('data-retry')}});await tick();assert.equal(root.innerHTML,html);
});
test('login audit UI has distinct empty result and export control',async()=>{
 const root=host();mountLoginAudit({root,api:async()=>({total:0,rows:[]}),escapeHtml,canExport:true,accountId:'ui-exporter'});await tick();assert.match(root.innerHTML,/没有符合条件的登录记录/);assert.match(root.innerHTML,/data-export/);assert.match(root.innerHTML,/第 1 \/ 1 页/);
});
