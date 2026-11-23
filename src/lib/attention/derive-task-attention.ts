import type { FleetAttentionKind } from "@/lib/fleet/attention-projection";

const STATE_PRIORITY = {
  "needs-you": 0,
  problem: 1,
  working: 2,
  "done-unseen": 3,
  idle: 4,
} as const;

export type TaskAttentionState = keyof typeof STATE_PRIORITY;

// PR status is a separate facet and does not enter task attention facts.
const FLEET_KIND_STATE = {
  "user-input": "needs-you",
  approval: "needs-you",
  "agent-run-sign-off": "needs-you",
  "agent-run-blocked": "needs-you",
  "tars-decision": "needs-you",
  "tars-blocked": "needs-you",
  "agent-run-stuck": "problem",
  "run-failed": "problem",
  "turn-stalled": "problem",
  "result-ready": "done-unseen",
  "pr-changes-requested": null,
  "pr-checks-failed": null,
  "pr-merge-conflict": null,
  "pr-behind-base": null,
  "pr-ready-to-merge": null,
} as const satisfies Record<FleetAttentionKind, TaskAttentionState | null>;

type FleetKindWithState<State extends TaskAttentionState> = {
  [Kind in FleetAttentionKind]: (typeof FLEET_KIND_STATE)[Kind] extends State
    ? Kind
    : never;
}[FleetAttentionKind];

type FleetAttentionMapping = {
  [State in TaskAttentionState]: { state: State; reason: FleetKindWithState<State> }
}[TaskAttentionState];

export function mapFleetAttentionKind(kind: FleetAttentionKind): FleetAttentionMapping | null {
  const state = FLEET_KIND_STATE[kind];
  return state === null ? null : { state, reason: kind } as FleetAttentionMapping;
}

/** Each owner identifies a current response route verified by the caller. */
export type TaskAttentionRequestOwner =
  | { kind: "live-turn"; turnId: string }
  | { kind: "host-managed" }
  | { kind: "async" }
  | { kind: "agent-run-persistent" }
  | { kind: "delegated-child"; parentTaskId: string };

export interface TaskAttentionRequest {
  /** Stable across observations and unique within the task, including routed requests. */
  id: string;
  kind: FleetKindWithState<"needs-you">;
  /** Null for a pending record whose response route is missing or expired. */
  owner: TaskAttentionRequestOwner | null;
  since: string | null;
}

interface TurnAttentionFact {
  turnId: string;
  since: string;
}

interface AttentionEpisode {
  id: string;
  since: string;
  seen?: boolean;
}

export interface TaskAttentionFacts {
  activeTurnId?: string | null;
  activeTurnStartedAt?: string | null;
  waitingForChild?: { since: string | null } | null;
  pendingRequests?: readonly TaskAttentionRequest[];
  /** The latest relevant failure for this task, after controller-owned outcomes are excluded. */
  turnFailure?: TurnAttentionFact | null;
  turnStall?: TurnAttentionFact | null;
  agentRunBlock?: (AttentionEpisode & { recoveryAvailable: boolean }) | null;
  tarsResult?: (AttentionEpisode & { canAcceptCompletion: boolean }) | null;
  /** The current Agent Run's stuck episode, while it still holds. */
  agentRunStuckAt?: string | null;
  /** The latest successful result eligible for this task's attention. */
  lastResultAt?: string | null;
  lastSeenAt?: string | null;
}

type AnswerableRequest = TaskAttentionRequest & { owner: TaskAttentionRequestOwner };

export interface TaskAttention {
  state: TaskAttentionState;
  reason: FleetKindWithState<TaskAttentionState> | "active-turn" | "waiting-for-child" | null;
  requests: readonly AnswerableRequest[];
  /** When the selected reason began, if recorded. */
  since: string | null;
}

function canAnswer(
  request: TaskAttentionRequest,
  activeTurnId: TaskAttentionFacts["activeTurnId"],
): request is AnswerableRequest {
  const { owner } = request;
  if (owner === null) return false;
  if (owner.kind === "live-turn") return owner.turnId === activeTurnId;
  if (owner.kind === "delegated-child") return Boolean(owner.parentTaskId);
  return true;
}

function timestamp(value: string | null | undefined, fallback: number): number {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? time : fallback;
}

function compareSince(left: string | null, right: string | null): number {
  // Unknown times sort after recorded times.
  const leftAt = timestamp(left, Infinity);
  const rightAt = timestamp(right, Infinity);
  return leftAt === rightAt ? 0 : leftAt - rightAt;
}

function requestPriority(request: TaskAttentionRequest): number {
  return request.kind === "user-input" ? 0 : 1;
}

export function deriveTaskAttention(facts: TaskAttentionFacts): TaskAttention {
  const { activeTurnId, turnFailure, turnStall, agentRunBlock, tarsResult } = facts;
  const candidates: TaskAttentionRequest[] = [...(facts.pendingRequests ?? [])];
  if (agentRunBlock?.recoveryAvailable) {
    candidates.push({ id: agentRunBlock.id, since: agentRunBlock.since, kind: "agent-run-blocked", owner: { kind: "agent-run-persistent" } });
  }
  if (tarsResult?.canAcceptCompletion) {
    candidates.push({ id: tarsResult.id, since: tarsResult.since, kind: "tars-decision", owner: { kind: "host-managed" } });
  }
  const passiveTarsResultAt = tarsResult && !tarsResult.seen ? tarsResult.since : null;
  const lastResultAt = timestamp(passiveTarsResultAt, -Infinity) > timestamp(facts.lastResultAt, -Infinity)
    ? passiveTarsResultAt : facts.lastResultAt;
  const requests = candidates
    .filter((request) => canAnswer(request, activeTurnId))
    .sort((left, right) => requestPriority(left) - requestPriority(right) ||
      compareSince(left.since, right.since) || left.id.localeCompare(right.id));
  const first = requests[0];
  if (first) {
    const seen = new Set<string>();
    const unique = requests.filter(({ id }) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return { state: FLEET_KIND_STATE[first.kind], reason: first.kind, requests: unique, since: first.since };
  }

  const lastSeen = timestamp(facts.lastSeenAt, -Infinity);
  const unseen = (value: string | null | undefined): value is string => timestamp(value, -Infinity) > lastSeen;
  const problems: Array<{ reason: FleetKindWithState<"problem"> | "agent-run-blocked"; since: string }> = [];
  // A new turn or a newer successful result supersedes a terminal failure.
  if (turnFailure && (!activeTurnId || turnFailure.turnId === activeTurnId) &&
      unseen(turnFailure.since) && timestamp(lastResultAt, -Infinity) <= Date.parse(turnFailure.since)) {
    problems.push({ reason: "run-failed", since: turnFailure.since });
  }
  if (turnStall && turnStall.turnId === activeTurnId && unseen(turnStall.since)) {
    problems.push({ reason: "turn-stalled", since: turnStall.since });
  }
  if (unseen(facts.agentRunStuckAt)) {
    problems.push({ reason: "agent-run-stuck", since: facts.agentRunStuckAt });
  }
  if (agentRunBlock && !agentRunBlock.seen && unseen(agentRunBlock.since)) {
    problems.push({ reason: "agent-run-blocked", since: agentRunBlock.since });
  }
  problems.sort((left, right) => compareSince(left.since, right.since));
  const problem = problems[0];
  if (problem) return { state: "problem", ...problem, requests: [] };

  if (activeTurnId) {
    return { state: "working", reason: "active-turn", requests: [], since: facts.activeTurnStartedAt ?? null };
  }
  if (facts.waitingForChild) {
    return { state: "working", reason: "waiting-for-child", requests: [], since: facts.waitingForChild.since };
  }
  if (unseen(lastResultAt)) {
    return { state: FLEET_KIND_STATE["result-ready"], reason: "result-ready", requests: [], since: lastResultAt };
  }
  return { state: "idle", reason: null, requests: [], since: null };
}

export function deriveWorkspaceAttention(tasks: readonly Pick<TaskAttention, "state">[]): TaskAttentionState {
  let state: TaskAttentionState = "idle";
  for (const task of tasks) {
    if (STATE_PRIORITY[task.state] < STATE_PRIORITY[state]) state = task.state;
  }
  return state;
}

export function countNeedsYouTasks(tasks: readonly Pick<TaskAttention, "state">[]): number {
  return tasks.filter(({ state }) => state === "needs-you").length;
}

type NotifyingState = "needs-you" | "problem" | "done-unseen";

export type TaskAttentionTransition =
  | { type: "entered"; state: NotifyingState }
  | { type: "new-request"; state: "needs-you"; requestId: string };

export function detectAttentionTransitions(
  previous: TaskAttention | null | undefined,
  next: TaskAttention,
): TaskAttentionTransition[] {
  if (!previous) return [];
  if (previous.state !== next.state) {
    const { state } = next;
    return state === "needs-you" || state === "problem" || state === "done-unseen"
      ? [{ type: "entered", state }]
      : [];
  }
  if (next.state !== "needs-you") return [];
  const previousIds = new Set(previous.requests.map(({ id }) => id));
  return next.requests
    .filter(({ id }) => !previousIds.has(id))
    .map(({ id }) => ({ type: "new-request", state: "needs-you", requestId: id }));
}
