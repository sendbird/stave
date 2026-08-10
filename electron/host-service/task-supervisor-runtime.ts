/**
 * Task supervisor: wakes existing tasks on a schedule, safely.
 *
 * Used by: `electron/host-service.ts` (constructs it, starts and stops it, and
 * dispatches `task-supervisor.invoke` actions to it).
 *
 * `runTask(taskId)` can already add a turn to an existing task in the same
 * provider session. What it lacks — and what lives here — is everything that
 * makes doing so unattended safe:
 *
 * - a user's turn always wins; a due occurrence defers rather than races it
 * - a task waiting on an approval or a question pauses instead of piling on
 * - a task whose provider/runtime identity drifted pauses until a human agrees
 * - archive, expiry, and the occurrence cap stop it, always with a reason
 * - a restart catches up exactly once: the latest instant fires, earlier ones
 *   are recorded as skipped
 * - every occurrence is idempotent, so a duplicate delivery is a no-op
 *
 * The decision policy itself is pure and lives in
 * `src/lib/automation/task-supervisor.ts`; this file is the I/O around it.
 */
import { randomUUID } from "node:crypto";
import {
  applyTaskHeartbeatDecision,
  buildTaskHeartbeatIdempotencyKey,
  createTaskHeartbeat,
  decideTaskHeartbeatAction,
  summarizeTaskHeartbeat,
  TaskHeartbeatUpsertInputSchema,
  TASK_HEARTBEAT_LIMITS,
  type TaskHeartbeat,
  type TaskHeartbeatObservation,
  type TaskHeartbeatOccurrence,
  type TaskHeartbeatOccurrenceOutcome,
  type TaskHeartbeatSummary,
  type TaskHeartbeatUpsertInput,
} from "../../src/lib/automation/task-supervisor";
import { validateFleetQueueAction } from "../../src/lib/fleet/control-plane";
import type { CanonicalRetrievedContextPart } from "../../src/lib/providers/provider.types";
import type { TaskSupervisionSnapshot } from "./local-mcp-runtime";

/**
 * Slower than the routine tick: a heartbeat's shortest cadence is a minute, and
 * every tick costs one task read per active heartbeat.
 */
const TASK_SUPERVISOR_TICK_INTERVAL_MS = 15_000;

interface TaskSupervisorPersistence {
  listTaskHeartbeats: () => TaskHeartbeat[];
  listActiveTaskHeartbeats: () => TaskHeartbeat[];
  listTaskHeartbeatsForWorkspace: (workspaceId: string) => TaskHeartbeat[];
  getTaskHeartbeat: (id: string) => TaskHeartbeat | null;
  getTaskHeartbeatByTaskId: (taskId: string) => TaskHeartbeat | null;
  upsertTaskHeartbeat: (heartbeat: TaskHeartbeat) => TaskHeartbeat;
  removeTaskHeartbeat: (id: string) => boolean;
  recordTaskHeartbeatOccurrence: (
    occurrence: TaskHeartbeatOccurrence,
  ) => boolean;
  attachTaskHeartbeatOccurrenceTurn: (args: {
    id: string;
    turnId: string;
  }) => void;
  listTaskHeartbeatOccurrences: (args: {
    heartbeatId: string;
    limit?: number;
  }) => TaskHeartbeatOccurrence[];
  pruneTaskHeartbeatOccurrences: (args: {
    heartbeatId: string;
    keep?: number;
  }) => number;
  completeInterruptedTurn: (args: { id: string }) => boolean;
}

interface TaskSupervisorRuntimeDependencies {
  persistence: TaskSupervisorPersistence;
  getTaskSupervisionSnapshot: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<TaskSupervisionSnapshot>;
  runHeartbeatTurn: (args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    retrievedContextParts?: CanonicalRetrievedContextPart[];
  }) => Promise<{ turnId: string }>;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface TaskHeartbeatSnapshot {
  heartbeats: TaskHeartbeat[];
  summaries: TaskHeartbeatSummary[];
}

export interface TaskSupervisorRuntime {
  start: () => void;
  stop: () => void;
  list: (args?: { workspaceId?: string }) => Promise<TaskHeartbeatSnapshot>;
  get: (args: { id: string }) => Promise<{
    heartbeat: TaskHeartbeat;
    occurrences: TaskHeartbeatOccurrence[];
  }>;
  create: (input: TaskHeartbeatUpsertInput) => Promise<TaskHeartbeat>;
  update: (args: {
    id: string;
    input: TaskHeartbeatUpsertInput;
  }) => Promise<TaskHeartbeat>;
  pause: (args: { id: string }) => Promise<TaskHeartbeat>;
  resume: (args: { id: string }) => Promise<TaskHeartbeat>;
  remove: (args: { id: string }) => Promise<{ ok: true; id: string }>;
}

function toSnapshot(heartbeats: TaskHeartbeat[]): TaskHeartbeatSnapshot {
  return {
    heartbeats,
    summaries: heartbeats.map(summarizeTaskHeartbeat),
  };
}

/**
 * Tells the woken model what woke it. Without this a heartbeat turn is
 * indistinguishable from the user typing, and the model asks questions nobody
 * is present to answer.
 */
function buildHeartbeatContextPart(args: {
  heartbeat: TaskHeartbeat;
  dueAt: string;
  occurrenceNumber: number;
}): CanonicalRetrievedContextPart {
  const cap = args.heartbeat.maxOccurrences
    ? ` of ${args.heartbeat.maxOccurrences}`
    : "";
  return {
    type: "retrieved_context",
    sourceId: "stave:task-heartbeat",
    title: "Scheduled Wake",
    content: [
      "A Stave heartbeat started this turn on a schedule. The user did not type this message and may not be watching.",
      `This is occurrence ${args.occurrenceNumber}${cap}, scheduled for ${args.dueAt}.`,
      "Report material changes only. Do not ask a question you cannot get answered — if you are blocked, say what is blocking you and stop.",
    ].join("\n"),
  };
}

export function createTaskSupervisorRuntime(
  dependencies: TaskSupervisorRuntimeDependencies,
): TaskSupervisorRuntime {
  const now = dependencies.now ?? (() => new Date());
  const setIntervalImpl = dependencies.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl =
    dependencies.clearInterval ?? globalThis.clearInterval;
  const { persistence } = dependencies;
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let operationChain = Promise.resolve();

  /**
   * Single-file ordering for every mutation and every tick. The host service is
   * one process, so this is the whole concurrency story: two ticks can never
   * interleave, and a create can never land between a tick's read and its write.
   */
  function enqueue<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = operationChain.then(operation, operation);
    operationChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  function requireHeartbeat(id: string) {
    const heartbeat = persistence.getTaskHeartbeat(id);
    if (!heartbeat) {
      throw new Error(`Heartbeat not found: ${id}`);
    }
    return heartbeat;
  }

  function buildObservation(args: {
    heartbeat: TaskHeartbeat;
    snapshot: TaskSupervisionSnapshot;
  }): TaskHeartbeatObservation {
    const { heartbeat, snapshot } = args;
    // The supervisor queues work onto a task from outside that task, which is
    // exactly the staleness question the fleet control plane already answers.
    const identity = validateFleetQueueAction({
      expected: {
        projectPath: heartbeat.projectPath,
        workspaceId: heartbeat.workspaceId,
        taskId: heartbeat.taskId,
      },
      current: {
        projectPath: snapshot.projectPath,
        workspaceId: snapshot.exists ? snapshot.workspaceId : null,
        taskId: snapshot.exists ? snapshot.taskId : null,
        turnId: snapshot.activeTurnId,
        messages: [],
      },
    });
    return {
      workspaceAvailable: Boolean(snapshot.projectPath),
      taskExists: snapshot.exists,
      taskArchived: snapshot.archived,
      hasActiveTurn: Boolean(snapshot.activeTurnId),
      pendingApprovalCount: snapshot.pendingApprovalCount,
      pendingUserInputCount: snapshot.pendingUserInputCount,
      fingerprint:
        snapshot.providerId && snapshot.model
          ? { providerId: snapshot.providerId, model: snapshot.model }
          : null,
      identity: identity.ok ? { ok: true } : { ok: false, reason: identity.reason },
    };
  }

  function recordOccurrence(args: {
    heartbeat: TaskHeartbeat;
    outcome: TaskHeartbeatOccurrenceOutcome;
    scheduledFor: string;
    reason: string | null;
  }) {
    const occurrence: TaskHeartbeatOccurrence = {
      id: randomUUID(),
      heartbeatId: args.heartbeat.id,
      idempotencyKey: buildTaskHeartbeatIdempotencyKey({
        heartbeatId: args.heartbeat.id,
        outcome: args.outcome,
        scheduledFor: args.scheduledFor,
      }),
      workspaceId: args.heartbeat.workspaceId,
      taskId: args.heartbeat.taskId,
      turnId: null,
      outcome: args.outcome,
      reason: args.reason
        ? args.reason.slice(0, TASK_HEARTBEAT_LIMITS.maxReasonChars)
        : null,
      scheduledFor: args.scheduledFor,
      recordedAt: now().toISOString(),
    };
    const recorded = persistence.recordTaskHeartbeatOccurrence(occurrence);
    return { recorded, occurrence };
  }

  function persistIfChanged(previous: TaskHeartbeat, next: TaskHeartbeat) {
    if (
      previous.state === next.state &&
      previous.pauseReason === next.pauseReason &&
      previous.stopReason === next.stopReason &&
      previous.reasonDetail === next.reasonDetail &&
      previous.nextRunAt === next.nextRunAt &&
      previous.occurrenceCount === next.occurrenceCount &&
      previous.skippedCount === next.skippedCount &&
      previous.lastOccurrenceAt === next.lastOccurrenceAt
    ) {
      // Nothing moved. Rewriting the row every tick would churn `updatedAt` and
      // make every heartbeat look freshly changed in the UI.
      return previous;
    }
    return persistence.upsertTaskHeartbeat(next);
  }

  async function evaluate(heartbeat: TaskHeartbeat) {
    const snapshot = await dependencies.getTaskSupervisionSnapshot({
      workspaceId: heartbeat.workspaceId,
      taskId: heartbeat.taskId,
    });
    const decision = decideTaskHeartbeatAction({
      heartbeat,
      observation: buildObservation({ heartbeat, snapshot }),
      now: now(),
    });

    if (decision.action === "idle") {
      return heartbeat;
    }

    if (decision.action === "defer") {
      // Collapsed by idempotency key, so a long user turn leaves one row per
      // missed instant rather than one per tick.
      recordOccurrence({
        heartbeat,
        outcome: "deferred",
        scheduledFor: decision.dueAt,
        reason: decision.detail,
      });
      return heartbeat;
    }

    if (decision.action !== "fire") {
      return persistIfChanged(
        heartbeat,
        applyTaskHeartbeatDecision({ heartbeat, decision, now: now() }),
      );
    }

    for (const skippedAt of decision.skippedAt) {
      recordOccurrence({
        heartbeat,
        outcome: "skipped",
        scheduledFor: skippedAt,
        reason: decision.truncated
          ? "Missed while Stave was not running; more occurrences were missed than are recorded."
          : "Missed while Stave was not running.",
      });
    }

    const fired = recordOccurrence({
      heartbeat,
      outcome: "fired",
      scheduledFor: decision.dueAt,
      reason: null,
    });
    if (!fired.recorded) {
      // The occurrence row is the idempotency guard: this instant was already
      // handled by an earlier delivery. Advance the schedule so the duplicate
      // cannot wedge the heartbeat, but do not start a second turn and do not
      // count it again — that would burn a slot of the occurrence cap.
      return persistIfChanged(heartbeat, {
        ...heartbeat,
        nextRunAt: decision.nextRunAt,
        updatedAt: now().toISOString(),
      });
    }
    const advanced = persistIfChanged(
      heartbeat,
      applyTaskHeartbeatDecision({ heartbeat, decision, now: now() }),
    );

    try {
      const turn = await dependencies.runHeartbeatTurn({
        workspaceId: heartbeat.workspaceId,
        taskId: heartbeat.taskId,
        prompt: heartbeat.prompt,
        retrievedContextParts: [
          buildHeartbeatContextPart({
            heartbeat,
            dueAt: decision.dueAt,
            occurrenceNumber: advanced.occurrenceCount,
          }),
        ],
      });
      persistence.attachTaskHeartbeatOccurrenceTurn({
        id: fired.occurrence.id,
        turnId: turn.turnId,
      });
    } catch (error) {
      // A failed start is not terminal: the task may simply have begun a turn
      // between the snapshot and the call. The reason is recorded and the next
      // tick re-evaluates from live state, which stops the heartbeat if the
      // task really is gone.
      persistence.recordTaskHeartbeatOccurrence({
        ...fired.occurrence,
        id: randomUUID(),
        idempotencyKey: `${fired.occurrence.idempotencyKey}:error`,
        outcome: "skipped",
        reason: (error instanceof Error
          ? error.message
          : "Failed to start the heartbeat turn."
        ).slice(0, TASK_HEARTBEAT_LIMITS.maxReasonChars),
        recordedAt: now().toISOString(),
      });
    }
    persistence.pruneTaskHeartbeatOccurrences({ heartbeatId: heartbeat.id });
    return advanced;
  }

  async function tick() {
    for (const heartbeat of persistence.listActiveTaskHeartbeats()) {
      try {
        await evaluate(heartbeat);
      } catch (error) {
        console.error("[task-supervisor] heartbeat evaluation failed", error, {
          heartbeatId: heartbeat.id,
          taskId: heartbeat.taskId,
        });
      }
    }
  }

  /**
   * Boot sweep. A turn a heartbeat started before Stave was killed is still
   * open in SQLite, so `hasActiveTurn` would be true forever and every later
   * occurrence would defer behind a turn that will never finish.
   */
  function closeInterruptedHeartbeatTurns() {
    for (const heartbeat of persistence.listActiveTaskHeartbeats()) {
      const latest = persistence
        .listTaskHeartbeatOccurrences({ heartbeatId: heartbeat.id, limit: 5 })
        .find((occurrence) => occurrence.outcome === "fired" && occurrence.turnId);
      if (latest?.turnId) {
        persistence.completeInterruptedTurn({ id: latest.turnId });
      }
    }
  }

  function start() {
    if (intervalHandle) {
      return;
    }
    closeInterruptedHeartbeatTurns();
    const enqueueTick = () => {
      void enqueue(tick).catch((error) => {
        console.error("[task-supervisor] tick failed", error);
      });
    };
    intervalHandle = setIntervalImpl(
      enqueueTick,
      TASK_SUPERVISOR_TICK_INTERVAL_MS,
    );
    // The first tick performs the restart catch-up: the latest missed instant
    // fires and the earlier ones land as skipped occurrences.
    enqueueTick();
  }

  function stop() {
    if (intervalHandle) {
      clearIntervalImpl(intervalHandle);
      intervalHandle = null;
    }
  }

  async function requireSupervisableTask(args: {
    workspaceId: string;
    taskId: string;
  }) {
    const snapshot = await dependencies.getTaskSupervisionSnapshot(args);
    if (!snapshot.exists || !snapshot.projectPath) {
      throw new Error(`Task not found: ${args.taskId}`);
    }
    if (snapshot.archived) {
      throw new Error("This task is archived, so it cannot be woken.");
    }
    if (!snapshot.providerId || !snapshot.model) {
      throw new Error("This task has no resolved provider yet.");
    }
    return snapshot;
  }

  return {
    start,
    stop,
    list: (args) =>
      enqueue(() =>
        toSnapshot(
          args?.workspaceId
            ? persistence.listTaskHeartbeatsForWorkspace(args.workspaceId)
            : persistence.listTaskHeartbeats(),
        ),
      ),
    get: ({ id }) =>
      enqueue(() => {
        const heartbeat = requireHeartbeat(id);
        return {
          heartbeat,
          occurrences: persistence.listTaskHeartbeatOccurrences({
            heartbeatId: id,
            limit: 20,
          }),
        };
      }),
    create: (rawInput) =>
      enqueue(async () => {
        const input = TaskHeartbeatUpsertInputSchema.parse(rawInput);
        if (input.trigger.kind !== "schedule") {
          throw new Error(
            "Completion heartbeats are not implemented yet. Use a schedule trigger.",
          );
        }
        const existing = persistence.getTaskHeartbeatByTaskId(input.taskId);
        if (existing && existing.state !== "stopped") {
          throw new Error(
            "This task already has a heartbeat. Update or remove it first.",
          );
        }
        const snapshot = await requireSupervisableTask({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        });
        if (existing) {
          // A stopped heartbeat is terminal but still occupies the task. Adding
          // a new one replaces it rather than resurrecting a stale reason.
          persistence.removeTaskHeartbeat(existing.id);
        }
        return persistence.upsertTaskHeartbeat(
          createTaskHeartbeat({
            id: randomUUID(),
            input,
            projectPath: snapshot.projectPath!,
            fingerprint: {
              providerId: snapshot.providerId!,
              model: snapshot.model!,
            },
            now: now(),
          }),
        );
      }),
    update: ({ id, input: rawInput }) =>
      enqueue(async () => {
        const input = TaskHeartbeatUpsertInputSchema.parse(rawInput);
        const current = requireHeartbeat(id);
        if (
          input.taskId !== current.taskId ||
          input.workspaceId !== current.workspaceId
        ) {
          throw new Error(
            "A heartbeat cannot be moved to another task. Remove it and add one there.",
          );
        }
        if (input.trigger.kind !== "schedule") {
          throw new Error(
            "Completion heartbeats are not implemented yet. Use a schedule trigger.",
          );
        }
        const snapshot = await requireSupervisableTask({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        });
        // An update is a fresh agreement: it re-captures the runtime identity
        // and clears any pause, including a runtime-changed one.
        const updated = createTaskHeartbeat({
          id: current.id,
          input,
          projectPath: snapshot.projectPath!,
          fingerprint: {
            providerId: snapshot.providerId!,
            model: snapshot.model!,
          },
          now: now(),
        });
        return persistence.upsertTaskHeartbeat({
          ...updated,
          createdAt: current.createdAt,
          occurrenceCount: current.occurrenceCount,
          skippedCount: current.skippedCount,
          lastOccurrenceAt: current.lastOccurrenceAt,
        });
      }),
    pause: ({ id }) =>
      enqueue(() => {
        const current = requireHeartbeat(id);
        if (current.state === "stopped") {
          throw new Error("This heartbeat already stopped.");
        }
        return persistence.upsertTaskHeartbeat({
          ...current,
          state: "paused",
          pauseReason: "paused-by-user",
          stopReason: null,
          reasonDetail: "Paused by the user.",
          updatedAt: now().toISOString(),
        });
      }),
    resume: ({ id }) =>
      enqueue(() => {
        const current = requireHeartbeat(id);
        if (current.state === "stopped") {
          throw new Error(
            `This heartbeat stopped for good: ${current.reasonDetail ?? current.stopReason}. Add a new one instead.`,
          );
        }
        return persistence.upsertTaskHeartbeat(
          applyTaskHeartbeatDecision({
            heartbeat: current,
            decision: { action: "resume" },
            now: now(),
          }),
        );
      }),
    remove: ({ id }) =>
      enqueue(() => {
        requireHeartbeat(id);
        persistence.removeTaskHeartbeat(id);
        return { ok: true as const, id };
      }),
  };
}
