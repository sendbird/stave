/**
 * Task supervisor domain: the pure half of a heartbeat.
 *
 * A heartbeat wakes one existing task on a schedule, in the same provider
 * session. It never creates a task — that is a routine's job, and the boundary
 * is asserted in `tests/agent-platform-boundaries.test.ts`.
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
});

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
 * Designed, not implemented. A completion trigger wakes the task when a
 * delegated child run finishes; that executor lands with child tasks. The slot
 * exists now so the durable row shape does not have to change later, and the
 * runtime refuses to create one until then.
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

const IdSchema = z.string().trim().min(1).max(TASK_HEARTBEAT_LIMITS.maxIdChars);

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
    idempotencyKey: z.string().min(1).max(512),
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
  | { action: "pause"; reason: TaskHeartbeatPauseReason; detail: string }
  | { action: "stop"; reason: TaskHeartbeatStopReason; detail: string };

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

  // 5. The completion trigger has no executor yet; it must never fire early.
  if (heartbeat.trigger.kind !== "schedule") {
    return { action: "idle" };
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
    default:
      decision satisfies never;
      return heartbeat;
  }
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
    state: heartbeat.state,
    reason: heartbeat.reasonDetail,
    nextRunAt: heartbeat.state === "scheduled" ? heartbeat.nextRunAt : null,
    occurrenceCount: heartbeat.occurrenceCount,
    skippedCount: heartbeat.skippedCount,
  };
}
