// 身份分类（V1.1 §3.1 业务规则）：唯一输入是人员主数据 position_code（职位）。
// 去首尾空白后精确匹配；不拆词、不模糊识别、不按姓名/分组/岗级/角色推断。
// 空值与所有未知值归普通员工，但通过 quality 字段显式区分，供数据质量清单使用。
// 组合值（如“主任/班组长”）按未知值处理（suspectedCombined 仅提示，不改变分类）。
// 本模块是纯函数：不读库、不写库、不依赖运行环境，分类结果不自动生成任何权限。

export const IDENTITY_CLASSIFICATION_RULES_VERSION = "2026-11-21.1";

export const IDENTITY_CLASSES = Object.freeze({
  CADRE: "cadre",
  TEAM_LEADER: "team_leader",
  WORKER: "worker"
});

export const IDENTITY_CLASS_LABELS = Object.freeze({
  cadre: "干部",
  team_leader: "班组长",
  worker: "普通员工"
});

// 精确匹配表（V1.1 §3.1；"书记"经用户 2026-11-21 批准加入干部映射）。
const CADRE_POSITIONS = Object.freeze(["主任", "副主任", "助理", "书记"]);
const TEAM_LEADER_POSITIONS = Object.freeze(["班组长"]);
// 已知普通员工职位（2026-11-21 生产实测值：维修/放行；维修人员/放行人员为历史写法兼容）。
const KNOWN_WORKER_POSITIONS = Object.freeze(["维修人员", "放行人员", "维修", "放行"]);

const COMBINATION_SEPARATORS = /[/、,，]/;

export function classifyPosition(rawPosition) {
  const normalized = String(rawPosition ?? "").trim();
  let identity = IDENTITY_CLASSES.WORKER;
  let quality = "unknown_value";
  if (CADRE_POSITIONS.includes(normalized)) {
    identity = IDENTITY_CLASSES.CADRE;
    quality = "matched";
  } else if (TEAM_LEADER_POSITIONS.includes(normalized)) {
    identity = IDENTITY_CLASSES.TEAM_LEADER;
    quality = "matched";
  } else if (KNOWN_WORKER_POSITIONS.includes(normalized)) {
    quality = "matched";
  } else if (normalized === "") {
    quality = "empty";
  }
  return {
    identity,
    identityLabel: IDENTITY_CLASS_LABELS[identity],
    normalizedPosition: normalized,
    quality, // matched | unknown_value | empty
    suspectedCombined: quality === "unknown_value" && COMBINATION_SEPARATORS.test(normalized),
    source: "personnel.position_code",
    rulesVersion: IDENTITY_CLASSIFICATION_RULES_VERSION
  };
}

// 数据质量清单：rows 为 [{ employeeNo, name, position, hasAccount? }]（人员主数据投影）。
// 只汇总分类结果与异常值，不输出其他个人敏感字段。hasAccount 缺省时不做干部缺账号统计。
export function identityQualityReport(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const entries = list.map(row => ({ employeeNo: String(row?.employeeNo ?? ""), name: String(row?.name ?? ""), position: String(row?.position ?? ""), hasAccount: row?.hasAccount, classification: classifyPosition(row?.position) }));
  const count = identity => entries.filter(e => e.classification.identity === identity).length;
  const cadreWithoutAccount = entries.filter(e => e.classification.identity === IDENTITY_CLASSES.CADRE && e.hasAccount === false);
  return {
    rulesVersion: IDENTITY_CLASSIFICATION_RULES_VERSION,
    source: "personnel.position_code",
    summary: {
      total: entries.length,
      cadre: count(IDENTITY_CLASSES.CADRE),
      teamLeader: count(IDENTITY_CLASSES.TEAM_LEADER),
      worker: count(IDENTITY_CLASSES.WORKER),
      workerMatched: entries.filter(e => e.classification.identity === IDENTITY_CLASSES.WORKER && e.classification.quality === "matched").length,
      workerUnknownValues: entries.filter(e => e.classification.identity === IDENTITY_CLASSES.WORKER && e.classification.quality === "unknown_value").length,
      emptyPositions: entries.filter(e => e.classification.quality === "empty").length,
      suspectedCombined: entries.filter(e => e.classification.suspectedCombined).length,
      ...(entries.some(e => e.hasAccount !== undefined) ? { cadreWithoutAccounts: cadreWithoutAccount.length } : {})
    },
    unknownValues: entries.filter(e => e.classification.quality === "unknown_value").map(e => ({ employeeNo: e.employeeNo, name: e.name, position: e.position, suspectedCombined: e.classification.suspectedCombined })),
    ...(entries.some(e => e.hasAccount !== undefined) ? { cadreWithoutAccounts: cadreWithoutAccount.map(e => ({ employeeNo: e.employeeNo, name: e.name, position: e.position })) } : {})
  };
}
