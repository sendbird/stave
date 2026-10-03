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
import type {
  PromptDraftQueuedNextTurn,
  PromptDraftQueuedTurn,
} from "@/types/chat";

// ── Rows ─────────────────────────────────────────────────────────────────

/** What heads the run line: an active agent run (or playbook mission), else the turn. */
export type ShelfRunSource = "mission" | "turn";

export type ComposerShelfRow = "run" | "limit" | "queue";

/**
 * The run line names one thing. An active run owns it for its whole life, the
 * turns it starts included, so the turn never draws a second status beside it.
 */
export function resolveShelfRunSource(args: {
  missionActive: boolean;
  turnVisible: boolean;
}): ShelfRunSource | null {
  if (args.missionActive) {
    return "mission";
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
}): ComposerShelfRow[] {
  const rows: ComposerShelfRow[] = [];
  if (args.run) {
    rows.push("run");
  }
  if (args.limited) {
    rows.push("limit");
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
  missionId: string | null;
  turnId: string | null;
}): string | null {
  if (args.missionId) {
    return `mission:${args.missionId}`;
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
      return "Working";
    case "waiting":
      return pendingInteraction === "approval"
        ? "Waiting for approval"
        : "Waiting for your input";
    case "steering":
      return "Steering";
    case "stalled":
      return "Stalled";
    case "retrying":
      return "Retrying";
    case "failed":
      return "Failed";
    case "done":
      return "Done";
    case "stopped":
      return "Stopped";
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
            ? "Review to continue"
            : "Reply to continue",
        detail: null,
        live: false,
      };
    case "steering":
      return {
        text: "Waiting for the provider to accept your message",
        detail: null,
        live: false,
      };
    case "stalled":
      return {
        text: `No updates for ${args.idleLabel ?? "a while"}`,
        detail: "Esc stops it, or send a message to interrupt and continue",
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
    text: args.isPlanPreparing ? "Preparing the plan" : null,
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
 * What the turn under an agent run (or playbook mission) needs said that the
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
 * A single item is not a plan, so it shows nothing.
 */
export function summarizeShelfTodos(
  todos: readonly { status: "pending" | "in_progress" | "completed" }[],
  maxSegments = SHELF_PROGRESS_MAX_SEGMENTS,
): ShelfTodoProgress | null {
  const total = todos.length;
  if (total < 2) {
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
    "Queued follow-up with attached context."
  );
}

/** `1 file · 2 images`, or null when the item carries text only. */
export function describeQueuedTurnAttachments(
  item: Pick<PromptDraftQueuedTurn, "attachedFilePaths" | "attachments">,
): string | null {
  const files = item.attachedFilePaths.length;
  const images = item.attachments.filter(
    (attachment) => attachment.kind === "image",
  ).length;
  const parts = [
    files > 0 ? `${files} ${files === 1 ? "file" : "files"}` : null,
    images > 0 ? `${images} ${images === 1 ? "image" : "images"}` : null,
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
      countLabel: `${args.items.length} queued`,
      preview: summarizeQueuedTurnText(front),
      pausedLabel: "paused",
      // Nothing sends on its own until the user says the work still applies.
      frontAction: "resume",
      hint: "Restored after Stave restarted, so nothing sends on its own. Resume to send them in order, or edit them first.",
    };
  }
  if (args.pause === "usage-limit") {
    return {
      countLabel: `${args.items.length} queued`,
      preview: summarizeQueuedTurnText(front),
      pausedLabel: "paused",
      // The limit line above owns Resume; a second copy here would compete.
      frontAction: null,
      hint: "Waiting for the usage limit. They send in order once the task resumes.",
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
      ? "The next one sends when the current response finishes, or steer one into it now."
      : "The next one sends when the current response finishes."
    : args.actions.canSend
      ? "Send one now, or it sends after your next message finishes."
      : null;
  return {
    countLabel: `${args.items.length} queued`,
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
  const ranOut = `${provider} usage ran out${pause.windowLabel ? ` (${pause.windowLabel})` : ""}.`;
  const resumeTarget = pause.stoppedTurn
    ? args.queuedCount > 0
      ? `Resume continues the stopped turn, then sends ${args.queuedCount} queued.`
      : "Resume continues the stopped turn where it left off."
    : `Resume sends ${args.queuedCount} queued in order.`;
  if (pause.autoResumeAt != null) {
    const seconds = pause.autoResumeAt / 1000;
    const countdown = formatResetCountdown(seconds, now);
    return {
      label: `Resumes at ${formatResetClock(seconds, now, args.locale)}`,
      armed: true,
      detail: `${provider} usage limit${countdown && countdown !== "now" ? ` · in ${countdown}` : ""}`,
      hint: `${ranOut} Stave resumes on its own after the limit resets, while the app is open. ${resumeTarget}`,
      canResumeAtReset: false,
      canDismiss: false,
    };
  }
  const resetSeconds = pause.resetsAt == null ? null : pause.resetsAt / 1000;
  const countdown = formatResetCountdown(resetSeconds, now);
  const resetAhead = resetSeconds != null && countdown !== "now";
  const detail =
    resetSeconds == null
      ? "reset time unknown"
      : resetAhead
        ? `resets ${formatResetClock(resetSeconds, now, args.locale)} · in ${countdown}`
        : "reset time passed";
  return {
    label: `${provider} usage limit`,
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
