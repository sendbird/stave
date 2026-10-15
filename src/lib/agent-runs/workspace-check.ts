import { i18n } from "@/i18n/runtime";
import type { AgentConfig } from "../agents/schema";
import type { Workflow, AiStage } from "../workflows/schema";
import type { AgentRunStageRecord } from "./domain";
import { revisionsMatch } from "./verification-contract";

/** Freeze the configured action IDs into the primary write run's workflow. */
export function withWorkspaceCheck(workflow: Workflow, agent: Pick<AgentConfig, "id" | "permission" | "workflow"> | null, scriptIds: readonly string[]): Workflow {
  if (!agent || agent.permission === "read-only" || ["researcher", "reviewer", "lead"].includes(agent.id) || !scriptIds.length) return workflow;
  if (agent.workflow?.length && !["implementer", "debugger", "ui-polisher"].includes(agent.id)) return workflow;
  const stage = [...workflow.stages].reverse().find((entry) => entry.kind === "ai");
  if (!stage || stage.kind !== "ai") return workflow;
  const ids = [...new Set(scriptIds)].sort();
  const text = i18n.t("agentRuns:workspaceCheck.criterion") + (ids.length > 1 ? ` (${ids.join(", ")})` : "");
  return { ...workflow, stages: workflow.stages.map((entry) => entry !== stage ? entry : {
    ...stage,
    acceptanceCriteria: [...(stage.acceptanceCriteria ?? []), { text, required: true, verification: "stave-check", scriptIds: ids }],
  }) };
}

export function workspaceCheckMet(record: AgentRunStageRecord, scriptIds?: readonly string[]): boolean {
  const reportRevision = record.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
  return (record.facts?.workspaceScripts ?? []).some((check) =>
    check.source === "stave" && check.exitCode === 0 && (!scriptIds?.length || scriptIds.includes(check.scriptId)) &&
    revisionsMatch(check.verification.sourceRevision, check.verification.completedRevision) &&
    revisionsMatch(check.verification.completedRevision, reportRevision) &&
    revisionsMatch(reportRevision, record.facts?.workspaceRevision));
}

/** Also used by the briefing, so the agent sees the exact runnable IDs. */
export function workspaceCheckInstruction(criterion: NonNullable<AiStage["acceptanceCriteria"]>[number]): string {
  const scripts = criterion.scriptIds?.map((id) => `\`${id}\``).join(" or ") ?? "a configured action ID";
  return `Run \`stave_run_workspace_script\` with script ${scripts} on the final revision, then report again`;
}
