import test from 'node:test';
import {inflateRawSync} from 'node:zlib';
function unzip(buf){let pos=0;const files={};while(buf.readUInt32LE(pos)===0x04034b50){const length=buf.readUInt32LE(pos+18),nl=buf.readUInt16LE(pos+26),el=buf.readUInt16LE(pos+28),name=buf.subarray(pos+30,pos+30+nl).toString();files[name]=inflateRawSync(buf.subarray(pos+30+nl+el,pos+30+nl+el+length)).toString();pos+=30+nl+el+length;}return files;}
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {loginAuditFilters,readLoginAudit,loginAuditXlsx} from '../login-audit.mjs';
import {RBAC_ROLE_DEFINITIONS,visibleNavigation} from '../rbac-policy.mjs';
test('login audit validates dates and defaults to seven Beijing calendar days',()=>{
 assert.deepEqual(loginAuditFilters(new URLSearchParams(),new Date('2026-11-23T17:00:00Z')),{from:'2026-11-18',to:'2026-11-24',q:'',page:1});
 for(const q of ['from=2026-02-30','from=2026-11-25&to=2026-11-24','page=-1','page=1.5'])assert.throws(()=>loginAuditFilters(new URLSearchParams(q)));
});
test('login audit filters complete Beijing days, literal keywords, pagination and all-row text export',()=>{
 const db=new DatabaseSync(':memory:');db.exec('create table users(id text,username text);create table audit_logs(id text,user_id text,user_name text,action text,created_at text)');
 db.prepare('insert into users values(?,?)').run('u','=账号%_');
 const add=(id,at,action='login',user='u',name='登录时姓名')=>db.prepare('insert into audit_logs values(?,?,?,?,?)').run(id,user,name,action,at);
 add('before','2026-11-23T15:59:59.999Z');add('after','2026-11-24T16:00:00.000Z');add('failed','2026-11-24T03:00:00Z','login_failed');
 for(let i=0;i<25;i++)add(String(i).padStart(2,'0'),'2026-11-23T16:00:00.000Z');
 add('missing','2026-11-24T15:59:59.999Z','login','deleted','历史姓名');
 const filters=loginAuditFilters(new URLSearchParams('from=2026-11-24&to=2026-11-24'));
 const data=readLoginAudit(db,filters);assert.equal(data.total,26);assert.equal(data.rows.length,20);assert.equal(data.rows[0].username,'—');assert.equal(data.rows[0].name,'历史姓名');
 assert.equal(readLoginAudit(db,{...filters,page:2}).rows.length,6);
 assert.equal(readLoginAudit(db,{...filters,q:'%_'}).total,25);assert.equal(readLoginAudit(db,{...filters,q:'不存在'}).total,0);
 const all=readLoginAudit(db,filters,{all:true});assert.equal(all.rows.length,26);assert.equal(all.rows[1].id,'24');
 const file=loginAuditXlsx(all,'2026-11-24T00:00:00Z');assert.equal(file.subarray(0,2).toString(),'PK');const xml=unzip(file)['xl/worksheets/sheet1.xml'];assert.ok(xml.includes('=账号%_'));assert.ok(xml.includes('t="inlineStr"'));assert.ok(!xml.includes('<f>'));assert.equal((xml.match(/<row /g)||[]).length,27);db.close();
});
test('only super role receives audit by default and audit-only user sees settings',()=>{
 for(const [role,permissions] of Object.entries(RBAC_ROLE_DEFINITIONS)){assert.equal(permissions.includes('audit.read'),role==='system_admin');assert.equal(permissions.includes('audit.export'),role==='system_admin');}
 assert.ok(visibleNavigation(['audit.read']).includes('settingsPage'));
});
