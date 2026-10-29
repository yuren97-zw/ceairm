import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {installInfoSync,createInfoSync} from '../info-sync.mjs';

test('information changes are transactional, durable, scoped and cursor-safe',()=>{
  const db=new DatabaseSync(':memory:');db.kind='sqlite';
  db.exec(`create table records(id text primary key,owner text,title text);
    create table record_recipients(record_id text,user_id text);
    create table read_receipts(record_id text,user_id text);
    create table favorites(record_id text,user_id text);
    create table attachments(owner_id text,owner_type text);`);
  installInfoSync(db);installInfoSync(db);
  const options={db,canView:(u,r)=>r?.owner===u.id,canFeedback:()=>false,signKey:Buffer.alloc(32,1)};
  const sync=createInfoSync(options),user={id:'a'},other={id:'b'};
  db.prepare('insert into records values(?,?,?)').run('one','a','private');
  const first=sync.changes(user,'',[]);assert.equal(first.reset,true);assert.equal(first.content.length,1);
  const cursor=first.cursor;
  assert.equal(sync.changes({...user,dataScopes:[{module:'info',scopeType:'department'}]},cursor,[]).reset,true);
  db.exec('begin');db.prepare('update records set title=? where id=?').run('rolled back','one');db.exec('rollback');
  assert.equal(sync.changes(user,cursor,['one']).content.length,0);
  db.prepare('insert into records values(?,?,?)').run('other','b','not visible');
  assert.equal(sync.changes(user,cursor,['one']).content.length,0);
  db.prepare('insert into read_receipts values(?,?)').run('one','a');
  const receipt=sync.changes(user,cursor,['one']);assert.equal(receipt.receipt.length,1);assert.equal(receipt.content.length,0);
  db.prepare('insert into favorites values(?,?)').run('one','b');
  assert.equal(sync.changes(user,receipt.cursor,['one']).content.length,0);
  assert.equal(sync.changes(other,cursor,[]).reset,true);
  db.prepare('update records set owner=? where id=?').run('b','one');
  assert.deepEqual(sync.changes(user,receipt.cursor,['one']).removed,['one']);
  const restarted=createInfoSync(options);assert.equal(restarted.latest(),sync.latest());
  db.prepare('delete from records where id=?').run('one');
  assert.deepEqual(restarted.changes(other,'',['one']).removed,['one']);
  db.close();
});

test('expired change history forces a safe full reconciliation',()=>{
  const db=new DatabaseSync(':memory:');db.kind='sqlite';
  db.exec(`create table records(id text primary key);create table record_recipients(record_id text,user_id text);create table read_receipts(record_id text,user_id text);create table favorites(record_id text,user_id text);create table attachments(owner_id text,owner_type text);`);
  installInfoSync(db);const sync=createInfoSync({db,canView:()=>true,canFeedback:()=>true,signKey:Buffer.alloc(32,2)}),u={id:'a'};
  const cursor=sync.encode(u,0);db.prepare('insert into records values(?)').run('x');
  db.exec('update info_sync_meta set version=10002;delete from info_sync_changes;insert into info_sync_changes values(10002,\'x\',\'\',\'content\');');
  assert.equal(sync.changes(u,cursor,[]).reset,true);assert.equal(sync.changes(u,'tampered',[]).reset,true);db.close();
});
