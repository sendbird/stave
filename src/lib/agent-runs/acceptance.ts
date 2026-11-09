import { i18n } from "@/i18n/runtime";
import type { AiStage, WorkflowStage } from "@/lib/workflows/schema";
import type { AgentRunAggregate, AgentRunStageRecord, CompleteStageReport } from "./domain";
import { collectAcceptanceCriteria, inheritedWorkspaceCheckCriteria } from "./briefing";
import { revisionsMatch } from "./verification-contract";
import { inheritedWorkspaceChecks, inheritedWorkspaceCheckRevision, workspaceCheckBlock, workspaceCheckMet, workspaceCheckMode } from "./workspace-check";
export { inheritedWorkspaceCheckCriteria } from "./briefing";

/** The final AI report also needs a revision when its host checks came from an earlier stage. */
export function hasInheritedWorkspaceChecks(aggregate: AgentRunAggregate): boolean {
  return inheritedWorkspaceCheckCriteria(aggregate).length > 0;
}

/** Also guards completion paths that safely omit a final stage. */
export function unmetInheritedWorkspaceChecks(aggregate: AgentRunAggregate, record: AgentRunStageRecord): string | null {
  const checks = inheritedWorkspaceChecks(aggregate);
  for (const criterion of collectAcceptanceCriteria(aggregate).filter((entry) => entry.required !== false)) {
    const check = checks.get(criterion.text.trim());
    if (check && !inheritedWorkspaceCheckRevision(aggregate, record, check, { requireCurrentReport: true })) return check.actionScriptId
      ? i18n.t("agentRuns:acceptance.extraCopy211") : workspaceCheckBlock(record, check.criterion);
  }
  return null;
}

type RequiredReportCriterion = NonNullable<WorkflowStage["acceptanceCriteria"]>[number] | { text: string; verification?: undefined };

/**
 * The criteria an AI stage's complete report must mark met, keyed by trimmed
 * text: this stage's required criteria, the goal criteria the final stage
 * must settle, and the report's own required additions. Host checks among
 * them (`verification: "stave-check"`) are settled by Stave, not the report.
 */
function requiredAiStageCriteria(aggregate: AgentRunAggregate, record: AgentRunStageRecord, stage: AiStage): Map<string, RequiredReportCriterion> {
  const explicit = stage.acceptanceCriteria?.filter((criterion) => criterion.required !== false) ?? [];
  const finalStage = aggregate.agentRun.currentStageIndex === aggregate.agentRun.workflow.stages.length - 1;
  const inheritedCriteria = collectAcceptanceCriteria(aggregate);
  const inheritedTexts = new Set(inheritedCriteria.map((criterion) => criterion.text.trim()));
  const optionalTexts = new Set([...inheritedCriteria, ...(stage.acceptanceCriteria ?? [])].filter((criterion) => criterion.required === false).map((criterion) => criterion.text.trim()));
  const goalCriteria = finalStage ? inheritedCriteria.filter((criterion) => criterion.required !== false) : [];
  const inheritedChecks = inheritedWorkspaceChecks(aggregate);
  const verifiedInherited = new Set(goalCriteria.map((criterion) => criterion.text.trim()).filter((text) => inheritedChecks.has(text)));
  const report = record.report?.outcome === "complete" ? record.report : null;
  const required = new Map<string, RequiredReportCriterion>(explicit.map((criterion) => [criterion.text.trim(), criterion]));
  // Planning may record criteria for later stages without claiming to have met them.
  if (stage.role !== "plan") {
    // A goal criterion an earlier stage already met stands, as it does before an
    // action stage, unless this stage says otherwise: its report restates it as
    // anything but met, or its own host check of that criterion has not passed
    // (`collectAcceptanceCriteria` order: report, then check). Marking it
    // optional here does not lift it. The rest must be met here.
    for (const criterion of goalCriteria) {
      const text = criterion.text.trim();
      if (required.has(text)) continue;
      const ownCheck = stage.acceptanceCriteria?.find((entry) => entry.verification === "stave-check" && entry.text.trim() === text);
      const current = ownCheck
        ? (workspaceCheckMet(record, "scriptIds" in ownCheck ? ownCheck.scriptIds : undefined, "scriptDefinitions" in ownCheck ? ownCheck.scriptDefinitions : undefined, workspaceCheckMode(ownCheck)) ? "met" : "unverified")
        : report?.acceptanceCriteria?.find((entry) => entry.text.trim() === text)?.status ?? (verifiedInherited.has(text) ? "met" : criterion.status);
      if (current !== "met") required.set(text, ownCheck ? { ...ownCheck, required: true } : { text: criterion.text });
    }
    for (const criterion of report?.acceptanceCriteria ?? []) {
      const text = criterion.text.trim();
      if (criterion.required !== false && !required.has(text) && !optionalTexts.has(text) && (finalStage || !inheritedTexts.has(text))) required.set(text, { text: criterion.text });
    }
  }
  return required;
}

/**
 * The required criteria a complete report for the current AI stage does not
 * name by their exact text, in workflow order. Stave matches a report to a
 * criterion only by its trimmed text, so a paraphrased criterion would leave
 * the real one unresolved and halt the run; `stave_report_stage` refuses such
 * a report so the agent can restate it in the same turn. Host checks are left
 * out: Stave settles them itself.
 */
export function unreportedStageCriteria(aggregate: AgentRunAggregate, record: AgentRunStageRecord, report: Pick<CompleteStageReport, "acceptanceCriteria">): string[] {
  const stage = aggregate.agentRun.workflow.stages[aggregate.agentRun.currentStageIndex]!;
  if (stage.kind !== "ai") return [];
  // Recording replaces the whole report, so an earlier report's criteria never carry over.
  const candidate = { ...record, report: { ...COMPLETE_REPORT_SHELL, acceptanceCriteria: report.acceptanceCriteria } };
  const named = new Set((report.acceptanceCriteria ?? []).map((criterion) => criterion.text.trim()));
  return [...requiredAiStageCriteria(aggregate, candidate, stage).entries()]
    .filter(([text, criterion]) => criterion.verification !== "stave-check" && !named.has(text))
    .map(([, criterion]) => criterion.text);
}

const COMPLETE_REPORT_SHELL: CompleteStageReport = { outcome: "complete", summary: "-", decisions: [], evidence: [], artifacts: [], reportedAt: new Date(0).toISOString(), turnId: null };

/** Reports and successful children do not satisfy an unresolved explicit requirement. */
export function unmetStageAcceptance(aggregate: AgentRunAggregate, record: AgentRunStageRecord): string | null {
  const stage = aggregate.agentRun.workflow.stages[aggregate.agentRun.currentStageIndex]!;
  const explicit = stage.acceptanceCriteria?.filter((criterion) => criterion.required !== false) ?? [];
  const finalStage = aggregate.agentRun.currentStageIndex === aggregate.agentRun.workflow.stages.length - 1;
  const inheritedCriteria = collectAcceptanceCriteria(aggregate);
  const goalCriteria = finalStage ? inheritedCriteria.filter((criterion) => criterion.required !== false) : [];
  const inheritedChecks = inheritedWorkspaceChecks(aggregate);
  const unmetInherited = finalStage ? unmetInheritedWorkspaceChecks(aggregate, record) : null;
  if (unmetInherited) return unmetInherited;
  const verifiedInherited = new Set(goalCriteria.map((criterion) => criterion.text.trim()).filter((text) => inheritedChecks.has(text)));
  if (stage.kind === "action") {
    const unresolved = goalCriteria.find((criterion) => criterion.status !== "met" && !verifiedInherited.has(criterion.text.trim()) && !explicit.some((current) => current.text.trim() === criterion.text.trim()));
    if (unresolved) return i18n.t("agentRuns:acceptance.extraCopy212", { value1: unresolved.text });
    if (!explicit.length) return null;
    const action = record.facts?.action;
    return action?.type === "run-script" && action.exitCode === 0 &&
      revisionsMatch(action.verification?.sourceRevision, action.verification?.completedRevision) &&
      revisionsMatch(action.verification?.sourceRevision, record.facts?.workspaceRevision)
      ? null : i18n.t("agentRuns:acceptance.extraCopy211");
  }
  const report = record.report?.outcome === "complete" ? record.report : null;
  for (const [text, criterion] of requiredAiStageCriteria(aggregate, record, stage)) {
    if (criterion.verification === "stave-check") {
      const checkCriterion = { ...criterion, scriptIds: "scriptIds" in criterion ? criterion.scriptIds : undefined, scriptDefinitions: "scriptDefinitions" in criterion ? criterion.scriptDefinitions : undefined };
      if (!workspaceCheckMet(record, checkCriterion.scriptIds, checkCriterion.scriptDefinitions, workspaceCheckMode(checkCriterion))) return workspaceCheckBlock(record, checkCriterion);
      continue;
    }
    const reported = report?.acceptanceCriteria?.find((entry) => entry.text.trim() === text);
    // Say what the report said, so the user and Tars can tell an honest
    // "unverified" from a criterion the report never named.
    if (reported?.status !== "met") return i18n.t(reported?.status === "unmet" ? "agentRuns:acceptance.criterionReportedUnmet"
      : reported ? "agentRuns:acceptance.criterionReportedUnverified" : "agentRuns:acceptance.criterionNotReported", { value1: text });
  }
  return null;
}
