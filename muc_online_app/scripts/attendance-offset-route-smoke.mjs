// B4 考勤路由隔离冒烟（V1.1 §6）：服务级内存库 fixture，覆盖
// 干部共同审批、唯一胜出、实时资格、混合单自选、责任重路由与自审禁止。
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createOffsetService } from "../attendance-offset-service.mjs";
import { datesBetween } from "../attendance-rules.mjs";

const perms = ["attendance.offset.rules.manage", "attendance.offset.submit", "attendance.offset.approve", "attendance.offset.responsibility.manage"];
function fixture() {
  const db = new DatabaseSync(":memory:"); let now = Date.parse("2026-09-30T23:00:00+08:00");
  db.exec("create table personnel(id text primary key,employee_no text,name text,position_code text,administrative_team_id text,data_status text default 'active',employment_status text default '在职')");
  db.exec("insert into personnel(id,employee_no,name,position_code) values ('p','10001','员工甲','维修人员'),('l','10002','组长乙','班组长'),('admin','10003','主任丙','主任'),('c2','10004','副主任丁','副主任')");
  const employee = { id: "employee", personId: "p", permissions: ["attendance.offset.submit"] };
  const leader = { id: "leader", personId: "l", permissions: ["attendance.offset.submit", "attendance.offset.approve"] };
  const admin = { id: "admin", personId: "admin", permissions: perms };
  const cadre2 = { id: "c2", personId: "c2", permissions: ["attendance.offset.approve"] };
  const users = [employee, leader, admin, cadre2];
  const sources = new Map();
  const day = date => sources.get(date) || { date, input: { date, covered: true, rest: true, points: [], punches: [], approvals: [] }, sourceReadAt: Date.parse(date + "T23:59:00+08:00") };
  const deps = { db, allowLegacySettlement: true, clock: () => now, hasPermission: (u, p) => u.permissions.includes(p), canViewPerson: () => true, loadUser: id => users.find(u => u.id === id), listApproverIds: () => users.map(u => u.id), readDays: (p, from, to) => datesBetween(from, to).map(day), writesEnabled: true };
  const service = createOffsetService(deps);
  const at = (date, time) => Date.parse(`${date}T${time}+08:00`);
  const abnormal = (personId, date) => {
    const input = { date, covered: true, points: [{ type: "OnDuty", planId: "on", planned: at(date, "08:30:00") }, { type: "OffDuty", planId: "off1", planned: at(date, "12:00:00") }, { type: "OnDuty", planId: "on2", planned: at(date, "13:00:00") }, { type: "OffDuty", planId: "off2", planned: at(date, "19:40:00") }], punches: [], approvals: [] };
    sources.set(date, { date, input, sourceReadAt: at(date, "23:59:00") }); return input;
  };
  function eventsOf(personId, date) { return db.prepare("select id from attendance_offset_events where person_id=? and work_date=? order by planned").all(personId, date).map(r => r.id); }
  function grant() {
    service.saveRule(admin, { sourceMonth: "2026-10", hours: "2", count: 1, cap: 9, personIds: ["l", "p"] }, "rule-all");
    now = at("2026-11-20", "12:00:00");
    const overtime = abnormal("p", "2026-10-05");  // 抵消额度来自 source 月的实际晚下班（挣得时间）
    overtime.punches = overtime.points.filter(p => p.type === "OffDuty").map(p => ({ ...p, actual: p.planned + 12 * 3600000, source: "USER", timeResult: "Normal" }));
    for (const personId of ["l", "p"]) {
      const issued = service.issue(admin, { personId, sourceMonth: "2026-10" }, "issue-" + personId);
      assert.ok(issued.granted >= 6, `额度发放失败：${JSON.stringify(issued)}`);
    }
  }
  return { db, service, employee, leader, admin, cadre2, sources, deps, abnormal, eventsOf, grant, setNow: v => now = v, at };
}

try {
  const f = fixture();

  // ---- 场景 1：班组长本人缺卡 → 干部共同审批，任一人完整审批终结整单。
  f.grant();
  const leaderDay = f.abnormal("l", "2026-11-10");
  f.service.reconcile(f.admin, "l", leaderDay.date, "reconcile-leader");
  const leaderEvents = f.eventsOf("l", leaderDay.date);
  assert.ok(leaderEvents.length >= 1, "班组长缺卡事件应生成");
  const cadreRequest = f.service.submit(f.leader, { events: leaderEvents, note: "班组长本人缺卡" }, "submit-cadre");
  const saved = f.db.prepare("select responsibility_json from attendance_offset_requests where id=?").get(cadreRequest.id);
  const responsibility = JSON.parse(saved.responsibility_json);
  assert.equal(responsibility.route_kind, "cadre_pool", "班组长缺卡应路由干部池");
  assert.equal(responsibility.applicant_class, "team_leader", "提交时分类快照（D01）");
  const candidateIds = responsibility.candidates.map(c => c.userId).sort();
  assert.deepEqual(candidateIds, ["admin", "c2"], "干部池=其他干部（申请人排除）");
  assert.equal(f.service.tasks.count(f.admin).count, 1, "每名可达干部一条待办");
  assert.equal(f.service.tasks.count(f.cadre2).count, 1);
  // 申请人（班组长本人）自审禁止。
  assert.throws(() => f.service.decide(f.leader, cadreRequest.id, { version: 1, decisions: [] }, "self"), { status: 403 });
  // 干部 c2 完整审批 → 整单终结；干部 admin 再审 → 已处理。
  const detail = f.service.detail(f.cadre2, cadreRequest.id);
  const decision = { version: detail.version, decisions: detail.items.map(i => ({ id: i.id, decision: "approved" })) };
  const result = f.service.decide(f.cadre2, cadreRequest.id, decision, "decide-c2");
  assert.equal(result.status, "approved");
  assert.equal(f.db.prepare("select assignee_user_id from attendance_offset_requests where id=?").get(cadreRequest.id).assignee_user_id, "c2", "胜出决定者写入 assignee 留痕");
  assert.throws(() => f.service.decide(f.admin, cadreRequest.id, decision, "decide-admin"), { status: 403 }, "整单终结后其他干部不可再审");
  assert.equal(f.service.tasks.count(f.admin).count, 0, "胜出后其他干部待办全部关闭");
  assert.equal(f.service.tasks.count(f.cadre2).count, 0);

  // ---- 场景 2：干部池候选实时资格（D05）——提交后撤职的候选不能再审。
  f.db.exec("update personnel set position_code='班组长' where id='p'");
  const workerDay = f.abnormal("p", "2026-11-11");
  f.service.reconcile(f.admin, "p", workerDay.date, "reconcile-worker");
  const workerEvents = f.eventsOf("p", workerDay.date);
  const secondRequest = f.service.submit(f.employee, { events: workerEvents, note: "撤职前提交" }, "submit-2");
  assert.equal(JSON.parse(f.db.prepare("select responsibility_json from attendance_offset_requests where id=?").get(secondRequest.id).responsibility_json).route_kind, "cadre_pool");
  f.db.exec("update personnel set position_code='副主任' , employment_status='停职' where id='c2'");  // 撤 c2 干部资格
  assert.throws(() => f.service.decide(f.cadre2, secondRequest.id, { version: 1, decisions: [] }, "demoted"), { status: 403 }, "撤职候选不得审批");
  const detail2 = f.service.detail(f.admin, secondRequest.id);
  const result2 = f.service.decide(f.admin, secondRequest.id, { version: detail2.version, decisions: detail2.items.map(i => ({ id: i.id, decision: "rejected", reason: "证据不足" })) }, "decide-2");
  assert.equal(result2.status, "rejected");

  // ---- 场景 3：普通员工缺卡（同班次唯一班组长）→ duty 路由；原审批人失效后允许责任重路由。
  f.db.exec("update personnel set position_code='维修人员' where id='p'");
  f.db.exec("update personnel set position_code='班组长', employment_status='在职' where id='l'");
  const dutyDay = f.abnormal("p", "2026-11-12");
  f.service.reconcile(f.admin, "p", dutyDay.date, "reconcile-duty");
  const dutyEvents = f.eventsOf("p", dutyDay.date);
  const dutyRequest = f.service.submit(f.employee, { events: dutyEvents, assigneeUserId: "cadre2", note: "自选应被忽略" }, "submit-duty");
  const dutyRow = f.db.prepare("select assignee_user_id,responsibility_json from attendance_offset_requests where id=?").get(dutyRequest.id);
  assert.equal(dutyRow.assignee_user_id, "leader", "路由到异常日同班次唯一班组长，自选被忽略");
  assert.equal(JSON.parse(dutyRow.responsibility_json).route_kind, "duty_team_leader");
  // 原审批人仍有效 → 禁止转交；失效后 → 允许重路由到干部（事实纠正）。
  assert.throws(() => f.service.transfer(f.admin, dutyRequest.id, { version: 1, assigneeUserId: "admin", reason: "仍然有效" }, "blocked"), { status: 409 });
  f.leader.permissions = [];
  f.service.transfer(f.admin, dutyRequest.id, { version: 1, assigneeUserId: "admin", reason: "原审批人失效，重路由" }, "reroute");
  assert.equal(f.db.prepare("select assignee_user_id from attendance_offset_requests where id=?").get(dutyRequest.id).assignee_user_id, "admin");
  const dutyDetail = f.service.detail(f.admin, dutyRequest.id);
  const dutyResult = f.service.decide(f.admin, dutyRequest.id, { version: dutyDetail.version, decisions: dutyDetail.items.map(i => ({ id: i.id, decision: "approved" })) }, "decide-duty");
  assert.equal(dutyResult.status, "approved");

  // ---- 场景 4：混合申请（缺卡+早退）维持申请人自选路径（D03）。
  const mixedDay = f.abnormal("p", "2026-11-13");
  mixedDay.punches = [{ ...mixedDay.points[1], actual: mixedDay.points[1].planned - 40 * 60000, source: "USER", timeResult: "Early" }];
  f.service.reconcile(f.admin, "p", mixedDay.date, "reconcile-mixed");
  const mixedEvents = f.eventsOf("p", mixedDay.date);
  assert.equal(mixedEvents.length, 2, "早退+缺卡两类事件");
  const kinds = f.db.prepare("select distinct kind from attendance_offset_events where work_date=?").all(mixedDay.date).map(r => r.kind).sort();
  assert.deepEqual(kinds, ["day_off_early", "day_off_missing"]);
  f.leader.permissions = ["attendance.offset.approve"];
  const mixedRequest = f.service.submit(f.employee, { events: mixedEvents, assigneeUserId: "leader", note: "混合单自选" }, "submit-mixed");
  assert.equal(JSON.parse(f.db.prepare("select responsibility_json from attendance_offset_requests where id=?").get(mixedRequest.id).responsibility_json).route_kind, "applicant_selected", "混合申请走自选路径");

  // ---- 场景 5：唯一干部是申请人本人 → 提交被拒（车间无其他在职干部）。
  f.db.exec("update personnel set position_code='主任' where id='p'");
  f.db.exec("delete from personnel where id in ('admin','c2')");
  f.db.exec("update personnel set position_code='维修人员' where id='l'");
  const soloDay = f.abnormal("p", "2026-11-14");
  f.service.reconcile(f.admin, "p", soloDay.date, "reconcile-solo");
  const soloEvents = f.eventsOf("p", soloDay.date);
  assert.throws(() => f.service.submit(f.employee, { events: soloEvents, note: "唯一干部" }, "submit-solo"), { status: 409 });

  console.log("考勤路由隔离冒烟通过：干部池共同审批、唯一胜出留痕、待办全关、实时资格、duty 路由、重路由、混合单自选、唯一干部拒交均符合预期。");
  process.exitCode = 0;
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
