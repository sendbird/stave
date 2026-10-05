import { i18n } from "@/i18n/runtime";
/**
 * The composer shelf: one surface over the prompt input that holds what is in
 * flight for the task — the run line (a turn, or the agent run heading it) and
 * the queue line. Pure decisions only; the components read them.
 *
 * The one-line summary never moves. `settings.turnActivityPlacement` now picks
 * where a run's *details* open: inline under the line, in the floating card, or
 * in the Task panel.
 */
import {
  formatProviderTurnIdleDuration,
  type ProviderTurnActivitySnapshot,
  type RetainedTurnOutcome,
} from "@/lib/providers/turn-status";
import { providerAccountUsageLabel } from "@/lib/providers/account-usage-block";
import {
  formatResetClock,
  formatResetCountdown,
} from "@/components/layout/status-bar-usage-strip.utils";
import type { TurnActivityPlacement } from "@/store/app-settings";
import type {
  QueuePauseReason,
  TaskUsageLimitPause,
} from "@/store/task-work-pause";
import type { ShelfDetailOverride } from "@/store/composer-shelf-store";
import { formatExchangeDuration } from "@/lib/delegation/duration";
import { getProviderLabel, toHumanModelName } from "@/lib/providers/model-catalog";
import type { ReviewShelfItem } from "@/lib/reviews/review-task";
import {
  describeReviewFindingsSummary,
  stripReviewFindingsBlock,
  summarizeReviewFindings,
  type ParsedReviewFindings,
} from "@/lib/reviews/review-findings";
import { fromDelegatedTask, type DelegationExchange } from "@/lib/delegation/exchange";
import type {
  ChatMessage,
  PromptDraftQueuedNextTurn,
  PromptDraftQueuedTurn,
} from "@/types/chat";

// ── Rows ─────────────────────────────────────────────────────────────────

/** What heads the run line: an active agent run (or legacy run), else the turn. */
export type ShelfRunSource = "agentRun" | "turn";

export type ComposerShelfRow = "run" | "limit" | "review" | "queue";

/**
 * The run line names one thing. An active run owns it for its whole life, the
 * turns it starts included, so the turn never draws a second status beside it.
 */
export function resolveShelfRunSource(args: {
  agentRunActive: boolean;
  turnVisible: boolean;
}): ShelfRunSource | null {
  if (args.agentRunActive) {
    return "agentRun";
  }
  return args.turnVisible ? "turn" : null;
}

/**
 * Rows in the order they stack. Blocking requests (approvals, questions,
 * sign-offs) are not rows: their cards already own the slot above the shelf,
 * and a second copy would ask the same question twice.
 */
export function selectComposerShelfRows(args: {
  run: ShelfRunSource | null;
  queueCount: number;
  /** Work a usage limit stopped is waiting to resume. */
  limited?: boolean;
  /** Reviews running in their own task, or finished and not yet carried. */
  reviewCount?: number;
}): ComposerShelfRow[] {
  const rows: ComposerShelfRow[] = [];
  if (args.run) {
    rows.push("run");
  }
  if (args.limited) {
    rows.push("limit");
  }
  if ((args.reviewCount ?? 0) > 0) {
    rows.push("review");
  }
  if (args.queueCount > 0) {
    rows.push("queue");
  }
  return rows;
}

// ── Where details open ───────────────────────────────────────────────────

export type ShelfDetailHost = "inline" | "floating" | "panel";

export function resolveShelfDetailHost(
  placement: TurnActivityPlacement,
): ShelfDetailHost {
  switch (placement) {
    case "docked":
      return "inline";
    case "floating":
      return "floating";
    case "panel":
      return "panel";
  }
}

/** The run a detail toggle belongs to: the agent run while one heads the shelf, else the turn. */
export function resolveShelfRunKey(args: {
  agentRunId: string | null;
  turnId: string | null;
}): string | null {
  if (args.agentRunId) {
    return `agent-run:${args.agentRunId}`;
  }
  return args.turnId ? `turn:${args.turnId}` : null;
}

/** A manual toggle wins for the run it was made in; any other run starts from the setting. */
export function resolveShelfDetailOpen(args: {
  override: ShelfDetailOverride | undefined;
  runKey: string | null;
  expandedByDefault: boolean;
}): boolean {
  if (args.override && args.runKey && args.override.runKey === args.runKey) {
    return args.override.open;
  }
  return args.expandedByDefault;
}

export interface ShelfRunControls {
  /** The toggle beside the line, or none when the details live in the Task panel. */
  detailToggle: "inline" | "floating" | null;
  /**
   * The Task panel button. `wide` drops it when the composer is narrow, where
   * the details are still one toggle away; `always` keeps it because it is the
   * only way to the details.
   */
  panelButton: "always" | "wide" | null;
}

export function resolveShelfRunControls(args: {
  detailHost: ShelfDetailHost;
  canExpand: boolean;
  canOpenPanel: boolean;
}): ShelfRunControls {
  const detailToggle =
    args.detailHost === "panel" || !args.canExpand ? null : args.detailHost;
  return {
    detailToggle,
    panelButton: args.canOpenPanel ? (detailToggle ? "wide" : "always") : null,
  };
}

// ── Turn line ────────────────────────────────────────────────────────────

/** Stalled, steering and failed are tones of the one line, not banners of their own. */
export type ShelfRunTone =
  | "active"
  | "waiting"
  | "steering"
  | "stalled"
  | "retrying"
  | "failed"
  | "done"
  | "stopped";

export function resolveTurnRunTone(args: {
  pendingInteraction: "approval" | "user_input" | null;
  isStalled: boolean;
  /** A steer was sent and the provider has not acknowledged it yet. */
  steering: boolean;
  turnError: string | null;
  turnErrorRecoverable: boolean;
  completed: boolean;
  replayOutcome?: RetainedTurnOutcome;
}): ShelfRunTone {
  if (args.replayOutcome) {
    return args.replayOutcome === "failed"
      ? "failed"
      : args.replayOutcome === "completed"
        ? "done"
        : "stopped";
  }
  if (args.completed) {
    return args.turnError ? "failed" : "done";
  }
  if (args.pendingInteraction) {
    return "waiting";
  }
  if (args.steering) {
    return "steering";
  }
  if (args.turnError) {
    return args.turnErrorRecoverable ? "retrying" : "failed";
  }
  return args.isStalled ? "stalled" : "active";
}

export function describeTurnRunLabel(
  tone: ShelfRunTone,
  pendingInteraction: "approval" | "user_input" | null,
): string {
  switch (tone) {
    case "active":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel");
    case "waiting":
      return pendingInteraction === "approval"
        ? i18n.t("composer:composerShelfUtils.describeTurnRunLabel2")
        : i18n.t("composer:composerShelfUtils.describeTurnRunLabel3");
    case "steering":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel4");
    case "stalled":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel5");
    case "retrying":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel6");
    case "failed":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel7");
    case "done":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel8");
    case "stopped":
      return i18n.t("composer:composerShelfUtils.describeTurnRunLabel9");
  }
}

export interface ShelfRunHeadline {
  /** The current step, or what the tone needs said. */
  text: string | null;
  /** Secondary half of the step (a path, a command), dimmer. */
  detail: string | null;
  /** The text names live work, so it may shimmer. */
  live: boolean;
}

/**
 * What follows the label. Attention tones say what they need in one line; a
 * question already asked by its card is not asked again here.
 */
export function resolveTurnRunHeadline(args: {
  tone: ShelfRunTone;
  pendingInteraction: "approval" | "user_input" | null;
  hasPendingInteractionCard: boolean;
  turnError: string | null;
  idleLabel: string | null;
  featured: { title: string; detail?: string } | null;
  /** `2 running · 1 done` while several agents run, which no single row can name. */
  countsHeadline: string | null;
  isPlanPreparing: boolean;
}): ShelfRunHeadline {
  switch (args.tone) {
    case "waiting":
      return {
        text: args.hasPendingInteractionCard
          ? null
          : args.pendingInteraction === "approval"
            ? i18n.t("composer:composerShelfUtils.text")
            : i18n.t("composer:composerShelfUtils.text2"),
        detail: null,
        live: false,
      };
    case "steering":
      return {
        text: i18n.t("composer:composerShelfUtils.text3"),
        detail: null,
        live: false,
      };
    case "stalled":
      return {
        text: i18n.t("composer:composerShelfUtils.text4", { value1: args.idleLabel ?? "a while" }),
        detail: i18n.t("composer:composerShelfUtils.detail"),
        live: false,
      };
    case "retrying":
    case "failed":
      return { text: args.turnError, detail: null, live: false };
    case "done":
    case "stopped":
      return { text: null, detail: null, live: false };
    case "active":
      break;
  }
  if (args.countsHeadline) {
    return { text: args.countsHeadline, detail: null, live: true };
  }
  if (args.featured) {
    const detail =
      args.featured.detail && args.featured.detail !== args.featured.title
        ? args.featured.detail
        : null;
    return { text: args.featured.title, detail, live: true };
  }
  return {
    text: args.isPlanPreparing ? i18n.t("composer:composerShelfUtils.text5") : null,
    detail: null,
    live: args.isPlanPreparing,
  };
}

/** The turn tones an agent run's line still has to say while it heads the shelf. */
export type ShelfTurnAlertTone = Extract<ShelfRunTone, "steering" | "stalled" | "retrying" | "failed">;

export interface ShelfTurnAlert {
  tone: ShelfTurnAlertTone;
  label: string;
  text: string | null;
  detail: string | null;
}

/**
 * What the turn under an agent run (or legacy run) needs said that the
 * run's own line cannot know: a stall and how to break it, a steer in flight,
 * a provider retry or a failure. Same tones and words as the turn's line; the
 * ordinary tones (working, waiting on a card, done) stay the run's to say.
 */
export function resolveShelfTurnAlert(args: {
  activity: Pick<
    ProviderTurnActivitySnapshot,
    | "completedAt"
    | "lastEventAt"
    | "pendingInteraction"
    | "stalledAt"
    | "turnError"
    | "turnErrorRecoverable"
  > | null;
  steering: boolean;
  now: number;
}): ShelfTurnAlert | null {
  const { activity } = args;
  const completed = activity?.completedAt != null;
  const pendingInteraction = activity?.pendingInteraction ?? null;
  const turnError = activity?.turnError ?? null;
  const isStalled = activity?.stalledAt != null && !completed && pendingInteraction == null;
  const tone = resolveTurnRunTone({
    pendingInteraction,
    isStalled,
    steering: args.steering,
    turnError,
    turnErrorRecoverable: activity?.turnErrorRecoverable ?? false,
    completed,
  });
  if (tone !== "steering" && tone !== "stalled" && tone !== "retrying" && tone !== "failed") {
    return null;
  }
  const headline = resolveTurnRunHeadline({
    tone,
    pendingInteraction,
    hasPendingInteractionCard: false,
    turnError,
    idleLabel: isStalled ? formatProviderTurnIdleDuration({ activity, now: args.now }) : null,
    featured: null,
    countsHeadline: null,
    isPlanPreparing: false,
  });
  return {
    tone,
    label: describeTurnRunLabel(tone, pendingInteraction),
    text: headline.text,
    detail: headline.detail,
  };
}

export type ShelfSegment = "done" | "active" | "pending";

export interface ShelfTodoProgress {
  done: number;
  total: number;
  segments: ShelfSegment[];
}

/** Ten cells read at a glance; more would turn the line into a ruler. */
export const SHELF_PROGRESS_MAX_SEGMENTS = 10;

/**
 * The turn's to-do list as `3/7` plus one cell per item (scaled down past ten).
 * Even a single step is progress the user should see.
 */
export function summarizeShelfTodos(
  todos: readonly { status: "pending" | "in_progress" | "completed" }[],
  maxSegments = SHELF_PROGRESS_MAX_SEGMENTS,
): ShelfTodoProgress | null {
  const total = todos.length;
  if (total === 0) {
    return null;
  }
  const done = todos.filter((todo) => todo.status === "completed").length;
  const running = todos.some((todo) => todo.status === "in_progress");
  if (total <= maxSegments) {
    return {
      done,
      total,
      segments: todos.map((todo) =>
        todo.status === "completed"
          ? "done"
          : todo.status === "in_progress"
            ? "active"
            : "pending",
      ),
    };
  }
  const filled = Math.floor((done / total) * maxSegments);
  const segments: ShelfSegment[] = Array.from({ length: maxSegments }, (_, index) =>
    index < filled
      ? "done"
      : index === filled && running
        ? "active"
        : "pending",
  );
  return { done, total, segments };
}

// ── Queue line ───────────────────────────────────────────────────────────

/**
 * A queue written by an older build kept one `queuedNextTurn`. It still shows,
 * but it has no dispatchable id, so no action may target it.
 */
export function resolveVisibleQueuedTurns(args: {
  queuedTurns: readonly PromptDraftQueuedTurn[];
  queuedNextTurn: PromptDraftQueuedNextTurn | null | undefined;
}): readonly PromptDraftQueuedTurn[] {
  if (args.queuedTurns.length > 0) {
    return args.queuedTurns;
  }
  const legacy = args.queuedNextTurn;
  if (!legacy?.content?.trim()) {
    return args.queuedTurns;
  }
  return [
    {
      id: `legacy-${legacy.queuedAt}`,
      queuedAt: legacy.queuedAt,
      sourceTurnId: legacy.sourceTurnId,
      content: legacy.content,
      attachedFilePaths: [],
      attachments: [],
    },
  ];
}

export interface QueuedTurnActions {
  /** Steer a queued item into the turn that is running now. */
  canSteer: boolean;
  /** Dispatch a queued item as a new turn now (no live turn to wait for). */
  canSend: boolean;
}

/**
 * Send-now is the idle composer's action and Steer the live turn's; they never
 * appear together. Neither targets a legacy item (`storedCount` counts only
 * real queue entries) or works while the composer is blocked.
 */
export function resolveQueuedTurnActions(args: {
  submitMode: "send" | "queue-next" | "steer-or-queue";
  disabled: boolean;
  isTurnActive: boolean;
  /** The running turn accepts steering (setting on, provider supports it, not stalled). */
  canSteerQueuedTurn: boolean;
  storedCount: number;
  hasSteerHandler: boolean;
  hasSendHandler: boolean;
}): QueuedTurnActions {
  const open = !args.disabled && args.storedCount > 0;
  return {
    canSteer:
      open && args.hasSteerHandler && args.canSteerQueuedTurn && args.isTurnActive,
    canSend: open && args.hasSendHandler && args.submitMode === "send",
  };
}

/** Attachments cannot ride along with a steer, so those items wait for dispatch. */
export function canSteerQueuedTurnItem(
  item: Pick<PromptDraftQueuedTurn, "attachedFilePaths" | "attachments">,
): boolean {
  return item.attachedFilePaths.length === 0 && item.attachments.length === 0;
}

export function summarizeQueuedTurnText(
  item: Pick<PromptDraftQueuedTurn, "content">,
): string {
  return (
    item.content.replace(/\s+/g, " ").trim() ||
    i18n.t("composer:composerShelfUtils.summarizeQueuedTurnText")
  );
}

/** `1 file · 2 images · 1 task`, or null when the item carries text only. */
export function describeQueuedTurnAttachments(
  item: Pick<PromptDraftQueuedTurn, "attachedFilePaths" | "attachments">,
): string | null {
  const files = item.attachedFilePaths.length;
  const images = item.attachments.filter(
    (attachment) => attachment.kind === "image",
  ).length;
  const tasks = item.attachments.filter(
    (attachment) => attachment.kind === "task-context",
  ).length;
  const parts = [
    files > 0 ? i18n.t("composer:counts.files", { count: files }) : null,
    images > 0 ? `${images} ${images === 1 ? "image" : "images"}` : null,
    tasks > 0 ? i18n.t("composer:counts.tasks", { count: tasks }) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export interface QueueLine {
  countLabel: string;
  preview: string;
  /** Why the queue is not sending on its own, shown after the count. */
  pausedLabel: string | null;
  /** The one action the collapsed line offers for the item that goes next. */
  frontAction: "steer" | "send" | "resume" | null;
  /** How the queue drains, for the line's description. */
  hint: string | null;
}

export function describeQueueLine(args: {
  items: readonly PromptDraftQueuedTurn[];
  actions: QueuedTurnActions;
  isTurnActive: boolean;
  pause?: QueuePauseReason | null;
}): QueueLine | null {
  const front = args.items[0];
  if (!front) {
    return null;
  }
  if (args.pause === "restart") {
    return {
      countLabel: i18n.t("session:remaining.presentationCopy338", { v1: args.items.length }),
      preview: summarizeQueuedTurnText(front),
      pausedLabel: "paused",
      // Nothing sends on its own until the user says the work still applies.
      frontAction: "resume",
      hint: i18n.t("composer:composerShelfUtils.hint"),
    };
  }
  if (args.pause === "usage-limit") {
    return {
      countLabel: i18n.t("session:remaining.presentationCopy339", { v1: args.items.length }),
      preview: summarizeQueuedTurnText(front),
      pausedLabel: "paused",
      // The limit line above owns Resume; a second copy here would compete.
      frontAction: null,
      hint: i18n.t("composer:composerShelfUtils.hint2"),
    };
  }
  const frontAction =
    args.actions.canSteer && canSteerQueuedTurnItem(front)
      ? "steer"
      : args.actions.canSend
        ? "send"
        : null;
  const hint = args.isTurnActive
    ? args.actions.canSteer
      ? i18n.t("composer:composerShelfUtils.hint3")
      : i18n.t("composer:composerShelfUtils.hint4")
    : args.actions.canSend
      ? i18n.t("composer:composerShelfUtils.hint5")
      : null;
  return {
    countLabel: i18n.t("session:remaining.presentationCopy340", { v1: args.items.length }),
    preview: summarizeQueuedTurnText(front),
    pausedLabel: null,
    frontAction,
    hint,
  };
}

// ── Usage-limit line ─────────────────────────────────────────────────────

export interface UsageLimitLine {
  /** `Claude usage limit`, or `Resumes at 3:41 PM` once armed. */
  label: string;
  armed: boolean;
  /** `resets 3:40 PM · in 1h 7m`; when the reset is unknown, says so. */
  detail: string;
  /** What Resume will do, for the line's description. */
  hint: string;
  /** "Resume at reset" needs a reset time that is still ahead. */
  canResumeAtReset: boolean;
  /** Dismiss forgets the pause; with a queue waiting, Clear all is the way out instead. */
  canDismiss: boolean;
}

export function describeUsageLimitLine(args: {
  pause: TaskUsageLimitPause;
  queuedCount: number;
  now: number;
  locale?: string;
}): UsageLimitLine {
  const { pause, now } = args;
  const provider = providerAccountUsageLabel(pause.providerId);
  // Window names are provider-specific (`Session`, `codex primary`), so they
  // stay in the description rather than the line.
  const ranOut = i18n.t("composer:composerShelfUtils.extraCopy170", { value1: provider, value2: pause.windowLabel ? ` (${pause.windowLabel})` : "" });
  const resumeTarget = pause.stoppedTurn
    ? args.queuedCount > 0
      ? i18n.t("composer:composerShelfUtils.extraCopy171", { value1: args.queuedCount })
      : i18n.t("composer:composerShelfUtils.extraCopy172")
    : i18n.t("composer:composerShelfUtils.extraCopy173", { value1: args.queuedCount });
  if (pause.autoResumeAt != null) {
    const seconds = pause.autoResumeAt / 1000;
    const countdown = formatResetCountdown(seconds, now);
    return {
      label: i18n.t("composer:composerShelfUtils.label", { value1: formatResetClock(seconds, now, args.locale) }),
      armed: true,
      detail: i18n.t("composer:composerShelfUtils.detail2", { value1: provider, value2: countdown && countdown !== "now" ? i18n.t("session:remaining.presentationCopy341", { v1: countdown }) : "" }),
      hint: i18n.t("composer:composerShelfUtils.hint6", { value1: ranOut, value2: resumeTarget }),
      canResumeAtReset: false,
      canDismiss: false,
    };
  }
  const resetSeconds = pause.resetsAt == null ? null : pause.resetsAt / 1000;
  const countdown = formatResetCountdown(resetSeconds, now);
  const resetAhead = resetSeconds != null && countdown !== "now";
  const detail =
    resetSeconds == null
      ? i18n.t("composer:composerShelfUtils.detail3")
      : resetAhead
        ? i18n.t("composer:composerShelfUtils.detail4", { value1: formatResetClock(resetSeconds, now, args.locale), value2: countdown })
        : i18n.t("composer:composerShelfUtils.detail5");
  return {
    label: i18n.t("composer:composerShelfUtils.label2", { value1: provider }),
    armed: false,
    detail,
    hint: `${ranOut} ${resumeTarget}`,
    canResumeAtReset: resetAhead,
    canDismiss: args.queuedCount === 0,
  };
}

/**
 * Move one queued item before or after another. Works on ids, so a list that
 * changed since the drag began (an item dispatched, another queued) is
 * reordered as it is now rather than written back as it was.
 */
export function reorderQueuedTurns<T extends { id: string }>(
  items: readonly T[],
  move: { sourceId: string; targetId: string; edge: "top" | "bottom" | null },
): readonly T[] {
  if (move.sourceId === move.targetId) {
    return items;
  }
  const source = items.find((item) => item.id === move.sourceId);
  if (!source || !items.some((item) => item.id === move.targetId)) {
    return items;
  }
  const rest = items.filter((item) => item.id !== move.sourceId);
  const targetIndex = rest.findIndex((item) => item.id === move.targetId);
  const insertAt = move.edge === "bottom" ? targetIndex + 1 : targetIndex;
  const next = [...rest.slice(0, insertAt), source, ...rest.slice(insertAt)];
  return next.every((item, index) => item === items[index]) ? items : next;
}

// ── Review line ──────────────────────────────────────────────────────────

export interface ReviewShelfLine {
  label: string;
  detail: string;
  tone: "active" | "ready" | "danger" | "muted";
}

function reviewModelLabel(child: ReviewShelfItem["child"]) {
  return child.requestedModel
    ? toHumanModelName({ model: child.requestedModel })
    : getProviderLabel({ providerId: child.providerId, variant: "short" });
}

/** One review in its own task: who reviews, and how far it got. */
export function describeReviewShelfLine(args: {
  item: ReviewShelfItem;
  now: number;
  /** What the structured findings say, once the review's reply is read. */
  findings?: ReviewShelfFindings | null;
}): ReviewShelfLine {
  const { child, status } = args.item;
  const model = reviewModelLabel(child);
  if (status === "running") {
    const elapsedMs = args.now - Date.parse(child.createdAt);
    return {
      label: i18n.t("composer:composerShelfUtils.label3"),
      detail: Number.isFinite(elapsedMs)
        ? `${model} · ${formatExchangeDuration(elapsedMs)}`
        : model,
      tone: "active",
    };
  }
  if (status === "ready") {
    const findings = args.findings;
    if (!findings) {
      return { label: i18n.t("composer:composerShelfUtils.label4"), detail: model, tone: "ready" };
    }
    if (findings.kind === "unreadable") {
      return { label: i18n.t("composer:composerShelfUtils.label5"), detail: i18n.t("composer:composerShelfUtils.detail6", { value1: model }), tone: "ready" };
    }
    return {
      label: findings.incomplete ? i18n.t("composer:composerShelfUtils.label6") : findings.recheck ? i18n.t("composer:composerShelfUtils.label7") : i18n.t("composer:composerShelfUtils.label8"),
      detail: `${model} · ${findings.text}`,
      tone: findings.blocking ? "danger" : "ready",
    };
  }
  const reason = child.reason?.trim();
  return {
    label: status === "stopped" ? i18n.t("composer:composerShelfUtils.label9") : i18n.t("composer:composerShelfUtils.label10"),
    detail: reason ? `${model} · ${reason}` : model,
    tone: status === "stopped" ? "muted" : "danger",
  };
}

/**
 * A review as the activity dialog's exchange: titled after its task, with
 * only the controls a one-turn read-only review has (open it, stop it). The
 * reviewer's full prompt is the review task's first message, which the
 * dialog's activity log reads.
 */
export function buildReviewExchange(args: {
  item: ReviewShelfItem;
  title: string;
  /** The review task's own messages, once read: its prompt and full answer. */
  transcript?: ReviewTranscript | null;
}): DelegationExchange {
  const exchange = fromDelegatedTask(args.item.child, {
    prompt:
      args.transcript?.prompt ??
      i18n.t("composer:composerShelfUtils.extraCopy174", { value1: args.title }),
  });
  // The ledger keeps a bounded copy of the answer; the task holds all of it.
  // The findings block is for Stave, so the written answer is shown alone.
  const fullReply = args.item.status === "ready" ? args.transcript?.reply : null;
  const reply = fullReply ? stripReviewFindingsBlock(fullReply) || fullReply : null;
  return {
    ...exchange,
    title: args.title,
    outcome: reply ? { ...exchange.outcome, result: reply } : exchange.outcome,
    actions: exchange.actions.filter((action) => action.id === "open" || action.id === "stop"),
  };
}

export interface ReviewTranscript {
  prompt: string | null;
  reply: string | null;
  /** The message the reply came from, when it was read from the task. */
  replyId?: string | null;
}

export type ReviewShelfFindings =
  | { kind: "unreadable" }
  | { kind: "summary"; text: string; blocking: boolean; recheck: boolean; incomplete: boolean };

/**
 * The shelf's reading of a review's structured findings. Blocking means a
 * critical finding, a request for changes, or an earlier finding still open.
 */
export function describeReviewShelfFindings(
  parsed: ParsedReviewFindings,
): ReviewShelfFindings {
  if (!parsed.ok) {
    return { kind: "unreadable" };
  }
  const summary = summarizeReviewFindings(parsed.report);
  return {
    kind: "summary",
    text: describeReviewFindingsSummary(summary),
    blocking:
      summary.bySeverity.critical > 0 ||
      summary.verdict === "request-changes" ||
      (summary.previous?.unresolved ?? 0) > 0 ||
      (summary.previous?.unchecked ?? 0) > 0 || summary.checkWarnings > 0,
    recheck: summary.previous !== null,
    incomplete: (summary.previous?.unchecked ?? 0) > 0 || summary.checkWarnings > 0,
  };
}

/** A review task's prompt (its first message) and its finished final answer. */
export function summarizeReviewTranscript(
  messages: readonly (Pick<ChatMessage, "role" | "content" | "isStreaming"> & { id?: string })[],
): ReviewTranscript {
  const prompt = messages.find((message) => message.role === "user" && message.content.trim());
  let reply: string | null = null;
  let replyId: string | null = null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role === "assistant" && !message.isStreaming && message.content.trim()) {
      reply = message.content.trim();
      replyId = message.id ?? null;
      break;
    }
  }
  return { prompt: prompt?.content.trim() ?? null, reply, replyId };
}
