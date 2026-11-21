import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
const roles = ['接机', '勤务', '例行机内', '例行L/G', '例行发动机', '例行机外', '例行电子'];
const ratios = [0.08, 0.24, 0.34, 0.085, 0.085, 0.085, 0.085];
const context = vm.createContext({
  maintenanceBaseHours: (_type, owner) => owner.baseHours,
  maintenanceRatioForOwner: (_type, owner, role) => owner.ratios[role] ?? 0,
  maintenanceRolesForOpportunity: () => ['放行', ...roles],
  maintenanceNonroutineRoleOrder: ['主做', '检验', '辅助'],
  normalizeMaintenanceSubtaskRole: role => role,
  json: (value,fallback)=>value ? JSON.parse(value) : fallback,
  maintenanceNonroutineAssessment: ()=>null,
  maintenanceNonroutineEffectivePolicy: ()=>null,
  maintenanceRatioRuleForOwner: (_type,owner,role)=>owner._nonroutinePolicy?.ratios?.[role] ?? null,
});
const start = source.indexOf('function maintenanceCalculatedHours(');
vm.runInContext(source.slice(start, source.indexOf('\n}\n', start) + 2), context);
const owner = { baseHours: 5, work_kind: '航后', ratios: Object.fromEntries(roles.map((role, i) => [role, ratios[i]])) };
const assignments = roles.map((role, i) => ({ id: `a-${i}`, person_id: 'person-a', role }));
const calculate = (rows, input = owner, type = 'flight') => context.maintenanceCalculatedHours(type, input, rows);
const cents = result => [...result.values()].reduce((sum, hours) => sum + Math.round(hours * 100), 0);
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
for (const name of ['maintenanceReviewPerson', 'maintenanceReviewCalculatedHours','maintenanceReviewRoleHtml']) {
  const begin = app.indexOf(`function ${name}(`);
  vm.runInContext(app.slice(begin, app.indexOf('\n}\n', begin) + 2), context);
}

test('postflight 5h allocates exactly 500 cents rather than 502', () => {
  const result = calculate(assignments);
  assert.equal(cents(result), 500);
  assert.deepEqual([...result.values()], [0.4, 1.2, 1.7, 0.43, 0.43, 0.42, 0.42]);
});

test('role and person allocation stays stable across input order and assignment ID regeneration', () => {
  const rows = assignments.flatMap(row => ['c', 'a', 'b'].map(person => ({ ...row, id: `${row.id}-${person}`, person_id: person })));
  const byPerson = (items, result) => items.map(row => [`${row.role}:${row.person_id}`, result.get(row.id)]).sort();
  const first = calculate(rows);
  const regenerated = [...rows].reverse().map((row, i) => ({ ...row, id: `new-${i}` }));
  assert.equal(cents(first), 500);
  assert.deepEqual(byPerson(rows, first), byPerson(regenerated, calculate(regenerated)));
  for (const role of roles) {
    const values = rows.filter(row => row.role === role).map(row => Math.round(first.get(row.id) * 100));
    assert.ok(Math.max(...values) - Math.min(...values) <= 1);
  }
});

test('missing or partially submitted roles do not receive another role budget', () => {
  const full = calculate(assignments);
  for (const row of assignments) assert.equal(calculate([row]).get(row.id), full.get(row.id));
  assert.equal(cents(calculate(assignments.slice(0, 1))), 40);
  assert.equal(calculate([{ id: 'release', role: '放行' }]).get('release'), 0);
  assert.equal(calculate([]).size, 0);
});

test('small and decimal budgets conserve cents with multiple people', () => {
  for (const baseHours of [0, 0.01, 0.03, 1.01, 2, 5, 99.99]) {
    const rows = assignments.flatMap(row => Array.from({ length: 7 }, (_, i) => ({ ...row, id: `${row.id}-${i}`, person_id: `p${i}` })));
    const result = calculate(rows, { ...owner, baseHours });
    assert.equal(cents(result), Math.round(baseHours * 100));
    assert.ok([...result.values()].every(value => value >= 0));
  }
});

test('nonroutine and towing allocation remain unchanged', () => {
  const rows = ['主做', '检验', '辅助'].map((role, i) => ({ id: `n${i}`, role }));
  assert.equal(cents(calculate(rows, { baseHours: 1, ratios: { 主做: 0.6, 检验: 0.3, 辅助: 0.1 } }, 'subtask')), 100);
  assert.equal(cents(calculate(rows, { baseHours: 1, category: '拖机' }, 'subtask')), 100);
});

test('new equal policy counts a person once across roles and leaves unknown or pending estimates missing', () => {
  const rows=[{id:'a1',person_id:'a',role:'主做'},{id:'a2',person_id:'a',role:'检验'},{id:'b1',person_id:'b',role:'主做'}];
  for(const baseHours of [0,0.01,1.5,2.1]) {
    const result=calculate(rows,{baseHours,_nonroutinePolicy:{strategy:'EQUAL'}},'subtask');
    assert.equal(cents(result),Math.round(baseHours*100));
    assert.equal(result.get('a2'),0);
    assert.ok(Math.abs(result.get('a1')-result.get('b1'))<=0.010001);
  }
  assert.equal(calculate(rows,{baseHours:null},'subtask').size,0);
  assert.equal(calculate(rows,{baseHours:2,_nonroutinePolicy:{strategy:'UNDECIDED'}},'subtask').size,0);
  assert.equal(calculate(rows,{baseHours:2,_nonroutinePolicy:{strategy:'ROLE_COMBINATION',valid:true,ratios:{主做:0.3,检验:null}}},'subtask').size,0);
});

test('review display keeps pending hours missing and uses saved new-policy results instead of a second allocation algorithm', () => {
  const pending={ownerType:'subtask',hourAssessment:{pending:true},baseHours:null};
  assert.equal(context.maintenanceReviewCalculatedHours(pending,'主做','a'),null);
  const standard={ownerType:'subtask',changed:false,hourAssessment:{pending:false},assignments:[{role:'主做',personId:'a',reportedHours:0}]};
  assert.equal(context.maintenanceReviewCalculatedHours(standard,'主做','a'),0);
  standard.changed=true;
  assert.equal(context.maintenanceReviewCalculatedHours(standard,'主做','a'),null);
});

test('review previews match server cents for every person and role after editing', () => {
  const rows = assignments.flatMap(row => ['c', 'a', 'b'].map(person => ({ ...row, id: `${row.id}-${person}`, person_id: person })));
  const task = { ownerType: 'flight', baseHours: 5, changed: true,
    roles: roles.map((role, i) => ({ role, ratio: ratios[i] })),
    selections: new Map(roles.map(role => [role, new Set(['c', 'a', 'b'])])), assignments: [] };
  const expected = calculate(rows);
  for (const row of rows) assert.equal(context.maintenanceReviewCalculatedHours(task, row.role, row.person_id), expected.get(row.id));
});

test('unchanged historical and adjusted stored hours remain authoritative in review', () => {
  const task = { changed: false, ownerType: 'flight', assignments: [{ role: '接机', personId: 'p', reportedHours: 0.47 }] };
  assert.equal(context.maintenanceReviewCalculatedHours(task, '接机', 'p'), 0.47);
  assert.equal(context.maintenanceReviewCalculatedHours(task, '放行', 'p'), 0);
});

test('review rendering distinguishes the original actual role from the verified allocation role',()=>{
  Object.assign(context,{state:{maintenanceReviewDraft:{activeTaskKey:'other',canEdit:false}},escapeHtml:value=>String(value ?? ''),maintenanceReviewTaskKey:()=> 'task'});
  const task={ownerType:'subtask',changed:false,hourAssessment:{sourceKind:'REVIEW',pending:false},selections:new Map([['主做',new Set(['p'])]]),
    assignments:[{personId:'p',role:'主做',allocationRole:'检验',reportedHours:2,status:'已确认'}]};
  const html=context.maintenanceReviewRoleHtml(task,{role:'主做',metricType:'hours',ratio:null},new Map([['p',{name:'参与人',team:'班组'}]]));
  assert.match(html,/<strong>主做<\/strong>/);assert.match(html,/核算角色：检验/);assert.match(html,/按终审核实角色/);assert.match(html,/2h/);
  assert.ok(!html.includes('比例 null'));
});
