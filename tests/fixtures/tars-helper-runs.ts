import type { AgentRunDetail } from "../../src/lib/agent-runs/api";
import type { AgentRun, AgentRunEvent, StageStatus } from "../../src/lib/agent-runs/domain";
import type { DelegatedAgentRunAuthority } from "../../src/lib/agent-runs/delegated-run";
import type { TarsResponsibility } from "../../src/lib/tars/types";
import { agentRunFixture } from "./agent-run-fixtures";

/**
 * A Tars responsibility whose lead run delegated one supervised helper, the
 * shape of the live run where the helper blocked: the lead sits in its own
 * work stage (running) while the helper's stage waits on the user.
 */
export const TEAM = {
  workspaceId: "ws-exec",
  repositoryPath: "/tmp/repo",
  leadRunId: "agent-run-lead",
  helperRunId: "agent-run-helper",
  helperTaskId: "task-helper",
  question: "bun test fails only in vendor/, which the repository forbids editing. May I change vendor/?",
} as const;

/** What a delegated helper's start event records about who delegated it. */
export function helperAuthority(parentTaskId: string): DelegatedAgentRunAuthority {
  return { parentTaskId, executionId: "execution-helper", agentConfigId: "implementer", agentContentHash: "hash-implementer",
    permissionPolicy: { providerId: "codex", source: "provider-default", requestedProfile: "auto", options: {} } };
}

function withStage(base: ReturnType<typeof agentRunFixture>, agentRun: AgentRun, status: StageStatus, detail: string | null): AgentRunDetail {
  const stageId = agentRun.workflow.stages[agentRun.currentStageIndex]!.id;
  const stages = base.stages.map((stage) => stage.stageId === stageId
    ? { ...stage, status, detail, blockReason: status === "blocked" ? "agent-blocked" as const : null }
    : stage);
  return { agentRun, stages, events: [], report: null };
}

/** The lead run Tars owns for `row`, in its first stage. */
export function leadRunDetail(row: Pick<TarsResponsibility, "id" | "instruction" | "taskId">, status: StageStatus = "running"): AgentRunDetail {
  const base = agentRunFixture({ id: TEAM.leadRunId, leadTaskId: row.taskId! });
  const agentRun: AgentRun = { ...base.agentRun, workspaceId: TEAM.workspaceId, repositoryPath: TEAM.repositoryPath, origin: "agent",
    assignment: row.instruction, workflow: { ...base.agentRun.workflow, id: `tars-${row.id}` }, state: "running", turnCount: 3 };
  return withStage(base, agentRun, status, null);
}

/**
 * The helper run. `interrupted` marks a helper whose turn the app's restart
 * interrupted and recovered (two turns, one measured), as in the live run.
 */
export function helperRunDetail(args: { status?: StageStatus; state?: AgentRun["state"]; pauseReason?: AgentRun["pauseReason"];
  turnCount?: number; interrupted?: boolean } = {}): AgentRunDetail {
  const base = agentRunFixture({ id: TEAM.helperRunId, leadTaskId: TEAM.helperTaskId });
  const agentRun: AgentRun = { ...base.agentRun, workspaceId: TEAM.workspaceId, repositoryPath: TEAM.repositoryPath,
    state: args.state ?? "running", pauseReason: args.pauseReason ?? null, reasonDetail: null, turnCount: args.turnCount ?? 1 };
  const status = args.status ?? "blocked";
  const detail = withStage(base, agentRun, status, status === "running" ? null : TEAM.question);
  if (!args.interrupted) return detail;
  const interrupted = { id: "event-interrupted", agentRunId: TEAM.helperRunId, sequence: 9, kind: "turn-interrupted",
    detail: { turnId: "turn-helper-1" }, createdAt: base.agentRun.createdAt } as unknown as AgentRunEvent;
  return { ...detail, events: [interrupted] };
}
