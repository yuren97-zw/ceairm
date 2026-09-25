// One-off, explicitly approved 8788 catalog correction. Normal APIs keep codes immutable.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

const [dbPath, sourcePath, mode = 'preview', backupPath = ''] = process.argv.slice(2);
assert(dbPath && sourcePath, 'Usage: node script DB SOURCE [preview|rehearse|apply] [BACKUP]');
assert(['preview', 'rehearse', 'apply'].includes(mode));
if (mode === 'apply') assert(backupPath && fs.existsSync(backupPath), 'A verified backup is required');
const source = fs.readFileSync(sourcePath, 'utf8');
const rows = source.split(/\r?\n/).filter(line => /^\| `/.test(line)).map(line => {
  const match = line.match(/^\| `([^`]+)` \| `([^`]+)` \|/);
  assert(match, 'Unexpected mapping format');
  return { code: match[1], name: match[2] };
});
assert.equal(rows.length, 136);
assert.equal(new Set(rows.map(r => r.code)).size, 136);
const mapping = new Map(rows.map(r => [r.code, r.name]));
const corrections = new Map([['2002-08-01', '2-08-01'], ['2004-06-01', '4-06-01'], ['2004-06-02', '4-06-02']]);
const db = new DatabaseSync(dbPath, { readOnly: mode === 'preview' });
db.exec('pragma busy_timeout=10000');
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const tables = () => db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map(r => r.name);
const tableRows = table => db.prepare(`select * from ${quote(table)}`).all();
const digest = table => hash(tableRows(table).map(r => JSON.stringify(r)).sort());
const catalog = () => db.prepare('select * from capability_catalog order by project_code').all();
function preflight() {
  const before = catalog(), changes = [], unchanged = [];
  const existing = new Map(before.map(r => [r.project_code, r]));
  const consumed = new Set();
  for (const [oldCode, newCode] of corrections) {
    if (!existing.has(oldCode)) continue;
    assert(!existing.has(newCode), `Correction target already exists: ${newCode}`);
    for (const table of tables()) {
      // Historical audits document past codes; all other references block correction.
      if (['capability_catalog', 'audit_logs', 'audit'].includes(table)) continue;
      assert(!tableRows(table).some(r => JSON.stringify(r).includes(oldCode)), `Old code referenced by ${table}: ${oldCode}`);
    }
    const old = existing.get(oldCode);
    assert.equal(old.project_name, mapping.get(newCode), 'Unexpected correction name');
    changes.push({ type: 'correct', id: old.id, oldCode, code: newCode, oldName: old.project_name, name: mapping.get(newCode) });
    consumed.add(newCode);
  }
  for (const { code, name } of rows) {
    if (consumed.has(code)) continue;
    const old = existing.get(code);
    if (!old) changes.push({ type: 'add', code, name });
    else if (old.project_name !== name) changes.push({ type: 'rename', id: old.id, code, oldName: old.project_name, name });
    else { assert.equal(old.status, 'active'); unchanged.push(old); }
  }
  assert(before.every(r => mapping.has(r.project_code) || corrections.has(r.project_code)), 'Unexpected extra catalog project');
  const counts = Object.fromEntries(['correct', 'add', 'rename'].map(t => [t, changes.filter(c => c.type === t).length]));
  // Fail closed on drift from the approved baseline; accept an exact completed rerun.
  assert((before.length === 71 && unchanged.length === 68 && counts.correct === 3 && counts.add === 65 && counts.rename === 0)
    || (before.length === 136 && unchanged.length === 136 && changes.length === 0), 'Catalog differs from approved preflight');
  return { before, unchanged, changes, counts };
}
let transaction = false;
try {
  if (mode !== 'preview') { db.exec('begin immediate'); transaction = true; }
  const plan = preflight();
  const report = { database: path.resolve(dbPath), source: sourcePath, sourceHash: hash(source), backupPath, mode, unchanged: plan.unchanged.length, ...plan.counts, changes: plan.changes };
  if (mode !== 'preview') {
    const retained = new Map(tables().filter(t => !['capability_catalog', 'audit_logs'].includes(t)).map(t => [t, digest(t)]));
    const oldAudits = tableRows('audit_logs');
    const admin = db.prepare("select id,name from users where username='54002010'").get();
    assert(admin, 'Expected super administrator not found');
    const stamp = new Date().toISOString();
    for (const item of plan.changes) {
      item.id ||= `cap_${crypto.randomUUID()}`;
      if (item.type === 'add') db.prepare("insert into capability_catalog(id,project_code,project_name,status,created_at,updated_at) values(?,?,?,'active',?,?)").run(item.id, item.code, item.name, stamp, stamp);
      else db.prepare("update capability_catalog set project_code=?,project_name=?,updated_at=? where id=?").run(item.code, item.name, stamp, item.id);
      db.prepare('insert into audit_logs(id,user_id,user_name,action,target_type,target_id,detail,created_at) values(?,?,?,?,?,?,?,?)').run(
        `audit_${crypto.randomUUID()}`, admin.id, admin.name, item.type === 'add' ? 'create_authorization_project' : 'correct_authorization_project', 'authorizationProject', item.id,
        JSON.stringify({ ...item, source: sourcePath, sourceHash: report.sourceHash, backupPath, reason: '按已确认对应表同步；三个日期化旧代码经用户明确确认纠正' }), stamp);
    }
    const after = catalog();
    assert.equal(after.length, 136);
    for (const row of after) assert.equal(row.project_name, mapping.get(row.project_code));
    for (const old of plan.unchanged) assert.deepEqual(after.find(r => r.id === old.id), old);
    for (const item of plan.changes.filter(c => c.type === 'correct')) assert.equal(after.find(r => r.project_code === item.code).id, item.id);
    for (const [table, expected] of retained) assert.equal(digest(table), expected, `Unrelated table changed: ${table}`);
    const audits = tableRows('audit_logs');
    assert.equal(audits.length, oldAudits.length + plan.changes.length);
    for (const old of oldAudits) assert.deepEqual(audits.find(r => r.id === old.id), old);
    report.verifiedUnchangedTables = retained.size;
    if (mode === 'rehearse') {
      db.exec('rollback'); transaction = false;
      assert.deepEqual(catalog(), plan.before);
      assert.deepEqual(tableRows('audit_logs'), oldAudits);
      report.rollbackVerified = true;
    } else { db.exec('commit'); transaction = false; }
    report.finalCount = mode === 'rehearse' ? plan.before.length : 136;
  }
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  if (transaction) db.exec('rollback');
  throw error;
} finally { db.close(); }
