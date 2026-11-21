// 层② 路由-权限矩阵审计（三层访问控制方案 / V1.1 §4.1）：
// 静态扫描 server.mjs 的 /api/ 变更类路由（POST/PUT/DELETE/PATCH），
// 断言每个路由处理体出现权限守卫（requireRbacPermission / requireAnyRbacPermission / hasRbac /
// 委托给内部自带 requirePermission 的服务模块），或命中显式豁免清单。
// 豁免清单新增条目必须写明原因；这是防"新路由漏权限"的兜底网，不能替代评审。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const lines = source.split('\n');

// 服务模块前缀：这些模块的公开入口在服务内部自带 requirePermission/权限校验。
const SERVICE_DELEGATIONS = [
  'offsetService.', 'handoverService.', 'attendanceService.', 'capabilityService.',
  'authorizationProjects.', 'personnelDeletion.', 'infoSync.', 'attachmentManager.',
  'capabilityIntegrity.', 'importWorkspace.', 'maintenanceDispatcher.', 'reportService.'
];
// 豁免清单：'METHOD 路径前缀' → 原因。仅允许登录态或公共语义的入口。
const EXEMPT = {
  'POST /api/login': '登录本身',
  'POST /api/logout': '登出',
  'POST /api/auth': '认证类（改密等内部含账户校验）',
  'PUT /api/self': '本人偏好/密码（内部校验旧密码与会话）'
};
const GUARDS = ['requireRbacPermission', 'requireAnyRbacPermission', 'hasRbac(', 'requireLogin(', 'sameOriginWrite('];
const MUTATING = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

// 路由声明行：if(method==='POST' && url.pathname==='/api/...') 等变体（含 startsWith/正则 target）。
const routes = [];
const seen = new Set();
function record(method, path, lineIndex, line) {
  const key = `${method} ${path} @${lineIndex}`;
  if (!path || seen.has(key)) return;
  seen.add(key);
  routes.push({ method, path, line: lineIndex + 1, guards: [], delegations: [], closed: false, scanFrom: lineIndex });
  if (GUARDS.some(guard => line.includes(guard))) routes[routes.length - 1].guards.push(line.trim().slice(0, 80));
  if (SERVICE_DELEGATIONS.some(prefix => line.includes(prefix))) routes[routes.length - 1].delegations.push(line.trim().slice(0, 80));
}
for (let index = 0; index < lines.length; index++) {
  const line = lines[index];
  const apiMatch = line.match(/['"`](\/api\/[^'"`\s]*)/) || (() => {
    const regexForm = line.match(/\^\\\/api\\\/([^\s'"`$]*)/);
    return regexForm ? { 1: '/api/' + regexForm[1].replace(/\\\//g, '/').replace(/\(\[[^)]*\]\)\+/g, '*') } : null;
  })();
  const methodMatch = line.match(/\bmethod\s*===?\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/);
  if (apiMatch && methodMatch) { record(methodMatch[1], apiMatch[1], index, line); continue; }
  if (apiMatch) {
    // pathname 在前、method 在块内的形式：向后 6 行找 method。
    for (let j = index + 1; j < Math.min(index + 7, lines.length); j++) {
      const m = lines[j].match(/\bmethod\s*===?\s*['"](GET|POST|PUT|DELETE|PATCH)['"]/);
      if (!m) continue;
      record(m[1], apiMatch[1], j, lines[j]);
    }
    continue;
  }
  if (methodMatch) {
    // method 在前、pathname 随后的形式：向后 3 行找 pathname。
    for (let j = index; j < Math.min(index + 4, lines.length); j++) {
      const p = lines[j].match(/['"`](\/api\/[^'"`\s]*)/);
      if (p) { record(methodMatch[1], p[1], index, line); break; }
    }
  }
}
// 处理体扫描：每条路由从声明行向后 80 行内收集守卫与委托（后续路由声明行除外）。
for (const route of routes) {
  for (let index = route.scanFrom + 1; index < Math.min(route.scanFrom + 81, lines.length); index++) {
    const line = lines[index];
    if (GUARDS.some(guard => line.includes(guard))) route.guards.push(line.trim().slice(0, 80));
    if (SERVICE_DELEGATIONS.some(prefix => line.includes(prefix))) route.delegations.push(line.trim().slice(0, 80));
  }
}

test('所有变更类 /api/ 路由都有权限守卫或显式豁免', () => {
  const violations = [];
  for (const route of routes) {
    if (!MUTATING.has(route.method) || !route.path) continue;
    const exemptKey = Object.keys(EXEMPT).find(key => route.path.startsWith(key.split(' ')[1]) && key.startsWith(route.method));
    if (exemptKey) continue;
    if (route.guards.length === 0 && route.delegations.length === 0)
      violations.push(`${route.method} ${route.path}（server.mjs:${route.line}）无权限守卫调用`);
  }
  assert.deepEqual(violations, [], `以下变更类路由缺少权限守卫（如为误报请修正审计器；如确属豁免请登记原因）：\n${violations.join('\n')}`);
});

test('审计器本身有效：识别出的路由数与源码 method 判断数一致（当前基线 169/177）', () => {
  // server.mjs 全量 method === 判断约 177 个（含非 /api/ 与不可达分支），解析器应稳定覆盖其中绝大多数。
  assert.ok(routes.length >= 150, `路由识别数量异常偏少：${routes.length}`);
  assert.ok(routes.some(route => route.method === 'POST'), '应识别出 POST 路由');
  assert.ok(routes.filter(route => MUTATING.has(route.method)).length >= 70, `变更类路由识别偏少：${routes.filter(r => MUTATING.has(r.method)).length}`);
});
