import {MAINTENANCE_RESULT_TYPES,maintenanceModuleResultReference} from './maintenance-module-results.mjs';
// The first registry version describes the existing report modules. These
// adapters expose source references. The original services own settlement.
export const MAINTENANCE_GATE_VERSION = "legacy-report-gates-v1";

// The first enabled coordinator may enforce only the existing approved rules.
// A divergent legacy decision is a deployment mismatch, never a fallback.
export function coordinateMaintenanceTransition(snapshot,action,legacyDecision){
  const decision=evaluateMaintenanceTransition(snapshot,action);
  const expected=typeof legacyDecision==='string'?decision.targetStatus:decision.allowed;
  if(expected!==legacyDecision)throw Object.assign(new Error('原状态服务与冻结规则判断不一致，请核对后重试'),{status:409,code:'MAINTENANCE_COORDINATOR_MISMATCH'});
  return decision;
}

export const MAINTENANCE_REPORT_DEFINITIONS = Object.freeze([
  Object.freeze({ reportType: "release", moduleTypeCode: "release_report", moduleVersion: 1, resultType: "RELEASE_COUNT" }),
  Object.freeze({ reportType: "routine", moduleTypeCode: "routine_report", moduleVersion: 1, resultType: "HOUR", category: "ROUTINE" }),
  Object.freeze({ reportType: "nonroutine", moduleTypeCode: "nonroutine_report", moduleVersion: 1, resultType: "HOUR", category: "NONROUTINE" })
]);

const submittedStatuses = new Set(["已提报", "待复核", "已确认"]);
const manualConfirmationKinds = new Set(["航后", "三方航后", "航后/航前"]);
const resultTypes = new Set(MAINTENANCE_RESULT_TYPES);

function validateTransitionModules(modules) {
  if (!Array.isArray(modules)) throw new TypeError("Missing maintenance modules");
  const seen = new Set();
  let opportunityId;
  for (const module of modules) {
    if (!module || !module.moduleInstanceId || !module.opportunityId || module.gateRuleVersion !== MAINTENANCE_GATE_VERSION || !resultTypes.has(module.resultType)) throw new TypeError("Unsupported maintenance module contract");
    if ((opportunityId && opportunityId !== module.opportunityId) || seen.has(module.moduleInstanceId)) throw new TypeError("Conflicting maintenance module identity");
    opportunityId = module.opportunityId;
    seen.add(module.moduleInstanceId);
    const definition = MAINTENANCE_REPORT_DEFINITIONS.find(item => item.moduleTypeCode === module.moduleTypeCode);
    if(module.resultSource!=null)maintenanceModuleResultReference(definition||{resultType:module.resultType},module.resultSource);
    if (!definition) {
      // The current rule version grants no state influence to extensions.
      if (module.countsAsFormalReportSubmission || module.requiredBeforePendingReview || module.requiredBeforeConfirmation) throw new TypeError("Unapproved extension gate");
      continue;
    }
    if (module.moduleVersion !== definition.moduleVersion || module.resultType !== definition.resultType || !["APPLICABLE", "NOT_APPLICABLE"].includes(module.applicability) || !["PENDING", "DRAFT", "SUBMITTED"].includes(module.moduleBusinessState)) throw new TypeError("Invalid original report module");
    const applicable = module.applicability === "APPLICABLE";
    if (module.moduleInstanceId !== JSON.stringify([module.opportunityId, definition.moduleTypeCode, definition.moduleVersion]) || (definition.reportType === "release" && !applicable)) throw new TypeError("Invalid original report identity or release applicability");
    if (module.requiredBeforePendingReview !== applicable || module.countsAsFormalReportSubmission !== (applicable && module.moduleBusinessState === "SUBMITTED")) throw new TypeError("Inconsistent original report completion fact");
  }
  for (const definition of MAINTENANCE_REPORT_DEFINITIONS) {
    if (modules.filter(module => module.moduleTypeCode === definition.moduleTypeCode).length !== 1) throw new TypeError("Missing or duplicate original report module");
  }
}

export function readMaintenanceReportModules(opportunityId, progress) {
  return MAINTENANCE_REPORT_DEFINITIONS.map(definition => {
    const { reportType, moduleTypeCode, moduleVersion, resultType, category } = definition;
    const batch = progress.batches[reportType];
    const applicable = reportType === "release" ||
      (reportType === "routine" ? progress.hasRoutine : progress.hasFormalNonroutine || progress.hasNonroutineDraft);
    const draftPending = reportType === "nonroutine" && progress.hasNonroutineDraft;
    const submitted = Boolean(applicable && submittedStatuses.has(batch?.status) && !draftPending);
    return {
      opportunityId,
      moduleInstanceId: JSON.stringify([opportunityId, moduleTypeCode, moduleVersion]),
      moduleTypeCode,
      moduleVersion,
      gateRuleVersion: MAINTENANCE_GATE_VERSION,
      applicability: applicable ? "APPLICABLE" : "NOT_APPLICABLE",
      moduleBusinessState: submitted ? "SUBMITTED" : draftPending ? "DRAFT" : "PENDING",
      countsAsFormalReportSubmission: submitted,
      requiredBeforePendingReview: applicable,
      resultType,
      resultSource: submitted && batch?.id ? maintenanceModuleResultReference(definition,{
        type: resultType,
        sourceId: batch.id,
        sourceVersion: batch.version,
        ...(category ? { category } : { unit: "架次" })
      }) : null
    };
  });
}

export function evaluateMaintenanceTransition(snapshot, action) {
  const { currentStatus, finalized, modules } = snapshot;
  validateTransitionModules(modules);
  const decision = {
    gateRuleVersion: MAINTENANCE_GATE_VERSION,
    moduleInstanceIds: modules.map(module => module.moduleInstanceId),
    allowed: true,
    targetStatus: currentStatus,
    blockers: [],
    predicates: []
  };
  const block = code => decision.blockers.push(code);
  const check = (id, satisfied, required = true, blocker = id) => {
    const passed = Boolean(satisfied);
    decision.predicates.push({ id, satisfied: passed, required });
    if (required && !passed) block(blocker);
    return passed;
  };

  if (action === "RECONCILE") {
    check("PRESERVE_CONFIRMED", snapshot.preserveConfirmed && currentStatus === "已确认", false);
    check("HAS_ASSIGNMENTS", snapshot.hasAssignments, false);
    check("REPORT_FINALIZED", finalized, false);
    check("ALL_ASSIGNMENTS_CONFIRMED", snapshot.allConfirmed, false);
    check("FORMAL_REPORT_SUBMITTED", modules.some(module => module.countsAsFormalReportSubmission), false);
    if (snapshot.preserveConfirmed && currentStatus === "已确认") {
      decision.targetStatus = "已确认";
    } else if (!snapshot.hasAssignments) {
      decision.targetStatus = "未派工";
    } else if (finalized) {
      decision.targetStatus = snapshot.allConfirmed ? "已确认" : "待复核";
    } else {
      const submitted = modules.some(module => module.countsAsFormalReportSubmission);
      decision.targetStatus = submitted ? "已提报" : "已派工";
    }
    return decision;
  }

  if (action === "CONFIRM_REVIEW") {
    check("NOT_ARCHIVE_RECONFIRM", snapshot.editingConfirmed === false, true, "ARCHIVE_ALREADY_CONFIRMED");
    check("ROUTINE_SIGNATURE_CHOSEN", snapshot.routineSignatureChosen === true, true, "ROUTINE_SIGNATURE_MISSING");
    check("NONROUTINE_SIGNATURE_CHOSEN", snapshot.nonroutineSignatureChosen === true, true, "NONROUTINE_SIGNATURE_MISSING");
    check("REVIEW_TASKS_COMPLETE", Array.isArray(snapshot.reviewBlockers) && !snapshot.reviewBlockers.length, true, "REVIEW_TASKS_INCOMPLETE");
    decision.allowed = !decision.blockers.length;
    if (decision.allowed) decision.targetStatus = "已确认";
    return decision;
  }

  if (!["FINALIZE_REPORT", "APPLY_FINALIZE_REPORT", "AUTO_FINALIZE_ROUTINE"].includes(action)) {
    throw new TypeError("Unknown maintenance transition action");
  }

  check("NOT_ALREADY_FINALIZED", !finalized, true, "REPORT_ALREADY_FINALIZED");
  check("NO_NONROUTINE_DRAFT", !snapshot.hasNonroutineDraft, true, "NONROUTINE_DRAFT_PENDING");
  for (const module of modules) {
    if (module.requiredBeforePendingReview && module.moduleBusinessState !== "SUBMITTED") {
      check(module.moduleTypeCode, false);
    } else if (module.requiredBeforePendingReview) {
      check(module.moduleTypeCode, true);
    }
  }

  if (action === "AUTO_FINALIZE_ROUTINE") {
    check("AUTOMATIC_KIND_ALLOWED", !manualConfirmationKinds.has(snapshot.workKind), true, "MANUAL_CONFIRMATION_REQUIRED");
    check("NO_FORMAL_NONROUTINE", !snapshot.hasFormalNonroutine, true, "FORMAL_NONROUTINE_PRESENT");
  } else {
    check("RELEASE_REPORTER_AUTHORIZED", snapshot.releaseReporterAuthorized, true, "RELEASE_REPORTER_REQUIRED");
  }
  if (action === "APPLY_FINALIZE_REPORT") {
    check("RELEASE_SELECTION_MATCHES", snapshot.releaseSelectionMatches === true, true, "LOCKED_RELEASE_SELECTION_CHANGED");
    check("RELEASE_PERSON_ACTIVE", snapshot.releasePersonActive === true, true, "LOCKED_RELEASE_PERSON_UNAVAILABLE");
    check("RELEASE_ASSIGNMENT_EXISTS", snapshot.releaseAssignmentExists === true, true, "RELEASE_ASSIGNMENT_MISSING");
    check("RELEASE_ASSIGNMENT_MATCHES", snapshot.releaseAssignmentMatches === true, true, "RELEASE_ASSIGNMENT_MISMATCH");
  }

  decision.allowed = !decision.blockers.length;
  if (decision.allowed) decision.targetStatus = "待复核";
  return decision;
}
