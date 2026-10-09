/**
 * Supervisor: wakes existing tasks safely — on a schedule, or when work
 * they delegated finishes.
 *
 * Used by: `electron/host-service.ts` (constructs it, starts and stops it, and
 * dispatches `wake-up.invoke` actions to it).
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
 * ledger for delegated-task runs this task delegated that have reached a terminal
 * status, and consumes each one exactly once. That read is deliberately a plain
 * injected function — the delegated-task coordinator emits no completion event, and
 * inventing one there would put execution machinery in the ledger's layer.
 *
 * The pull request trigger rides it the same way. Dueness is "the watched pull
 * request has a failure no earlier wake consumed", read from GitHub through an
 * injected reader on a two-minute poll. Those reads happen outside the
 * serialized chain so a slow `gh` call never holds up a list or an edit; the
 * tick that consumes them is enqueued once they land.
 *
 * The decision policy itself is pure and lives in
 * `src/lib/supervision/wake-up-policy.ts`; this file is the I/O around it.
 */
import { randomUUID } from "node:crypto";
import {
  applyWakeUpDecision,
  buildTaskCompletionSignalKey,
  buildWakeUpCompletionIdempotencyKey,
  buildWakeUpIdempotencyKey,
  buildWakeUpPullRequestIdempotencyKey,
  buildWakeUpUnreportedKey,
  classifyTaskCompletionObservability,
  createWakeUp,
  decideWakeUpAction,
  summarizeWakeUp,
  TaskCompletionSignalSchema,
  WakeUpUpsertInputSchema,
  WAKE_UP_LIMITS,
  type TaskCompletionObservability,
  type TaskCompletionSignal,
  type WakeUp,
  type WakeUpDecision,
  type WakeUpObservation,
  type WakeUpOccurrence,
  type WakeUpOccurrenceOutcome,
  type WakeUpSummary,
  type WakeUpTrigger,
  type WakeUpUpsertInput,
} from "../../src/lib/supervision/wake-up-policy";
import {
  advancePullRequestWatchState,
  buildPullRequestWatchPrompt,
  collectPullRequestWatchSignals,
  isPullRequestWatchPollDue,
  PULL_REQUEST_WATCH_LIMITS,
  PullRequestWatchReadSchema,
  type PullRequestWatchEvent,
  type PullRequestWatchObservation,
  type PullRequestWatchRead,
  type PullRequestWatchSignal,
  type PullRequestWatchSnapshot,
} from "../../src/lib/supervision/pull-request-watch";
import { validateFleetQueueAction } from "../../src/lib/fleet/control-plane";
import { refuseWakeUpForAgentRun } from "../../src/lib/supervision/automatic-turn-owner";
import type {
  CanonicalRetrievedContextPart,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import type { TaskSupervisionSnapshot } from "./local-mcp-runtime";

/**
 * Slower than the automation tick: a wake-up's shortest cadence is a minute, and
 * every tick costs one task read per active wake-up.
 */
const WAKE_UP_TICK_INTERVAL_MS = 15_000;

interface WakeUpPersistence {
  listWakeUps: () => WakeUp[];
  listActiveWakeUps: () => WakeUp[];
  listWakeUpsForWorkspace: (workspaceId: string) => WakeUp[];
  getWakeUp: (id: string) => WakeUp | null;
  getWakeUpByTaskId: (taskId: string) => WakeUp | null;
  upsertWakeUp: (wakeUp: WakeUp) => WakeUp;
  removeWakeUp: (id: string) => boolean;
  recordWakeUpOccurrence: (
    occurrence: WakeUpOccurrence,
  ) => boolean;
  attachWakeUpOccurrenceTurn: (args: {
    id: string;
    turnId: string;
  }) => void;
  listWakeUpOccurrences: (args: {
    wakeUpId: string;
    limit?: number;
  }) => WakeUpOccurrence[];
  pruneWakeUpOccurrences: (args: {
    wakeUpId: string;
    keep?: number;
  }) => number;
  completeInterruptedTurn: (args: { id: string }) => boolean;
}

interface WakeUpRuntimeDependencies {
  persistence: WakeUpPersistence;
  getTaskSupervisionSnapshot: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<TaskSupervisionSnapshot>;
  runSupervisedTurn: (args: {
    workspaceId: string;
    taskId: string;
    prompt: string;
    /**
     * The runtime identity to wake the task as. The decision policy has already
     * refused to fire unless this matches the task's live provider and model, so
     * passing it is what keeps a Codex task from being resumed under the
     * caller's default provider.
     */
    fingerprint?: { providerId: WakeUp["fingerprint"]["providerId"]; model: string };
    /** The user's own provider permission settings; see `userPermissionOptions`. */
    runtimeOptions?: ProviderRuntimeOptions;
    retrievedContextParts?: CanonicalRetrievedContextPart[];
  }) => Promise<{ turnId: string }>;
  /**
   * The user's own provider permission settings for the woken task's
   * provider. A wake-up has no consent of its own, so its turn runs as the
   * user's turns do rather than on the runtime's fallbacks. Absent (tests and
   * headless callers): the turn passes no permissions.
   */
  userPermissionOptions?: (
    providerId: WakeUp["fingerprint"]["providerId"],
  ) => ProviderRuntimeOptions | undefined;
  /**
   * The other half of "exactly one follow-up turn OR one terminal
   * notification". A wake-up whose turn never started has consumed a durable
   * receipt, and staying quiet about that is the same silence the whole trigger
   * exists to avoid — so the human is told instead.
   *
   * Optional so tests and headless callers can omit it; when it is absent the
   * failure is still recorded as an occurrence with its reason.
   */
  notifyWakeUpFailed?: (args: {
    workspaceId: string;
    taskId: string;
    triggerKind: WakeUpTrigger["kind"];
    detail: string;
  }) => Promise<void> | void;
  /**
   * Terminal delegated-task runs this task delegated, read straight off the run
   * ledger. Read-only on purpose: the supervisor records wake-ups, the ledger
   * records delegated execution, and neither writes the other's rows.
   *
   * Absent means completion cannot be observed at all, which is what makes the
   * probe return `unsupported` rather than leaving a wake-up waiting forever.
   */
  listCompletedDelegatedRuns?: (args: {
    workspaceId: string;
    taskId: string;
  }) => Promise<TaskCompletionSignal[]> | TaskCompletionSignal[];
  /**
   * Reads the pull request of the task's workspace branch for a `pull_request`
   * watch — by number once the watch has locked onto one. Read-only, like the
   * ledger read above. Absent means pull requests cannot be read here, so a
   * watch is refused rather than left waiting on a read that never happens.
   */
  readPullRequestWatch?: (args: {
    workspaceId: string;
    taskId: string;
    pullRequestNumber: number | null;
    events: PullRequestWatchEvent[];
  }) => Promise<PullRequestWatchRead>;
  /**
   * The task's running or paused agent run. An agent run owns its lead task's
   * automatic turns, so the wake-up pauses with `agent-run-active` while one
   * exists, and creating, updating or resuming a wake-up on that task is
   * refused. Absent means no agent runs are wired in.
   */
  getActiveAgentRunForTask?: (taskId: string) => { id: string } | null;
  /**
   * Announces a wake-up that was written or removed, so the task surfaces
   * that list wake-ups refresh. Never throws into the runtime.
   */
  emitChanged?: (event: { wakeUpId: string; workspaceId: string; taskId: string }) => void;
  now?: () => Date;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
}

export interface WakeUpSnapshot {
  wakeUps: WakeUp[];
  summaries: WakeUpSummary[];
}

export interface WakeUpRuntime {
  start: () => void;
  stop: () => void;
  list: (args?: { workspaceId?: string }) => Promise<WakeUpSnapshot>;
  get: (args: { id: string }) => Promise<{
    wakeUp: WakeUp;
    occurrences: WakeUpOccurrence[];
  }>;
  create: (input: WakeUpUpsertInput) => Promise<WakeUp>;
  update: (args: {
    id: string;
    input: WakeUpUpsertInput;
  }) => Promise<WakeUp>;
  pause: (args: { id: string }) => Promise<WakeUp>;
  resume: (args: { id: string }) => Promise<WakeUp>;
  remove: (args: { id: string }) => Promise<{ ok: true; id: string }>;
  /**
   * Resolves once pull request reads in flight have landed and the chain has
   * drained. For tests and shutdown; the tick itself never waits on it.
   */
  whenIdle: () => Promise<void>;
}

function toSnapshot(wakeUps: WakeUp[]): WakeUpSnapshot {
  return {
    wakeUps,
    summaries: wakeUps.map(summarizeWakeUp),
  };
}

/**
 * Tells the woken model what woke it. Without this a wake-up turn is
 * indistinguishable from the user typing, and the model asks questions nobody
 * is present to answer.
 */
function buildWakeUpContextPart(args: {
  wakeUp: WakeUp;
  dueAt: string;
  occurrenceNumber: number;
}): CanonicalRetrievedContextPart {
  const cap = args.wakeUp.maxOccurrences
    ? ` of ${args.wakeUp.maxOccurrences}`
    : "";
  return {
    type: "retrieved_context",
    sourceId: "stave:wake-up",
    title: "Scheduled Wake",
    content: [
      "A Stave schedule started this turn. The user did not type this message and may not be watching.",
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
  wakeUp: WakeUp;
  completions: TaskCompletionSignal[];
  occurrenceNumber: number;
}): CanonicalRetrievedContextPart {
  const cap = args.wakeUp.maxOccurrences
    ? ` of ${args.wakeUp.maxOccurrences}`
    : "";
  const lines = args.completions.map((completion) => {
    const who = completion.delegatedTaskId ?? completion.runId;
    const why = completion.reason ? ` — ${completion.reason}` : "";
    return `- ${who} (${completion.providerId}): ${completion.status}${why}`;
  });
  return {
    type: "retrieved_context",
    sourceId: "stave:wake-up",
    title: "Delegated Work Finished",
    content: [
      "A Stave schedule started this turn because this task's subagents finished. The user did not type this message and may not be watching.",
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

/**
 * The pull request counterpart. The woken turn's prompt already carries what
 * failed; this says who woke it and that nobody is necessarily watching.
 */
function buildPullRequestContextPart(args: {
  wakeUp: WakeUp;
  pullRequest: PullRequestWatchSnapshot;
  occurrenceNumber: number;
}): CanonicalRetrievedContextPart {
  const cap = args.wakeUp.maxOccurrences
    ? ` of ${args.wakeUp.maxOccurrences}`
    : "";
  return {
    type: "retrieved_context",
    sourceId: "stave:wake-up",
    title: "Pull Request Needs Fixing",
    content: [
      "A Stave pull request watch started this turn because this task's pull request needs fixing. The user did not type this message and may not be watching.",
      `This is wake ${args.occurrenceNumber}${cap} for pull request #${args.pullRequest.number}. The watch keeps reading it and wakes this task again only for a new failure.`,
      "Report what you changed and whether you pushed. Do not ask a question you cannot get answered — if you are blocked, say what is blocking you and stop.",
    ].join("\n"),
  };
}

/** The occurrence row's reason for one consumed pull request signal. */
function describePullRequestSignal(
  signal: PullRequestWatchSignal,
  pullRequest: PullRequestWatchSnapshot,
) {
  const sha = pullRequest.headRefOid ? ` on ${pullRequest.headRefOid.slice(0, 7)}` : "";
  switch (signal.kind) {
    case "checks_failed":
      return `Check ${signal.check.name} failed${sha}.`;
    case "merge_conflict":
      return `The branch conflicts with ${signal.baseRefName || "its base"}${sha}.`;
    case "review_comments":
      return `New review comment${signal.comment.author ? ` from @${signal.comment.author}` : ""}.`;
    default:
      signal satisfies never;
      return "Pull request signal.";
  }
}

export function createWakeUpRuntime(
  dependencies: WakeUpRuntimeDependencies,
): WakeUpRuntime {
  const now = dependencies.now ?? (() => new Date());
  const setIntervalImpl = dependencies.setInterval ?? globalThis.setInterval;
  const clearIntervalImpl =
    dependencies.clearInterval ?? globalThis.clearInterval;
  // Delegate every method by name, never spread: the host passes its
  // `SqliteStore`, whose methods live on the class prototype, and a spread
  // copies only own properties. Listing each one also makes a new
  // `WakeUpPersistence` method without a delegation fail `tsc`.
  const store = dependencies.persistence;
  const persistence: WakeUpPersistence = {
    listWakeUps: () => store.listWakeUps(),
    listActiveWakeUps: () => store.listActiveWakeUps(),
    listWakeUpsForWorkspace: (workspaceId) =>
      store.listWakeUpsForWorkspace(workspaceId),
    getWakeUp: (id) => store.getWakeUp(id),
    getWakeUpByTaskId: (taskId) => store.getWakeUpByTaskId(taskId),
    upsertWakeUp: (wakeUp) => {
      const written = store.upsertWakeUp(wakeUp);
      announce(written);
      return written;
    },
    removeWakeUp: (id) => {
      const existing = store.getWakeUp(id);
      const removed = store.removeWakeUp(id);
      if (existing) announce(existing);
      return removed;
    },
    recordWakeUpOccurrence: (occurrence) =>
      store.recordWakeUpOccurrence(occurrence),
    attachWakeUpOccurrenceTurn: (args) => store.attachWakeUpOccurrenceTurn(args),
    listWakeUpOccurrences: (args) => store.listWakeUpOccurrences(args),
    pruneWakeUpOccurrences: (args) => store.pruneWakeUpOccurrences(args),
    completeInterruptedTurn: (args) => store.completeInterruptedTurn(args),
  };
  /** Read at fire time, so a settings change applies to the next wake. */
  function userRuntimeOptions(wakeUp: WakeUp) {
    const runtimeOptions = dependencies.userPermissionOptions?.(
      wakeUp.fingerprint.providerId,
    );
    return runtimeOptions ? { runtimeOptions } : {};
  }
  function announce(wakeUp: Pick<WakeUp, "id" | "workspaceId" | "taskId">) {
    try {
      dependencies.emitChanged?.({
        wakeUpId: wakeUp.id,
        workspaceId: wakeUp.workspaceId,
        taskId: wakeUp.taskId,
      });
    } catch (error) {
      console.warn("[wake-ups] failed to announce a wake-up change", error);
    }
  }
  let intervalHandle: ReturnType<typeof globalThis.setInterval> | null = null;
  let operationChain = Promise.resolve();
  /** The pull request reads of the current tick, while they are out. */
  let pullRequestReadsInFlight: Promise<void> | null = null;

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

  function requireWakeUp(id: string) {
    const wakeUp = persistence.getWakeUp(id);
    if (!wakeUp) {
      throw new Error(`Schedule not found: ${id}`);
    }
    return wakeUp;
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
   * Terminal delegated runs this wake-up has not already consumed.
   *
   * The durable occurrence rows are the filter. Attempting the write is the
   * authoritative guard (the store's unique index settles races), but filtering
   * first keeps a duplicate delivery from also producing a spurious deferral
   * row while the task happens to be mid-turn.
   */
  function listConsumedKeys(wakeUp: WakeUp) {
    return new Set(
      persistence
        .listWakeUpOccurrences({
          wakeUpId: wakeUp.id,
          // Wide enough to reach every `fired` row the store protects, even
          // when a burst of deferrals sits in front of them. Reading a shorter
          // window would reintroduce exactly the duplicate this guards against.
          limit:
            WAKE_UP_LIMITS.maxRetainedOccurrences +
            WAKE_UP_LIMITS.minRetainedFiredOccurrences,
        })
        .filter((occurrence) => occurrence.outcome === "fired")
        .map((occurrence) => occurrence.idempotencyKey),
    );
  }

  function selectUnconsumedCompletions(args: {
    wakeUp: WakeUp;
    signals: TaskCompletionSignal[];
  }) {
    const consumed = listConsumedKeys(args.wakeUp);
    return args.signals.filter((signal) => {
      if (
        consumed.has(
          buildWakeUpCompletionIdempotencyKey({
            wakeUpId: args.wakeUp.id,
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
          buildWakeUpCompletionIdempotencyKey({
            wakeUpId: args.wakeUp.id,
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

  async function readCompletions(wakeUp: WakeUp) {
    if (wakeUp.trigger.kind !== "completion") {
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
          workspaceId: wakeUp.workspaceId,
          taskId: wakeUp.taskId,
        })
      ).map((signal) => TaskCompletionSignalSchema.parse(signal));
    } catch (error) {
      // A ledger read that fails this tick is not an observability verdict — the
      // wake-up idles and tries again rather than stopping for good over a
      // transient error.
      console.warn("[wake-ups] failed to read delegated completions", error, {
        wakeUpId: wakeUp.id,
        taskId: wakeUp.taskId,
      });
      return [];
    }
    // Only work that reached a terminal state after this wake-up existed is
    // signalable. Without the baseline, a freshly created (or re-created)
    // completion wake-up has no occurrence rows at all, so every old
    // terminal receipt still inside the feed window would read as new and the
    // creation itself would trigger a burst of wake-ups for work that finished
    // long ago. `createdAt` survives updates, so an updated wake-up keeps
    // its original baseline and its consumed receipts.
    const baseline = Date.parse(wakeUp.createdAt);
    const eligible = Number.isFinite(baseline)
      ? signals.filter((signal) => {
          const completedAt = Date.parse(signal.completedAt);
          return !Number.isFinite(completedAt) || completedAt >= baseline;
        })
      : signals;
    return selectUnconsumedCompletions({ wakeUp, signals: eligible });
  }

  /**
   * Pull request signals no earlier wake consumed. Same guard as completions:
   * the durable `fired` rows decide, so a failure seen on every poll is one
   * receipt, and only a new fact can wake the task again.
   */
  function selectUnconsumedPullRequestSignals(args: {
    wakeUp: WakeUp;
    signals: PullRequestWatchSignal[];
  }) {
    if (args.signals.length === 0) return [];
    const consumed = listConsumedKeys(args.wakeUp);
    return args.signals.filter(
      (signal) =>
        !consumed.has(
          buildWakeUpPullRequestIdempotencyKey({
            wakeUpId: args.wakeUp.id,
            outcome: "fired",
            signalKey: signal.key,
          }),
        ),
    );
  }

  /**
   * Folds this tick's read (if there was one) into the watch state and the
   * observation the policy decides on. Pure apart from the receipt lookup.
   */
  function observePullRequest(
    wakeUp: WakeUp,
    read: PullRequestWatchRead | undefined,
  ): {
    state: WakeUp["pullRequestWatch"];
    observation: PullRequestWatchObservation;
  } | null {
    if (wakeUp.trigger.kind !== "pull_request") return null;
    if (!read) {
      return { state: wakeUp.pullRequestWatch, observation: { kind: "not-read" } };
    }
    const previous = wakeUp.pullRequestWatch;
    const advanced = advancePullRequestWatchState({ previous, read, now: now() });
    if (!read.ok) {
      return {
        state: advanced,
        observation: {
          kind: "read-failed",
          error: read.error,
          consecutiveFailures: advanced.consecutiveReadFailures,
        },
      };
    }
    const signals = read.pullRequest
      ? selectUnconsumedPullRequestSignals({
          wakeUp,
          signals: collectPullRequestWatchSignals({
            events: wakeUp.trigger.events,
            pullRequest: read.pullRequest,
          }),
        })
      : [];
    return {
      // Nothing new to wake on means nothing is queued behind a turn either.
      state: signals.length === 0 ? { ...advanced, pendingSince: null } : advanced,
      observation: {
        kind: "read",
        pullRequest: read.pullRequest,
        watchedNumber: previous?.pullRequest?.number ?? null,
        signals,
      },
    };
  }

  function buildObservation(args: {
    wakeUp: WakeUp;
    snapshot: TaskSupervisionSnapshot;
    completions: TaskCompletionSignal[];
    pullRequest?: PullRequestWatchObservation;
  }): WakeUpObservation {
    const { wakeUp, snapshot } = args;
    // The supervisor queues work onto a task from outside that task, which is
    // exactly the staleness question the fleet control plane already answers.
    const identity = validateFleetQueueAction({
      expected: {
        repositoryPath: wakeUp.repositoryPath,
        workspaceId: wakeUp.workspaceId,
        taskId: wakeUp.taskId,
      },
      current: {
        repositoryPath: snapshot.repositoryPath,
        workspaceId: snapshot.exists ? snapshot.workspaceId : null,
        taskId: snapshot.exists ? snapshot.taskId : null,
        turnId: snapshot.activeTurnId,
        messages: [],
      },
    });
    return {
      workspaceAvailable: Boolean(snapshot.repositoryPath),
      taskExists: snapshot.exists,
      taskArchived: snapshot.archived,
      hasActiveTurn: Boolean(snapshot.activeTurnId),
      pendingApprovalCount: snapshot.pendingApprovalCount,
      pendingUserInputCount: snapshot.pendingUserInputCount,
      fingerprint:
        (snapshot.providerId === "claude-code" || snapshot.providerId === "codex") && snapshot.model
          ? { providerId: snapshot.providerId, model: snapshot.model }
          : null,
      identity: identity.ok ? { ok: true } : { ok: false, reason: identity.reason },
      completionObservability: probeCompletionObservability(snapshot),
      completions: args.completions,
      agentRunActive: Boolean(dependencies.getActiveAgentRunForTask?.(wakeUp.taskId)),
      ...(args.pullRequest ? { pullRequest: args.pullRequest } : {}),
    };
  }

  function recordOccurrence(args: {
    wakeUp: WakeUp;
    outcome: WakeUpOccurrenceOutcome;
    scheduledFor: string;
    reason: string | null;
  }) {
    const occurrence: WakeUpOccurrence = {
      id: randomUUID(),
      wakeUpId: args.wakeUp.id,
      idempotencyKey: buildWakeUpIdempotencyKey({
        wakeUpId: args.wakeUp.id,
        outcome: args.outcome,
        scheduledFor: args.scheduledFor,
      }),
      workspaceId: args.wakeUp.workspaceId,
      taskId: args.wakeUp.taskId,
      turnId: null,
      outcome: args.outcome,
      reason: args.reason
        ? args.reason.slice(0, WAKE_UP_LIMITS.maxReasonChars)
        : null,
      scheduledFor: args.scheduledFor,
      recordedAt: now().toISOString(),
    };
    const recorded = persistence.recordWakeUpOccurrence(occurrence);
    return { recorded, occurrence };
  }

  /**
   * One row per finished child, keyed by the completion rather than by an
   * instant. `recorded === false` means this exact completion was already
   * consumed by an earlier wake-up, so it must not contribute to another turn.
   */
  function recordCompletionOccurrence(args: {
    wakeUp: WakeUp;
    signal: TaskCompletionSignal;
  }) {
    const occurrence: WakeUpOccurrence = {
      id: randomUUID(),
      wakeUpId: args.wakeUp.id,
      idempotencyKey: buildWakeUpCompletionIdempotencyKey({
        wakeUpId: args.wakeUp.id,
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(args.signal),
      }),
      workspaceId: args.wakeUp.workspaceId,
      taskId: args.wakeUp.taskId,
      turnId: null,
      outcome: "fired",
      reason: `Delegated run ${args.signal.runId} ${args.signal.status}.`.slice(
        0,
        WAKE_UP_LIMITS.maxReasonChars,
      ),
      scheduledFor: args.signal.completedAt,
      recordedAt: now().toISOString(),
    };
    const recorded = persistence.recordWakeUpOccurrence(occurrence);
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
    occurrence: WakeUpOccurrence;
    detail: string;
  }) {
    persistence.recordWakeUpOccurrence({
      ...args.occurrence,
      id: randomUUID(),
      idempotencyKey: buildWakeUpUnreportedKey(
        args.occurrence.idempotencyKey,
      ),
      turnId: null,
      outcome: "skipped",
      reason: args.detail.slice(0, WAKE_UP_LIMITS.maxReasonChars),
      recordedAt: now().toISOString(),
    });
  }

  /**
   * Tell the human that a wake-up was consumed without reaching the task.
   *
   * Never allowed to throw: the occurrence rows are already written by the time
   * this runs, and a failed notification must not turn one lost wake-up into a
   * failed tick that also skips every other wake-up.
   */
  async function reportWakeFailure(args: {
    wakeUp: WakeUp;
    detail: string;
  }) {
    const notify = dependencies.notifyWakeUpFailed;
    if (!notify) {
      return;
    }
    try {
      await notify({
        workspaceId: args.wakeUp.workspaceId,
        taskId: args.wakeUp.taskId,
        triggerKind: args.wakeUp.trigger.kind,
        detail: args.detail.slice(0, WAKE_UP_LIMITS.maxReasonChars),
      });
    } catch (error) {
      console.warn("[wake-ups] failed to report a lost wake-up", error, {
        wakeUpId: args.wakeUp.id,
        taskId: args.wakeUp.taskId,
      });
    }
  }

  function describeTurnFailure(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  function persistIfChanged(previous: WakeUp, next: WakeUp) {
    if (
      previous.state === next.state &&
      previous.pauseReason === next.pauseReason &&
      previous.stopReason === next.stopReason &&
      previous.reasonDetail === next.reasonDetail &&
      previous.nextRunAt === next.nextRunAt &&
      previous.occurrenceCount === next.occurrenceCount &&
      previous.skippedCount === next.skippedCount &&
      previous.lastOccurrenceAt === next.lastOccurrenceAt &&
      JSON.stringify(previous.pullRequestWatch) ===
        JSON.stringify(next.pullRequestWatch)
    ) {
      // Nothing moved. Rewriting the row every tick would churn `updatedAt` and
      // make every wake-up look freshly changed in the UI.
      return previous;
    }
    return persistence.upsertWakeUp(next);
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
    wakeUp: WakeUp;
    decision: Extract<WakeUpDecision, { action: "fire-completion" }>;
  }) {
    const { wakeUp, decision } = args;
    const consumed: Array<{
      occurrence: WakeUpOccurrence;
      signal: TaskCompletionSignal;
    }> = [];
    for (const signal of decision.completions) {
      const recorded = recordCompletionOccurrence({ wakeUp, signal });
      if (recorded.recorded) {
        consumed.push({ occurrence: recorded.occurrence, signal });
      }
    }
    if (consumed.length === 0) {
      // Every completion in this batch had already been handled. Do not start a
      // second turn and do not spend an occurrence on it.
      return wakeUp;
    }

    const woken = persistIfChanged(
      wakeUp,
      applyWakeUpDecision({
        wakeUp,
        decision: {
          ...decision,
          completions: consumed.map((entry) => entry.signal),
        },
        now: now(),
      }),
    );

    try {
      const turn = await dependencies.runSupervisedTurn({
        workspaceId: wakeUp.workspaceId,
        taskId: wakeUp.taskId,
        prompt: wakeUp.prompt,
        fingerprint: wakeUp.fingerprint,
        ...userRuntimeOptions(wakeUp),
        retrievedContextParts: [
          buildCompletionContextPart({
            wakeUp,
            completions: consumed.map((entry) => entry.signal),
            occurrenceNumber: woken.occurrenceCount,
          }),
        ],
      });
      for (const entry of consumed) {
        persistence.attachWakeUpOccurrenceTurn({
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
        wakeUp,
        detail: `${consumed.length === 1 ? "A finished delegated run" : `${consumed.length} finished delegated runs`} could not be reported to this task: ${detail}`,
      });
    }
    persistence.pruneWakeUpOccurrences({ wakeUpId: wakeUp.id });
    return woken;
  }

  /**
   * One row per consumed pull request signal, keyed by the fact. `recorded ===
   * false` means an earlier wake already consumed it.
   */
  function recordPullRequestOccurrence(args: {
    wakeUp: WakeUp;
    signal: PullRequestWatchSignal;
    pullRequest: PullRequestWatchSnapshot;
    observedAt: string;
  }) {
    const occurrence: WakeUpOccurrence = {
      id: randomUUID(),
      wakeUpId: args.wakeUp.id,
      idempotencyKey: buildWakeUpPullRequestIdempotencyKey({
        wakeUpId: args.wakeUp.id,
        outcome: "fired",
        signalKey: args.signal.key,
      }),
      workspaceId: args.wakeUp.workspaceId,
      taskId: args.wakeUp.taskId,
      turnId: null,
      outcome: "fired",
      reason: describePullRequestSignal(args.signal, args.pullRequest).slice(
        0,
        WAKE_UP_LIMITS.maxReasonChars,
      ),
      scheduledFor: args.observedAt,
      recordedAt: now().toISOString(),
    };
    const recorded = persistence.recordWakeUpOccurrence(occurrence);
    return { recorded, occurrence };
  }

  /**
   * Consume what is new on the pull request with exactly one turn. As with a
   * completion, every signal is written first and only accepted ones count, so
   * a duplicate delivery starts nothing.
   */
  async function firePullRequest(args: {
    /** The row as it was read, before this tick's observation. */
    previous: WakeUp;
    wakeUp: WakeUp;
    decision: Extract<WakeUpDecision, { action: "fire-pull-request" }>;
  }) {
    const { previous, wakeUp, decision } = args;
    const consumed: Array<{
      occurrence: WakeUpOccurrence;
      signal: PullRequestWatchSignal;
    }> = [];
    for (const signal of decision.signals) {
      const recorded = recordPullRequestOccurrence({
        wakeUp,
        signal,
        pullRequest: decision.pullRequest,
        observedAt: decision.observedAt,
      });
      if (recorded.recorded) {
        consumed.push({ occurrence: recorded.occurrence, signal });
      }
    }
    if (consumed.length === 0) {
      return persistIfChanged(previous, wakeUp);
    }
    const signals = consumed.map((entry) => entry.signal);
    const woken = persistIfChanged(
      previous,
      applyWakeUpDecision({
        wakeUp,
        decision: { ...decision, signals },
        now: now(),
      }),
    );

    try {
      const turn = await dependencies.runSupervisedTurn({
        workspaceId: wakeUp.workspaceId,
        taskId: wakeUp.taskId,
        prompt: buildPullRequestWatchPrompt({
          instruction: wakeUp.prompt,
          pullRequest: decision.pullRequest,
          signals,
        }),
        fingerprint: wakeUp.fingerprint,
        ...userRuntimeOptions(wakeUp),
        retrievedContextParts: [
          buildPullRequestContextPart({
            wakeUp,
            pullRequest: decision.pullRequest,
            occurrenceNumber: woken.occurrenceCount,
          }),
        ],
      });
      for (const entry of consumed) {
        persistence.attachWakeUpOccurrenceTurn({
          id: entry.occurrence.id,
          turnId: turn.turnId,
        });
      }
    } catch (error) {
      // Consumed either way: retrying could start a second turn for the same
      // failure. The human hears about it instead.
      const detail = describeTurnFailure(
        error,
        "Failed to start the pull request watch turn.",
      );
      for (const entry of consumed) {
        recordUnreportedOccurrence({ occurrence: entry.occurrence, detail });
      }
      await reportWakeFailure({
        wakeUp,
        detail: `Pull request #${decision.pullRequest.number} needs fixing, but the turn to fix it could not start: ${detail}`,
      });
    }
    persistence.pruneWakeUpOccurrences({ wakeUpId: wakeUp.id });
    return woken;
  }

  async function evaluate(wakeUp: WakeUp, read?: PullRequestWatchRead) {
    const snapshot = await dependencies.getTaskSupervisionSnapshot({
      workspaceId: wakeUp.workspaceId,
      taskId: wakeUp.taskId,
    });
    const completions = await readCompletions(wakeUp);
    const watched = observePullRequest(wakeUp, read);
    // What a pull request watch learned this tick is kept whatever the
    // decision, so "last checked" and the read-failure count stay honest.
    const observed: WakeUp = watched
      ? { ...wakeUp, pullRequestWatch: watched.state }
      : wakeUp;
    const decision = decideWakeUpAction({
      wakeUp: observed,
      observation: buildObservation({
        wakeUp,
        snapshot,
        completions,
        ...(watched ? { pullRequest: watched.observation } : {}),
      }),
      now: now(),
    });

    if (decision.action === "idle") {
      return persistIfChanged(wakeUp, observed);
    }

    if (decision.action === "defer") {
      // Collapsed by idempotency key, so a long user turn leaves one row per
      // missed instant rather than one per tick.
      const deferred = recordOccurrence({
        wakeUp,
        outcome: "deferred",
        scheduledFor: decision.dueAt,
        reason: decision.detail,
      });
      if (deferred.recorded) {
        // The fire paths prune after themselves, but a wake-up can defer for
        // a very long time without ever firing — pruning here keeps its
        // history bounded instead of growing one row per missed instant
        // forever. The `fired` retention floor is unaffected.
        persistence.pruneWakeUpOccurrences({ wakeUpId: wakeUp.id });
      }
      // A watch with signals queued behind the turn re-reads the moment the
      // task is free (see `isPullRequestWatchPollDue`).
      const watch = observed.pullRequestWatch;
      return persistIfChanged(
        wakeUp,
        watch && !watch.pendingSince
          ? { ...observed, pullRequestWatch: { ...watch, pendingSince: now().toISOString() } }
          : observed,
      );
    }

    if (decision.action === "fire-completion") {
      return await fireCompletion({ wakeUp, decision });
    }

    if (decision.action === "fire-pull-request") {
      return await firePullRequest({ previous: wakeUp, wakeUp: observed, decision });
    }

    if (decision.action !== "fire") {
      return persistIfChanged(
        wakeUp,
        applyWakeUpDecision({ wakeUp: observed, decision, now: now() }),
      );
    }

    if (decision.skippedAt.length > 0) {
      // "Missed" has two different causes and the row should not lie about
      // which one happened: an instant that has a durable `deferred` row was
      // skipped while Stave was running but the task was busy with another
      // turn; one without was missed while Stave was not running at all.
      const deferredKeys = new Set(
        persistence
          .listWakeUpOccurrences({
            wakeUpId: wakeUp.id,
            limit: WAKE_UP_LIMITS.maxRetainedOccurrences,
          })
          .filter((occurrence) => occurrence.outcome === "deferred")
          .map((occurrence) => occurrence.idempotencyKey),
      );
      const truncatedSuffix = decision.truncated
        ? " More occurrences were missed than are recorded."
        : "";
      for (const skippedAt of decision.skippedAt) {
        const wasDeferred = deferredKeys.has(
          buildWakeUpIdempotencyKey({
            wakeUpId: wakeUp.id,
            outcome: "deferred",
            scheduledFor: skippedAt,
          }),
        );
        recordOccurrence({
          wakeUp,
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
      wakeUp,
      outcome: "fired",
      scheduledFor: decision.dueAt,
      reason: null,
    });
    if (!fired.recorded) {
      // The occurrence row is the idempotency guard: this instant was already
      // handled by an earlier delivery. Advance the schedule so the duplicate
      // cannot wedge the wake-up, but do not start a second turn and do not
      // count it again — that would burn a slot of the occurrence cap.
      return persistIfChanged(wakeUp, {
        ...wakeUp,
        nextRunAt: decision.nextRunAt,
        updatedAt: now().toISOString(),
      });
    }
    const advanced = persistIfChanged(
      wakeUp,
      applyWakeUpDecision({ wakeUp, decision, now: now() }),
    );

    try {
      const turn = await dependencies.runSupervisedTurn({
        workspaceId: wakeUp.workspaceId,
        taskId: wakeUp.taskId,
        prompt: wakeUp.prompt,
        fingerprint: wakeUp.fingerprint,
        ...userRuntimeOptions(wakeUp),
        retrievedContextParts: [
          buildWakeUpContextPart({
            wakeUp,
            dueAt: decision.dueAt,
            occurrenceNumber: advanced.occurrenceCount,
          }),
        ],
      });
      persistence.attachWakeUpOccurrenceTurn({
        id: fired.occurrence.id,
        turnId: turn.turnId,
      });
    } catch (error) {
      // A failed start is not terminal: the task may simply have begun a turn
      // between the snapshot and the call. The reason is recorded and the next
      // tick re-evaluates from live state, which stops the wake-up if the
      // task really is gone. This instant is spent either way, so the human
      // hears about it rather than reading a `scheduled` row that quietly
      // skipped a beat.
      const detail = describeTurnFailure(
        error,
        "Failed to start the scheduled turn.",
      );
      recordUnreportedOccurrence({ occurrence: fired.occurrence, detail });
      await reportWakeFailure({
        wakeUp,
        detail: `A schedule for ${decision.dueAt} could not start: ${detail}`,
      });
    }
    persistence.pruneWakeUpOccurrences({ wakeUpId: wakeUp.id });
    return advanced;
  }

  async function tick(reads: ReadonlyMap<string, PullRequestWatchRead>) {
    for (const wakeUp of persistence.listActiveWakeUps()) {
      try {
        await evaluate(wakeUp, reads.get(wakeUp.id));
      } catch (error) {
        console.error("[wake-ups] wake-up evaluation failed", error, {
          wakeUpId: wakeUp.id,
          taskId: wakeUp.taskId,
        });
      }
    }
  }

  /**
   * Boot sweep. A turn a wake-up started before Stave was killed is still
   * open in SQLite, so `hasActiveTurn` would be true forever and every later
   * occurrence would defer behind a turn that will never finish.
   */
  function closeInterruptedWakeUpTurns() {
    for (const wakeUp of persistence.listActiveWakeUps()) {
      const latest = persistence
        .listWakeUpOccurrences({ wakeUpId: wakeUp.id, limit: 5 })
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
  async function reportInterruptedWakeUps() {
    for (const wakeUp of persistence.listActiveWakeUps()) {
      const occurrences = persistence.listWakeUpOccurrences({
        wakeUpId: wakeUp.id,
        limit:
          WAKE_UP_LIMITS.maxRetainedOccurrences +
          WAKE_UP_LIMITS.minRetainedFiredOccurrences,
      });
      const alreadyReported = new Set(
        occurrences.map((occurrence) => occurrence.idempotencyKey),
      );
      const lost = occurrences.filter(
        (occurrence) =>
          occurrence.outcome === "fired" &&
          !occurrence.turnId &&
          !alreadyReported.has(
            buildWakeUpUnreportedKey(occurrence.idempotencyKey),
          ),
      );
      if (lost.length === 0) {
        continue;
      }
      const detail =
        "Stave stopped before this schedule reached the task, so it was consumed without a turn.";
      for (const occurrence of lost) {
        recordUnreportedOccurrence({ occurrence, detail });
      }
      await reportWakeFailure({
        wakeUp,
        detail: `${lost.length === 1 ? "One schedule" : `${lost.length} schedules`} were lost when Stave stopped: ${detail}`,
      });
    }
  }

  function describeReadError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return (message || "Stave could not read the pull request.").slice(
      0,
      PULL_REQUEST_WATCH_LIMITS.maxErrorChars,
    );
  }

  /** Watches due a read, from a synchronous look at the rows alone. */
  function listPullRequestReadCandidates() {
    if (!dependencies.readPullRequestWatch) return [];
    const at = now();
    return persistence.listActiveWakeUps().filter(
      (wakeUp) =>
        wakeUp.trigger.kind === "pull_request" &&
        wakeUp.state === "scheduled" &&
        // `hasActiveTurn: false` is the widest answer; the live snapshot
        // narrows it below once it has been read.
        isPullRequestWatchPollDue({ state: wakeUp.pullRequestWatch, now: at, hasActiveTurn: false }),
    );
  }

  /**
   * Reads every due watch concurrently. A task that is gone or archived is not
   * read at all — the tick stops its watch without asking GitHub — and a busy
   * one is read only on the interval.
   */
  async function readPullRequests(candidates: WakeUp[]) {
    const reads = new Map<string, PullRequestWatchRead>();
    const read = dependencies.readPullRequestWatch;
    if (!read) return reads;
    await Promise.all(
      candidates.map(async (wakeUp) => {
        if (wakeUp.trigger.kind !== "pull_request") return;
        const snapshot = await dependencies
          .getTaskSupervisionSnapshot({ workspaceId: wakeUp.workspaceId, taskId: wakeUp.taskId })
          .catch(() => null);
        if (!snapshot?.exists || snapshot.archived) return;
        if (
          !isPullRequestWatchPollDue({
            state: wakeUp.pullRequestWatch,
            now: now(),
            hasActiveTurn: Boolean(snapshot.activeTurnId),
          })
        ) {
          return;
        }
        let result: PullRequestWatchRead;
        try {
          result = PullRequestWatchReadSchema.parse(
            await read({
              workspaceId: wakeUp.workspaceId,
              taskId: wakeUp.taskId,
              pullRequestNumber: wakeUp.pullRequestWatch?.pullRequest?.number ?? null,
              events: wakeUp.trigger.events,
            }),
          );
        } catch (error) {
          result = { ok: false, error: describeReadError(error) };
        }
        reads.set(wakeUp.id, result);
      }),
    );
    return reads;
  }

  /**
   * A tick with no watch due a read enqueues at once, exactly as before
   * pull request watches existed. Otherwise the reads go out first, outside
   * the chain, and the tick that consumes them is enqueued when they land. If
   * the previous tick's reads are still out, this one evaluates without new
   * reads rather than piling a second round on top.
   */
  function startTick(): Promise<void> {
    const candidates = pullRequestReadsInFlight ? [] : listPullRequestReadCandidates();
    if (candidates.length === 0) {
      return enqueue(() => tick(new Map()));
    }
    const tracked: Promise<void> = readPullRequests(candidates)
      .catch((error) => {
        console.error("[wake-ups] pull request reads failed", error);
        return new Map<string, PullRequestWatchRead>();
      })
      .then((reads) => enqueue(() => tick(reads)))
      .finally(() => {
        if (pullRequestReadsInFlight === tracked) pullRequestReadsInFlight = null;
      });
    pullRequestReadsInFlight = tracked;
    return tracked;
  }

  async function whenIdle() {
    while (pullRequestReadsInFlight) {
      await pullRequestReadsInFlight.catch(() => undefined);
    }
    await enqueue(() => undefined);
  }

  function start() {
    if (intervalHandle) {
      return;
    }
    try {
      // The boot sweep must not be able to keep the supervisor from starting:
      // one unreadable wake-up row would otherwise take every wake-up (and
      // the host service's startup path) down with it.
      closeInterruptedWakeUpTurns();
    } catch (error) {
      console.error(
        "[wake-ups] failed to close interrupted wake-up turns",
        error,
      );
    }
    void enqueue(reportInterruptedWakeUps).catch((error) => {
      console.error(
        "[wake-ups] failed to report interrupted wake-ups",
        error,
      );
    });
    // Returns the tick so a test clock can await it; `setInterval` ignores it.
    const enqueueTick = () =>
      startTick().catch((error) => {
        console.error("[wake-ups] tick failed", error);
      });
    intervalHandle = setIntervalImpl(
      enqueueTick,
      WAKE_UP_TICK_INTERVAL_MS,
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

  function refuseWhileAgentRunActive(taskId: string) {
    const refusal = refuseWakeUpForAgentRun(
      dependencies.getActiveAgentRunForTask?.(taskId) ?? null,
    );
    if (refusal) throw new Error(refusal);
  }

  async function requireSupervisableTask(args: {
    workspaceId: string;
    taskId: string;
  }) {
    refuseWhileAgentRunActive(args.taskId);
    const snapshot = await dependencies.getTaskSupervisionSnapshot(args);
    if (!snapshot.exists || !snapshot.repositoryPath) {
      throw new Error(`Task not found: ${args.taskId}`);
    }
    if (snapshot.archived) {
      throw new Error("This task is archived, so it cannot be woken.");
    }
    if (!snapshot.providerId || !snapshot.model) {
      throw new Error("This task has no resolved provider yet.");
    }
    if (snapshot.providerId !== "claude-code" && snapshot.providerId !== "codex") {
      throw new Error("Check-back schedules are available for Claude and Codex tasks.");
    }
    return { ...snapshot, providerId: snapshot.providerId, model: snapshot.model, repositoryPath: snapshot.repositoryPath };
  }

  /**
   * Refuse up front rather than accept a wake-up that could never fire. The
   * decision policy would stop it on the very next tick anyway; failing here
   * gives the caller the reason instead of a row that dies silently.
   */
  function requireObservableCompletion(args: {
    trigger: WakeUpUpsertInput["trigger"];
    snapshot: TaskSupervisionSnapshot;
  }) {
    if (args.trigger.kind === "pull_request" && !dependencies.readPullRequestWatch) {
      throw new Error(
        "Stave cannot read pull requests here, so a pull request watch would never run.",
      );
    }
    if (args.trigger.kind !== "completion") {
      return;
    }
    if (probeCompletionObservability(args.snapshot) === "unsupported") {
      throw new Error(
        "Stave cannot observe when this task's delegated work finishes, so a subagent-completion schedule would never run. Use a cadence.",
      );
    }
  }

  return {
    start,
    stop,
    whenIdle,
    list: (args) =>
      enqueue(() =>
        toSnapshot(
          args?.workspaceId
            ? persistence.listWakeUpsForWorkspace(args.workspaceId)
            : persistence.listWakeUps(),
        ),
      ),
    get: ({ id }) =>
      enqueue(() => {
        const wakeUp = requireWakeUp(id);
        return {
          wakeUp,
          occurrences: persistence.listWakeUpOccurrences({
            wakeUpId: id,
            limit: 20,
          }),
        };
      }),
    create: (rawInput) =>
      enqueue(async () => {
        const input = WakeUpUpsertInputSchema.parse(rawInput);
        const existing = persistence.getWakeUpByTaskId(input.taskId);
        if (existing && existing.state !== "stopped") {
          throw new Error(
            "This task already has a schedule. Update or remove it first.",
          );
        }
        const snapshot = await requireSupervisableTask({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        });
        requireObservableCompletion({ trigger: input.trigger, snapshot });
        if (existing) {
          // A stopped wake-up is terminal but still occupies the task. Adding
          // a new one replaces it rather than resurrecting a stale reason.
          persistence.removeWakeUp(existing.id);
        }
        return persistence.upsertWakeUp(
          createWakeUp({
            id: randomUUID(),
            input,
            repositoryPath: snapshot.repositoryPath!,
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
        const input = WakeUpUpsertInputSchema.parse(rawInput);
        const current = requireWakeUp(id);
        if (current.state === "stopped") {
          // Matches `resume`: a stopped wake-up is terminal for a stated
          // reason, and an update quietly rescheduling it would erase that
          // reason. Creating a fresh wake-up replaces a stopped one instead.
          throw new Error(
            `This schedule stopped for good: ${current.reasonDetail ?? current.stopReason}. Add a new one instead.`,
          );
        }
        if (
          input.taskId !== current.taskId ||
          input.workspaceId !== current.workspaceId
        ) {
          throw new Error(
            "A schedule cannot be moved to another task. Remove it and add one there.",
          );
        }
        const snapshot = await requireSupervisableTask({
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        });
        requireObservableCompletion({ trigger: input.trigger, snapshot });
        // An update is a fresh agreement: it re-captures the runtime identity
        // and clears any pause, including a runtime-changed one.
        const updated = createWakeUp({
          id: current.id,
          input,
          repositoryPath: snapshot.repositoryPath!,
          fingerprint: {
            providerId: snapshot.providerId!,
            model: snapshot.model!,
          },
          now: now(),
        });
        return persistence.upsertWakeUp({
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
          // Editing a watch's events keeps what it has seen and its receipts,
          // so a failure already reported is not reported again.
          pullRequestWatch:
            input.trigger.kind === "pull_request" &&
            current.trigger.kind === "pull_request"
              ? (current.pullRequestWatch ?? updated.pullRequestWatch)
              : updated.pullRequestWatch,
        });
      }),
    pause: ({ id }) =>
      enqueue(() => {
        const current = requireWakeUp(id);
        if (current.state === "stopped") {
          throw new Error("This schedule already stopped.");
        }
        return persistence.upsertWakeUp({
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
        const current = requireWakeUp(id);
        refuseWhileAgentRunActive(current.taskId);
        if (current.state === "stopped") {
          throw new Error(
            `This schedule stopped for good: ${current.reasonDetail ?? current.stopReason}. Add a new one instead.`,
          );
        }
        return persistence.upsertWakeUp(
          applyWakeUpDecision({
            wakeUp: current,
            decision: { action: "resume" },
            now: now(),
          }),
        );
      }),
    remove: ({ id }) =>
      enqueue(() => {
        requireWakeUp(id);
        persistence.removeWakeUp(id);
        return { ok: true as const, id };
      }),
  };
}
