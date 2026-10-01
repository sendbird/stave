/**
 * Supervisor domain: the pure half of a wake-up.
 *
 * A wake-up resumes one existing task — on a schedule, or when work that task
 * delegated finishes. It never creates a task — that is an automation's job, and
 * the boundary is asserted in `tests/agent-platform-boundaries.test.ts`.
 *
 * Used by:
 * - `electron/host-service/wake-up-runtime.ts` (the only executor)
 * - `electron/persistence/wake-up-store.ts` (row parsing)
 * - `electron/main/stave-mcp-server.ts` (MCP tool input schema)
 *
 * Everything here is pure: no clock, no I/O, no store. The runtime supplies
 * `now` and an observation of the task, and applies the returned decision. That
 * split is what makes defer / pause / stop / catch-up testable on a fake clock.
 *
 * This module has no `@/` imports on purpose: the host service bundles it
 * through a relative path.
 */
import { z } from "zod";
import type { ProviderId } from "../providers/provider.types";
import { MISSION_ACTIVE_WAKE_UP_DETAIL } from "./automatic-turn-owner";
import {
  computeNextAutomationRunAt,
  AutomationScheduleSchema,
  type AutomationSchedule,
} from "../automations";

export const WAKE_UP_LIMITS = Object.freeze({
  maxIdChars: 256,
  /**
   * Widths for ids the supervisor *reads* rather than mints, which must match
   * the run ledger's `RunIdSchema` bound rather than this file's own. A child
   * run id is derived (`child-task:<parentTaskId>:<delegationKey>`) and so runs
   * legitimately longer than a UUID; validating it against `maxIdChars` would
   * reject a legal row, and rejecting the read looks exactly like "nothing
   * finished" — the silent forever-scheduled wake-up this stage exists to
   * prevent.
   */
  maxLedgerIdChars: 300,
  /**
   * Wide enough that a completion key — wake-up id, outcome, run id, step id,
   * status, and the `:error` marker — always fits whole. Truncating it would be
   * worse than rejecting it: two steps of one run share a derived prefix, so a
   * clipped key could collide with a sibling's and drop that completion as an
   * already-handled duplicate.
   */
  maxIdempotencyKeyChars: 1_024,
  /**
   * Wake-up prompts are short standing instructions ("re-check CI, report
   * only on change"), not task briefs, and this row is replayed indefinitely.
   * Deliberately far below the automation prompt bound.
   */
  maxPromptChars: 10_000,
  maxReasonChars: 500,
  maxOccurrenceCap: 10_000,
  /** Skipped catch-up instants retained as rows after a long downtime. */
  maxRecordedSkips: 64,
  /** Hard bound on the catch-up walk so a year offline cannot spin the tick. */
  maxCatchUpSteps: 10_000,
  /** Occurrence rows retained per wake-up. */
  maxRetainedOccurrences: 100,
  /**
   * `fired` rows retained regardless of the cap above, because for a completion
   * they ARE the idempotency guard: the ledger keeps reporting a finished child
   * for as long as it is inside its own list window, so evicting that child's
   * row would let it wake the task a second time. Deferrals and skips must
   * never be able to crowd one out, hence a separate floor comfortably above
   * the ledger's list limit.
   *
   * A scheduled wake-up does not need this — its instants only move forward,
   * so a pruned instant can never come due again.
   */
  minRetainedFiredOccurrences: 256,
  /**
   * How deep the run-ledger completion feed reads. It MUST stay at or below
   * `minRetainedFiredOccurrences`: the retained `fired` rows are the
   * idempotency guard, so every completion the feed can still report must
   * still have its consumed receipt retained. A feed wider than the retention
   * would let pruning evict a consumed completion's receipt while the ledger
   * still reports it — which reads as brand new and wakes the task twice.
   * `tests/wake-up-policy.test.ts` pins the inequality.
   */
  maxCompletionFeedRows: 128,
  /**
   * A completion wake-up has no cadence to run out, and the turn it wakes can
   * delegate more work — which finishes, which wakes it again. An uncapped one
   * is therefore an unbounded recursion, so a completion wake-up created
   * without a cap gets this one and stops with `occurrence-cap-reached` rather
   * than running forever.
   */
  defaultCompletionOccurrenceCap: 20,
  /** Completions folded into a single wake-up. Older ones still consume. */
  maxCoalescedCompletions: 20,
});

const IdSchema = z.string().trim().min(1).max(WAKE_UP_LIMITS.maxIdChars);
/** Ids that originate in the run ledger. See `maxLedgerIdChars`. */
const LedgerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(WAKE_UP_LIMITS.maxLedgerIdChars);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The provider identity a wake-up was created against. If the task's identity
 * drifts from this, the wake-up pauses instead of firing a turn into a
 * runtime the user never agreed to.
 */
export const WakeUpFingerprintSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type WakeUpFingerprint = z.infer<
  typeof WakeUpFingerprintSchema
>;

export function formatWakeUpFingerprint(
  fingerprint: WakeUpFingerprint,
) {
  return `${fingerprint.providerId}:${fingerprint.model}`;
}

export function wakeUpFingerprintsMatch(
  left: WakeUpFingerprint,
  right: WakeUpFingerprint,
) {
  return (
    left.providerId === right.providerId &&
    left.model.trim() === right.model.trim()
  );
}

/* -------------------------------------------------------------------------- */
/* Trigger                                                                     */
/* -------------------------------------------------------------------------- */

export const WakeUpScheduleTriggerSchema = z
  .object({
    kind: z.literal("schedule"),
    schedule: AutomationScheduleSchema,
  })
  .strict();

/**
 * Wakes the task when work it delegated finishes. "Delegated work" means a
 * delegated-task run on the run ledger whose origin is this task — the taxonomy's
 * only durable delegation. It carries no configuration: the task it belongs to
 * already says which children to watch, and a field here would be a second
 * place to get that wrong.
 */
export const WakeUpCompletionTriggerSchema = z
  .object({
    kind: z.literal("completion"),
  })
  .strict();

export const WakeUpTriggerSchema = z.discriminatedUnion("kind", [
  WakeUpScheduleTriggerSchema,
  WakeUpCompletionTriggerSchema,
]);
export type WakeUpTrigger = z.infer<typeof WakeUpTriggerSchema>;

/* -------------------------------------------------------------------------- */
/* Completion observability                                                    */
/* -------------------------------------------------------------------------- */

/**
 * How completion can be seen for one task.
 *
 * - `provider_event`: the runtime itself reports that delegated work finished.
 * - `stave_owned`: Stave sees it in its own durable records, not the runtime's.
 * - `unsupported`: it cannot be seen at all.
 *
 * The third value is the point of the enum. A completion wake-up that cannot
 * observe completion would sit `scheduled` forever and leave its task looking
 * permanently busy, so it is refused at creation and stopped with
 * `completion-unobservable` if it ever loses observability — never silence.
 */
export const TASK_COMPLETION_OBSERVABILITY = [
  "provider_event",
  "stave_owned",
  "unsupported",
] as const;
export const TaskCompletionObservabilitySchema = z.enum(
  TASK_COMPLETION_OBSERVABILITY,
);
export type TaskCompletionObservability = z.infer<
  typeof TaskCompletionObservabilitySchema
>;

/**
 * The capability probe.
 *
 * Today every supported provider classifies `stave_owned`, and deliberately so:
 * a delegated task's terminal state is a run-ledger row that the delegated-task
 * coordinator writes, and neither runtime emits an event saying "the work I was
 * delegated is done". That is also why this is a function of the ledger rather
 * than of the provider — the two runtimes are symmetric here because the signal
 * never comes from them.
 *
 * `provider_event` stays in the enum because a runtime that reports delegated
 * completion natively should land inside this classification rather than beside
 * it; nothing returns it yet, and the callers already branch only on
 * `unsupported`.
 */
export function classifyTaskCompletionObservability(args: {
  providerId: ProviderId | null;
  /** False when no run-ledger reader is wired into the supervisor at all. */
  ledgerReadable: boolean;
}): TaskCompletionObservability {
  if (args.providerId !== "claude-code" && args.providerId !== "codex") {
    return "unsupported";
  }
  return args.ledgerReadable ? "stave_owned" : "unsupported";
}

/** The terminal statuses a delegated run can settle into. */
export const TASK_COMPLETION_STATUSES = [
  "completed",
  "failed",
  "cancelled",
  "interrupted",
] as const;
export const TaskCompletionStatusSchema = z.enum(TASK_COMPLETION_STATUSES);
export type TaskCompletionStatus = z.infer<typeof TaskCompletionStatusSchema>;

/**
 * One finished piece of delegated work, as the supervisor sees it.
 *
 * Identity, phase, and reason only. The child's transcript never crosses into
 * the parent — that boundary is the taxonomy's, and this shape is where it is
 * enforced for wake-ups.
 */
export const TaskCompletionSignalSchema = z
  .object({
    runId: LedgerIdSchema,
    stepId: LedgerIdSchema,
    /** Null while the delegated task was never actually minted. */
    delegatedTaskId: z
      .string()
      .trim()
      .max(WAKE_UP_LIMITS.maxLedgerIdChars)
      .nullable(),
    providerId: WakeUpFingerprintSchema.shape.providerId,
    status: TaskCompletionStatusSchema,
    reason: z.string().max(WAKE_UP_LIMITS.maxReasonChars).nullable(),
    completedAt: z.string().datetime(),
    /**
     * The ledger step's attempt when it settled. A retried delegation reuses
     * its run and step ids and bumps only the attempt, so without it a retry
     * that fails again would look like the already-consumed first failure and
     * never wake the parent a second time.
     */
    attempt: z.number().int().min(0).max(10).default(0),
  })
  .strict();
export type TaskCompletionSignal = z.infer<typeof TaskCompletionSignalSchema>;

/**
 * Stable per (run, step, attempt, terminal status) and never per delivery.
 * This is what makes a completion idempotent: the same finished child observed
 * on ten ticks yields one key, one occurrence row, and therefore one follow-up
 * turn. The attempt is part of the key on purpose — a retried attempt that
 * settles again is a new fact and must be able to wake the parent again.
 */
export function buildTaskCompletionSignalKey(signal: {
  runId: string;
  stepId: string;
  status: TaskCompletionStatus;
  attempt?: number;
}) {
  return `${signal.runId}:${signal.stepId}:${signal.attempt ?? 0}:${signal.status}`;
}

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

export const WAKE_UP_STATES = ["scheduled", "paused", "stopped"] as const;
export const WakeUpStateSchema = z.enum(WAKE_UP_STATES);
export type WakeUpState = z.infer<typeof WakeUpStateSchema>;

/**
 * Only `paused-by-user` is cleared by hand. The rest describe a condition the
 * supervisor is watching, and it resumes on its own once the condition lifts.
 */
export const WAKE_UP_PAUSE_REASONS = [
  "paused-by-user",
  "awaiting-approval",
  "awaiting-user-input",
  "runtime-changed",
  "task-identity-changed",
  /**
   * A mission owns this task's automatic turns (see
   * `automatic-turn-owner.ts`). Clears on its own when the mission ends.
   */
  "mission-active",
] as const;
export const WakeUpPauseReasonSchema = z.enum(
  WAKE_UP_PAUSE_REASONS,
);
export type WakeUpPauseReason = z.infer<
  typeof WakeUpPauseReasonSchema
>;

/**
 * All terminal. There is no user-initiated stop: removing a wake-up deletes
 * it, so a stopped one always means the supervisor ended it for a stated
 * reason, and resuming it is refused rather than silently ignoring that reason.
 */
export const WAKE_UP_STOP_REASONS = [
  "expired",
  "occurrence-cap-reached",
  "task-unavailable",
  /**
   * Completion cannot be observed for this task, so this wake-up would wait
   * forever. Terminal rather than paused: observability is a property of how
   * Stave is wired, not a condition that lifts on its own while the supervisor
   * watches, and a silent forever-scheduled wake-up is the exact failure this
   * layer exists to prevent.
   */
  "completion-unobservable",
] as const;
export const WakeUpStopReasonSchema = z.enum(
  WAKE_UP_STOP_REASONS,
);
export type WakeUpStopReason = z.infer<
  typeof WakeUpStopReasonSchema
>;

const AUTOMATIC_PAUSE_REASONS = new Set<WakeUpPauseReason>([
  "awaiting-approval",
  "awaiting-user-input",
  "runtime-changed",
  "task-identity-changed",
  "mission-active",
]);

/** A pause the supervisor set itself, and can therefore clear itself. */
export function isAutomaticWakeUpPause(reason: WakeUpPauseReason) {
  return AUTOMATIC_PAUSE_REASONS.has(reason);
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The definition input. Unlike an automation's, this REQUIRES a taskId: a wake-up
 * only ever adds a turn to a task that already exists.
 */
export const WakeUpUpsertInputSchema = z
  .object({
    workspaceId: IdSchema,
    taskId: IdSchema,
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(WAKE_UP_LIMITS.maxPromptChars),
    trigger: WakeUpTriggerSchema,
    /** Stop after this many fired occurrences. `null` means no cap. */
    maxOccurrences: z
      .number()
      .int()
      .min(1)
      .max(WAKE_UP_LIMITS.maxOccurrenceCap)
      .nullable()
      .default(null),
    /** Stop once the next occurrence would land after this instant. */
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict();
export type WakeUpUpsertInput = z.infer<
  typeof WakeUpUpsertInputSchema
>;

export const WakeUpSchema = WakeUpUpsertInputSchema.extend({
  id: IdSchema,
  repositoryPath: z.string().min(1),
  fingerprint: WakeUpFingerprintSchema,
  state: WakeUpStateSchema,
  pauseReason: WakeUpPauseReasonSchema.nullable(),
  stopReason: WakeUpStopReasonSchema.nullable(),
  /** The human sentence behind `pauseReason` / `stopReason`. */
  reasonDetail: z
    .string()
    .max(WAKE_UP_LIMITS.maxReasonChars)
    .nullable(),
  nextRunAt: z.string().datetime().nullable(),
  lastOccurrenceAt: z.string().datetime().nullable(),
  occurrenceCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((wakeUp, context) => {
  // A non-running wake-up that cannot say why is the failure mode this whole
  // layer exists to prevent, so it is a parse error rather than a UI fallback.
  if (wakeUp.state === "paused" && !wakeUp.pauseReason) {
    context.addIssue({
      code: "custom",
      path: ["pauseReason"],
      message: "A paused wake-up must carry a pause reason.",
    });
  }
  if (wakeUp.state === "stopped" && !wakeUp.stopReason) {
    context.addIssue({
      code: "custom",
      path: ["stopReason"],
      message: "A stopped wake-up must carry a stop reason.",
    });
  }
  if (wakeUp.state === "scheduled" && (wakeUp.pauseReason || wakeUp.stopReason)) {
    context.addIssue({
      code: "custom",
      path: ["state"],
      message: "A scheduled wake-up carries no pause or stop reason.",
    });
  }
});
export type WakeUp = z.infer<typeof WakeUpSchema>;

/* -------------------------------------------------------------------------- */
/* Occurrence                                                                  */
/* -------------------------------------------------------------------------- */

export const WAKE_UP_OCCURRENCE_OUTCOMES = [
  "fired",
  "deferred",
  "skipped",
] as const;
export const WakeUpOccurrenceOutcomeSchema = z.enum(
  WAKE_UP_OCCURRENCE_OUTCOMES,
);
export type WakeUpOccurrenceOutcome = z.infer<
  typeof WakeUpOccurrenceOutcomeSchema
>;

export const WakeUpOccurrenceSchema = z
  .object({
    id: IdSchema,
    wakeUpId: IdSchema,
    /**
     * Stable per (wake-up, outcome, scheduled instant). The store's unique
     * index turns a duplicate delivery — a double tick, a replayed catch-up —
     * into a no-op instead of a second turn.
     */
    idempotencyKey: z
      .string()
      .min(1)
      .max(WAKE_UP_LIMITS.maxIdempotencyKeyChars),
    workspaceId: IdSchema,
    taskId: IdSchema,
    turnId: IdSchema.nullable(),
    outcome: WakeUpOccurrenceOutcomeSchema,
    reason: z.string().max(WAKE_UP_LIMITS.maxReasonChars).nullable(),
    scheduledFor: z.string().datetime(),
    recordedAt: z.string().datetime(),
  })
  .strict();
export type WakeUpOccurrence = z.infer<
  typeof WakeUpOccurrenceSchema
>;

export function buildWakeUpIdempotencyKey(args: {
  wakeUpId: string;
  outcome: WakeUpOccurrenceOutcome;
  scheduledFor: string;
}) {
  return `${args.wakeUpId}:${args.outcome}:${args.scheduledFor}`;
}

/**
 * The completion-side counterpart. It keys on the completion itself rather than
 * on an instant, because two children can finish in the same millisecond and
 * keying by timestamp would silently drop one of them.
 *
 * Never truncated: `maxIdempotencyKeyChars` is sized so the whole key fits, and
 * clipping it would make two steps of one run — which share a derived prefix —
 * collide and lose a completion to a false duplicate.
 */
export function buildWakeUpCompletionIdempotencyKey(args: {
  wakeUpId: string;
  outcome: WakeUpOccurrenceOutcome;
  signalKey: string;
}) {
  return `${args.wakeUpId}:${args.outcome}:completion:${args.signalKey}`;
}

/**
 * Marks a consumed occurrence whose wake-up never actually reached the task, so
 * a boot sweep can tell "this completion was reported" from "this completion
 * was consumed and then dropped on the floor".
 */
export function buildWakeUpUnreportedKey(idempotencyKey: string) {
  return `${idempotencyKey}:error`;
}

/* -------------------------------------------------------------------------- */
/* Schedule walking                                                            */
/* -------------------------------------------------------------------------- */

export interface DueWakeUpOccurrences {
  /** The single instant that fires: the most recent one that came due. */
  dueAt: string | null;
  /** Earlier instants that came due while nothing was firing. Oldest first. */
  skippedAt: string[];
  /** True when more instants were missed than `maxRecordedSkips` retains. */
  truncated: boolean;
  /** Where the schedule resumes from. */
  nextRunAt: string;
}

/**
 * Catch-up, done once. After a restart (or a long pause) a wake-up can have
 * many instants in the past. Only the latest one fires — replaying a backlog of
 * turns into a live task is the opposite of what the user asked for — and the
 * earlier ones are recorded as skipped so the gap is visible rather than
 * silently swallowed.
 */
export function collectDueWakeUpOccurrences(args: {
  schedule: AutomationSchedule;
  nextRunAt: string;
  now: Date;
}): DueWakeUpOccurrences {
  const nowMs = args.now.getTime();
  const firstDueMs = Date.parse(args.nextRunAt);
  if (!Number.isFinite(firstDueMs) || firstDueMs > nowMs) {
    return {
      dueAt: null,
      skippedAt: [],
      truncated: false,
      nextRunAt: args.nextRunAt,
    };
  }

  const due: string[] = [args.nextRunAt];
  let cursor = args.nextRunAt;
  let steps = 0;
  let exhausted = false;
  for (;;) {
    const next = computeNextAutomationRunAt({
      schedule: args.schedule,
      after: cursor,
    });
    if (Date.parse(next) > nowMs) {
      cursor = next;
      break;
    }
    steps += 1;
    if (steps >= WAKE_UP_LIMITS.maxCatchUpSteps) {
      // Absurdly long downtime for this cadence. Re-anchor to now rather than
      // walk millions of instants; the skip count still reports the gap.
      exhausted = true;
      cursor = computeNextAutomationRunAt({ schedule: args.schedule, after: args.now });
      due.push(args.now.toISOString());
      break;
    }
    due.push(next);
    cursor = next;
  }

  const dueAt = due[due.length - 1] ?? null;
  const skipped = due.slice(0, -1);
  const truncated =
    exhausted || skipped.length > WAKE_UP_LIMITS.maxRecordedSkips;
  return {
    dueAt,
    skippedAt: truncated
      ? skipped.slice(-WAKE_UP_LIMITS.maxRecordedSkips)
      : skipped,
    truncated,
    nextRunAt: cursor,
  };
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

/** What the runtime observed about the task this tick. */
export interface WakeUpObservation {
  /**
   * False when the workspace itself could not be resolved. Kept separate from
   * `taskExists` on purpose: a workspace that is momentarily unreadable is a
   * recoverable pause, while a task that is genuinely gone is terminal, and
   * conflating them would let a transient read delete a wake-up for good.
   */
  workspaceAvailable: boolean;
  /** False when the workspace loaded but no longer contains the task. */
  taskExists: boolean;
  taskArchived: boolean;
  /** A turn is streaming right now. A user turn always wins over a wake-up. */
  hasActiveTurn: boolean;
  pendingApprovalCount: number;
  pendingUserInputCount: number;
  fingerprint: WakeUpFingerprint | null;
  /**
   * Result of `validateFleetQueueAction` against the live task. The supervisor
   * queues work onto a task from outside the task, which is exactly the
   * staleness question the fleet control plane already answers.
   */
  identity: { ok: true } | { ok: false; reason: string };
  /**
   * How completion can be seen for this task right now. Meaningless for a
   * schedule wake-up, which never reads it.
   */
  completionObservability: TaskCompletionObservability;
  /**
   * Delegated work that finished and has NOT been consumed by an earlier
   * wake-up. The runtime does that filtering against the durable occurrence
   * rows before calling in, which is what keeps this function pure and keeps
   * "was this already handled" a single question with a single answer.
   */
  completions: TaskCompletionSignal[];
  /**
   * A mission is running or paused on this task. It owns the task's automatic
   * turns, so the wake-up pauses until it ends.
   */
  missionActive: boolean;
}

export type WakeUpDecision =
  | { action: "idle" }
  | { action: "resume" }
  | { action: "defer"; dueAt: string; detail: string }
  | {
      action: "fire";
      dueAt: string;
      nextRunAt: string;
      skippedAt: string[];
      truncated: boolean;
    }
  | {
      /**
       * One wake-up for a batch of finished work. Every signal in `completions`
       * is consumed by this single turn: N children finishing together must not
       * stack N unattended turns onto a task.
       */
      action: "fire-completion";
      completions: TaskCompletionSignal[];
      observedAt: string;
    }
  | { action: "pause"; reason: WakeUpPauseReason; detail: string }
  | { action: "stop"; reason: WakeUpStopReason; detail: string };

/** Oldest first, with the signal key as a tiebreak so batching is deterministic. */
function compareCompletionSignals(
  left: TaskCompletionSignal,
  right: TaskCompletionSignal,
) {
  const delta = Date.parse(left.completedAt) - Date.parse(right.completedAt);
  if (delta !== 0 && Number.isFinite(delta)) {
    return delta;
  }
  return buildTaskCompletionSignalKey(left).localeCompare(
    buildTaskCompletionSignalKey(right),
  );
}

/** The instant a deferred completion batch is recorded against. */
function latestCompletionInstant(
  completions: TaskCompletionSignal[],
  now: Date,
) {
  let latest = Number.NEGATIVE_INFINITY;
  for (const completion of completions) {
    const parsed = Date.parse(completion.completedAt);
    if (Number.isFinite(parsed) && parsed > latest) {
      latest = parsed;
    }
  }
  return Number.isFinite(latest)
    ? new Date(latest).toISOString()
    : now.toISOString();
}

/**
 * The whole safety policy, in priority order. Read top to bottom: stop beats
 * pause, pause beats defer, defer beats fire.
 */
export function decideWakeUpAction(args: {
  wakeUp: WakeUp;
  observation: WakeUpObservation;
  now: Date;
}): WakeUpDecision {
  const { wakeUp, observation, now } = args;

  if (wakeUp.state === "stopped") {
    return { action: "idle" };
  }

  // 1. Terminal conditions. A stopped wake-up never wakes again, so these are
  //    checked before anything that could resume it. They are only trusted when
  //    the workspace actually loaded — see `workspaceAvailable`.
  if (!observation.workspaceAvailable) {
    return {
      action: "pause",
      reason: "task-identity-changed",
      detail: "This task's workspace is not loaded right now.",
    };
  }
  if (!observation.taskExists) {
    return {
      action: "stop",
      reason: "task-unavailable",
      detail: "The task this schedule checks back on no longer exists.",
    };
  }
  if (observation.taskArchived) {
    return {
      action: "stop",
      reason: "task-unavailable",
      detail: "The task this schedule checks back on was archived.",
    };
  }
  // A completion wake-up that cannot observe completion never fires. Saying so
  // is the whole point: the alternative is a wake-up that reads `scheduled`
  // forever while nothing is ever going to wake it.
  if (
    wakeUp.trigger.kind === "completion" &&
    observation.completionObservability === "unsupported"
  ) {
    return {
      action: "stop",
      reason: "completion-unobservable",
      detail:
        "Stave cannot observe when this task's subagents finish, so this schedule would never run.",
    };
  }
  if (wakeUp.expiresAt && Date.parse(wakeUp.expiresAt) <= now.getTime()) {
    return {
      action: "stop",
      reason: "expired",
      detail: `This schedule expired at ${wakeUp.expiresAt}.`,
    };
  }
  if (
    wakeUp.maxOccurrences !== null &&
    wakeUp.occurrenceCount >= wakeUp.maxOccurrences
  ) {
    return {
      action: "stop",
      reason: "occurrence-cap-reached",
      detail: `This schedule reached its limit of ${wakeUp.maxOccurrences} occurrences.`,
    };
  }

  // 2. A manual pause outranks every automatic one. Without this a pending
  //    approval would overwrite the user's pause reason, and answering it would
  //    then auto-resume a wake-up the user deliberately switched off.
  if (wakeUp.state === "paused" && wakeUp.pauseReason === "paused-by-user") {
    return { action: "idle" };
  }

  // One source of automatic turns per task: a mission outranks a wake-up.
  if (observation.missionActive) {
    return wakeUp.state === "paused" && wakeUp.pauseReason === "mission-active"
      ? { action: "idle" }
      : {
          action: "pause",
          reason: "mission-active",
          detail: MISSION_ACTIVE_WAKE_UP_DETAIL,
        };
  }

  // 3. Conditions that pause. Checked before dueness so the state is visible
  //    the moment it starts, not only at the next scheduled instant.
  if (!observation.identity.ok) {
    return {
      action: "pause",
      reason: "task-identity-changed",
      detail: observation.identity.reason,
    };
  }
  if (
    observation.fingerprint &&
    !wakeUpFingerprintsMatch(wakeUp.fingerprint, observation.fingerprint)
  ) {
    return {
      action: "pause",
      reason: "runtime-changed",
      detail: `The task now runs on ${formatWakeUpFingerprint(observation.fingerprint)}, not ${formatWakeUpFingerprint(wakeUp.fingerprint)}. Resume to accept the change.`,
    };
  }
  if (observation.pendingApprovalCount > 0) {
    return {
      action: "pause",
      reason: "awaiting-approval",
      detail: "The task is waiting on an approval.",
    };
  }
  if (observation.pendingUserInputCount > 0) {
    return {
      action: "pause",
      reason: "awaiting-user-input",
      detail: "The task is waiting on an answer.",
    };
  }

  // 4. Nothing is blocking. An automatic pause has served its purpose and the
  //    supervisor clears it; a manual pause was already handled above.
  if (wakeUp.state === "paused") {
    if (wakeUp.pauseReason && isAutomaticWakeUpPause(wakeUp.pauseReason)) {
      return { action: "resume" };
    }
    return { action: "idle" };
  }

  // 5. Completion. Its dueness question is "did anything finish that this
  //    wake-up has not already consumed", and the runtime has answered it by
  //    the time we get here. Everything above — stop, pause, and the deferral
  //    below — applies to a completion wake-up exactly as to a scheduled one.
  if (wakeUp.trigger.kind === "completion") {
    if (observation.completions.length === 0) {
      return { action: "idle" };
    }
    // The user's turn still wins. The completions stay unconsumed, so the next
    // tick sees the same batch (plus anything that finished meanwhile) rather
    // than losing the wake-up.
    if (observation.hasActiveTurn) {
      return {
        action: "defer",
        dueAt: latestCompletionInstant(observation.completions, now),
        detail: "The task is mid-turn; the schedule waits for it to finish.",
      };
    }
    return {
      action: "fire-completion",
      // Oldest first, and bounded: a backlog larger than this still consumes in
      // order, one wake-up per tick, instead of building one unbounded prompt.
      completions: [...observation.completions]
        .sort(compareCompletionSignals)
        .slice(0, WAKE_UP_LIMITS.maxCoalescedCompletions),
      observedAt: now.toISOString(),
    };
  }

  if (!wakeUp.nextRunAt) {
    return { action: "idle" };
  }

  const due = collectDueWakeUpOccurrences({
    schedule: wakeUp.trigger.schedule,
    nextRunAt: wakeUp.nextRunAt,
    now,
  });
  if (!due.dueAt) {
    return { action: "idle" };
  }

  // 6. The user's turn always wins. Deferring keeps the instant unconsumed, so
  //    the wake-up fires as soon as the task is free instead of losing a beat.
  if (observation.hasActiveTurn) {
    return {
      action: "defer",
      dueAt: due.dueAt,
      detail: "The task is mid-turn; the schedule waits for it to finish.",
    };
  }

  return {
    action: "fire",
    dueAt: due.dueAt,
    nextRunAt: due.nextRunAt,
    skippedAt: due.skippedAt,
    truncated: due.truncated,
  };
}

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

export function applyWakeUpDecision(args: {
  wakeUp: WakeUp;
  decision: WakeUpDecision;
  now: Date;
}): WakeUp {
  const { wakeUp, decision, now } = args;
  const updatedAt = now.toISOString();

  switch (decision.action) {
    case "idle":
    case "defer":
      return wakeUp;
    case "resume":
      return {
        ...wakeUp,
        state: "scheduled",
        pauseReason: null,
        stopReason: null,
        reasonDetail: null,
        // Resume from now rather than from the stale instant: a wake-up that
        // waited an hour on an approval must not fire the moment it is answered.
        nextRunAt:
          wakeUp.trigger.kind === "schedule"
            ? computeNextAutomationRunAt({
                schedule: wakeUp.trigger.schedule,
                after: now,
              })
            : null,
        updatedAt,
      };
    case "pause":
      return {
        ...wakeUp,
        state: "paused",
        pauseReason: decision.reason,
        stopReason: null,
        reasonDetail: decision.detail.slice(
          0,
          WAKE_UP_LIMITS.maxReasonChars,
        ),
        updatedAt,
      };
    case "stop":
      return {
        ...wakeUp,
        state: "stopped",
        pauseReason: null,
        stopReason: decision.reason,
        reasonDetail: decision.detail.slice(
          0,
          WAKE_UP_LIMITS.maxReasonChars,
        ),
        nextRunAt: null,
        updatedAt,
      };
    case "fire": {
      const occurrenceCount = wakeUp.occurrenceCount + 1;
      const skippedCount = wakeUp.skippedCount + decision.skippedAt.length;
      const fired: WakeUp = {
        ...wakeUp,
        state: "scheduled",
        pauseReason: null,
        stopReason: null,
        reasonDetail: null,
        occurrenceCount,
        skippedCount,
        lastOccurrenceAt: decision.dueAt,
        nextRunAt: decision.nextRunAt,
        updatedAt,
      };
      // Settle the terminal state on the same transition that earns it, so the
      // last occurrence and its reason land together.
      if (
        fired.maxOccurrences !== null &&
        occurrenceCount >= fired.maxOccurrences
      ) {
        return {
          ...fired,
          state: "stopped",
          stopReason: "occurrence-cap-reached",
          reasonDetail: `This schedule reached its limit of ${fired.maxOccurrences} occurrences.`,
          nextRunAt: null,
        };
      }
      if (
        fired.expiresAt &&
        Date.parse(decision.nextRunAt) > Date.parse(fired.expiresAt)
      ) {
        return {
          ...fired,
          state: "stopped",
          stopReason: "expired",
          reasonDetail: `This schedule expired at ${fired.expiresAt}.`,
          nextRunAt: null,
        };
      }
      return fired;
    }
    case "fire-completion": {
      // One wake-up, however many children it folded in. The cap therefore
      // bounds *turns*, which is the thing that recurses — a parent that
      // delegates ten children and is woken once has spent one occurrence.
      const occurrenceCount = wakeUp.occurrenceCount + 1;
      const latest = decision.completions[decision.completions.length - 1];
      const woken: WakeUp = {
        ...wakeUp,
        state: "scheduled",
        pauseReason: null,
        stopReason: null,
        reasonDetail: null,
        occurrenceCount,
        lastOccurrenceAt: latest?.completedAt ?? decision.observedAt,
        // A completion wake-up has no cadence, so there is no next instant to
        // advertise. It waits on the ledger, not on the clock.
        nextRunAt: null,
        updatedAt,
      };
      if (
        woken.maxOccurrences !== null &&
        occurrenceCount >= woken.maxOccurrences
      ) {
        return {
          ...woken,
          state: "stopped",
          stopReason: "occurrence-cap-reached",
          reasonDetail: `This schedule reached its limit of ${woken.maxOccurrences} occurrences.`,
        };
      }
      return woken;
    }
    default:
      decision satisfies never;
      return wakeUp;
  }
}

/**
 * A schedule wake-up may legitimately run forever — the user chose a cadence
 * and can see it. A completion wake-up cannot: the turn it wakes can delegate
 * more work, whose completion wakes it again, and nothing in that loop involves
 * the user. So an uncapped completion wake-up gets the default cap, which is
 * the whole of the recursion bound: the chain always ends, always with the
 * stated `occurrence-cap-reached` reason.
 */
export function resolveWakeUpOccurrenceCap(
  input: Pick<WakeUpUpsertInput, "trigger" | "maxOccurrences">,
) {
  if (input.trigger.kind !== "completion") {
    return input.maxOccurrences;
  }
  return (
    input.maxOccurrences ?? WAKE_UP_LIMITS.defaultCompletionOccurrenceCap
  );
}

export function createWakeUp(args: {
  id: string;
  input: WakeUpUpsertInput;
  repositoryPath: string;
  fingerprint: WakeUpFingerprint;
  now: Date;
}): WakeUp {
  const timestamp = args.now.toISOString();
  return WakeUpSchema.parse({
    ...args.input,
    maxOccurrences: resolveWakeUpOccurrenceCap(args.input),
    id: args.id,
    repositoryPath: args.repositoryPath,
    fingerprint: args.fingerprint,
    state: "scheduled",
    pauseReason: null,
    stopReason: null,
    reasonDetail: null,
    nextRunAt:
      args.input.trigger.kind === "schedule"
        ? computeNextAutomationRunAt({
            schedule: args.input.trigger.schedule,
            after: args.now,
          })
        : null,
    lastOccurrenceAt: null,
    occurrenceCount: 0,
    skippedCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

/* -------------------------------------------------------------------------- */
/* Surfacing                                                                   */
/* -------------------------------------------------------------------------- */

export interface WakeUpSummary {
  wakeUpId: string;
  taskId: string;
  /**
   * A completion wake-up has no `nextRunAt`, so without this the surface
   * cannot tell "waiting on delegated work" from "scheduled but broken".
   */
  triggerKind: WakeUpTrigger["kind"];
  state: WakeUpState;
  reason: string | null;
  nextRunAt: string | null;
  occurrenceCount: number;
  skippedCount: number;
}

/**
 * The shape the fleet surfaces read. Kept here so the renderer never has to
 * reconstruct a reason sentence from enum values.
 */
export function summarizeWakeUp(
  wakeUp: WakeUp,
): WakeUpSummary {
  return {
    wakeUpId: wakeUp.id,
    taskId: wakeUp.taskId,
    triggerKind: wakeUp.trigger.kind,
    state: wakeUp.state,
    reason: wakeUp.reasonDetail,
    nextRunAt: wakeUp.state === "scheduled" ? wakeUp.nextRunAt : null,
    occurrenceCount: wakeUp.occurrenceCount,
    skippedCount: wakeUp.skippedCount,
  };
}
