import type { TodoItem } from "@/components/ai-elements/todo";
import {
  formatAdvisorDuration,
  type AdvisorExchangeSnapshot,
} from "@/lib/providers/advisor-activity";
import {
  describeHookEventLabel,
  formatHookSourcePreview,
  normalizeHookEventToken,
} from "@/lib/providers/hook-activity";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import { truncateWorkText } from "@/lib/providers/subagent-identity";
import { resolveToolProviderDetail } from "@/lib/providers/tool-activity";
import type {
  ProviderTurnActivitySnapshot,
  ProviderTurnWorkItem,
  RetainedTurnOutcome,
} from "@/lib/providers/turn-status";
import type { WorkGraphSummary } from "@/lib/work-graph/work-graph-tree";
import type { OrbState } from "thinking-orbs";

export type TurnActivityRowStatus =
  "pending" | "running" | "waiting" | "completed" | "failed";

/** Icon slot for a row; the renderer maps these onto lucide components. */
export type TurnActivityIconKey =
  | "alert"
  | "pause"
  | "plan"
  | "subagent"
  | "advisor"
  | "tool"
  | "hook"
  | "todo";

export interface TurnActivityWorkItemLike {
  status: TurnActivityRowStatus;
}

/**
 * A todo carried into the shelf. `promoted` marks a queued todo that the shelf
 * surfaces as the active one — the provider never reported it as in progress,
 * so the row labels it instead of pretending it is running.
 */
export interface TurnActivityTodo extends TodoItem {
  promoted?: boolean;
}

export interface TurnActivityItem {
  id: string;
  status: TurnActivityRowStatus;
  title: string;
  detail?: string;
  /**
   * Content only this provider can express, kept out of `title` and `detail`.
   *
   * `title` and `detail` are normalized so the same turn reads the same way on
   * every provider. Raw provider vocabulary — a hook's own event token, the
   * file a handler was declared in — still matters when something misbehaves,
   * so it rides in its own field and the row gives it its own visually
   * distinct slot. A reader can then tell which half of a row is Stave's
   * normalization and which half is the provider talking.
   */
  providerDetail?: string;
  badge?: string;
  elapsedSeconds?: number;
  /**
   * Seconds between the turn starting and this row's work starting. Lets the
   * roomier placements show *where* in the turn a step happened, which a bare
   * duration cannot answer.
   */
  startOffsetSeconds?: number;
  /**
   * The provider tool call this row stands for. Present only for rows the
   * transcript can actually reveal, so it doubles as "this row is clickable".
   */
  toolUseId?: string;
  /**
   * A detail surface this row opens instead of revealing a transcript entry.
   *
   * Separate from `toolUseId` on purpose: that field asserts "the transcript
   * can reveal this call", and borrowing it for the advisor row would put a
   * row in the transcript-reveal path that has nothing to reveal.
   */
  detailSurface?: "advisor-consult-log";
  iconKey: TurnActivityIconKey;
}

/**
 * What clicking a row should do, if anything.
 *
 * One place decides, so the row component branches on the result rather than
 * re-deriving "is this clickable" from two fields that mean different things.
 */
export type TurnActivityRowActivation =
  | { kind: "tool"; toolUseId: string }
  | { kind: "advisor-log" };

export function resolveTurnActivityRowActivation(
  item: TurnActivityItem,
): TurnActivityRowActivation | null {
  if (item.toolUseId) {
    return { kind: "tool", toolUseId: item.toolUseId };
  }
  if (item.detailSurface === "advisor-consult-log") {
    return { kind: "advisor-log" };
  }
  return null;
}

export interface TurnActivitySummary {
  label: string;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

export interface TurnActivityCounts {
  failedCount: number;
  waitingCount: number;
  runningCount: number;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  subagentFailedCount: number;
  subagentWaitingCount: number;
  subagentRunningCount: number;
  subagentPendingCount: number;
  subagentCompletedCount: number;
  hasGraphSubagentCounts: boolean;
}

/** Most urgent first: what the shelf should show before anything else. */
const TURN_ACTIVITY_STATUS_ORDER: Record<TurnActivityRowStatus, number> = {
  failed: 0,
  waiting: 1,
  running: 2,
  pending: 3,
  completed: 4,
};

/**
 * The shelf stays mounted for the whole turn. It deliberately does not react to
 * pending approval/user-input cards: unmounting there replayed the shelf's
 * enter/exit animation on every interaction, which read as a flicker. The
 * duplicate row is suppressed in `buildTurnActivityItems` instead.
 */
export function resolveTurnActivityVisibility(args: {
  isTurnActive: boolean;
  isPlanPending: boolean;
  hasRetainedFailure?: boolean;
  /**
   * A finished turn is being replayed. Only the panel ever sets this — see
   * `resolveTurnActivityReplay` for why the other two placements do not.
   */
  hasReplay?: boolean;
}) {
  return Boolean(
    args.hasRetainedFailure ||
      args.hasReplay ||
      (args.isTurnActive && !args.isPlanPending),
  );
}

/**
 * Whether this surface should replay the task's last finished turn.
 *
 * Replay is the panel's alone. The docked shelf sits between the transcript and
 * the composer and has to collapse when a turn ends, or every finished turn
 * would permanently steal a band of the prompt area; the floating card would
 * hang a stale turn over the chat with no reason to ever go away. The panel is
 * opened deliberately, is full height, and is already the placement people
 * choose when they want to study a turn rather than glance at it — so it is the
 * one surface where keeping the finished turn on screen is what was asked for.
 */
export function resolveTurnActivityReplay<T>(args: {
  placement: "docked" | "floating" | "panel";
  isTurnActive: boolean;
  retained: T | null;
}): T | null {
  if (args.placement !== "panel" || args.isTurnActive) {
    return null;
  }
  return args.retained;
}

/**
 * The headline for a replayed turn.
 *
 * The live headline names what is happening right now, and every one of its
 * fallbacks ("Working on your request") reads as a turn still in flight. A
 * finished turn has to say so in the first two words or the panel is
 * indistinguishable from a live one that stopped updating.
 */
export function describeRetainedTurnHeadline(outcome: RetainedTurnOutcome) {
  switch (outcome) {
    case "failed":
      return "Turn failed";
    case "stopped":
      return "Turn stopped";
    case "completed":
      return "Turn finished";
  }
}

/**
 * Map the turn-level lifecycle to the orb's visual vocabulary. Keep this
 * separate from the surface so the state mapping stays deterministic and
 * testable as provider activity grows.
 */
export function resolveTurnActivityOrbState(args: {
  activity: Pick<ProviderTurnActivitySnapshot, "pendingInteraction"> | null;
  isPlanPreparing: boolean;
  isStalled: boolean;
  workItems: Pick<ProviderTurnWorkItem, "kind" | "status">[];
}): OrbState {
  if (!args.activity) {
    return "connecting";
  }
  if (args.activity.pendingInteraction) {
    return "listening";
  }
  if (args.isStalled) {
    return "breathing";
  }
  if (args.isPlanPreparing) {
    return "shaping";
  }

  const runningWorkItems = args.workItems.filter(
    (item) => item.status === "running",
  );
  if (runningWorkItems.length > 1) {
    return "weaving";
  }
  if (runningWorkItems.some((item) => item.kind === "subagent")) {
    return "searching";
  }
  return "working";
}

export function promoteFirstPendingTodoForActiveTurn(
  todos: TurnActivityTodo[],
): TurnActivityTodo[] {
  if (
    todos.length === 0 ||
    todos.some((todo) => todo.status === "in_progress")
  ) {
    return todos;
  }
  const firstPendingIndex = todos.findIndex(
    (todo) => todo.status === "pending",
  );
  if (firstPendingIndex < 0) {
    return todos;
  }
  return todos.map((todo, index) =>
    index === firstPendingIndex
      ? { ...todo, status: "in_progress" as const, promoted: true }
      : todo,
  );
}

/** `Claude · Sonnet 4.6 · high`, or null when the runtime named no target. */
function describeAdvisorIdentity(snapshot: AdvisorExchangeSnapshot) {
  if (!snapshot.advisorProviderId) {
    return null;
  }
  const segments = [
    getProviderLabel({ providerId: snapshot.advisorProviderId }),
    ...(snapshot.advisorModel
      ? [toHumanModelName({ model: snapshot.advisorModel })]
      : []),
    ...(snapshot.advisorEffort ? [snapshot.advisorEffort] : []),
  ];
  return segments.join(" · ");
}

/**
 * The Advisor's row in the turn shelf.
 *
 * On-demand consults are the one delegation the user cannot predict: the model
 * decides whether to spend one at all. So the row exists from the moment the
 * turn is armed, and its title always states the count — a turn that consulted
 * nobody says so, instead of looking exactly like a turn with no Advisor.
 *
 * The floating exchange card still owns the detail (question, advice, checks);
 * this row exists so every delegation this turn made is countable in one place.
 */
export function describeAdvisorTurnActivityItem(
  snapshot: AdvisorExchangeSnapshot,
  options?: {
    /**
     * The task has archived consults to open. Gated on log emptiness rather
     * than on this turn's outcome, so a merely-armed turn whose task consulted
     * earlier still offers a way back to those consults.
     */
    hasConsultLog?: boolean;
  },
): TurnActivityItem {
  const identity = describeAdvisorIdentity(snapshot);
  const limit = snapshot.consultLimit;
  const duration =
    snapshot.durationMs === undefined
      ? null
      : formatAdvisorDuration(snapshot.durationMs);

  if (snapshot.outcome === "armed") {
    return {
      id: "advisor",
      status: "pending",
      title: "Advisor armed · 0 consults",
      detail: identity
        ? `${identity} · available if the primary asks`
        : "Available if the primary asks",
      ...(limit ? { badge: `0/${limit}` } : {}),
      ...(options?.hasConsultLog
        ? { detailSurface: "advisor-consult-log" as const }
        : {}),
      iconKey: "advisor",
    };
  }

  const index = snapshot.consultIndex ?? snapshot.settledConsults;
  const countLabel = limit ? `${index}/${limit}` : `${index}`;
  if (snapshot.outcome === "pending") {
    return {
      id: "advisor",
      status: "running",
      title: `Advisor consult ${countLabel}`,
      detail: snapshot.question ?? identity ?? "Waiting on the advisor",
      ...(limit ? { badge: countLabel } : {}),
      ...(options?.hasConsultLog
        ? { detailSurface: "advisor-consult-log" as const }
        : {}),
      iconKey: "advisor",
    };
  }

  const failed = snapshot.outcome === "failed" || snapshot.outcome === "timeout";
  const outcomeDetail =
    snapshot.outcome === "completed"
      ? `Advice returned${duration ? ` in ${duration}` : ""}`
      : snapshot.outcome === "timeout"
        ? `Timed out${duration ? ` after ${duration}` : ""}; the turn continued`
        : snapshot.outcome === "failed"
          ? `Failed${duration ? ` after ${duration}` : ""}; the turn continued`
          : snapshot.outcome === "skipped"
            ? "Consult cancelled; the turn continued"
            : "Turn cancelled during a consult";
  return {
    id: "advisor",
    // A failed consult is not a failed turn — the primary keeps going — but it
    // is the one advisor outcome worth surfacing in the collapsed header.
    status: failed ? "failed" : "completed",
    title: `Advisor · ${snapshot.settledConsults} consult${
      snapshot.settledConsults === 1 ? "" : "s"
    }`,
    detail: identity ? `${outcomeDetail} · ${identity}` : outcomeDetail,
    ...(limit ? { badge: `${snapshot.settledConsults}/${limit}` } : {}),
    ...(options?.hasConsultLog
      ? { detailSurface: "advisor-consult-log" as const }
      : {}),
    iconKey: "advisor",
  };
}

/**
 * How long this row's work took.
 *
 * Only Claude reports `elapsedSeconds` (it rides `tool_progress`, which the
 * Codex app server has no equivalent for), so a finished row derives its own
 * duration from the timestamps every provider records. Live rows deliberately
 * do NOT derive: that would need a per-second clock in the row list, and the
 * list is memoized precisely to avoid re-rendering every row on every tick.
 */
function resolveWorkItemElapsedSeconds(item: ProviderTurnWorkItem) {
  if (item.elapsedSeconds != null) {
    return item.elapsedSeconds;
  }
  if (item.status !== "completed" && item.status !== "failed") {
    return undefined;
  }
  const elapsedMs = item.updatedAt - item.startedAt;
  return elapsedMs > 0 ? elapsedMs / 1000 : undefined;
}

function resolveWorkItemStartOffsetSeconds(args: {
  item: ProviderTurnWorkItem;
  turnStartedAt: number | null;
}) {
  if (args.turnStartedAt == null) {
    return undefined;
  }
  const offsetMs = args.item.startedAt - args.turnStartedAt;
  return offsetMs > 0 ? offsetMs / 1000 : 0;
}

/** At most this many distinct provider values are named before a `+N` tail. */
const HOOK_PROVIDER_DETAIL_VALUE_LIMIT = 2;

interface HookActivityGroup {
  /** The work item whose position in the list the group row inherits. */
  leader: ProviderTurnWorkItem;
  items: ProviderTurnWorkItem[];
}

/**
 * Fold a turn's hook runs into one row per lifecycle moment.
 *
 * A single hooks file routinely declares several handlers for the same event, and
 * providers report each handler run separately. Rendering one row per run filled
 * the shelf with rows whose labels were identical — the old presentation had to
 * invent `handler 1 ·` / `handler 2 ·` ordinals just to keep them apart, which
 * spent the row's most valuable characters on a number that means nothing to the
 * reader. Grouping states the moment once and counts the handlers instead, which
 * is both shorter and the thing someone actually wants to know.
 *
 * Grouping is by canonical event so it behaves identically across providers.
 * Runs the provider left unnamed fall back to their own label, so they never
 * collapse into one meaningless bucket with unrelated hooks.
 */
function groupHookWorkItems(workItems: ProviderTurnWorkItem[]) {
  const groups = new Map<string, HookActivityGroup>();
  const groupKeyByItemId = new Map<string, string>();
  for (const item of workItems) {
    if (item.kind !== "hook") {
      continue;
    }
    const token = item.hookEvent ?? "";
    const key = describeHookEventLabel(token)
      ? `event:${normalizeHookEventToken(token)}`
      : `label:${item.title}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { leader: item, items: [item] });
    }
    groupKeyByItemId.set(item.id, key);
  }
  return { groups, groupKeyByItemId };
}

/** `a, b (+2)` — distinct values, capped so the provider line stays one line. */
function joinDistinctHookValues(values: (string | null | undefined)[]) {
  const distinct = [
    ...new Set(
      values.filter((value): value is string => Boolean(value && value.trim())),
    ),
  ];
  if (distinct.length === 0) {
    return null;
  }
  const shown = distinct.slice(0, HOOK_PROVIDER_DETAIL_VALUE_LIMIT);
  const hidden = distinct.length - shown.length;
  return hidden > 0 ? `${shown.join(", ")} (+${hidden})` : shown.join(", ");
}

function resolveHookGroupStatus(
  items: ProviderTurnWorkItem[],
): TurnActivityRowStatus {
  let status: TurnActivityRowStatus = "completed";
  for (const item of items) {
    if (
      TURN_ACTIVITY_STATUS_ORDER[item.status] <
      TURN_ACTIVITY_STATUS_ORDER[status]
    ) {
      status = item.status;
    }
  }
  return status;
}

/**
 * One hook row: a normalized title and count, then the provider's own tokens.
 *
 * The title names the moment in the turn (`Session start hook`), the badge
 * counts the handlers, and everything the provider phrased itself — its event
 * token, the handler kind, the declaring file — goes to `providerDetail` so the
 * row never presents a provider identifier as if it were normalized content.
 */
function describeHookActivityItem(args: {
  group: HookActivityGroup;
  turnStartedAt: number | null;
}): TurnActivityItem {
  const { leader, items } = args.group;
  const count = items.length;
  const eventLabel = describeHookEventLabel(leader.hookEvent ?? "");
  const status = resolveHookGroupStatus(items);
  const failedCount = items.filter((item) => item.status === "failed").length;

  // A provider that names no event still gets a readable row. Claude labels
  // such runs descriptively ("Hook feedback"), so that label is kept; a run
  // that instead reports the file it was declared in is identified by its own
  // label only in `providerDetail`, because that label is a handler *kind*
  // ("command") and reads as nothing on its own.
  const title = eventLabel
    ? `${eventLabel} ${count > 1 ? "hooks" : "hook"}`
    : count > 1 || leader.hookSource
      ? `Provider hook${count > 1 ? "s" : ""}`
      : leader.title;
  const detail =
    failedCount === 0
      ? undefined
      : count > 1
        ? `${failedCount} of ${count} handlers failed`
        : "Handler failed";
  // Raw token first: it is the string that appears in the provider's own logs
  // and hook config. Dropped when the normalized label is only a re-casing of
  // it (`sessionStart` -> `Session start`), because then it adds a second
  // spelling of the row title and no information.
  const rawEventToken =
    eventLabel &&
    leader.hookEvent &&
    normalizeHookEventToken(leader.hookEvent) !==
      normalizeHookEventToken(eventLabel)
      ? leader.hookEvent
      : null;
  const providerDetailSegments = [
    rawEventToken,
    joinDistinctHookValues(items.map((item) => item.title)),
    joinDistinctHookValues(
      items.map((item) =>
        item.hookSource ? formatHookSourcePreview(item.hookSource) : null,
      ),
    ),
  ].filter((segment): segment is string => Boolean(segment));
  const joinedProviderDetail = providerDetailSegments.join(" · ");
  // A provider whose only extra vocabulary is the label already used as the
  // title has nothing provider-specific left to show.
  const providerDetail =
    joinedProviderDetail && joinedProviderDetail !== title
      ? joinedProviderDetail
      : null;

  const elapsedCandidates = items
    .map((item) => resolveWorkItemElapsedSeconds(item))
    .filter((value): value is number => value != null);
  const startOffsetCandidates = items
    .map((item) =>
      resolveWorkItemStartOffsetSeconds({
        item,
        turnStartedAt: args.turnStartedAt,
      }),
    )
    .filter((value): value is number => value != null);

  return {
    id: `work:${leader.id}`,
    status,
    title: truncateWorkText(title) ?? "Provider hook",
    ...(detail ? { detail } : {}),
    ...(providerDetail
      ? { providerDetail: truncateWorkText(providerDetail) ?? providerDetail }
      : {}),
    ...(count > 1 ? { badge: `${count} handlers` } : {}),
    // The group spans every handler run, so it reports the longest handler and
    // the earliest start rather than an arbitrary member's numbers.
    ...(elapsedCandidates.length > 0
      ? { elapsedSeconds: Math.max(...elapsedCandidates) }
      : {}),
    ...(startOffsetCandidates.length > 0
      ? { startOffsetSeconds: Math.min(...startOffsetCandidates) }
      : {}),
    iconKey: "hook",
  };
}

function resolveTodoStatus(todo: TurnActivityTodo): TurnActivityRowStatus {
  if (todo.status === "completed") {
    return "completed";
  }
  if (todo.status === "in_progress") {
    return "running";
  }
  return "pending";
}

/**
 * Flatten every tracked signal into one row list, in a stable order: turn-level
 * signals first, then provider work in the order it started, then todos in
 * their authored order.
 *
 * Rows are deliberately NOT sorted by status. Re-ranking on every status change
 * made rows swap places while work landed — and provider events flush once per
 * animation frame, so that churned continuously. Severity now only decides the
 * collapsed header's featured row (`resolveTurnActivityFeaturedItem`).
 */
export function buildTurnActivityItems(args: {
  activity: Pick<
    ProviderTurnActivitySnapshot,
    "completedAt" | "pendingInteraction" | "turnError" | "turnErrorRecoverable"
  > | null;
  idleLabel: string | null;
  isPlanPreparing: boolean;
  isStalled: boolean;
  todos: TurnActivityTodo[];
  workItems: ProviderTurnWorkItem[];
  /** Turn start, used to place each work row on the turn's own timeline. */
  turnStartedAt?: number | null;
  /**
   * This turn's Advisor grant, if one was minted. Rendered here rather than
   * only in the floating card so subagents, child tasks and consults are all
   * countable from the same shelf.
   */
  advisor?: AdvisorExchangeSnapshot | null;
  /** The task has archived consults, so the advisor row can open the log. */
  hasAdvisorConsultLog?: boolean;
  /**
   * A chat-level approval/user-input card is already on screen, so the shelf
   * skips its own row rather than saying the same thing twice.
   */
  hasPendingInteractionCard?: boolean;
}): TurnActivityItem[] {
  const items: TurnActivityItem[] = [];
  const { groups: hookGroups, groupKeyByItemId: hookGroupKeyByItemId } =
    groupHookWorkItems(args.workItems);
  if (args.activity?.turnError) {
    const isRecovering =
      args.activity.turnErrorRecoverable === true &&
      args.activity.completedAt == null;
    items.push({
      id: "turn-error",
      status: isRecovering ? "waiting" : "failed",
      title: isRecovering ? "Provider issue" : "Turn failed",
      detail: args.activity.turnError,
      ...(isRecovering ? { badge: "Retrying" } : {}),
      iconKey: "alert",
    });
  }
  if (args.activity?.pendingInteraction) {
    if (!args.hasPendingInteractionCard) {
      const needsApproval = args.activity.pendingInteraction === "approval";
      items.push({
        id: `interaction:${args.activity.pendingInteraction}`,
        status: "waiting",
        title: needsApproval ? "Approval needed" : "Input needed",
        detail: needsApproval ? "Review to continue" : "Reply to continue",
        iconKey: "pause",
      });
    }
  } else if (args.isStalled) {
    items.push({
      id: "stalled",
      status: "waiting",
      title: "Activity paused",
      detail: args.idleLabel
        ? `No updates for ${args.idleLabel}`
        : "Waiting for the provider",
      iconKey: "pause",
    });
  }
  if (args.isPlanPreparing) {
    items.push({
      id: "plan",
      status: "running",
      title: "Preparing the plan",
      iconKey: "plan",
    });
  }
  if (args.advisor) {
    // Fixed slot ahead of provider work: the row appears when the turn is
    // armed and only changes text afterwards, so it never reorders the list
    // mid-turn the way an insertion at consult time would.
    items.push(
      describeAdvisorTurnActivityItem(args.advisor, {
        hasConsultLog: args.hasAdvisorConsultLog ?? false,
      }),
    );
  }
  for (const item of args.workItems) {
    if (item.kind === "hook") {
      // Hook runs render as one row per lifecycle moment. The group takes the
      // slot of its first member so hook rows keep their place in the turn's
      // timeline; later members are already folded into it.
      const groupKey = hookGroupKeyByItemId.get(item.id);
      const group = groupKey ? hookGroups.get(groupKey) : undefined;
      if (!group || group.leader.id !== item.id) {
        continue;
      }
      items.push(
        describeHookActivityItem({
          group,
          turnStartedAt: args.turnStartedAt ?? null,
        }),
      );
      continue;
    }
    const title = item.title;
    // The provider's own tool token, in the slot reserved for content the
    // normalized half of the row cannot express. Suppressed when the title was
    // derived from that same token, so it never reads as an echo.
    const providerDetail = item.toolName
      ? truncateWorkText(
          resolveToolProviderDetail({ toolName: item.toolName, title }) ?? "",
        )
      : undefined;
    const elapsedSeconds = resolveWorkItemElapsedSeconds(item);
    const startOffsetSeconds = resolveWorkItemStartOffsetSeconds({
      item,
      turnStartedAt: args.turnStartedAt ?? null,
    });
    items.push({
      id: `work:${item.id}`,
      status: item.status,
      title,
      detail: item.progressMessages.at(-1) ?? item.detail,
      ...(providerDetail ? { providerDetail } : {}),
      ...(item.badge ? { badge: item.badge } : {}),
      ...(elapsedSeconds != null ? { elapsedSeconds } : {}),
      ...(startOffsetSeconds != null ? { startOffsetSeconds } : {}),
      ...(item.toolUseId ? { toolUseId: item.toolUseId } : {}),
      iconKey: item.kind === "subagent" ? "subagent" : "tool",
    });
  }
  args.todos.forEach((todo, index) => {
    items.push({
      id: `todo:${todo.content}:${index}`,
      status: resolveTodoStatus(todo),
      title: todo.content,
      ...(todo.promoted ? { badge: "Next" } : {}),
      iconKey: "todo",
    });
  });

  return items;
}

/**
 * Pick the row the collapsed header should name: the most urgent one, with
 * insertion order breaking ties. This is the only place status severity is
 * allowed to reorder anything — the list itself stays in insertion order so
 * rows never swap places mid-turn.
 */
export function resolveTurnActivityFeaturedItem(
  items: TurnActivityItem[],
): TurnActivityItem | null {
  let featured: TurnActivityItem | null = null;
  for (const item of items) {
    if (
      featured == null ||
      TURN_ACTIVITY_STATUS_ORDER[item.status] <
        TURN_ACTIVITY_STATUS_ORDER[featured.status]
    ) {
      featured = item;
    }
  }
  return featured;
}

export function countTurnActivityItems(
  items: TurnActivityItem[],
): TurnActivityCounts {
  const counts: TurnActivityCounts = {
    failedCount: 0,
    waitingCount: 0,
    runningCount: 0,
    pendingCount: 0,
    completedCount: 0,
    totalCount: items.length,
    subagentFailedCount: 0,
    subagentWaitingCount: 0,
    subagentRunningCount: 0,
    subagentPendingCount: 0,
    subagentCompletedCount: 0,
    hasGraphSubagentCounts: false,
  };
  for (const item of items) {
    if (item.status === "failed") {
      counts.failedCount += 1;
      if (item.iconKey === "subagent") {
        counts.subagentFailedCount += 1;
      }
    } else if (item.status === "waiting") {
      counts.waitingCount += 1;
      if (item.iconKey === "subagent") {
        counts.subagentWaitingCount += 1;
      }
    } else if (item.status === "running") {
      counts.runningCount += 1;
      if (item.iconKey === "subagent") {
        counts.subagentRunningCount += 1;
      }
    } else if (item.status === "pending") {
      counts.pendingCount += 1;
      if (item.iconKey === "subagent") {
        counts.subagentPendingCount += 1;
      }
    } else {
      counts.completedCount += 1;
      if (item.iconKey === "subagent") {
        counts.subagentCompletedCount += 1;
      }
    }
  }
  return counts;
}

/**
 * Replace the flat shelf's bounded subagent contribution with the complete
 * work-graph summary. Non-agent rows remain owned by the flat activity tail.
 */
export function mergeTurnActivityCounts(
  flatCounts: TurnActivityCounts,
  graphSummary: WorkGraphSummary | null,
): TurnActivityCounts {
  if (!graphSummary || graphSummary.totalCount === 0) {
    return flatCounts;
  }
  const flatSubagentCount =
    flatCounts.subagentFailedCount +
    flatCounts.subagentWaitingCount +
    flatCounts.subagentRunningCount +
    flatCounts.subagentPendingCount +
    flatCounts.subagentCompletedCount;

  return {
    failedCount:
      flatCounts.failedCount -
      flatCounts.subagentFailedCount +
      graphSummary.failedCount,
    waitingCount:
      flatCounts.waitingCount -
      flatCounts.subagentWaitingCount +
      graphSummary.blockedCount,
    runningCount:
      flatCounts.runningCount -
      flatCounts.subagentRunningCount +
      graphSummary.runningCount,
    pendingCount: flatCounts.pendingCount - flatCounts.subagentPendingCount,
    completedCount:
      flatCounts.completedCount -
      flatCounts.subagentCompletedCount +
      graphSummary.completedCount,
    totalCount:
      flatCounts.totalCount - flatSubagentCount + graphSummary.totalCount,
    subagentFailedCount: graphSummary.failedCount,
    subagentWaitingCount: graphSummary.blockedCount,
    subagentRunningCount: graphSummary.runningCount,
    subagentPendingCount: 0,
    subagentCompletedCount: graphSummary.completedCount,
    hasGraphSubagentCounts: true,
  };
}

/** `2 running · 1 waiting · 3 done` — the expanded-state headline. */
export function formatTurnActivityCountsLabel(counts: TurnActivityCounts) {
  const segments = [
    counts.failedCount > 0 ? `${counts.failedCount} failed` : null,
    counts.waitingCount > 0 ? `${counts.waitingCount} waiting` : null,
    counts.runningCount > 0 ? `${counts.runningCount} running` : null,
    counts.pendingCount > 0 ? `${counts.pendingCount} queued` : null,
    counts.completedCount > 0 ? `${counts.completedCount} done` : null,
  ].filter((segment): segment is string => segment !== null);
  return segments.length > 0 ? segments.join(" · ") : null;
}

export function formatTurnActivityElapsedSeconds(value: number) {
  const totalSeconds = Math.max(0, Math.round(value));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/** Whether any row still represents outstanding work rather than a result. */
export function hasOutstandingTurnActivity(counts: TurnActivityCounts) {
  return (
    counts.failedCount +
      counts.waitingCount +
      counts.runningCount +
      counts.pendingCount >
    0
  );
}

/**
 * The shelf headline.
 *
 * Attention states own the header in both the collapsed and expanded state —
 * they name themselves better than a row title or a count can, and the shelf now
 * stays mounted behind interaction cards, so a collapsed header must not bury
 * "waiting for you" under whichever tool happens to be running.
 *
 * Counts only earn the slot while something is still outstanding: once every
 * tracked row has finished, `formatTurnActivityCountsLabel` degrades to a bare
 * `5 done`, which sat there reading like a finished turn for the whole
 * final-response stream. The completed ratio is rendered separately in the
 * header, so the label falls back to naming the state instead.
 */
export function resolveTurnActivityHeadline(args: {
  expanded: boolean;
  needsAttention: boolean;
  counts: TurnActivityCounts;
  countsLabel: string | null;
  featuredItem: TurnActivityItem | null;
  summaryLabel: string;
}) {
  if (args.needsAttention) {
    return args.summaryLabel;
  }
  if (!args.expanded) {
    if (
      args.counts.hasGraphSubagentCounts &&
      args.counts.subagentRunningCount >= 2
    ) {
      return args.countsLabel ?? args.summaryLabel;
    }
    return args.featuredItem?.title ?? args.summaryLabel;
  }
  if (!hasOutstandingTurnActivity(args.counts)) {
    return args.summaryLabel;
  }
  return args.countsLabel ?? args.summaryLabel;
}

/** Worst status among rows the collapsed header hides, for the `+N` badge. */
export function resolveTurnActivityHiddenSeverity(
  items: TurnActivityItem[],
): "failed" | "waiting" | "default" {
  if (items.some((item) => item.status === "failed")) {
    return "failed";
  }
  if (items.some((item) => item.status === "waiting")) {
    return "waiting";
  }
  return "default";
}

export function resolveTurnActivitySummary(args: {
  pendingInteraction: "approval" | "user_input" | null;
  isStalled: boolean;
  isPlanPreparing: boolean;
  workItems: TurnActivityWorkItemLike[];
  todos: TodoItem[];
}): TurnActivitySummary {
  const completedWorkCount = args.workItems.filter(
    (item) => item.status === "completed",
  ).length;
  const failedWorkCount = args.workItems.filter(
    (item) => item.status === "failed",
  ).length;
  const activeWorkCount = args.workItems.filter(
    (item) =>
      item.status === "running" ||
      item.status === "waiting" ||
      item.status === "pending",
  ).length;
  const completedTodoCount = args.todos.filter(
    (todo) => todo.status === "completed",
  ).length;
  const activeTodoCount = args.todos.filter(
    (todo) => todo.status !== "completed",
  ).length;
  const completedCount = completedWorkCount + completedTodoCount;
  const activeCount =
    activeWorkCount + activeTodoCount + (args.isPlanPreparing ? 1 : 0);
  const totalCount =
    args.workItems.length + args.todos.length + (args.isPlanPreparing ? 1 : 0);

  if (args.pendingInteraction === "approval") {
    return {
      label: "Waiting for approval",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.pendingInteraction === "user_input") {
    return {
      label: "Waiting for your input",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.isStalled) {
    return {
      label: "Activity paused",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (args.isPlanPreparing) {
    return {
      label: "Preparing the plan",
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (failedWorkCount > 0) {
    return {
      label:
        failedWorkCount === 1
          ? "1 activity failed"
          : `${failedWorkCount} activities failed`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (activeWorkCount > 0) {
    return {
      label:
        activeWorkCount === 1
          ? "1 background activity"
          : `${activeWorkCount} background activities`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }
  if (activeTodoCount > 0) {
    return {
      label:
        activeTodoCount === 1
          ? "1 task in progress"
          : `${activeTodoCount} tasks in progress`,
      activeCount,
      completedCount,
      failedCount: failedWorkCount,
      totalCount,
    };
  }

  return {
    label: "Working on your request",
    activeCount,
    completedCount,
    failedCount: failedWorkCount,
    totalCount,
  };
}
