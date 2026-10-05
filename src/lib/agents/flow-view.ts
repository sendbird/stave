import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n } from "@/i18n/runtime";
import { classifyStageEvidence, isVerifiedEvidence } from "@/lib/agent-runs/evidence";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { AgentRunStageRecord, StageStatus } from "@/lib/agent-runs/domain";
import type { DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import type { RunStatus } from "@/lib/runs/run-domain";
import type { WorkspacePrInfo, WorkspacePrStatus } from "@/lib/pr-status";
import type { TurnVerificationResult } from "@/lib/workspace-scripts";
import type { TaskExecutionSummary } from "@/lib/fleet/task-execution-summary";
import { getTodoProgress } from "@/components/ai-elements/todo";
import { findLatestTodoPart } from "@/components/session/turn-todo.utils";
import { findLatestPendingToolInteraction } from "@/store/provider-message.utils";
import type { ChatMessage } from "@/types/chat";

/**
 * The Flow of one task: what was assigned, the stages it went through, and
 * the delegated tasks that branched off. A pure projection of records that
 * already exist (the assignment, the agent run, the run ledger). It owns no
 * state and decides nothing; each owner keeps deciding its own status.
 *
 * Distinct from the Work graph, which shows one turn's live fan-out.
 */

/** Same words as Fleet: "Action required" is anything waiting on the user. */
export const FLOW_STATES = ["waiting", "running", "action-required", "done", "failed", "skipped", "cancelled"] as const;
export type FlowState = (typeof FLOW_STATES)[number];

export const FLOW_STATE_LABELS: Readonly<Record<FlowState, string>> = {
  get waiting() { return i18n.t("agents:flowView.waiting"); },
  get running() { return i18n.t("agents:flowView.running"); },
  get "action-required"() { return i18n.t("agents:flowView.actionRequired"); },
  get done() { return i18n.t("agents:flowView.done"); },
  get failed() { return i18n.t("agents:flowView.failed"); },
  get skipped() { return i18n.t("agents:flowView.skipped"); },
  get cancelled() { return i18n.t("agents:flowView.cancelled"); },
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
  /** Stage evidence split the way the agent run shows it. */
  evidence: { verified: number; reported: number } | null;
  /** For delegated tasks: where to open them. */
  target: { workspaceId: string; taskId: string } | null;
  /** The node's Timeline, oldest first. */
  events: FlowEvent[];
  /** Agent identity for an avatar on assignment nodes, when known. */
  agent?: { id: string; name: string };
  children: FlowNode[];
}

export interface FlowAssignmentInput {
  id: string;
  agentName: string;
  /** The saved agent's id, for a stable avatar colour when known. */
  agentConfigId?: string;
  providerId: string;
  model: string | null;
  workspaceMode: "new-worktree" | "same-workspace";
  branch: string | null;
  state: "preparing" | "started" | "failed" | "interrupted";
  detail: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The first user message that opened the task. */
export interface FlowRequestInput {
  at: string;
  text: string;
}

/** The latest plan/todo list the provider reported for the task. */
export interface FlowPlanInput {
  total: number;
  done: number;
  /** Each todo, in the order the provider reported it. */
  items: Array<{ text: string; done: boolean }>;
}

/** Changed files with line totals, as derived by the task execution summary. */
export interface FlowChangesInput {
  fileCount: number;
  additions: number | null;
  deletions: number | null;
  /** Line totals were unavailable for an oversized diff. */
  partial: boolean;
}

/**
 * The structured verification result only. Callers pass this from the task
 * execution summary; the flow never parses tool stdout to guess a pass/fail.
 */
export interface FlowVerificationInput {
  status: TurnVerificationResult["status"];
  totalEntries: number;
  executedEntries: number;
  completedAt: number;
}

/** The workspace pull request and its derived status. */
export interface FlowPullRequestInput {
  number: number;
  title: string;
  url: string;
  status: WorkspacePrStatus;
  /** Rollup of the PR's checks, when GitHub has reported one. */
  checks: "success" | "failure" | "pending" | null;
  createdAt: string | null;
}

/** The task is waiting on the user for an approval or a question. */
export interface FlowNeedsYouInput {
  kind: "approval" | "question";
  /** The tool or question the user has to answer. */
  label: string;
  at: string | null;
}

/**
 * The base flow of any task, derived from records that already exist. Every
 * field is optional: a step is only drawn once its source has something to
 * say, so a fresh task shows Request alone and fills in as work lands.
 */
export interface FlowBaseInput {
  request: FlowRequestInput | null;
  plan: FlowPlanInput | null;
  changes: FlowChangesInput | null;
  verification: FlowVerificationInput | null;
  pullRequest: FlowPullRequestInput | null;
  needsYou: FlowNeedsYouInput | null;
  /** Whether the task has a turn running now. */
  taskRunning: boolean;
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
  waiting: "waiting",
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

const VERIFICATION_STATE: Readonly<Record<FlowVerificationInput["status"], FlowState>> = {
  pass: "done",
  warn: "action-required",
  fail: "failed",
};

/** GitHub's own merge gate, mapped to Fleet words. */
const PR_STATE: Readonly<Record<WorkspacePrStatus, FlowState>> = {
  no_pr: "waiting",
  draft: "running",
  review_required: "action-required",
  changes_requested: "action-required",
  checks_pending: "running",
  checks_failed: "failed",
  merge_conflict: "action-required",
  behind_base: "action-required",
  blocked: "action-required",
  ready_to_merge: "action-required",
  merged: "done",
  closed_unmerged: "cancelled",
};

const PR_STATUS_LABELS: Readonly<Record<WorkspacePrStatus, string>> = {
  get no_pr() { return i18n.t("agents:flowView.noPr"); },
  get draft() { return i18n.t("agents:flowView.draft"); },
  get review_required() { return i18n.t("agents:flowView.reviewRequired"); },
  get changes_requested() { return i18n.t("agents:flowView.changesRequested"); },
  get checks_pending() { return i18n.t("agents:flowView.checksPending"); },
  get checks_failed() { return i18n.t("agents:flowView.checksFailed"); },
  get merge_conflict() { return i18n.t("agents:flowView.mergeConflict"); },
  get behind_base() { return i18n.t("agents:flowView.behindBase"); },
  get blocked() { return i18n.t("agents:flowView.blocked"); },
  get ready_to_merge() { return i18n.t("agents:flowView.readyToMerge"); },
  get merged() { return i18n.t("agents:flowView.merged"); },
  get closed_unmerged() { return i18n.t("agents:flowView.closedUnmerged"); },
};

const CHECKS_LABELS: Readonly<Record<NonNullable<FlowPullRequestInput["checks"]>, string>> = {
  get success() { return i18n.t("agents:flowView.success"); },
  get failure() { return i18n.t("agents:flowView.failure"); },
  get pending() { return i18n.t("agents:flowView.pending"); },
};

const FLOW_REQUEST_MAX_CHARS = 140;

function boundRequestText(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= FLOW_REQUEST_MAX_CHARS
    ? normalized
    : `${normalized.slice(0, FLOW_REQUEST_MAX_CHARS - 1).trimEnd()}…`;
}

/**
 * The base flow every task has, drawn from data that already exists: the first
 * message, the reported plan, the changed files, the structured verification,
 * and the pull request. A "Needs you" step is appended whenever the task waits
 * on the user. Each step is only added once its source has something to say.
 */
export function buildBaseSteps(base: FlowBaseInput): FlowNode[] {
  const steps: FlowNode[] = [];

  if (base.request) {
    steps.push({
      id: "base:request",
      kind: "task",
      title: i18n.t("agents:flowView.title"),
      detail: boundRequestText(base.request.text) || null,
      state: "done",
      evidence: null,
      target: null,
      events: [{ at: base.request.at, label: i18n.t("agents:flowView.label") }],
      children: [],
    });
  }

  if (base.plan && base.plan.total > 0) {
    const allDone = base.plan.done >= base.plan.total;
    steps.push({
      id: "base:plan",
      kind: "task",
      title: i18n.t("agents:flowView.title2"),
      detail: i18n.t("agents:remaining.presentationCopy486", { v1: base.plan.done, v2: base.plan.total }),
      state: allDone ? "done" : base.taskRunning ? "running" : "waiting",
      evidence: null,
      target: null,
      // The plan list itself is the timeline: each todo as a line, done first.
      events: base.plan.items.map((item) => ({
        at: "",
        label: `${item.done ? "✓" : "○"} ${item.text}`,
      })),
      children: [],
    });
  }

  if (base.changes) {
    const lines =
      base.changes.additions == null || base.changes.deletions == null
        ? base.changes.partial
          ? i18n.t("agents:flowView.extraCopy362")
          : ""
        : ` · +${base.changes.additions}/−${base.changes.deletions}`;
    steps.push({
      id: "base:changes",
      kind: "task",
      title: i18n.t("agents:flowView.title3"),
      detail: i18n.t("agents:flowView.files", { count: base.changes.fileCount, changes: lines }),
      state: base.taskRunning ? "running" : "done",
      evidence: null,
      target: null,
      events: [],
      children: [],
    });
  }

  if (base.verification) {
    steps.push({
      id: "base:verification",
      kind: "task",
      title: i18n.t("agents:flowView.title4"),
      detail: i18n.t("agents:remaining.presentationCopy488", { v1: base.verification.executedEntries, v2: base.verification.totalEntries }),
      state: VERIFICATION_STATE[base.verification.status],
      evidence: null,
      target: null,
      events: [{ at: new Date(base.verification.completedAt).toISOString(), label: i18n.t("agents:flowView.label2") }],
      children: [],
    });
  }

  if (base.pullRequest) {
    const pr = base.pullRequest;
    const events: FlowEvent[] = pr.createdAt ? [{ at: pr.createdAt, label: i18n.t("agents:flowView.label3") }] : [];
    steps.push({
      id: "base:pull-request",
      kind: "task",
      title: i18n.t("agents:flowView.title5"),
      detail: [`#${pr.number} ${pr.title}`, PR_STATUS_LABELS[pr.status], pr.checks ? CHECKS_LABELS[pr.checks] : null]
        .filter(Boolean)
        .join(" · "),
      state: PR_STATE[pr.status],
      evidence: null,
      target: null,
      events,
      children: [],
    });
  }

  if (base.needsYou) {
    steps.push({
      id: "base:needs-you",
      kind: "task",
      title: base.needsYou.kind === "approval" ? i18n.t("agents:flowView.title6") : i18n.t("agents:flowView.title7"),
      detail: base.needsYou.label || null,
      state: "action-required",
      evidence: null,
      target: null,
      events: base.needsYou.at ? [{ at: base.needsYou.at, label: i18n.t("agents:flowView.label4") }] : [],
      children: [],
    });
  }

  return steps;
}

function firstUserMessageRequest(messages: readonly ChatMessage[]): FlowRequestInput | null {
  for (const message of messages) {
    if (message.role !== "user") continue;
    const text = (message.displayContent ?? message.content ?? "").trim();
    if (!text) continue;
    return { at: message.startedAt ?? message.completedAt ?? "", text };
  }
  return null;
}

function derivePlan(messages: readonly ChatMessage[]): FlowPlanInput | null {
  const part = findLatestTodoPart(messages as ChatMessage[]);
  if (!part) return null;
  const progress = getTodoProgress({ input: part.input });
  if (progress.totalCount === 0) return null;
  return {
    total: progress.totalCount,
    done: progress.completedCount,
    items: progress.todos.map((todo) => ({ text: todo.content, done: todo.status === "completed" })),
  };
}

function derivePullRequest(prInfo: WorkspacePrInfo | null | undefined): FlowPullRequestInput | null {
  const pr = prInfo?.pr;
  if (!pr) return null;
  const checks =
    pr.checksRollup === "SUCCESS"
      ? "success"
      : pr.checksRollup === "FAILURE"
        ? "failure"
        : pr.checksRollup === "PENDING"
          ? "pending"
          : null;
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    status: prInfo!.derived,
    checks,
    createdAt: null,
  };
}

function deriveNeedsYou(messages: readonly ChatMessage[]): FlowNeedsYouInput | null {
  const pending = findLatestPendingToolInteraction({ messages: messages as ChatMessage[] });
  if (!pending) return null;
  if (pending.part.type === "approval") {
    return {
      kind: "approval",
      label: [pending.part.toolName, pending.part.description].filter(Boolean).join(": "),
      at: null,
    };
  }
  return {
    kind: "question",
    label: pending.part.questions[0]?.question.trim() || pending.part.toolName,
    at: null,
  };
}

/**
 * Turns the records the panel already reads into the base flow input. Pure and
 * synchronous: the panel calls it inside a `useMemo` so no fresh object leaves
 * a Zustand selector. Changes and verification come straight from the shared
 * task execution summary — verification is the structured result only, never a
 * guess parsed from tool stdout.
 */
export function deriveFlowBase(args: {
  messages: readonly ChatMessage[];
  summary: TaskExecutionSummary;
  prInfo: WorkspacePrInfo | null | undefined;
  taskRunning: boolean;
}): FlowBaseInput {
  const changes = args.summary.changes.value;
  const verification = args.summary.verification.value;
  return {
    request: firstUserMessageRequest(args.messages),
    plan: derivePlan(args.messages),
    changes: changes
      ? {
          fileCount: changes.files.length,
          additions: changes.additions,
          deletions: changes.deletions,
          partial: changes.partial,
        }
      : null,
    verification: verification
      ? {
          status: verification.status,
          totalEntries: verification.totalEntries,
          executedEntries: verification.executedEntries,
          completedAt: verification.completedAt,
        }
      : null,
    pullRequest: derivePullRequest(args.prInfo),
    needsYou: deriveNeedsYou(args.messages),
    taskRunning: args.taskRunning,
  };
}

function stageEvents(records: readonly AgentRunStageRecord[]): FlowEvent[] {
  const events: FlowEvent[] = [];
  for (const record of records) {
    const attempt = record.attempt > 1 ? i18n.t("agents:remaining.presentationCopy489", { v1: record.attempt }) : "";
    if (record.startedAt) events.push({ at: record.startedAt, label: i18n.t("agents:flowView.label5", { value1: attempt }) });
    if (record.feedback && record.startedAt) events.push({ at: record.startedAt, label: i18n.t("agents:flowView.label6") });
    if (record.endedAt) events.push({ at: record.endedAt, label: `${FLOW_STATE_LABELS[STAGE_STATE[record.status]]}${attempt}` });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}

function delegateNode(child: DelegatedTaskSummary, turnRunning = false): FlowNode {
  const events: FlowEvent[] = [{ at: child.createdAt, label: child.attempt > 0 ? i18n.t("agents:flowView.label7", { value1: child.attempt + 1 }) : i18n.t("agents:flowView.label8") }];
  if (child.completedAt) events.push({ at: child.completedAt, label: FLOW_STATE_LABELS[DELEGATE_STATE[child.phase]] });
  return {
    id: `delegate:${child.runId}`,
    kind: "delegate",
    title: child.delegationKey,
    detail: [child.providerId === "codex" ? "Codex" : "Claude", child.requestedModel,
      child.phase === "waiting" ? (turnRunning ? i18n.t("agents:flowView.extraCopy363") : i18n.t("agents:flowView.extraCopy364")) : null,
      child.reason].filter(Boolean).join(" · "),
    state: child.phase === "waiting" && turnRunning ? "running" : DELEGATE_STATE[child.phase],
    evidence: null,
    target: { workspaceId: child.delegatedWorkspaceId, taskId: child.delegatedTaskId },
    events,
    children: [],
  };
}

/** Hangs each delegated task off the stage that was running when it was delegated. */
function attachDelegates(stages: FlowNode[], windows: Array<{ start: string | null; end: string | null }>, children: readonly DelegatedTaskSummary[], runningTaskIds?: ReadonlySet<string>) {
  const loose: FlowNode[] = [];
  for (const child of children) {
    const index = windows.findIndex(
      (window) => window.start !== null && window.start <= child.createdAt && (window.end === null || child.createdAt <= window.end),
    );
    (index >= 0 ? stages[index]!.children : loose).push(delegateNode(child, runningTaskIds?.has(child.delegatedTaskId)));
  }
  return loose;
}

export function buildFlow(args: {
  taskTitle: string;
  assignment: FlowAssignmentInput | null;
  agentRun: AgentRunDetail | null;
  delegates: readonly DelegatedTaskSummary[];
  runningDelegateTaskIds?: ReadonlySet<string>;
  /** The base flow every task has, derived from records that already exist. */
  base: FlowBaseInput;
}): FlowNode[] {
  const nodes: FlowNode[] = [];
  const { assignment, agentRun, base } = args;
  const baseSteps = buildBaseSteps(base);

  if (assignment) {
    const where = assignment.workspaceMode === "new-worktree" ? i18n.t("agents:flowView.extraCopy365", { value1: assignment.branch ?? "" }).trim() : i18n.t("agents:flowView.extraCopy366");
    nodes.push({
      id: `assignment:${assignment.id}`,
      kind: "assignment",
      title: i18n.t("agents:flowView.title8", { value1: assignment.agentName }),
      detail: assignment.detail ?? [assignment.providerId, assignment.model, where].filter(Boolean).join(" · "),
      state: ASSIGNMENT_STATE[assignment.state],
      evidence: null,
      target: null,
      agent: { id: assignment.agentConfigId ?? assignment.id, name: assignment.agentName },
      events: [
        { at: assignment.createdAt, label: i18n.t("agents:flowView.label9") },
        ...(assignment.updatedAt !== assignment.createdAt
          ? [{ at: assignment.updatedAt, label: assignment.state === "started" ? i18n.t("agents:flowView.label10") : FLOW_STATE_LABELS[ASSIGNMENT_STATE[assignment.state]] }]
          : []),
      ],
      children: [],
    });
  }

  if (agentRun) {
    const windows: Array<{ start: string | null; end: string | null }> = [];
    let runningIndex = -1;
    const stageNodes = agentRun.agentRun.workflow.stages.map((stage, index) => {
      const records = agentRun.stages.filter((record) => record.stageId === stage.id);
      const latest = records.reduce<AgentRunStageRecord | undefined>(
        (best, record) => (!best || record.attempt > best.attempt ? record : best),
        undefined,
      );
      const first = records.reduce<string | null>(
        (earliest, record) => (record.startedAt && (!earliest || record.startedAt < earliest) ? record.startedAt : earliest),
        null,
      );
      windows.push({ start: first, end: latest?.status === "running" ? null : (latest?.endedAt ?? null) });
      if (latest?.status === "running") runningIndex = index;
      const complete = latest?.report?.outcome === "complete" ? latest.report : null;
      const classified = complete ? classifyStageEvidence(complete, latest?.facts ?? null) : [];
      return {
        id: `stage:${stage.id}`,
        kind: "stage" as const,
        title: `${index + 1}. ${getStageDisplayTitle(stage)}`,
        detail: latest?.detail ?? (complete ? complete.summary.split("\n")[0]! : null),
        state: latest ? STAGE_STATE[latest.status] : "waiting",
        evidence: complete
          ? {
              verified: classified.filter(isVerifiedEvidence).length,
              reported: classified.filter((item) => item.source === "agent").length,
            }
          : null,
        target: null,
        events: stageEvents(records),
        children: [] as FlowNode[],
      } satisfies FlowNode;
    });
    // Workspace PR context belongs to the workspace, never to an agent run stage.
    const taskSteps = baseSteps.filter((step) => step.id === "base:pull-request" || runningIndex < 0);
    const stageSteps = baseSteps.filter((step) => step.id !== "base:pull-request");
    // The base steps belong to whichever stage is running now, nested under it
    // so the agent run's shape stays intact while the current stage shows what
    // the task is actually doing.
    if (runningIndex >= 0 && baseSteps.length) {
      stageNodes[runningIndex]!.children.push(...stageSteps);
    }
    const loose = attachDelegates(stageNodes, windows, args.delegates, args.runningDelegateTaskIds);
    // Current task activity remains visible before historical stages after an agent run ends.
    if (runningIndex < 0) nodes.push(...taskSteps, ...stageNodes);
    else nodes.push(...stageNodes, ...taskSteps);
    if (loose.length) nodes.push(taskNode(args.taskTitle, loose, base.taskRunning));
    return nodes;
  }

  const delegateNodes = args.delegates.map((child) => delegateNode(child, args.runningDelegateTaskIds?.has(child.delegatedTaskId)));
  if (baseSteps.length === 0 && delegateNodes.length === 0) {
    // A task with no messages yet: name the wait rather than the old hint.
    nodes.push({
      id: "task",
      kind: "task",
      title: args.taskTitle,
      detail: i18n.t("agents:flowView.detail"),
      state: "waiting",
      evidence: null,
      target: null,
      events: [],
      children: [],
    });
    return nodes;
  }
  nodes.push(...baseSteps, ...delegateNodes);
  return nodes;
}

function taskNode(title: string, children: FlowNode[], running: boolean): FlowNode {
  return {
    id: "task",
    kind: "task",
    title,
    detail: children.length ? i18n.t("agents:flowView.detail2", { value1: children.length, count: children.length }) : null,
    // The conversation itself has no end state; it is running or open.
    state: running || children.some((child) => child.state === "running") ? "running" : "waiting",
    evidence: null,
    target: null,
    events: [],
    children,
  };
}
