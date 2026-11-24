// 数据保留周期策略（D07 决策，2026-11-24 用户拍板）：
// - 审计与变更日志：3 年
// - 考勤与工时原始数据：5 年
// - 人员主数据：长期保留（不清理）
//
// 执行工具：scripts/retention-cleanup.mjs。默认干跑只统计；--apply 才归档并删除，
// 归档落在 data/retention-archive/ 下（先归档、后删除、可回溯），并写 audit_logs 留痕。
// 新增表进策略前必须核对外键依赖：有未被本策略覆盖的入边外键的表不得加入（清理会失败或被引擎阻止）。

export const RETENTION_GROUPS = {
  audit: {
    years: 3,
    description: "审计与变更日志",
    tables: [
      { table: "audit_logs", timeColumn: "created_at", pk: ["id"] },
      { table: "maintenance_logs", timeColumn: "created_at", pk: ["id"] },
      { table: "personnel_change_logs", timeColumn: "created_at", pk: ["id"] },
      { table: "handover_change_log", timeColumn: "changed_at", pk: ["id"] },
      { table: "attendance_offset_audit", timeColumn: "created_at", pk: ["id"] },
    ],
  },
  raw: {
    years: 5,
    description: "考勤与工时原始数据",
    tables: [
      { table: "attendance_events", timeColumn: "received_at", pk: ["id"] },
      // 日期列与 ISO 时间戳的字符串序不同，单独按 YYYY-MM-DD 截断
      { table: "attendance_days", timeColumn: "work_date", pk: ["person_id", "work_date"], dateOnly: true },
      // 先从子表删，再删父表；父表删除额外守卫“无剩余子行”
      { table: "maintenance_nonroutine_role_results", timeColumn: "created_at", pk: ["id"] },
      {
        table: "maintenance_hour_results",
        timeColumn: "created_at",
        pk: ["id"],
        guard: "not exists (select 1 from maintenance_nonroutine_role_results c where c.result_id = maintenance_hour_results.id)",
      },
      { table: "maintenance_sortie_results", timeColumn: "created_at", pk: ["id"] },
    ],
  },
};

export function retentionCutoff(years, { now = new Date(), dateOnly = false } = {}) {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - years);
  return dateOnly ? cutoff.toISOString().slice(0, 10) : cutoff.toISOString();
}
