import { i18n } from "@/i18n/runtime";
import { formatList } from "@/i18n/format";
import type { AgentConfig } from "../agents/schema";
import type { Workflow, AiStage, WorkspaceCheckMode } from "../workflows/schema";
import { AgentRunCommandError, latestStageRecord, type AgentRunAggregate, type AgentRunStageRecord } from "./domain";
import { revisionsMatch, type FrozenWorkspaceScript, type WorkspaceRevision, type ScriptVerification } from "./verification-contract";

/**
 * The rule a check criterion is judged by. A criterion without a mode keeps
 * its original meaning, one passing script (D10); only an explicit `all`
 * needs every listed script.
 */
export function workspaceCheckMode(criterion: object | undefined): WorkspaceCheckMode {
  return criterion && "mode" in criterion && criterion.mode === "all" ? "all" : "any";
}

/** The scripts a check names: its explicit IDs, else every bound definition. */
function checkScriptIds(scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[]): string[] {
  return scriptIds?.length ? [...scriptIds] : (definitions ?? []).map((definition) => definition.scriptId);
}

/** Explicit checks are bound regardless of whether this agent gets a default. */
export function freezeWorkspaceChecks(workflow: Workflow, scripts: readonly FrozenWorkspaceScript[]): Workflow {
  const definitions = [...scripts].sort((left, right) => left.scriptId < right.scriptId ? -1 : left.scriptId > right.scriptId ? 1 : 0);
  let changed = false;
  const stages = workflow.stages.map((stage) => {
    if (stage.kind === "action") {
      if (stage.action.type !== "run-script" || !stage.acceptanceCriteria?.length) return stage;
      const scriptId = stage.action.scriptId;
      const definition = definitions.find((script) => script.scriptId === scriptId);
      if (!definition) throw new AgentRunCommandError("refused", i18n.t("agentRuns:workspaceCheck.unknownAction", { scriptId }));
      changed = true;
      return { ...stage, acceptanceCriteria: stage.acceptanceCriteria.map(({ scriptIds: _incomingIds, scriptDefinitions: _incomingDefinitions, ...criterion }) => ({
        ...criterion, scriptIds: [scriptId], scriptDefinitions: [definition],
      })) };
    }
    const criteria = stage.acceptanceCriteria?.map((criterion) => {
      if (criterion.verification !== "stave-check") return criterion;
      if (!definitions.length) throw new AgentRunCommandError("refused", i18n.t("agentRuns:workspaceCheck.noActions"));
      const selected = criterion.scriptIds === undefined ? definitions : criterion.scriptIds.map((id) => {
        const definition = definitions.find((script) => script.scriptId === id);
        if (!definition) throw new AgentRunCommandError("refused", i18n.t("agentRuns:workspaceCheck.unknownAction", { scriptId: id }));
        return definition;
      });
      if (!selected.length) throw new AgentRunCommandError("refused", i18n.t("agentRuns:workspaceCheck.noActions"));
      // Every admission discards client bindings, including those from Run again.
      const { scriptDefinitions: _incoming, ...unbound } = criterion;
      changed = true;
      return { ...unbound, scriptIds: selected.map((script) => script.scriptId), scriptDefinitions: selected };
    });
    return criteria?.some((criterion, index) => criterion !== stage.acceptanceCriteria?.[index]) ? { ...stage, acceptanceCriteria: criteria } : stage;
  });
  return changed ? { ...workflow, stages } : workflow;
}

export function withWorkspaceCheck(workflow: Workflow, agent: Pick<AgentConfig, "id" | "permission" | "workflow"> | null, scripts: readonly FrozenWorkspaceScript[]): Workflow {
  return withDefaultWorkspaceCheck(freezeWorkspaceChecks(workflow, scripts), agent, scripts);
}

/**
 * Whether an agent's runs get the default "Workspace checks pass" criterion
 * (when its workspace has action scripts): a primary write agent, not one of
 * the researching or reviewing built-ins, and without a workflow of its own
 * unless it is one of the built-ins whose workflow ends in a fix.
 */
export function defaultWorkspaceCheckApplies(agent: Pick<AgentConfig, "id" | "permission" | "workflow"> | null): boolean {
  if (!agent || agent.permission === "read-only" || ["researcher", "reviewer", "lead"].includes(agent.id)) return false;
  return !(agent.workflow?.length && !["implementer", "debugger", "ui-polisher"].includes(agent.id));
}

/** Add or upgrade the primary write run's default after rebinding explicit checks. */
export function withDefaultWorkspaceCheck(bound: Workflow, agent: Pick<AgentConfig, "id" | "permission" | "workflow"> | null, scripts: readonly FrozenWorkspaceScript[]): Workflow {
  if (!agent || !defaultWorkspaceCheckApplies(agent) || !scripts.length) return bound;
  const stage = [...bound.stages].reverse().find((entry) => entry.kind === "ai");
  if (!stage || stage.kind !== "ai") return bound;
  const definitions = [...scripts].sort((left, right) => left.scriptId < right.scriptId ? -1 : left.scriptId > right.scriptId ? 1 : 0);
  const ids = definitions.map((script) => script.scriptId);
  const text = i18n.t("agentRuns:workspaceCheck.criterion") + (ids.length > 1 ? ` (${ids.join(", ")})` : "");
  const existing = stage.acceptanceCriteria?.find((criterion) => criterion.text === text || criterion.text === i18n.t("agentRuns:workspaceCheck.criterion"));
  if (existing?.verification === "stave-check") return bound;
  if (!existing && stage.acceptanceCriteria?.some((criterion) => criterion.verification === "stave-check" && criterion.required !== false)) return bound;
  const criterion = { text, required: true, verification: "stave-check" as const, scriptIds: ids, scriptDefinitions: definitions };
  return freezeWorkspaceChecks({ ...bound, stages: bound.stages.map((entry) => entry !== stage ? entry : {
    ...stage,
    acceptanceCriteria: existing ? stage.acceptanceCriteria!.map((entry) => entry === existing ? { ...criterion, ...existing, verification: "stave-check" as const } : entry) : [...(stage.acceptanceCriteria ?? []), criterion],
  }) }, scripts);
}

export function workspaceCheckMet(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[], mode: WorkspaceCheckMode = "any"): boolean {
  return revisionsMatch(workspaceCheckRevision(record, scriptIds, definitions, mode), record.facts?.workspaceRevision);
}

/** A host-issued checks-repair turn runs scripts without reporting its action stage. */
export function workspaceActionCheckMet(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[]): boolean {
  return revisionsMatch(workspaceActionCheckRevision(record, scriptIds, definitions), record.facts?.workspaceRevision);
}

/** A later result supersedes that script's earlier result, including a failure. */
export function latestWorkspaceScriptResults(record: Pick<AgentRunStageRecord, "facts">) {
  const latest = new Map<string, NonNullable<NonNullable<AgentRunStageRecord["facts"]>["workspaceScripts"]>[number]>();
  for (const check of record.facts?.workspaceScripts ?? []) {
    if (check.source === "stave") latest.set(check.scriptId, check);
  }
  return [...latest.values()];
}

function verifiedWorkspaceScripts(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[]) {
  return latestWorkspaceScriptResults(record).filter((check) =>
    check.source === "stave" && check.exitCode === 0 && (!scriptIds?.length || scriptIds.includes(check.scriptId)) &&
    Boolean(definitions?.some((definition) => definition.scriptId === check.scriptId && definition.definitionHash === check.definitionHash)) &&
    revisionsMatch(check.verification.sourceRevision, check.verification.completedRevision));
}

/**
 * Original AI-check evidence, independent of a later display-only workspace
 * refresh. With `all`, every named script needs its own passing result on the
 * reported revision; one passing script is enough otherwise.
 */
export function workspaceCheckRevision(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[], mode: WorkspaceCheckMode = "any"): WorkspaceRevision | undefined {
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  const reported = verifiedWorkspaceScripts(record, scriptIds, definitions).filter((check) => revisionsMatch(check.verification.completedRevision, reportRevision));
  if (mode === "any") return reported[0]?.verification.completedRevision;
  const ids = checkScriptIds(scriptIds, definitions);
  const passed = new Set(reported.map((check) => check.scriptId));
  return ids.length > 0 && ids.every((id) => passed.has(id)) ? reported[0]?.verification.completedRevision : undefined;
}

/**
 * Which of a check's scripts passed, each judged by the same rule that decides
 * the check (`workspaceCheckMet`, or the content match an earlier stage uses).
 * Under `any` one passing script meets a check, so `passed` explains what met
 * it; under `all` the scripts not in `passed` are what it still needs.
 */
export interface WorkspaceCheckProgress {
  /** Script IDs that passed, in the check's order. */
  passed: string[];
  total: number;
  /** Every script the check names, in its order. */
  scripts: string[];
  mode: WorkspaceCheckMode;
}

export function workspaceCheckProgress(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[], options: { inherited?: boolean; mode?: WorkspaceCheckMode } = {}): WorkspaceCheckProgress {
  const ids = checkScriptIds(scriptIds, definitions);
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  const matches = options.inherited ? workspaceCheckRevisionMatches : revisionsMatch;
  const passing = new Set(verifiedWorkspaceScripts(record, scriptIds, definitions)
    .filter((check) => revisionsMatch(check.verification.completedRevision, reportRevision) && matches(check.verification.completedRevision, record.facts?.workspaceRevision))
    .map((check) => check.scriptId));
  return { passed: ids.filter((id) => passing.has(id)), total: ids.length, scripts: ids, mode: options.mode ?? "any" };
}

/**
 * "Stave checks: 1 of 3 passed (setup)", or that none has passed yet. A check
 * that needs every script also names the scripts it still needs.
 */
export function describeWorkspaceCheckProgress(progress: WorkspaceCheckProgress): string {
  if (progress.mode === "all") {
    const missing = progress.scripts.filter((id) => !progress.passed.includes(id));
    if (!missing.length) return i18n.t("agentRuns:workspaceCheck.progressAllPassed", { total: progress.total, names: formatList(progress.passed) });
    return progress.passed.length > 0
      ? i18n.t("agentRuns:workspaceCheck.progressAllPartial", { passed: progress.passed.length, total: progress.total, names: formatList(progress.passed), missing: formatList(missing) })
      : i18n.t("agentRuns:workspaceCheck.progressAllNone", { total: progress.total, missing: formatList(missing) });
  }
  return progress.passed.length > 0
    ? i18n.t("agentRuns:workspaceCheck.progressPassed", { passed: progress.passed.length, total: progress.total, names: formatList(progress.passed) })
    : i18n.t("agentRuns:workspaceCheck.progressNone", { total: progress.total });
}

/** Original repair evidence: host scripts do not require an action-stage report. */
export function workspaceActionCheckRevision(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[]): WorkspaceRevision | undefined {
  return verifiedWorkspaceScripts(record, scriptIds, definitions).at(-1)?.verification.completedRevision;
}

/** Only inherited evidence permits a metadata-only staging or commit change. */
export function workspaceCheckRevisionMatches(verified?: WorkspaceRevision, current?: WorkspaceRevision): boolean {
  return revisionsMatch(verified, current) || verified?.status === "known" && current?.status === "known" &&
    verified.contentRevision !== undefined && verified.contentRevision === current.contentRevision;
}

export type WorkspaceCheckCriterion = NonNullable<AiStage["acceptanceCriteria"]>[number];
export type InheritedWorkspaceCheck = { record: AgentRunStageRecord; criterion: WorkspaceCheckCriterion; actionScriptId?: string };

/** One evidence decision for inherited acceptance, briefings and result status.
 * Read latest attempts in workflow order; alternatives remain independent, but
 * a later failed/unacknowledged result cannot fall back to an older success. */
export function inheritedWorkspaceCheckRevision(aggregate: AgentRunAggregate, current: AgentRunStageRecord, inherited: InheritedWorkspaceCheck, options: { requireCurrentReport?: boolean } = {}): WorkspaceRevision | undefined {
  const results = inheritedWorkspaceCheckResults(aggregate, current, inherited, options);
  if (!results) return undefined;
  const matches = (revision: WorkspaceRevision | undefined) => workspaceCheckRevisionMatches(revision, current.facts?.workspaceRevision);
  if (inheritedCheckMode(inherited) === "all") {
    const revisions = results.ids.map((id) => results.latest.get(id));
    return revisions.length > 0 && revisions.every(matches) ? revisions[0] : undefined;
  }
  return [...results.latest.values()].find(matches);
}

/** A Run script action's own check names one script, so only an AI-stage criterion can need all of several. */
function inheritedCheckMode(inherited: InheritedWorkspaceCheck): WorkspaceCheckMode {
  return inherited.actionScriptId ? "any" : workspaceCheckMode(inherited.criterion);
}

/** `inheritedWorkspaceCheckRevision`, script by script. */
export function inheritedWorkspaceCheckProgress(aggregate: AgentRunAggregate, current: AgentRunStageRecord, inherited: InheritedWorkspaceCheck): WorkspaceCheckProgress {
  const results = inheritedWorkspaceCheckResults(aggregate, current, inherited, {});
  const ids = results?.ids ?? [];
  return {
    passed: ids.filter((id) => workspaceCheckRevisionMatches(results?.latest.get(id), current.facts?.workspaceRevision)),
    total: ids.length, scripts: ids, mode: inheritedCheckMode(inherited),
  };
}

/** The latest passing revision per script, or undefined when the current report must match first and does not. */
function inheritedWorkspaceCheckResults(aggregate: AgentRunAggregate, current: AgentRunStageRecord, inherited: InheritedWorkspaceCheck, options: { requireCurrentReport?: boolean }) {
  const currentStage = aggregate.agentRun.workflow.stages[aggregate.agentRun.currentStageIndex];
  if (options.requireCurrentReport && currentStage?.kind === "ai" && !revisionsMatch(current.report?.outcome === "complete" ? current.report.workspaceRevision : undefined, current.facts?.workspaceRevision)) return undefined;
  const { criterion } = inherited;
  const definitions = criterion.scriptDefinitions ?? (inherited.actionScriptId
    ? aggregate.agentRun.workflow.stages.flatMap((stage) => stage.kind === "ai" ? stage.acceptanceCriteria ?? [] : [])
      .flatMap((entry) => entry.scriptDefinitions ?? []).filter((entry) => entry.scriptId === inherited.actionScriptId)
    : []);
  const ids = inherited.actionScriptId ? [inherited.actionScriptId] : criterion.scriptIds ?? definitions.map((entry) => entry.scriptId);
  const latest = new Map<string, WorkspaceRevision | undefined>();
  const firstIndex = aggregate.agentRun.workflow.stages.findIndex((stage) => stage.id === inherited.record.stageId);
  for (let index = firstIndex; index >= 0 && index <= aggregate.agentRun.currentStageIndex; index += 1) {
    const stage = aggregate.agentRun.workflow.stages[index]!;
    const record = index === aggregate.agentRun.currentStageIndex ? current : latestStageRecord(aggregate.stages, stage.id);
    if (!record || index < aggregate.agentRun.currentStageIndex && record.status !== "completed") continue;
    const action = record.facts?.action;
    // Ordinary action results carry no executed definition hash. Only the
    // inherited source action may use its own result; later checks need receipts.
    if (inherited.actionScriptId && record.stageId === inherited.record.stageId && record.attempt === inherited.record.attempt &&
      stage.kind === "action" && stage.action.type === "run-script" && action?.type === "run-script" && stage.action.scriptId === action.scriptId && ids.includes(action.scriptId)) {
      latest.set(action.scriptId, action.exitCode === 0 && revisionsMatch(action.verification?.sourceRevision, action.verification?.completedRevision)
        ? action.verification?.completedRevision : undefined);
    }
    if (stage.kind !== "ai" && !(stage.kind === "action" && stage.action.type === "watch-checks")) continue;
    for (const result of latestWorkspaceScriptResults(record)) {
      if (!ids.includes(result.scriptId)) continue;
      const acknowledged = stage.kind !== "ai" || record.report?.outcome === "complete" && revisionsMatch(result.verification.completedRevision, record.report.workspaceRevision) &&
        (index < aggregate.agentRun.currentStageIndex || revisionsMatch(record.report.workspaceRevision, record.facts?.workspaceRevision));
      latest.set(result.scriptId, result.exitCode === 0 && acknowledged &&
        definitions.some((definition) => definition.scriptId === result.scriptId && definition.definitionHash === result.definitionHash) &&
        revisionsMatch(result.verification.sourceRevision, result.verification.completedRevision) ? result.verification.completedRevision : undefined);
    }
  }
  return { ids, latest };
}

/** Preserve host verification authority when a later stage restates the same goal. */
export function inheritedWorkspaceChecks(aggregate: AgentRunAggregate): Map<string, InheritedWorkspaceCheck> {
  const checks = new Map<string, InheritedWorkspaceCheck>();
  for (const stage of aggregate.agentRun.workflow.stages.slice(0, aggregate.agentRun.currentStageIndex)) {
    const record = latestStageRecord(aggregate.stages, stage.id);
    if (!record || record.status !== "completed") continue;
    if (stage.kind === "ai" && stage.role === "plan") {
      const updates = [...(record.report?.outcome === "complete" ? record.report.acceptanceCriteria ?? [] : []),
        ...(stage.acceptanceCriteria ?? []).filter((criterion) => criterion.verification === "stave-check")];
      if (updates.length) {
        const retained = new Set(updates.map((criterion) => criterion.text.trim()));
        for (const text of checks.keys()) if (!retained.has(text)) checks.delete(text);
      }
    }
    for (const criterion of stage.acceptanceCriteria ?? []) {
      if (stage.kind === "ai" && criterion.verification === "stave-check") checks.set(criterion.text.trim(), { record, criterion });
      else if (stage.kind === "action" && stage.action.type === "run-script") checks.set(criterion.text.trim(), { record, criterion, actionScriptId: stage.action.scriptId });
    }
  }
  return checks;
}

export function workspaceRevisionProblem(revision: WorkspaceRevision | undefined, phase: "source" | "completed" | "report" | "workspace"): string | undefined {
  if (revision?.status === "known") return;
  return i18n.t("agentRuns:workspaceCheck.unknownRevision", {
    phase: i18n.t(`agentRuns:workspaceCheck.phase.${phase}`),
    reason: i18n.t(`agentRuns:workspaceCheck.revisionReason.${revision?.reason ?? "unavailable"}`),
  });
}

export function scriptVerificationProblem(verification: ScriptVerification): string | undefined {
  return workspaceRevisionProblem(verification.sourceRevision, "source") ?? workspaceRevisionProblem(verification.completedRevision, "completed") ??
    (!revisionsMatch(verification.sourceRevision, verification.completedRevision) ? i18n.t("agentRuns:workspaceCheck.changedTree") : undefined);
}

export function workspaceCheckBlock(record: AgentRunStageRecord, criterion: NonNullable<AiStage["acceptanceCriteria"]>[number]): string {
  // A check that needs every script names the first one that has not passed.
  const pending = workspaceCheckMode(criterion) === "all" ? firstPendingScript(record, criterion) : undefined;
  const check = [...(record.facts?.workspaceScripts ?? [])].reverse().find((entry) => pending !== undefined
    ? entry.scriptId === pending : !criterion.scriptIds?.length || criterion.scriptIds.includes(entry.scriptId));
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  const reason = !check ? i18n.t("agentRuns:workspaceCheck.missing") :
    !criterion.scriptDefinitions?.some((definition) => definition.scriptId === check.scriptId && definition.definitionHash === check.definitionHash) ? i18n.t("agentRuns:workspaceCheck.definitionMismatch") :
    scriptVerificationProblem(check.verification) ?? workspaceRevisionProblem(reportRevision, "report") ?? workspaceRevisionProblem(record.facts?.workspaceRevision, "workspace") ??
    (check.exitCode !== 0 ? i18n.t("agentRuns:workspaceCheck.failed", { exitCode: check.exitCode }) : i18n.t("agentRuns:workspaceCheck.stale"));
  const prefix = pending !== undefined ? `${i18n.t("agentRuns:workspaceCheck.allPending", { scriptId: pending })} ` : "";
  return `${prefix}${reason} ${workspaceCheckInstruction(criterion)}`;
}

function firstPendingScript(record: AgentRunStageRecord, criterion: NonNullable<AiStage["acceptanceCriteria"]>[number]): string | undefined {
  const { passed, scripts } = workspaceCheckProgress(record, criterion.scriptIds, criterion.scriptDefinitions);
  return scripts.find((id) => !passed.includes(id));
}

/** Also used by the briefing, so the agent sees the exact runnable IDs. */
export function workspaceCheckInstruction(criterion: NonNullable<AiStage["acceptanceCriteria"]>[number]): string {
  if (workspaceCheckMode(criterion) === "all" && criterion.scriptIds?.length) {
    const every = criterion.scriptIds.map((id) => `\`${id}\``).join(" and ");
    return `Run \`stave_run_workspace_script\` with each of the scripts ${every} on the final revision (every one must pass), then report again`;
  }
  const scripts = criterion.scriptIds?.map((id) => `\`${id}\``).join(" or ") ?? "a configured action ID";
  return `Run \`stave_run_workspace_script\` with script ${scripts} on the final revision, then report again`;
}
