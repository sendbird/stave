import { classifyStageEvidence } from "@/lib/missions/evidence";
import type { MissionDetail } from "@/lib/missions/api";
import type { MissionStageRecord, StageStatus } from "@/lib/missions/domain";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { RunStatus } from "@/lib/runs/run-domain";

/**
 * The Flow of one task: what was assigned, the stages it went through, and
 * the delegated tasks that branched off. A pure projection of records that
 * already exist (the assignment, the mission, the run ledger). It owns no
 * state and decides nothing; each owner keeps deciding its own status.
 *
 * Distinct from the Work graph, which shows one turn's live fan-out.
 */

/** Same words as Fleet: "Action required" is anything waiting on the user. */
export const FLOW_STATES = ["waiting", "running", "action-required", "done", "failed", "skipped", "cancelled"] as const;
export type FlowState = (typeof FLOW_STATES)[number];

export const FLOW_STATE_LABELS: Readonly<Record<FlowState, string>> = {
  waiting: "Waiting",
  running: "Running",
  "action-required": "Action required",
  done: "Done",
  failed: "Failed",
  skipped: "Skipped",
  cancelled: "Cancelled",
};

export interface FlowEvent {
  at: string;
  label: string;
}

export interface FlowNode {
  id: string;
  kind: "assignment" | "task" | "stage" | "delegate";
  title: string;
  /** One short line: agent and provider, or the stage's reason. */
  detail: string | null;
  state: FlowState;
  /** Stage evidence split the way the mission shows it. */
  evidence: { verified: number; reported: number } | null;
  /** For delegated tasks: where to open them. */
  target: { workspaceId: string; taskId: string } | null;
  /** The node's Timeline, oldest first. */
  events: FlowEvent[];
  children: FlowNode[];
}

export interface FlowAssignmentInput {
  id: string;
  agentName: string;
  providerId: string;
  model: string | null;
  workspaceMode: "new-worktree" | "same-workspace";
  branch: string | null;
  state: "preparing" | "started" | "failed" | "interrupted";
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

const STAGE_STATE: Readonly<Record<StageStatus, FlowState>> = {
  pending: "waiting",
  "awaiting-sign-off": "action-required",
  running: "running",
  blocked: "action-required",
  stuck: "action-required",
  completed: "done",
  skipped: "skipped",
  cancelled: "cancelled",
};

const DELEGATE_STATE: Readonly<Record<RunStatus, FlowState>> = {
  pending: "waiting",
  running: "running",
  // A detached delegation parks here between follow-ups.
  waiting: "done",
  completed: "done",
  failed: "failed",
  cancelled: "cancelled",
  interrupted: "failed",
};

const ASSIGNMENT_STATE: Readonly<Record<FlowAssignmentInput["state"], FlowState>> = {
  preparing: "running",
  started: "done",
  failed: "failed",
  interrupted: "action-required",
};

function stageEvents(records: readonly MissionStageRecord[]): FlowEvent[] {
  const events: FlowEvent[] = [];
  for (const record of records) {
    const attempt = record.attempt > 1 ? ` (attempt ${record.attempt})` : "";
    if (record.startedAt) events.push({ at: record.startedAt, label: `Started${attempt}` });
    if (record.feedback && record.startedAt) events.push({ at: record.startedAt, label: "Changes requested" });
    if (record.endedAt) events.push({ at: record.endedAt, label: `${FLOW_STATE_LABELS[STAGE_STATE[record.status]]}${attempt}` });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function delegateNode(child: DelegatedTaskSummary): FlowNode {
  const events: FlowEvent[] = [{ at: child.createdAt, label: child.attempt > 0 ? `Retried (attempt ${child.attempt + 1})` : "Delegated" }];
  if (child.completedAt) events.push({ at: child.completedAt, label: FLOW_STATE_LABELS[DELEGATE_STATE[child.phase]] });
  return {
    id: `delegate:${child.runId}`,
    kind: "delegate",
    title: child.delegationKey,
    detail: [child.providerId === "codex" ? "Codex" : "Claude", child.requestedModel, child.reason].filter(Boolean).join(" · "),
    state: DELEGATE_STATE[child.phase],
    evidence: null,
    target: { workspaceId: child.delegatedWorkspaceId, taskId: child.delegatedTaskId },
    events,
    children: [],
  };
}

/** Hangs each delegated task off the stage that was running when it was delegated. */
function attachDelegates(stages: FlowNode[], windows: Array<{ start: string | null; end: string | null }>, children: readonly DelegatedTaskSummary[]) {
  const loose: FlowNode[] = [];
  for (const child of children) {
    const index = windows.findIndex(
      (window) => window.start !== null && window.start <= child.createdAt && (window.end === null || child.createdAt <= window.end),
    );
    (index >= 0 ? stages[index]!.children : loose).push(delegateNode(child));
  }
  return loose;
}

export function buildFlow(args: {
  taskTitle: string;
  assignment: FlowAssignmentInput | null;
  mission: MissionDetail | null;
  delegates: readonly DelegatedTaskSummary[];
  /** Whether the task has a turn running now. */
  taskRunning: boolean;
}): FlowNode[] {
  const nodes: FlowNode[] = [];
  const { assignment, mission } = args;

  if (assignment) {
    const where = assignment.workspaceMode === "new-worktree" ? `New worktree ${assignment.branch ?? ""}`.trim() : "Current workspace";
    nodes.push({
      id: `assignment:${assignment.id}`,
      kind: "assignment",
      title: `Assigned to ${assignment.agentName}`,
      detail: assignment.detail ?? [assignment.providerId, assignment.model, where].filter(Boolean).join(" · "),
      state: ASSIGNMENT_STATE[assignment.state],
      evidence: null,
      target: null,
      events: [
        { at: assignment.createdAt, label: "Assigned" },
        ...(assignment.updatedAt !== assignment.createdAt
          ? [{ at: assignment.updatedAt, label: assignment.state === "started" ? "First turn started" : FLOW_STATE_LABELS[ASSIGNMENT_STATE[assignment.state]] }]
          : []),
      ],
      children: [],
    });
  }

  if (mission) {
    const windows: Array<{ start: string | null; end: string | null }> = [];
    const stageNodes = mission.mission.playbook.stages.map((stage, index) => {
      const records = mission.stages.filter((record) => record.stageId === stage.id);
      const latest = records.reduce<MissionStageRecord | undefined>(
        (best, record) => (!best || record.attempt > best.attempt ? record : best),
        undefined,
      );
      const first = records.reduce<string | null>(
        (earliest, record) => (record.startedAt && (!earliest || record.startedAt < earliest) ? record.startedAt : earliest),
        null,
      );
      windows.push({ start: first, end: latest?.status === "running" ? null : (latest?.endedAt ?? null) });
      const complete = latest?.report?.outcome === "complete" ? latest.report : null;
      const classified = complete ? classifyStageEvidence(complete, latest?.facts ?? null) : [];
      return {
        id: `stage:${stage.id}`,
        kind: "stage" as const,
        title: `${index + 1}. ${stage.title}`,
        detail: latest?.detail ?? (complete ? complete.summary.split("\n")[0]! : null),
        state: latest ? STAGE_STATE[latest.status] : "waiting",
        evidence: complete
          ? {
              verified: classified.filter((item) => item.source === "stave").length,
              reported: classified.filter((item) => item.source === "agent").length,
            }
          : null,
        target: null,
        events: stageEvents(records),
        children: [],
      } satisfies FlowNode;
    });
    const loose = attachDelegates(stageNodes, windows, args.delegates);
    nodes.push(...stageNodes);
    if (loose.length) nodes.push(taskNode(args.taskTitle, loose, args.taskRunning));
    return nodes;
  }

  nodes.push(taskNode(args.taskTitle, args.delegates.map(delegateNode), args.taskRunning));
  return nodes;
}

function taskNode(title: string, children: FlowNode[], running: boolean): FlowNode {
  return {
    id: "task",
    kind: "task",
    title,
    detail: children.length ? `${children.length} delegated task${children.length === 1 ? "" : "s"}` : null,
    // The conversation itself has no end state; it is running or open.
    state: running || children.some((child) => child.state === "running") ? "running" : "waiting",
    evidence: null,
    target: null,
    events: [],
    children,
  };
}
