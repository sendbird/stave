import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isActiveAgentRunState, latestStageRecord, type StageStatus } from "@/lib/agent-runs/domain";
import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import type { FleetFocusTarget } from "@/store/fleet-focus-store";
import type { TarsActionReceipt, TarsActionRecord } from "./conversation";
import type { TarsActivity, TarsResponsibility, TarsState } from "./types";

/** One workflow stage of a responsibility's run, as its latest attempt stands. */
export interface TarsFlowStage {
  id: string;
  title: string;
  /** `pending` when the stage has no attempt yet. */
  status: StageStatus;
  /** 0 before the first attempt starts. */
  attempt: number;
  current: boolean;
  /** The workflow's independent review (the reviewer agent's stage); its node opens the review. */
  review: boolean;
  /** Why a blocked or stuck stage stopped, as the run recorded it; null otherwise. */
  reason: string | null;
  /** When the latest attempt started, as the run recorded it; null before it started (never guessed). */
  startedAt: string | null;
}

/** Where a run stands across its workflow stages. */
export interface TarsRunProgress {
  stages: TarsFlowStage[];
  /** Stages whose latest attempt completed or was skipped. */
  finished: number;
  total: number;
  /** The stage the run is on while it is active; null once it ended. */
  current: TarsFlowStage | null;
}

const FINISHED: ReadonlySet<StageStatus> = new Set(["completed", "skipped"]);

/** Reads stage progress from the run itself; never inferred from the responsibility's state. */
export function projectTarsRunProgress(detail: AgentRunDetail): TarsRunProgress {
  const { agentRun } = detail;
  const active = isActiveAgentRunState(agentRun.state);
  const stages = agentRun.workflow.stages.map((stage, index): TarsFlowStage => {
    const record = latestStageRecord(detail.stages, stage.id);
    const status = record?.status ?? "pending";
    const blockedReport = record?.report?.outcome === "blocked" ? record.report.missing : null;
    return { id: stage.id, title: getStageDisplayTitle(stage), status, attempt: record?.attempt ?? 0,
      current: active && index === agentRun.currentStageIndex,
      review: stage.kind === "ai" && stage.agentConfigId === "reviewer",
      reason: status === "blocked" || status === "stuck" ? record?.detail ?? blockedReport ?? null : null,
      startedAt: record?.startedAt ?? null };
  });
  return { stages, finished: stages.filter((stage) => FINISHED.has(stage.status)).length, total: stages.length,
    current: stages.find((stage) => stage.current) ?? null };
}

/** The run a responsibility points at, when this window has read it. */
export function tarsRunOf(row: Pick<TarsResponsibility, "agentRunId"> | undefined, runs: Readonly<Record<string, AgentRunDetail>>) {
  return row?.agentRunId ? runs[row.agentRunId] : undefined;
}

/** Fleet's row for a responsibility's task; null before the task exists. */
export function tarsFleetTarget(row: Pick<TarsResponsibility, "taskId" | "workspaceId" | "executionWorkspaceId">): FleetFocusTarget | null {
  return row.taskId ? { workspaceId: row.executionWorkspaceId ?? row.workspaceId, taskId: row.taskId } : null;
}

type DelegateReceipt = TarsActionReceipt & { action: Extract<TarsActionReceipt["action"], { kind: "delegate" }>; responsibilityId: string };

/** A delegate action the host applied: the conversation shows its flow in place of the receipt line. */
export function isAppliedDelegateReceipt(receipt: TarsActionReceipt): receipt is DelegateReceipt {
  return receipt.status === "applied" && receipt.action.kind === "delegate" && receipt.responsibilityId !== null;
}

/**
 * The flow of one delegated responsibility: request → Tars's decision → the
 * run's stages → completion. Unknown values stay null (no run read yet means
 * no stages and no criteria count), never zero.
 */
export interface TarsFlow {
  responsibilityId: string;
  title: string;
  criteriaCount: number;
  /** The agent the host admitted; null lets the execution lead choose. */
  agentId: string | null;
  /** Tars's stated reason for this delegation, when the decision carries one. */
  reason: string | null;
  /** Null while the responsibility is not in the last snapshot. */
  state: TarsState | null;
  /** Null until this window has read the responsibility's run. */
  progress: TarsRunProgress | null;
  /** Criteria the run's final report marks met; null until there is a report. */
  criteriaMet: number | null;
  fleetTarget: FleetFocusTarget | null;
}


export function buildTarsFlow(args: {
  receipt: TarsActionReceipt;
  row: TarsResponsibility | undefined;
  run: AgentRunDetail | undefined;
}): TarsFlow | null {
  const { receipt, row, run } = args;
  if (!isAppliedDelegateReceipt(receipt)) return null;
  const criteria = row?.acceptanceCriteria ?? receipt.action.acceptanceCriteria;
  const report = run?.report ?? null;
  const met = report ? criteria.filter((text) => report.acceptanceCriteria.some((item) => item.text === text && item.status === "met")).length : null;
  return {
    responsibilityId: receipt.responsibilityId,
    title: row?.title ?? receipt.action.title,
    criteriaCount: criteria.length,
    agentId: row?.agentId ?? receipt.action.agentId ?? null,
    reason: receipt.action.reason ?? null,
    state: row?.state ?? null,
    progress: run ? projectTarsRunProgress(run) : null,
    criteriaMet: met,
    fleetTarget: row ? tarsFleetTarget(row) : null,
  };
}

/**
 * The work events the conversation keeps: completion, a block that needs the
 * user, and an end the user did not ask for. Live progress (queued, running,
 * waiting, paused) belongs to the tray and the flow block.
 */
export type TarsActivityNoticeKind = "completed" | "blocked" | "cancelled";

export interface TarsActivityNotice {
  activity: TarsActivity;
  kind: TarsActivityNoticeKind;
}

const NOTICE_OF: Partial<Record<TarsState, TarsActivityNoticeKind>> = { completed: "completed", blocked: "blocked", cancelled: "cancelled" };

export function selectTarsActivityNotices(activity: readonly TarsActivity[], records: readonly TarsActionRecord[] = []): TarsActivityNotice[] {
  // A cancel the user applied already has its own action record line.
  const cancelledByYou = new Set(records.filter((record) => record.status === "applied" && record.action.kind === "control" && record.action.operation === "cancel")
    .flatMap((record) => "responsibilityId" in record.action ? [record.action.responsibilityId] : []));
  const lastState = new Map<string, TarsState>();
  const notices: TarsActivityNotice[] = [];
  for (const event of [...activity].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.revision - b.revision)) {
    const previous = lastState.get(event.responsibilityId);
    lastState.set(event.responsibilityId, event.state);
    // A detail edit on the same state is not a new event.
    if (previous === event.state) continue;
    const kind = NOTICE_OF[event.state];
    if (!kind || (kind === "cancelled" && cancelledByYou.has(event.responsibilityId))) continue;
    notices.push({ activity: event, kind });
  }
  return notices;
}
