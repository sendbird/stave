/**
 * Task supervisor: wakes existing tasks safely — on a schedule, or when work
 * they delegated finishes.
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
 * The completion trigger rides all of the above unchanged. Its only difference
 * is where dueness comes from: instead of walking a schedule it reads the run
 * ledger for child-task runs this task delegated that have reached a terminal
 * status, and consumes each one exactly once. That read is deliberately a plain
 * injected function — the child-task coordinator emits no completion event, and
 * inventing one there would put execution machinery in the ledger's layer.
 *
 * The decision policy itself is pure and lives in
 * `src/lib/automation/task-supervisor.ts`; this file is the I/O around it.
 */
import { randomUUID } from "node:crypto";
import {
  applyTaskHeartbeatDecision,
  buildTaskCompletionSignalKey,
  buildTaskHeartbeatCompletionIdempotencyKey,
  buildTaskHeartbeatIdempotencyKey,
  buildTaskHeartbeatUnreportedKey,
  classifyTaskCompletionObservability,
  createTaskHeartbeat,
  decideTaskHeartbeatAction,
  summarizeTaskHeartbeat,
  TaskCompletionSignalSchema,
  TaskHeartbeatUpsertInputSchema,
  TASK_HEARTBEAT_LIMITS,
  type TaskCompletionObservability,
  type TaskCompletionSignal,
  type TaskHeartbeat,
  type TaskHeartbeatDecision,
  type TaskHeartbeatObservation,
  type TaskHeartbeatOccurrence,
  type TaskHeartbeatOccurrenceOutcome,
  type TaskHeartbeatSummary,
  type TaskHeartbeatTrigger,
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
    /**
     * The runtime identity to wake the task as. The decision policy has already
     * refused to fire unless this matches the task's live provider and model, so
     * passing it is what keeps a Codex task from being resumed under the
     * caller's default provider.
     */
    fingerprint?: { providerId: TaskHeartbeat["fingerprint"]["providerId"]; model: string };
    retrievedContextParts?: CanonicalRetrievedContextPart[];
  }) => Promise<{ turnId: string }>;
  /**
   * The other half of "exactly one follow-up turn OR one terminal
   * notification". A wake-up whose turn never started has consumed a durable
   * receipt, and staying quiet about that is the same silence the whole trigger
   * exists to avoid — so the human is told instead.
   *
   * Optional so tests and headless callers can omit it; when it is absent the
   * failure is still recorded as an occurrence with its reason.
   */
  notifyHeartbeatWakeFailed?: (args: {
    workspaceId: string;
    taskId: string;
    triggerKind: TaskHeartbeatTrigger["kind"];
    detail: string;
  }) => Promise<void> | void;
  /**
   * Terminal child-task runs this task delegated, read straight off the run
   * ledger. Read-only on purpose: the supervisor records wake-ups, the ledger
   * records delegated execution, and neither writes the other's rows.
   *
   * Absent means completion cannot be observed at all, which is what makes the
   * probe return `unsupported` rather than leaving a heartbeat waiting forever.
   */
  listCompletedDelegatedRuns?: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<TaskCompletionSignal[]> | TaskCompletionSignal[];
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

/**
 * The completion counterpart. It carries identity, phase, and reason for each
 * finished child and nothing else — no transcript, no artifact contents, no
 * secrets. That boundary is the taxonomy's ("the parent's context receives
 * identity, phase and reason; never the child's transcript") and this is where
 * a wake-up honours it.
 */
function buildCompletionContextPart(args: {
  heartbeat: TaskHeartbeat;
  completions: TaskCompletionSignal[];
  occurrenceNumber: number;
}): CanonicalRetrievedContextPart {
  const cap = args.heartbeat.maxOccurrences
    ? ` of ${args.heartbeat.maxOccurrences}`
    : "";
  const lines = args.completions.map((completion) => {
    const who = completion.childTaskId ?? completion.runId;
    const why = completion.reason ? ` — ${completion.reason}` : "";
    return `- ${who} (${completion.providerId}): ${completion.status}${why}`;
  });
  return {
    type: "retrieved_context",
    sourceId: "stave:task-heartbeat",
    title: "Delegated Work Finished",
    content: [
      "A Stave heartbeat started this turn because work this task delegated finished. The user did not type this message and may not be watching.",
      `This is occurrence ${args.occurrenceNumber}${cap}.`,
      args.completions.length === 1
        ? "One delegated run finished:"
        : `${args.completions.length} delegated runs finished:`,
      ...lines,
      "You have their identity, phase, and reason only — read anything further yourself if you need it.",
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

  /**
   * The capability probe, per task. Completion for a delegated child run is a
   * run-ledger fact rather than a provider one, so both runtimes classify the
   * same way — the asymmetry that would matter is a missing ledger reader, not
   * a missing provider feature.
   */
  function probeCompletionObservability(
    snapshot: TaskSupervisionSnapshot,
  ): TaskCompletionObservability {
    return classifyTaskCompletionObservability({
      providerId: snapshot.providerId,
      ledgerReadable: Boolean(dependencies.listCompletedDelegatedRuns),
    });
  }

  /**
   * Terminal delegated runs this heartbeat has not already consumed.
   *
   * The durable occurrence rows are the filter. Attempting the write is the
   * authoritative guard (the store's unique index settles races), but filtering
   * first keeps a duplicate delivery from also producing a spurious deferral
   * row while the task happens to be mid-turn.
   */
  function selectUnconsumedCompletions(args: {
    heartbeat: TaskHeartbeat;
    signals: TaskCompletionSignal[];
  }) {
    const consumed = new Set(
      persistence
        .listTaskHeartbeatOccurrences({
          heartbeatId: args.heartbeat.id,
          // Wide enough to reach every `fired` row the store protects, even
          // when a burst of deferrals sits in front of them. Reading a shorter
          // window would reintroduce exactly the duplicate this guards against.
          limit:
            TASK_HEARTBEAT_LIMITS.maxRetainedOccurrences +
            TASK_HEARTBEAT_LIMITS.minRetainedFiredOccurrences,
        })
        .filter((occurrence) => occurrence.outcome === "fired")
        .map((occurrence) => occurrence.idempotencyKey),
    );
    return args.signals.filter((signal) => {
      if (
        consumed.has(
          buildTaskHeartbeatCompletionIdempotencyKey({
            heartbeatId: args.heartbeat.id,
            outcome: "fired",
            signalKey: buildTaskCompletionSignalKey(signal),
          }),
        )
      ) {
        return false;
      }
      // Rows written before the signal key carried the attempt used the legacy
      // `runId:stepId:status` shape. Only a first attempt may match one — a
      // retried attempt is a new fact, and matching it against a legacy row
      // would reintroduce the very "retry never re-wakes" bug the attempt in
      // the key fixes.
      if (
        signal.attempt <= 1 &&
        consumed.has(
          buildTaskHeartbeatCompletionIdempotencyKey({
            heartbeatId: args.heartbeat.id,
            outcome: "fired",
            signalKey: `${signal.runId}:${signal.stepId}:${signal.status}`,
          }),
        )
      ) {
        return false;
      }
      return true;
    });
  }

  async function readCompletions(heartbeat: TaskHeartbeat) {
    if (heartbeat.trigger.kind !== "completion") {
      return [];
    }
    const read = dependencies.listCompletedDelegatedRuns;
    if (!read) {
      return [];
    }
    let signals: TaskCompletionSignal[];
    try {
      signals = (
        await read({
          workspaceId: heartbeat.workspaceId,
          taskId: heartbeat.taskId,
        })
      ).map((signal) => TaskCompletionSignalSchema.parse(signal));
    } catch (error) {
      // A ledger read that fails this tick is not an observability verdict — the
      // heartbeat idles and tries again rather than stopping for good over a
      // transient error.
      console.warn("[task-supervisor] failed to read delegated completions", error, {
        heartbeatId: heartbeat.id,
        taskId: heartbeat.taskId,
      });
      return [];
    }
    // Only work that reached a terminal state after this heartbeat existed is
    // signalable. Without the baseline, a freshly created (or re-created)
    // completion heartbeat has no occurrence rows at all, so every old
    // terminal receipt still inside the feed window would read as new and the
    // creation itself would trigger a burst of wake-ups for work that finished
    // long ago. `createdAt` survives updates, so an updated heartbeat keeps
    // its original baseline and its consumed receipts.
    const baseline = Date.parse(heartbeat.createdAt);
    const eligible = Number.isFinite(baseline)
      ? signals.filter((signal) => {
          const completedAt = Date.parse(signal.completedAt);
          return !Number.isFinite(completedAt) || completedAt >= baseline;
        })
      : signals;
    return selectUnconsumedCompletions({ heartbeat, signals: eligible });
  }

  function buildObservation(args: {
    heartbeat: TaskHeartbeat;
    snapshot: TaskSupervisionSnapshot;
    completions: TaskCompletionSignal[];
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
      completionObservability: probeCompletionObservability(snapshot),
      completions: args.completions,
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

  /**
   * One row per finished child, keyed by the completion rather than by an
   * instant. `recorded === false` means this exact completion was already
   * consumed by an earlier wake-up, so it must not contribute to another turn.
   */
  function recordCompletionOccurrence(args: {
    heartbeat: TaskHeartbeat;
    signal: TaskCompletionSignal;
  }) {
    const occurrence: TaskHeartbeatOccurrence = {
      id: randomUUID(),
      heartbeatId: args.heartbeat.id,
      idempotencyKey: buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: args.heartbeat.id,
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(args.signal),
      }),
      workspaceId: args.heartbeat.workspaceId,
      taskId: args.heartbeat.taskId,
      turnId: null,
      outcome: "fired",
      reason: `Delegated run ${args.signal.runId} ${args.signal.status}.`.slice(
        0,
        TASK_HEARTBEAT_LIMITS.maxReasonChars,
      ),
      scheduledFor: args.signal.completedAt,
      recordedAt: now().toISOString(),
    };
    const recorded = persistence.recordTaskHeartbeatOccurrence(occurrence);
    return { recorded, occurrence };
  }

  /**
   * The sibling row that marks a consumed occurrence as never reported.
   *
   * Derived from the consumed row's own key so it is both idempotent and
   * *findable*: the boot sweep looks for a `fired` row with no turn and no such
   * sibling, which is precisely a wake-up that died between being recorded and
   * being delivered.
   */
  function recordUnreportedOccurrence(args: {
    occurrence: TaskHeartbeatOccurrence;
    detail: string;
  }) {
    persistence.recordTaskHeartbeatOccurrence({
      ...args.occurrence,
      id: randomUUID(),
      idempotencyKey: buildTaskHeartbeatUnreportedKey(
        args.occurrence.idempotencyKey,
      ),
      turnId: null,
      outcome: "skipped",
      reason: args.detail.slice(0, TASK_HEARTBEAT_LIMITS.maxReasonChars),
      recordedAt: now().toISOString(),
    });
  }

  /**
   * Tell the human that a wake-up was consumed without reaching the task.
   *
   * Never allowed to throw: the occurrence rows are already written by the time
   * this runs, and a failed notification must not turn one lost wake-up into a
   * failed tick that also skips every other heartbeat.
   */
  async function reportWakeFailure(args: {
    heartbeat: TaskHeartbeat;
    detail: string;
  }) {
    const notify = dependencies.notifyHeartbeatWakeFailed;
    if (!notify) {
      return;
    }
    try {
      await notify({
        workspaceId: args.heartbeat.workspaceId,
        taskId: args.heartbeat.taskId,
        triggerKind: args.heartbeat.trigger.kind,
        detail: args.detail.slice(0, TASK_HEARTBEAT_LIMITS.maxReasonChars),
      });
    } catch (error) {
      console.warn("[task-supervisor] failed to report a lost wake-up", error, {
        heartbeatId: args.heartbeat.id,
        taskId: args.heartbeat.taskId,
      });
    }
  }

  function describeTurnFailure(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
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

  /**
   * Consume a batch of finished delegated work with exactly one turn.
   *
   * The order matters. Every completion is written first, and only the ones the
   * store actually accepted count: if a duplicate delivery means nothing new was
   * accepted, no turn starts at all. That is the idempotency guarantee — the
   * occurrence rows decide, not the caller and not the tick.
   */
  async function fireCompletion(args: {
    heartbeat: TaskHeartbeat;
    decision: Extract<TaskHeartbeatDecision, { action: "fire-completion" }>;
  }) {
    const { heartbeat, decision } = args;
    const consumed: Array<{
      occurrence: TaskHeartbeatOccurrence;
      signal: TaskCompletionSignal;
    }> = [];
    for (const signal of decision.completions) {
      const recorded = recordCompletionOccurrence({ heartbeat, signal });
      if (recorded.recorded) {
        consumed.push({ occurrence: recorded.occurrence, signal });
      }
    }
    if (consumed.length === 0) {
      // Every completion in this batch had already been handled. Do not start a
      // second turn and do not spend an occurrence on it.
      return heartbeat;
    }

    const woken = persistIfChanged(
      heartbeat,
      applyTaskHeartbeatDecision({
        heartbeat,
        decision: {
          ...decision,
          completions: consumed.map((entry) => entry.signal),
        },
        now: now(),
      }),
    );

    try {
      const turn = await dependencies.runHeartbeatTurn({
        workspaceId: heartbeat.workspaceId,
        taskId: heartbeat.taskId,
        prompt: heartbeat.prompt,
        fingerprint: heartbeat.fingerprint,
        retrievedContextParts: [
          buildCompletionContextPart({
            heartbeat,
            completions: consumed.map((entry) => entry.signal),
            occurrenceNumber: woken.occurrenceCount,
          }),
        ],
      });
      for (const entry of consumed) {
        persistence.attachTaskHeartbeatOccurrenceTurn({
          id: entry.occurrence.id,
          turnId: turn.turnId,
        });
      }
    } catch (error) {
      // The completions stay consumed on purpose — retrying them would risk a
      // second turn for work already reported. But a consumed receipt that
      // produced no turn is exactly the case the trigger's contract answers with
      // a notification instead, so each one is marked unreported and the human
      // is told once for the batch.
      const detail = describeTurnFailure(
        error,
        "Failed to start the completion turn.",
      );
      for (const entry of consumed) {
        recordUnreportedOccurrence({ occurrence: entry.occurrence, detail });
      }
      await reportWakeFailure({
        heartbeat,
        detail: `${consumed.length === 1 ? "A finished delegated run" : `${consumed.length} finished delegated runs`} could not be reported to this task: ${detail}`,
      });
    }
    persistence.pruneTaskHeartbeatOccurrences({ heartbeatId: heartbeat.id });
    return woken;
  }

  async function evaluate(heartbeat: TaskHeartbeat) {
    const snapshot = await dependencies.getTaskSupervisionSnapshot({
      workspaceId: heartbeat.workspaceId,
      taskId: heartbeat.taskId,
    });
    const completions = await readCompletions(heartbeat);
    const decision = decideTaskHeartbeatAction({
      heartbeat,
      observation: buildObservation({ heartbeat, snapshot, completions }),
      now: now(),
    });

    if (decision.action === "idle") {
      return heartbeat;
    }

    if (decision.action === "defer") {
      // Collapsed by idempotency key, so a long user turn leaves one row per
      // missed instant rather than one per tick.
      const deferred = recordOccurrence({
        heartbeat,
        outcome: "deferred",
        scheduledFor: decision.dueAt,
        reason: decision.detail,
      });
      if (deferred.recorded) {
        // The fire paths prune after themselves, but a heartbeat can defer for
        // a very long time without ever firing — pruning here keeps its
        // history bounded instead of growing one row per missed instant
        // forever. The `fired` retention floor is unaffected.
        persistence.pruneTaskHeartbeatOccurrences({ heartbeatId: heartbeat.id });
      }
      return heartbeat;
    }

    if (decision.action === "fire-completion") {
      return await fireCompletion({ heartbeat, decision });
    }

    if (decision.action !== "fire") {
      return persistIfChanged(
        heartbeat,
        applyTaskHeartbeatDecision({ heartbeat, decision, now: now() }),
      );
    }

    if (decision.skippedAt.length > 0) {
      // "Missed" has two different causes and the row should not lie about
      // which one happened: an instant that has a durable `deferred` row was
      // skipped while Stave was running but the task was busy with another
      // turn; one without was missed while Stave was not running at all.
      const deferredKeys = new Set(
        persistence
          .listTaskHeartbeatOccurrences({
            heartbeatId: heartbeat.id,
            limit: TASK_HEARTBEAT_LIMITS.maxRetainedOccurrences,
          })
          .filter((occurrence) => occurrence.outcome === "deferred")
          .map((occurrence) => occurrence.idempotencyKey),
      );
      const truncatedSuffix = decision.truncated
        ? " More occurrences were missed than are recorded."
        : "";
      for (const skippedAt of decision.skippedAt) {
        const wasDeferred = deferredKeys.has(
          buildTaskHeartbeatIdempotencyKey({
            heartbeatId: heartbeat.id,
            outcome: "deferred",
            scheduledFor: skippedAt,
          }),
        );
        recordOccurrence({
          heartbeat,
          outcome: "skipped",
          scheduledFor: skippedAt,
          reason: `${
            wasDeferred
              ? "Skipped while the task was busy with another turn."
              : "Missed while Stave was not running."
          }${truncatedSuffix}`,
        });
      }
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
        fingerprint: heartbeat.fingerprint,
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
      // task really is gone. This instant is spent either way, so the human
      // hears about it rather than reading a `scheduled` row that quietly
      // skipped a beat.
      const detail = describeTurnFailure(
        error,
        "Failed to start the heartbeat turn.",
      );
      recordUnreportedOccurrence({ occurrence: fired.occurrence, detail });
      await reportWakeFailure({
        heartbeat,
        detail: `A scheduled wake-up for ${decision.dueAt} could not start: ${detail}`,
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

  /**
   * The other boot sweep, for the crash window the in-tick failure path cannot
   * reach: a `fired` row is written before its turn starts, so a process that
   * dies in between leaves a consumed receipt with no turn and no reason.
   *
   * At boot nothing is in flight, so a `fired` row with no `turnId` and no
   * unreported sibling can only be that. Marking it is what keeps this
   * report-once rather than once per restart.
   */
  async function reportInterruptedHeartbeatWakes() {
    for (const heartbeat of persistence.listActiveTaskHeartbeats()) {
      const occurrences = persistence.listTaskHeartbeatOccurrences({
        heartbeatId: heartbeat.id,
        limit:
          TASK_HEARTBEAT_LIMITS.maxRetainedOccurrences +
          TASK_HEARTBEAT_LIMITS.minRetainedFiredOccurrences,
      });
      const alreadyReported = new Set(
        occurrences.map((occurrence) => occurrence.idempotencyKey),
      );
      const lost = occurrences.filter(
        (occurrence) =>
          occurrence.outcome === "fired" &&
          !occurrence.turnId &&
          !alreadyReported.has(
            buildTaskHeartbeatUnreportedKey(occurrence.idempotencyKey),
          ),
      );
      if (lost.length === 0) {
        continue;
      }
      const detail =
        "Stave stopped before this wake-up reached the task, so it was consumed without a turn.";
      for (const occurrence of lost) {
        recordUnreportedOccurrence({ occurrence, detail });
      }
      await reportWakeFailure({
        heartbeat,
        detail: `${lost.length === 1 ? "One wake-up" : `${lost.length} wake-ups`} were lost when Stave stopped: ${detail}`,
      });
    }
  }

  function start() {
    if (intervalHandle) {
      return;
    }
    try {
      // The boot sweep must not be able to keep the supervisor from starting:
      // one unreadable heartbeat row would otherwise take every heartbeat (and
      // the host service's startup path) down with it.
      closeInterruptedHeartbeatTurns();
    } catch (error) {
      console.error(
        "[task-supervisor] failed to close interrupted heartbeat turns",
        error,
      );
    }
    void enqueue(reportInterruptedHeartbeatWakes).catch((error) => {
      console.error(
        "[task-supervisor] failed to report interrupted wake-ups",
        error,
      );
    });
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

  /**
   * Refuse up front rather than accept a heartbeat that could never fire. The
   * decision policy would stop it on the very next tick anyway; failing here
   * gives the caller the reason instead of a row that dies silently.
   */
  function requireObservableCompletion(args: {
    trigger: TaskHeartbeatUpsertInput["trigger"];
    snapshot: TaskSupervisionSnapshot;
  }) {
    if (args.trigger.kind !== "completion") {
      return;
    }
    if (probeCompletionObservability(args.snapshot) === "unsupported") {
      throw new Error(
        "Stave cannot observe when this task's delegated work finishes, so a completion heartbeat would never fire. Use a schedule trigger.",
      );
    }
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
        requireObservableCompletion({ trigger: input.trigger, snapshot });
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
        if (current.state === "stopped") {
          // Matches `resume`: a stopped heartbeat is terminal for a stated
          // reason, and an update quietly rescheduling it would erase that
          // reason. Creating a fresh heartbeat replaces a stopped one instead.
          throw new Error(
            `This heartbeat stopped for good: ${current.reasonDetail ?? current.stopReason}. Add a new one instead.`,
          );
        }
        if (
          input.taskId !== current.taskId ||
          input.workspaceId !== current.workspaceId
        ) {
          throw new Error(
            "A heartbeat cannot be moved to another task. Remove it and add one there.",
          );
        }
        const snapshot = await requireSupervisableTask({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        });
        requireObservableCompletion({ trigger: input.trigger, snapshot });
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
          // Switching trigger kinds resets the fired count: a schedule that
          // already fired dozens of times must not arrive at the completion
          // trigger's default cap half spent (or vice versa).
          occurrenceCount:
            input.trigger.kind === current.trigger.kind
              ? current.occurrenceCount
              : 0,
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
