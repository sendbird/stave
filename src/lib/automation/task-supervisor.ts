/**
 * Task supervisor domain: the pure half of a heartbeat.
 *
 * A heartbeat wakes one existing task — on a schedule, or when work that task
 * delegated finishes. It never creates a task — that is a routine's job, and
 * the boundary is asserted in `tests/agent-platform-boundaries.test.ts`.
 *
 * Used by:
 * - `electron/host-service/task-supervisor-runtime.ts` (the only executor)
 * - `electron/persistence/task-heartbeat-store.ts` (row parsing)
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
import {
  computeNextRoutineRunAt,
  RoutineScheduleSchema,
  type RoutineSchedule,
} from "../routines";

export const TASK_HEARTBEAT_LIMITS = Object.freeze({
  maxIdChars: 256,
  /**
   * Widths for ids the supervisor *reads* rather than mints, which must match
   * the run ledger's `RunIdSchema` bound rather than this file's own. A child
   * run id is derived (`child-task:<parentTaskId>:<delegationKey>`) and so runs
   * legitimately longer than a UUID; validating it against `maxIdChars` would
   * reject a legal row, and rejecting the read looks exactly like "nothing
   * finished" — the silent forever-scheduled heartbeat this stage exists to
   * prevent.
   */
  maxLedgerIdChars: 300,
  /**
   * Wide enough that a completion key — heartbeat id, outcome, run id, step id,
   * status, and the `:error` marker — always fits whole. Truncating it would be
   * worse than rejecting it: two steps of one run share a derived prefix, so a
   * clipped key could collide with a sibling's and drop that completion as an
   * already-handled duplicate.
   */
  maxIdempotencyKeyChars: 1_024,
  /**
   * Heartbeat prompts are short standing instructions ("re-check CI, report
   * only on change"), not task briefs, and this row is replayed indefinitely.
   * Deliberately far below the routine prompt bound.
   */
  maxPromptChars: 10_000,
  maxReasonChars: 500,
  maxOccurrenceCap: 10_000,
  /** Skipped catch-up instants retained as rows after a long downtime. */
  maxRecordedSkips: 64,
  /** Hard bound on the catch-up walk so a year offline cannot spin the tick. */
  maxCatchUpSteps: 10_000,
  /** Occurrence rows retained per heartbeat. */
  maxRetainedOccurrences: 100,
  /**
   * `fired` rows retained regardless of the cap above, because for a completion
   * they ARE the idempotency guard: the ledger keeps reporting a finished child
   * for as long as it is inside its own list window, so evicting that child's
   * row would let it wake the task a second time. Deferrals and skips must
   * never be able to crowd one out, hence a separate floor comfortably above
   * the ledger's list limit.
   *
   * A scheduled heartbeat does not need this — its instants only move forward,
   * so a pruned instant can never come due again.
   */
  minRetainedFiredOccurrences: 256,
  /**
   * A completion heartbeat has no cadence to run out, and the turn it wakes can
   * delegate more work — which finishes, which wakes it again. An uncapped one
   * is therefore an unbounded recursion, so a completion heartbeat created
   * without a cap gets this one and stops with `occurrence-cap-reached` rather
   * than running forever.
   */
  defaultCompletionOccurrenceCap: 20,
  /** Completions folded into a single wake-up. Older ones still consume. */
  maxCoalescedCompletions: 20,
});

const IdSchema = z.string().trim().min(1).max(TASK_HEARTBEAT_LIMITS.maxIdChars);
/** Ids that originate in the run ledger. See `maxLedgerIdChars`. */
const LedgerIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(TASK_HEARTBEAT_LIMITS.maxLedgerIdChars);

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The provider identity a heartbeat was created against. If the task's identity
 * drifts from this, the heartbeat pauses instead of firing a turn into a
 * runtime the user never agreed to.
 */
export const TaskHeartbeatFingerprintSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
  })
  .strict();
export type TaskHeartbeatFingerprint = z.infer<
  typeof TaskHeartbeatFingerprintSchema
>;

export function formatTaskHeartbeatFingerprint(
  fingerprint: TaskHeartbeatFingerprint,
) {
  return `${fingerprint.providerId}:${fingerprint.model}`;
}

export function taskHeartbeatFingerprintsMatch(
  left: TaskHeartbeatFingerprint,
  right: TaskHeartbeatFingerprint,
) {
  return (
    left.providerId === right.providerId &&
    left.model.trim() === right.model.trim()
  );
}

/* -------------------------------------------------------------------------- */
/* Trigger                                                                     */
/* -------------------------------------------------------------------------- */

export const TaskHeartbeatScheduleTriggerSchema = z
  .object({
    kind: z.literal("schedule"),
    schedule: RoutineScheduleSchema,
  })
  .strict();

/**
 * Wakes the task when work it delegated finishes. "Delegated work" means a
 * child-task run on the run ledger whose origin is this task — the taxonomy's
 * only durable delegation. It carries no configuration: the task it belongs to
 * already says which children to watch, and a field here would be a second
 * place to get that wrong.
 */
export const TaskHeartbeatCompletionTriggerSchema = z
  .object({
    kind: z.literal("completion"),
  })
  .strict();

export const TaskHeartbeatTriggerSchema = z.discriminatedUnion("kind", [
  TaskHeartbeatScheduleTriggerSchema,
  TaskHeartbeatCompletionTriggerSchema,
]);
export type TaskHeartbeatTrigger = z.infer<typeof TaskHeartbeatTriggerSchema>;

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
 * The third value is the point of the enum. A completion heartbeat that cannot
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
 * a child task's terminal state is a run-ledger row that the child-task
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
  providerId: TaskHeartbeatFingerprint["providerId"] | null;
  /** False when no run-ledger reader is wired into the supervisor at all. */
  ledgerReadable: boolean;
}): TaskCompletionObservability {
  if (!args.providerId) {
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
    /** Null while the child task was never actually minted. */
    childTaskId: z
      .string()
      .trim()
      .max(TASK_HEARTBEAT_LIMITS.maxLedgerIdChars)
      .nullable(),
    providerId: TaskHeartbeatFingerprintSchema.shape.providerId,
    status: TaskCompletionStatusSchema,
    reason: z.string().max(TASK_HEARTBEAT_LIMITS.maxReasonChars).nullable(),
    completedAt: z.string().datetime(),
  })
  .strict();
export type TaskCompletionSignal = z.infer<typeof TaskCompletionSignalSchema>;

/**
 * Stable per (run, step, terminal status) and never per delivery. This is what
 * makes a completion idempotent: the same finished child observed on ten ticks
 * yields one key, one occurrence row, and therefore one follow-up turn.
 */
export function buildTaskCompletionSignalKey(signal: {
  runId: string;
  stepId: string;
  status: TaskCompletionStatus;
}) {
  return `${signal.runId}:${signal.stepId}:${signal.status}`;
}

/* -------------------------------------------------------------------------- */
/* State                                                                       */
/* -------------------------------------------------------------------------- */

export const TASK_HEARTBEAT_STATES = ["scheduled", "paused", "stopped"] as const;
export const TaskHeartbeatStateSchema = z.enum(TASK_HEARTBEAT_STATES);
export type TaskHeartbeatState = z.infer<typeof TaskHeartbeatStateSchema>;

/**
 * Only `paused-by-user` is cleared by hand. The rest describe a condition the
 * supervisor is watching, and it resumes on its own once the condition lifts.
 */
export const TASK_HEARTBEAT_PAUSE_REASONS = [
  "paused-by-user",
  "awaiting-approval",
  "awaiting-user-input",
  "runtime-changed",
  "task-identity-changed",
] as const;
export const TaskHeartbeatPauseReasonSchema = z.enum(
  TASK_HEARTBEAT_PAUSE_REASONS,
);
export type TaskHeartbeatPauseReason = z.infer<
  typeof TaskHeartbeatPauseReasonSchema
>;

/**
 * All terminal. There is no user-initiated stop: removing a heartbeat deletes
 * it, so a stopped one always means the supervisor ended it for a stated
 * reason, and resuming it is refused rather than silently ignoring that reason.
 */
export const TASK_HEARTBEAT_STOP_REASONS = [
  "expired",
  "occurrence-cap-reached",
  "task-unavailable",
  /**
   * Completion cannot be observed for this task, so this heartbeat would wait
   * forever. Terminal rather than paused: observability is a property of how
   * Stave is wired, not a condition that lifts on its own while the supervisor
   * watches, and a silent forever-scheduled heartbeat is the exact failure this
   * layer exists to prevent.
   */
  "completion-unobservable",
] as const;
export const TaskHeartbeatStopReasonSchema = z.enum(
  TASK_HEARTBEAT_STOP_REASONS,
);
export type TaskHeartbeatStopReason = z.infer<
  typeof TaskHeartbeatStopReasonSchema
>;

const AUTOMATIC_PAUSE_REASONS = new Set<TaskHeartbeatPauseReason>([
  "awaiting-approval",
  "awaiting-user-input",
  "runtime-changed",
  "task-identity-changed",
]);

/** A pause the supervisor set itself, and can therefore clear itself. */
export function isAutomaticTaskHeartbeatPause(reason: TaskHeartbeatPauseReason) {
  return AUTOMATIC_PAUSE_REASONS.has(reason);
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The definition input. Unlike a routine's, this REQUIRES a taskId: a heartbeat
 * only ever adds a turn to a task that already exists.
 */
export const TaskHeartbeatUpsertInputSchema = z
  .object({
    workspaceId: IdSchema,
    taskId: IdSchema,
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(TASK_HEARTBEAT_LIMITS.maxPromptChars),
    trigger: TaskHeartbeatTriggerSchema,
    /** Stop after this many fired occurrences. `null` means no cap. */
    maxOccurrences: z
      .number()
      .int()
      .min(1)
      .max(TASK_HEARTBEAT_LIMITS.maxOccurrenceCap)
      .nullable()
      .default(null),
    /** Stop once the next occurrence would land after this instant. */
    expiresAt: z.string().datetime().nullable().default(null),
  })
  .strict();
export type TaskHeartbeatUpsertInput = z.infer<
  typeof TaskHeartbeatUpsertInputSchema
>;

export const TaskHeartbeatSchema = TaskHeartbeatUpsertInputSchema.extend({
  id: IdSchema,
  projectPath: z.string().min(1),
  fingerprint: TaskHeartbeatFingerprintSchema,
  state: TaskHeartbeatStateSchema,
  pauseReason: TaskHeartbeatPauseReasonSchema.nullable(),
  stopReason: TaskHeartbeatStopReasonSchema.nullable(),
  /** The human sentence behind `pauseReason` / `stopReason`. */
  reasonDetail: z
    .string()
    .max(TASK_HEARTBEAT_LIMITS.maxReasonChars)
    .nullable(),
  nextRunAt: z.string().datetime().nullable(),
  lastOccurrenceAt: z.string().datetime().nullable(),
  occurrenceCount: z.number().int().min(0),
  skippedCount: z.number().int().min(0),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).superRefine((heartbeat, context) => {
  // A non-running heartbeat that cannot say why is the failure mode this whole
  // layer exists to prevent, so it is a parse error rather than a UI fallback.
  if (heartbeat.state === "paused" && !heartbeat.pauseReason) {
    context.addIssue({
      code: "custom",
      path: ["pauseReason"],
      message: "A paused heartbeat must carry a pause reason.",
    });
  }
  if (heartbeat.state === "stopped" && !heartbeat.stopReason) {
    context.addIssue({
      code: "custom",
      path: ["stopReason"],
      message: "A stopped heartbeat must carry a stop reason.",
    });
  }
  if (heartbeat.state === "scheduled" && (heartbeat.pauseReason || heartbeat.stopReason)) {
    context.addIssue({
      code: "custom",
      path: ["state"],
      message: "A scheduled heartbeat carries no pause or stop reason.",
    });
  }
});
export type TaskHeartbeat = z.infer<typeof TaskHeartbeatSchema>;

/* -------------------------------------------------------------------------- */
/* Occurrence                                                                  */
/* -------------------------------------------------------------------------- */

export const TASK_HEARTBEAT_OCCURRENCE_OUTCOMES = [
  "fired",
  "deferred",
  "skipped",
] as const;
export const TaskHeartbeatOccurrenceOutcomeSchema = z.enum(
  TASK_HEARTBEAT_OCCURRENCE_OUTCOMES,
);
export type TaskHeartbeatOccurrenceOutcome = z.infer<
  typeof TaskHeartbeatOccurrenceOutcomeSchema
>;

export const TaskHeartbeatOccurrenceSchema = z
  .object({
    id: IdSchema,
    heartbeatId: IdSchema,
    /**
     * Stable per (heartbeat, outcome, scheduled instant). The store's unique
     * index turns a duplicate delivery — a double tick, a replayed catch-up —
     * into a no-op instead of a second turn.
     */
    idempotencyKey: z
      .string()
      .min(1)
      .max(TASK_HEARTBEAT_LIMITS.maxIdempotencyKeyChars),
    workspaceId: IdSchema,
    taskId: IdSchema,
    turnId: IdSchema.nullable(),
    outcome: TaskHeartbeatOccurrenceOutcomeSchema,
    reason: z.string().max(TASK_HEARTBEAT_LIMITS.maxReasonChars).nullable(),
    scheduledFor: z.string().datetime(),
    recordedAt: z.string().datetime(),
  })
  .strict();
export type TaskHeartbeatOccurrence = z.infer<
  typeof TaskHeartbeatOccurrenceSchema
>;

export function buildTaskHeartbeatIdempotencyKey(args: {
  heartbeatId: string;
  outcome: TaskHeartbeatOccurrenceOutcome;
  scheduledFor: string;
}) {
  return `${args.heartbeatId}:${args.outcome}:${args.scheduledFor}`;
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
export function buildTaskHeartbeatCompletionIdempotencyKey(args: {
  heartbeatId: string;
  outcome: TaskHeartbeatOccurrenceOutcome;
  signalKey: string;
}) {
  return `${args.heartbeatId}:${args.outcome}:completion:${args.signalKey}`;
}

/**
 * Marks a consumed occurrence whose wake-up never actually reached the task, so
 * a boot sweep can tell "this completion was reported" from "this completion
 * was consumed and then dropped on the floor".
 */
export function buildTaskHeartbeatUnreportedKey(idempotencyKey: string) {
  return `${idempotencyKey}:error`;
}

/* -------------------------------------------------------------------------- */
/* Schedule walking                                                            */
/* -------------------------------------------------------------------------- */

export interface DueTaskHeartbeatOccurrences {
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
 * Catch-up, done once. After a restart (or a long pause) a heartbeat can have
 * many instants in the past. Only the latest one fires — replaying a backlog of
 * turns into a live task is the opposite of what the user asked for — and the
 * earlier ones are recorded as skipped so the gap is visible rather than
 * silently swallowed.
 */
export function collectDueTaskHeartbeatOccurrences(args: {
  schedule: RoutineSchedule;
  nextRunAt: string;
  now: Date;
}): DueTaskHeartbeatOccurrences {
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
    const next = computeNextRoutineRunAt({
      schedule: args.schedule,
      after: cursor,
    });
    if (Date.parse(next) > nowMs) {
      cursor = next;
      break;
    }
    steps += 1;
    if (steps >= TASK_HEARTBEAT_LIMITS.maxCatchUpSteps) {
      // Absurdly long downtime for this cadence. Re-anchor to now rather than
      // walk millions of instants; the skip count still reports the gap.
      exhausted = true;
      cursor = computeNextRoutineRunAt({ schedule: args.schedule, after: args.now });
      due.push(args.now.toISOString());
      break;
    }
    due.push(next);
    cursor = next;
  }

  const dueAt = due[due.length - 1] ?? null;
  const skipped = due.slice(0, -1);
  const truncated =
    exhausted || skipped.length > TASK_HEARTBEAT_LIMITS.maxRecordedSkips;
  return {
    dueAt,
    skippedAt: truncated
      ? skipped.slice(-TASK_HEARTBEAT_LIMITS.maxRecordedSkips)
      : skipped,
    truncated,
    nextRunAt: cursor,
  };
}

/* -------------------------------------------------------------------------- */
/* Decision                                                                    */
/* -------------------------------------------------------------------------- */

/** What the runtime observed about the task this tick. */
export interface TaskHeartbeatObservation {
  /**
   * False when the workspace itself could not be resolved. Kept separate from
   * `taskExists` on purpose: a workspace that is momentarily unreadable is a
   * recoverable pause, while a task that is genuinely gone is terminal, and
   * conflating them would let a transient read delete a heartbeat for good.
   */
  workspaceAvailable: boolean;
  /** False when the workspace loaded but no longer contains the task. */
  taskExists: boolean;
  taskArchived: boolean;
  /** A turn is streaming right now. A user turn always wins over a heartbeat. */
  hasActiveTurn: boolean;
  pendingApprovalCount: number;
  pendingUserInputCount: number;
  fingerprint: TaskHeartbeatFingerprint | null;
  /**
   * Result of `validateFleetQueueAction` against the live task. The supervisor
   * queues work onto a task from outside the task, which is exactly the
   * staleness question the fleet control plane already answers.
   */
  identity: { ok: true } | { ok: false; reason: string };
  /**
   * How completion can be seen for this task right now. Meaningless for a
   * schedule heartbeat, which never reads it.
   */
  completionObservability: TaskCompletionObservability;
  /**
   * Delegated work that finished and has NOT been consumed by an earlier
   * wake-up. The runtime does that filtering against the durable occurrence
   * rows before calling in, which is what keeps this function pure and keeps
   * "was this already handled" a single question with a single answer.
   */
  completions: TaskCompletionSignal[];
}

export type TaskHeartbeatDecision =
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
  | { action: "pause"; reason: TaskHeartbeatPauseReason; detail: string }
  | { action: "stop"; reason: TaskHeartbeatStopReason; detail: string };

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
export function decideTaskHeartbeatAction(args: {
  heartbeat: TaskHeartbeat;
  observation: TaskHeartbeatObservation;
  now: Date;
}): TaskHeartbeatDecision {
  const { heartbeat, observation, now } = args;

  if (heartbeat.state === "stopped") {
    return { action: "idle" };
  }

  // 1. Terminal conditions. A stopped heartbeat never wakes again, so these are
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
      detail: "The task this heartbeat watches no longer exists.",
    };
  }
  if (observation.taskArchived) {
    return {
      action: "stop",
      reason: "task-unavailable",
      detail: "The task this heartbeat watches was archived.",
    };
  }
  // A completion heartbeat that cannot observe completion never fires. Saying so
  // is the whole point: the alternative is a heartbeat that reads `scheduled`
  // forever while nothing is ever going to wake it.
  if (
    heartbeat.trigger.kind === "completion" &&
    observation.completionObservability === "unsupported"
  ) {
    return {
      action: "stop",
      reason: "completion-unobservable",
      detail:
        "Stave cannot observe when this task's delegated work finishes, so this heartbeat would never fire.",
    };
  }
  if (heartbeat.expiresAt && Date.parse(heartbeat.expiresAt) <= now.getTime()) {
    return {
      action: "stop",
      reason: "expired",
      detail: `This heartbeat expired at ${heartbeat.expiresAt}.`,
    };
  }
  if (
    heartbeat.maxOccurrences !== null &&
    heartbeat.occurrenceCount >= heartbeat.maxOccurrences
  ) {
    return {
      action: "stop",
      reason: "occurrence-cap-reached",
      detail: `This heartbeat reached its limit of ${heartbeat.maxOccurrences} occurrences.`,
    };
  }

  // 2. A manual pause outranks every automatic one. Without this a pending
  //    approval would overwrite the user's pause reason, and answering it would
  //    then auto-resume a heartbeat the user deliberately switched off.
  if (heartbeat.state === "paused" && heartbeat.pauseReason === "paused-by-user") {
    return { action: "idle" };
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
    !taskHeartbeatFingerprintsMatch(heartbeat.fingerprint, observation.fingerprint)
  ) {
    return {
      action: "pause",
      reason: "runtime-changed",
      detail: `The task now runs on ${formatTaskHeartbeatFingerprint(observation.fingerprint)}, not ${formatTaskHeartbeatFingerprint(heartbeat.fingerprint)}. Resume to accept the change.`,
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
  if (heartbeat.state === "paused") {
    if (heartbeat.pauseReason && isAutomaticTaskHeartbeatPause(heartbeat.pauseReason)) {
      return { action: "resume" };
    }
    return { action: "idle" };
  }

  // 5. Completion. Its dueness question is "did anything finish that this
  //    heartbeat has not already consumed", and the runtime has answered it by
  //    the time we get here. Everything above — stop, pause, and the deferral
  //    below — applies to a completion wake-up exactly as to a scheduled one.
  if (heartbeat.trigger.kind === "completion") {
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
        detail: "The task is mid-turn; the completion wake-up waits for it to finish.",
      };
    }
    return {
      action: "fire-completion",
      // Oldest first, and bounded: a backlog larger than this still consumes in
      // order, one wake-up per tick, instead of building one unbounded prompt.
      completions: [...observation.completions]
        .sort(compareCompletionSignals)
        .slice(0, TASK_HEARTBEAT_LIMITS.maxCoalescedCompletions),
      observedAt: now.toISOString(),
    };
  }

  if (!heartbeat.nextRunAt) {
    return { action: "idle" };
  }

  const due = collectDueTaskHeartbeatOccurrences({
    schedule: heartbeat.trigger.schedule,
    nextRunAt: heartbeat.nextRunAt,
    now,
  });
  if (!due.dueAt) {
    return { action: "idle" };
  }

  // 6. The user's turn always wins. Deferring keeps the instant unconsumed, so
  //    the heartbeat fires as soon as the task is free instead of losing a beat.
  if (observation.hasActiveTurn) {
    return {
      action: "defer",
      dueAt: due.dueAt,
      detail: "The task is mid-turn; the heartbeat waits for it to finish.",
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

export function applyTaskHeartbeatDecision(args: {
  heartbeat: TaskHeartbeat;
  decision: TaskHeartbeatDecision;
  now: Date;
}): TaskHeartbeat {
  const { heartbeat, decision, now } = args;
  const updatedAt = now.toISOString();

  switch (decision.action) {
    case "idle":
    case "defer":
      return heartbeat;
    case "resume":
      return {
        ...heartbeat,
        state: "scheduled",
        pauseReason: null,
        stopReason: null,
        reasonDetail: null,
        // Resume from now rather than from the stale instant: a heartbeat that
        // waited an hour on an approval must not fire the moment it is answered.
        nextRunAt:
          heartbeat.trigger.kind === "schedule"
            ? computeNextRoutineRunAt({
                schedule: heartbeat.trigger.schedule,
                after: now,
              })
            : null,
        updatedAt,
      };
    case "pause":
      return {
        ...heartbeat,
        state: "paused",
        pauseReason: decision.reason,
        stopReason: null,
        reasonDetail: decision.detail.slice(
          0,
          TASK_HEARTBEAT_LIMITS.maxReasonChars,
        ),
        updatedAt,
      };
    case "stop":
      return {
        ...heartbeat,
        state: "stopped",
        pauseReason: null,
        stopReason: decision.reason,
        reasonDetail: decision.detail.slice(
          0,
          TASK_HEARTBEAT_LIMITS.maxReasonChars,
        ),
        nextRunAt: null,
        updatedAt,
      };
    case "fire": {
      const occurrenceCount = heartbeat.occurrenceCount + 1;
      const skippedCount = heartbeat.skippedCount + decision.skippedAt.length;
      const fired: TaskHeartbeat = {
        ...heartbeat,
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
          reasonDetail: `This heartbeat reached its limit of ${fired.maxOccurrences} occurrences.`,
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
          reasonDetail: `This heartbeat expired at ${fired.expiresAt}.`,
          nextRunAt: null,
        };
      }
      return fired;
    }
    case "fire-completion": {
      // One wake-up, however many children it folded in. The cap therefore
      // bounds *turns*, which is the thing that recurses — a parent that
      // delegates ten children and is woken once has spent one occurrence.
      const occurrenceCount = heartbeat.occurrenceCount + 1;
      const latest = decision.completions[decision.completions.length - 1];
      const woken: TaskHeartbeat = {
        ...heartbeat,
        state: "scheduled",
        pauseReason: null,
        stopReason: null,
        reasonDetail: null,
        occurrenceCount,
        lastOccurrenceAt: latest?.completedAt ?? decision.observedAt,
        // A completion heartbeat has no cadence, so there is no next instant to
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
          reasonDetail: `This heartbeat reached its limit of ${woken.maxOccurrences} occurrences.`,
        };
      }
      return woken;
    }
    default:
      decision satisfies never;
      return heartbeat;
  }
}

/**
 * A schedule heartbeat may legitimately run forever — the user chose a cadence
 * and can see it. A completion heartbeat cannot: the turn it wakes can delegate
 * more work, whose completion wakes it again, and nothing in that loop involves
 * the user. So an uncapped completion heartbeat gets the default cap, which is
 * the whole of the recursion bound: the chain always ends, always with the
 * stated `occurrence-cap-reached` reason.
 */
export function resolveTaskHeartbeatOccurrenceCap(
  input: Pick<TaskHeartbeatUpsertInput, "trigger" | "maxOccurrences">,
) {
  if (input.trigger.kind !== "completion") {
    return input.maxOccurrences;
  }
  return (
    input.maxOccurrences ?? TASK_HEARTBEAT_LIMITS.defaultCompletionOccurrenceCap
  );
}

export function createTaskHeartbeat(args: {
  id: string;
  input: TaskHeartbeatUpsertInput;
  projectPath: string;
  fingerprint: TaskHeartbeatFingerprint;
  now: Date;
}): TaskHeartbeat {
  const timestamp = args.now.toISOString();
  return TaskHeartbeatSchema.parse({
    ...args.input,
    maxOccurrences: resolveTaskHeartbeatOccurrenceCap(args.input),
    id: args.id,
    projectPath: args.projectPath,
    fingerprint: args.fingerprint,
    state: "scheduled",
    pauseReason: null,
    stopReason: null,
    reasonDetail: null,
    nextRunAt:
      args.input.trigger.kind === "schedule"
        ? computeNextRoutineRunAt({
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

export interface TaskHeartbeatSummary {
  heartbeatId: string;
  taskId: string;
  /**
   * A completion heartbeat has no `nextRunAt`, so without this the surface
   * cannot tell "waiting on delegated work" from "scheduled but broken".
   */
  triggerKind: TaskHeartbeatTrigger["kind"];
  state: TaskHeartbeatState;
  reason: string | null;
  nextRunAt: string | null;
  occurrenceCount: number;
  skippedCount: number;
}

/**
 * The shape the fleet surfaces read. Kept here so the renderer never has to
 * reconstruct a reason sentence from enum values.
 */
export function summarizeTaskHeartbeat(
  heartbeat: TaskHeartbeat,
): TaskHeartbeatSummary {
  return {
    heartbeatId: heartbeat.id,
    taskId: heartbeat.taskId,
    triggerKind: heartbeat.trigger.kind,
    state: heartbeat.state,
    reason: heartbeat.reasonDetail,
    nextRunAt: heartbeat.state === "scheduled" ? heartbeat.nextRunAt : null,
    occurrenceCount: heartbeat.occurrenceCount,
    skippedCount: heartbeat.skippedCount,
  };
}
