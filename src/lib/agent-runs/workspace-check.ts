import { i18n } from "@/i18n/runtime";
import type { AgentConfig } from "../agents/schema";
import type { Workflow, AiStage } from "../workflows/schema";
import { AgentRunCommandError, type AgentRunStageRecord } from "./domain";
import { revisionsMatch, type FrozenWorkspaceScript, type WorkspaceRevision, type ScriptVerification } from "./verification-contract";

/** Explicit checks are bound regardless of whether this agent gets a default. */
export function freezeWorkspaceChecks(workflow: Workflow, scripts: readonly FrozenWorkspaceScript[]): Workflow {
  const definitions = [...scripts].sort((left, right) => left.scriptId < right.scriptId ? -1 : left.scriptId > right.scriptId ? 1 : 0);
  let changed = false;
  const stages = workflow.stages.map((stage) => {
    if (stage.kind !== "ai") return stage;
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

/** Add or upgrade the primary write run's default after rebinding explicit checks. */
export function withDefaultWorkspaceCheck(bound: Workflow, agent: Pick<AgentConfig, "id" | "permission" | "workflow"> | null, scripts: readonly FrozenWorkspaceScript[]): Workflow {
  if (!agent || agent.permission === "read-only" || ["researcher", "reviewer", "lead"].includes(agent.id) || !scripts.length) return bound;
  if (agent.workflow?.length && !["implementer", "debugger", "ui-polisher"].includes(agent.id)) return bound;
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

export function workspaceCheckMet(record: AgentRunStageRecord, scriptIds?: readonly string[], definitions?: readonly FrozenWorkspaceScript[]): boolean {
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  return (record.facts?.workspaceScripts ?? []).some((check) =>
    check.source === "stave" && check.exitCode === 0 && (!scriptIds?.length || scriptIds.includes(check.scriptId)) &&
    Boolean(definitions?.some((definition) => definition.scriptId === check.scriptId && definition.definitionHash === check.definitionHash)) &&
    revisionsMatch(check.verification.sourceRevision, check.verification.completedRevision) &&
    revisionsMatch(check.verification.completedRevision, reportRevision) &&
    revisionsMatch(reportRevision, record.facts?.workspaceRevision));
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
  const check = [...(record.facts?.workspaceScripts ?? [])].reverse().find((entry) => !criterion.scriptIds?.length || criterion.scriptIds.includes(entry.scriptId));
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  const reason = !check ? i18n.t("agentRuns:workspaceCheck.missing") :
    !criterion.scriptDefinitions?.some((definition) => definition.scriptId === check.scriptId && definition.definitionHash === check.definitionHash) ? i18n.t("agentRuns:workspaceCheck.definitionMismatch") :
    scriptVerificationProblem(check.verification) ?? workspaceRevisionProblem(reportRevision, "report") ?? workspaceRevisionProblem(record.facts?.workspaceRevision, "workspace") ??
    (check.exitCode !== 0 ? i18n.t("agentRuns:workspaceCheck.failed", { exitCode: check.exitCode }) : i18n.t("agentRuns:workspaceCheck.stale"));
  return `${reason} ${workspaceCheckInstruction(criterion)}`;
}

/** Also used by the briefing, so the agent sees the exact runnable IDs. */
export function workspaceCheckInstruction(criterion: NonNullable<AiStage["acceptanceCriteria"]>[number]): string {
  const scripts = criterion.scriptIds?.map((id) => `\`${id}\``).join(" or ") ?? "a configured action ID";
  return `Run \`stave_run_workspace_script\` with script ${scripts} on the final revision, then report again`;
}
