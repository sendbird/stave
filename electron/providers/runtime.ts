import {
  buildClaudeEnv,
  cleanupClaudeMcpOauthFlows,
  cleanupClaudeTask,
  getClaudeCommandCatalog,
  resolveClaudeExecutablePath,
  streamClaudeWithSdk,
} from "./claude-sdk-runtime";
import { buildCodexCliEnv } from "./cli-path-env";
import {
  resolveCodexExecutablePath,
  cleanupCodexAppServerTask,
  disposeAllCodexAppServerClients,
  streamCodexWithAppServer,
} from "./codex-app-server-runtime";
import {
  describeCursorAvailability,
  streamCursorWithAcp,
} from "./cursor/cursor-acp-profile";
import {
  describeKiroAvailability,
  streamKiroWithAcp,
} from "./kiro/kiro-acp-profile";
import {
  appendBoundedBridgeEvent,
  createBoundedBridgeEventCollector,
  dropBufferedBridgeEvents,
} from "./provider-buffering";
import { getProviderConnectedToolStatus } from "./connected-tool-status";
import type {
  BridgeEvent,
  ProviderResponderResult,
  ProviderRuntime,
  StreamTurnArgs,
} from "./types";
import {
  getCodexSlashCommandCatalogDetail,
  listCodexSlashCommands,
} from "../../src/lib/providers/codex-command-catalog";
import { randomUUID } from "node:crypto";
import { probeExecutableVersion } from "./runtime-shared";
import {
  createEmptyProviderRuntimeCapabilities,
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../../src/lib/providers/runtime-capabilities";
import {
  PROVIDER_STEER_ACK_TIMEOUT_MS,
  waitForSteerDelivery,
} from "../../src/lib/providers/steer-delivery";
import {
  appendAdvisorConsultBriefing,
  normalizeAdvisorConsultLimit,
  normalizeAdvisorTarget,
  shouldRunAdvisor,
  withoutAdvisorTarget,
} from "../../src/lib/providers/advisor";
import {
  buildAdvisorArmedEvent,
  createAdvisorUsageMerger,
  mergeAdvisorUsage,
} from "./advisor-runtime";
import {
  cleanupAdvisorSessionsForTask,
  consultAdvisor,
  registerAdvisorConsultGrant,
} from "./advisor-consult";
import {
  cleanupAcpWorkerSessionsForTask,
  disposeAllAcpWorkerGrants,
  registerAcpWorkerGrant,
  runAcpWorker,
} from "./acp/acp-worker-runtime";
import { getProviderModelCatalog } from "./provider-model-catalog";
import { createProviderApprovalRouter } from "./provider-approval-router";
import {
  WORKER_DELEGATE_TOOL_NAME,
  appendAcpWorkerBriefing,
  buildAcpWorkerPrimaryInstructions,
  resolveWorkerProfile,
  type ResolvedWorkerProfile,
} from "../../src/lib/providers/worker-mode";
import {
  createProviderTurnLifecycle,
  type ProviderTurnLifecycleSnapshot,
} from "./provider-turn-lifecycle";
import { DEFAULT_PROVIDER_TIMEOUT_MS } from "../../src/lib/providers/runtime-option-contract";

const sdkTurnTimeoutMs = Number(
  process.env.STAVE_PROVIDER_TIMEOUT_MS ?? DEFAULT_PROVIDER_TIMEOUT_MS,
);
const ACTIVE_STREAM_TTL_MS = 15 * 60 * 1000;
const COMPLETED_STREAM_TTL_MS = 60 * 1000;
const ACTIVE_STREAM_RETAINED_BYTES_MAX = 512 * 1024;
const BATCH_TURN_RETAINED_BYTES_MAX = 2 * 1024 * 1024;
const DEFAULT_PROVIDER_TASK_KEY = "default";
type TurnTimeoutController = {
  promise: Promise<null>;
  /**
   * Suspend the turn clock while the UI waits on one user decision. Pass the
   * decision's `requestId` as `key`: pauses are tracked per decision, so a
   * re-emitted approval can't leave a phantom pause behind and an unrelated
   * signal can't release a decision that is still waiting. Keyless calls get an
   * anonymous per-call pause (legacy refcount behaviour).
   */
  pauseForDecision: (args?: { key?: string }) => void;
  resumeAfterDecision: (args?: { key?: string }) => void;
  /** Release every outstanding decision pause (terminal stream signals). */
  resumeAllDecisions: () => void;
  /** Suspend the clock for a named runtime phase (e.g. an advisor consult). */
  pausePhase: (args: { phase: string }) => void;
  resumePhase: (args: { phase: string }) => void;
  dispose: () => void;
  readonly timedOut: boolean;
  /** Diagnostics: which decision pauses are still outstanding. */
  readonly pausedDecisionKeys: string[];
};

const ANONYMOUS_DECISION_PAUSE_PREFIX = "anonymous:";

type ActiveRuntimeSession = {
  turnId: string;
  providerId: StreamTurnArgs["providerId"];
  taskId?: string;
  streamId?: string;
  abort?: () => void;
  respondApproval?: (args: {
    requestId: string;
    approved: boolean;
    reason?: string;
    scope?: "once" | "always";
  }) => ProviderResponderResult;
  respondUserInput?: (args: {
    requestId: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => ProviderResponderResult;
  steer?: (args: {
    text: string;
    clientMessageId?: string;
  }) => Promise<ProviderResponderResult>;
  /**
   * Cancels the in-flight advisor consult while keeping the primary turn.
   * Separate from `abort` so escaping a slow advisor never costs the user
   * their whole turn. Returns `false` when no consult is running.
   */
  skipAdvisor?: () => boolean;
  timeoutController?: TurnTimeoutController;
};

const activeSessions = new Map<string, ActiveRuntimeSession>();
type ActiveStreamSession = {
  events: BridgeEvent[];
  done: boolean;
  updatedAt: number;
  baseCursor: number;
  retainedBytes: number;
};

const activeStreams = new Map<string, ActiveStreamSession>();
/**
 * Tracks in-flight turn promises so `shutdown()` can await their completion
 * before the caller closes the persistence layer.  Without this, abort is
 * fire-and-forget and the `.finally()` → `onDone()` callback races with
 * SQLite being closed → "database connection is not open".
 */
const activeTurnPromises = new Map<string, Promise<void>>();
let lastCompletedLifecycleSnapshot: ProviderTurnLifecycleSnapshot | null = null;

export function getProviderRuntimeLifecycleSnapshot() {
  return {
    activeSessionCount: activeSessions.size,
    activeStreamCount: activeStreams.size,
    activeTurnPromiseCount: activeTurnPromises.size,
    lastCompleted: lastCompletedLifecycleSnapshot,
  };
}
function upsertActiveSession(args: {
  turnId: string;
  providerId: StreamTurnArgs["providerId"];
  taskId?: string;
  streamId?: string;
  abort?: () => void;
  respondApproval?: ActiveRuntimeSession["respondApproval"];
  respondUserInput?: ActiveRuntimeSession["respondUserInput"];
  steer?: ActiveRuntimeSession["steer"];
  skipAdvisor?: ActiveRuntimeSession["skipAdvisor"];
  timeoutController?: TurnTimeoutController;
}) {
  const current = activeSessions.get(args.turnId);
  activeSessions.set(args.turnId, {
    turnId: args.turnId,
    providerId: args.providerId,
    taskId: args.taskId ?? current?.taskId,
    streamId: args.streamId ?? current?.streamId,
    abort: args.abort ?? current?.abort,
    respondApproval: args.respondApproval ?? current?.respondApproval,
    respondUserInput: args.respondUserInput ?? current?.respondUserInput,
    steer: args.steer ?? current?.steer,
    skipAdvisor: args.skipAdvisor ?? current?.skipAdvisor,
    timeoutController: args.timeoutController ?? current?.timeoutController,
  });
}

function toClaudeErrorEvents(args: { message: string }): BridgeEvent[] {
  return [
    { type: "error", message: args.message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

function toCodexErrorEvents(args: { message: string }): BridgeEvent[] {
  return [
    { type: "error", message: args.message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

function toInteractiveAcpErrorEvents(args: { message: string }): BridgeEvent[] {
  return [
    { type: "error", message: args.message, recoverable: true },
    { type: "done", stop_reason: "runtime_failure" },
  ];
}

function abortActive(args: { turnId: string }) {
  const session = activeSessions.get(args.turnId);
  const aborter = session?.abort;
  if (!aborter) {
    return false;
  }
  aborter();
  activeSessions.delete(args.turnId);
  return true;
}

function clearActiveTurnState(args: { turnId: string }) {
  activeSessions.delete(args.turnId);
}

function skipAdvisorForTurn(args: { turnId: string }) {
  const skip = activeSessions.get(args.turnId)?.skipAdvisor;
  return skip ? skip() : false;
}

function summarizeActiveTurns() {
  return Array.from(activeSessions.values()).map((session) => ({
    turnId: session.turnId,
    providerId: session.providerId,
    taskId: session.taskId,
  }));
}

/**
 * Inject a bridge warning into the active stream for a given turn, if any is
 * open. The UI picks these up via the same channel as runtime errors, so the
 * renderer can surface a toast/log entry instead of silently ignoring a failed
 * IPC response. Safe to call when no stream exists — it simply no-ops.
 */
function emitBridgeWarningForTurn(args: { turnId: string; message: string }) {
  const streamId = activeSessions.get(args.turnId)?.streamId;
  if (!streamId) {
    return;
  }
  const session = activeStreams.get(streamId);
  if (!session) {
    return;
  }
  appendStreamEvent(session, {
    type: "error",
    message: args.message,
    recoverable: true,
  });
  session.updatedAt = Date.now();
}

type ResponderKind = "approval" | "user-input" | "steer";

function describeResponderKind(kind: ResponderKind) {
  if (kind === "approval") {
    return "approval";
  }
  if (kind === "steer") {
    return "steer";
  }
  return "user-input";
}

function describeResponderSuccessLabel(kind: ResponderKind) {
  if (kind === "approval") {
    return "Approval";
  }
  if (kind === "steer") {
    return "Steer";
  }
  return "User-input";
}

/**
 * Shared delivery path for `respondApproval` / `respondUserInput`.
 *
 * Why the indirection:
 * - Both responders share the same miss paths (no active session / responder
 *   rejected with unknown-request), and both need to surface a bridge warning
 *   so the renderer can react even though the direct IPC `ok:false` response
 *   is often unhandled by hot UI surfaces.
 * - Capturing pending request IDs and active turn IDs in the error message
 *   turns an opaque "didn't land" into a diagnosable "we expected X, got Y".
 */
async function deliverResponderResult<
  Responder extends (
    ...args: never[]
  ) => ProviderResponderResult | Promise<ProviderResponderResult>,
>(args: {
  kind: ResponderKind;
  turnId: string;
  requestId: string;
  selectResponder: (session: ActiveRuntimeSession) => Responder | undefined;
  invoke: (
    responder: Responder,
  ) => ProviderResponderResult | Promise<ProviderResponderResult>;
  timeoutMs?: number;
}): Promise<{ ok: boolean; message: string; timedOut?: boolean }> {
  const label = describeResponderKind(args.kind);
  const successLabel = describeResponderSuccessLabel(args.kind);
  const session = activeSessions.get(args.turnId);
  const responder = session ? args.selectResponder(session) : undefined;
  if (!session || !responder) {
    const activeTurns = summarizeActiveTurns();
    const activeTurnIds = activeTurns.map((entry) => entry.turnId);
    const message =
      `No active ${label} responder for turn ${args.turnId}. ` +
      `requestId=${args.requestId}. activeTurnIds=[${activeTurnIds.join(", ")}]`;
    // Try to surface the warning onto an adjacent live stream for the same
    // taskId even though the turn itself is gone — best-effort only.
    for (const entry of activeTurns) {
      emitBridgeWarningForTurn({ turnId: entry.turnId, message });
    }
    return { ok: false, message };
  }

  const response = Promise.resolve().then(() => args.invoke(responder));
  const delivery =
    args.timeoutMs === undefined
      ? ({ status: "resolved", value: await response } as const)
      : await waitForSteerDelivery({
          response,
          timeoutMs: args.timeoutMs,
        });
  if (delivery.status === "timed-out") {
    const message =
      `${successLabel} delivery acknowledgement timed out after ` +
      `${Math.round(args.timeoutMs! / 1_000)}s for turn ${args.turnId}. ` +
      `requestId=${args.requestId}. The provider may still accept it; wait for the current response before retrying or queueing.`;
    emitBridgeWarningForTurn({ turnId: args.turnId, message });
    return { ok: false, message, timedOut: true };
  }

  const result = delivery.value;
  if (result.ok) {
    // The user has made their decision — resume the turn-level timeout so
    // the provider's generation budget resumes from the full allowance.
    // Keyed by `requestId` so this releases exactly the decision that was just
    // answered: steering is additive (it answers no pending decision) and its
    // own request id is never in the paused set, so it stays a no-op.
    session.timeoutController?.resumeAfterDecision({ key: args.requestId });
    return {
      ok: true,
      message: `${successLabel} response delivered to turn ${args.turnId}. requestId=${args.requestId}`,
    };
  }

  const pendingIds = result.pendingRequestIds.join(", ");
  const rejectionDetail =
    result.reason === "turn-not-steerable"
      ? "turn not steerable"
      : "unknown request";
  const message =
    `${successLabel} responder rejected (${rejectionDetail}) for turn ${args.turnId}. ` +
    `requestId=${args.requestId}. pendingRequestIds=[${pendingIds}]`;
  emitBridgeWarningForTurn({ turnId: args.turnId, message });
  return { ok: false, message };
}

function pruneExpiredStreams(now = Date.now()) {
  for (const [streamId, session] of activeStreams.entries()) {
    const ttl = session.done ? COMPLETED_STREAM_TTL_MS : ACTIVE_STREAM_TTL_MS;
    if (now - session.updatedAt > ttl) {
      activeStreams.delete(streamId);
    }
  }
}

function getStreamEndCursor(session: ActiveStreamSession) {
  return session.baseCursor + session.events.length;
}

function compactStreamToCursor(session: ActiveStreamSession, cursor: number) {
  const nextCursor = Math.max(
    session.baseCursor,
    Math.min(cursor, getStreamEndCursor(session)),
  );
  const dropCount = nextCursor - session.baseCursor;
  if (dropCount > 0) {
    session.retainedBytes = dropBufferedBridgeEvents({
      events: session.events,
      retainedBytes: session.retainedBytes,
      dropCount,
    });
    session.baseCursor = nextCursor;
  }
  return nextCursor;
}

function appendStreamEvent(session: ActiveStreamSession, event: BridgeEvent) {
  const result = appendBoundedBridgeEvent({
    events: session.events,
    next: event,
    retainedBytes: session.retainedBytes,
    maxBytes: ACTIVE_STREAM_RETAINED_BYTES_MAX,
  });
  session.retainedBytes = result.retainedBytes;
  session.baseCursor += result.droppedCount;
}

function cleanupProviderTaskState(taskId: string) {
  cleanupAdvisorSessionsForTask(taskId);
  cleanupAcpWorkerSessionsForTask(taskId);
  cleanupClaudeTask(taskId);
  cleanupCodexAppServerTask(taskId);
}

function clearActiveTaskSessions(args: { taskId: string }) {
  for (const [turnId, session] of activeSessions.entries()) {
    if (session.taskId !== args.taskId) {
      continue;
    }
    session.abort?.();
    activeSessions.delete(turnId);
  }
}

function describeClaudeAvailability(
  args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {},
) {
  const executablePath = resolveClaudeExecutablePath({
    explicitPath: args.runtimeOptions?.claudeBinaryPath,
  });
  if (!executablePath) {
    return {
      available: false,
      detail:
        "Claude CLI not found from runtime override, STAVE_CLAUDE_CLI_PATH, CLAUDE_CODE_PATH, login-shell PATH, or home-bin candidates.",
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  }

  const versionProbe = probeExecutableVersion({
    executablePath,
    env: buildClaudeEnv({ executablePath }),
  });
  const available = versionProbe.status === 0;
  const version = extractRuntimeVersion(versionProbe.text);
  const detail = available
    ? `Resolved Claude CLI: ${executablePath}`
    : [
        `Claude executable probe failed: ${executablePath}`,
        versionProbe.stderr,
        versionProbe.error,
      ]
        .filter(Boolean)
        .join("\n");
  return {
    available,
    detail,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "claude-code",
      versionText: versionProbe.text,
      available,
    }),
  };
}

function describeCodexAvailability(
  args: { runtimeOptions?: StreamTurnArgs["runtimeOptions"] } = {},
) {
  const executablePath = resolveCodexExecutablePath({
    explicitPath: args.runtimeOptions?.codexBinaryPath,
  });
  if (!executablePath) {
    return {
      available: false,
      detail:
        "Codex executable not found from runtime override, env vars, login-shell PATH, or home-bin candidates.",
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  }

  const versionProbe = probeExecutableVersion({
    executablePath,
    env: buildCodexCliEnv({ executablePath }),
  });
  const available = versionProbe.status === 0;
  const version = extractRuntimeVersion(versionProbe.text);
  const detail = available
    ? `Resolved Codex executable: ${executablePath}`
    : [
        `Codex executable probe failed: ${executablePath}`,
        versionProbe.stderr,
        versionProbe.error,
      ]
        .filter(Boolean)
        .join("\n");
  return {
    available,
    detail,
    ...(version ? { version } : {}),
    capabilities: resolveProviderRuntimeCapabilities({
      providerId: "codex",
      versionText: versionProbe.text,
      available,
    }),
  };
}

/**
 * Turn-level timeout that can be paused while the UI is waiting on a user
 * decision (approval, user-input elicitation, or blocking plan review).
 *
 * Why pausing matters: without this, an unattended approval prompt that sits
 * idle for longer than `sdkTurnTimeoutMs` (12 hours by default) silently aborts
 * the turn the moment the user finally clicks Approve. That produces the
 * "plan completed but UI is stuck" symptom because the abort races with
 * the tool_result, corrupting replay state.
 *
 * Semantics:
 * - The timer starts when the turn is created.
 * - `pauseForDecision({ key })` is called each time the bridge emits `approval`,
 *   `user_input`, or a blocking `plan_ready`, keyed by the decision's request id.
 * - `resumeAfterDecision({ key })` is called when a responder fires
 *   successfully (via respondApproval/respondUserInput) OR on a `tool_result`
 *   whose `tool_use_id` matches the request.
 * - On resume we deliberately **reset** the remaining budget to the full
 *   `timeoutMs` rather than continue where we paused: the user's
 *   deliberation latency should never eat the provider's generation budget.
 * - `dispose()` is called from the finally block regardless of outcome.
 *
 * Why pauses are keyed instead of refcounted: a bare counter has to be
 * perfectly balanced or it desynchronises in one of two ways, both observed as
 * "the turn hangs forever."
 * - Over-pausing: the same decision pausing twice (a replayed/re-emitted
 *   approval event) leaves the count above zero after the single matching
 *   resume, so the clock never restarts and the turn sits paused for good.
 * - Over-resuming: any `tool_result` decremented the count, so an unrelated
 *   tool finishing while an approval was still on screen restarted the clock
 *   and could abort the turn mid-deliberation — the exact failure the pause
 *   exists to prevent.
 * Keying by `requestId` makes both impossible: a duplicate pause for a known
 * decision is a no-op, and a resume for an unknown key never releases someone
 * else's pause. Runtime phases that are not user decisions (the advisor
 * preflight) use `pausePhase`/`resumePhase` so a terminal
 * `resumeAllDecisions()` cannot unpause them behind their own `finally`.
 *
 * Deliberately *not* capped: an approval may legitimately sit unanswered for
 * hours while the user is away, so there is no wall-clock ceiling on a pause
 * here. Reclaiming a turn nobody will ever answer is the renderer's job — see
 * `createStalledProviderTurnAborter` in `src/store/provider-turn-stall-abort.ts`,
 * which force-aborts through this runtime once the prompt is gone and the
 * stream has been silent past its grace window.
 */
export function createTurnTimeoutController(args: {
  timeoutMs: number;
  onTimeout: () => void;
}): TurnTimeoutController {
  let remainingMs = args.timeoutMs;
  let handle: NodeJS.Timeout | null = null;
  let disposed = false;
  let timedOut = false;
  const pausedDecisionKeys = new Set<string>();
  const pausedPhases = new Set<string>();
  let anonymousDecisionSeq = 0;

  let resolvePromise: (value: null) => void = () => {};
  const promise = new Promise<null>((resolve) => {
    resolvePromise = resolve;
  });

  const stopTimer = () => {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  };

  const start = () => {
    if (disposed || handle !== null || timedOut) {
      return;
    }
    handle = setTimeout(() => {
      handle = null;
      if (disposed || timedOut) {
        return;
      }
      timedOut = true;
      args.onTimeout();
      resolvePromise(null);
    }, remainingMs);
  };

  const isPaused = () => pausedDecisionKeys.size > 0 || pausedPhases.size > 0;

  /**
   * Apply the timer side effect for a pause-set transition. Called after every
   * mutation so a nested pause (two decisions at once, or a decision arriving
   * during the advisor preflight) neither restarts the clock early nor stops an
   * already-stopped one.
   */
  const syncTimerToPauseState = (wasPaused: boolean) => {
    const paused = isPaused();
    if (paused === wasPaused) {
      return;
    }
    if (paused) {
      stopTimer();
      return;
    }
    remainingMs = args.timeoutMs;
    start();
  };

  const pauseForDecision = (options?: { key?: string }) => {
    if (disposed || timedOut) {
      return;
    }
    const key =
      options?.key ??
      `${ANONYMOUS_DECISION_PAUSE_PREFIX}${(anonymousDecisionSeq += 1)}`;
    if (pausedDecisionKeys.has(key)) {
      // Same decision paused twice (re-emitted approval / replayed event).
      return;
    }
    const wasPaused = isPaused();
    pausedDecisionKeys.add(key);
    syncTimerToPauseState(wasPaused);
  };

  const resumeAfterDecision = (options?: { key?: string }) => {
    if (disposed || timedOut) {
      return;
    }
    const wasPaused = isPaused();
    if (options?.key !== undefined) {
      if (!pausedDecisionKeys.delete(options.key)) {
        // Unknown or already-resumed decision: never release a pause that
        // belongs to a decision still waiting on the user.
        return;
      }
    } else {
      const anonymousKey = [...pausedDecisionKeys].find((candidate) =>
        candidate.startsWith(ANONYMOUS_DECISION_PAUSE_PREFIX),
      );
      if (anonymousKey === undefined) {
        return;
      }
      pausedDecisionKeys.delete(anonymousKey);
    }
    syncTimerToPauseState(wasPaused);
  };

  const resumeAllDecisions = () => {
    if (disposed || timedOut || pausedDecisionKeys.size === 0) {
      return;
    }
    const wasPaused = isPaused();
    pausedDecisionKeys.clear();
    syncTimerToPauseState(wasPaused);
  };

  const pausePhase = (options: { phase: string }) => {
    if (disposed || timedOut || pausedPhases.has(options.phase)) {
      return;
    }
    const wasPaused = isPaused();
    pausedPhases.add(options.phase);
    syncTimerToPauseState(wasPaused);
  };

  const resumePhase = (options: { phase: string }) => {
    if (disposed || timedOut) {
      return;
    }
    const wasPaused = isPaused();
    if (!pausedPhases.delete(options.phase)) {
      return;
    }
    syncTimerToPauseState(wasPaused);
  };

  const dispose = () => {
    disposed = true;
    stopTimer();
  };

  start();

  return {
    promise,
    pauseForDecision,
    resumeAfterDecision,
    resumeAllDecisions,
    pausePhase,
    resumePhase,
    dispose,
    get timedOut() {
      return timedOut;
    },
    get pausedDecisionKeys() {
      return [...pausedDecisionKeys];
    },
  };
}

export function getProviderDecisionRequestId(event: BridgeEvent) {
  if (event.type === "approval" || event.type === "user_input") {
    return event.requestId;
  }
  if (
    event.type === "plan_ready" &&
    event.review?.responseMode === "blocking"
  ) {
    return event.review.requestId;
  }
  return null;
}

async function runProviderTurn(
  args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void },
) {
  const lifecycle = createProviderTurnLifecycle({
    onEvent: args.onEvent,
  });
  /**
   * Set once the advisor usage mapper exists. Terminal `done` events synthesised
   * here bypass the per-event mapper, so without this flush the advisor's tokens
   * were billed but never reported whenever the turn timed out or aborted.
   */
  let flushAdvisorUsage: (() => BridgeEvent[]) | null = null;
  const finishLifecycle = (
    reason: "completed" | "runtime_failure" | "user_abort",
  ) => {
    for (const event of flushAdvisorUsage?.() ?? []) {
      lifecycle.emit(event);
    }
    lifecycle.finish(reason);
    lastCompletedLifecycleSnapshot = lifecycle.snapshot();
    return lifecycle.events();
  };
  const turnId = args.turnId ?? randomUUID();
  let abortRequested = false;
  let activePhaseAborter: (() => void) | null = null;
  const abortTurn = () => {
    if (abortRequested) {
      return;
    }
    abortRequested = true;
    activePhaseAborter?.();
  };
  const registerPhaseAborter = (aborter: () => void) => {
    activePhaseAborter = aborter;
    if (abortRequested) {
      aborter();
    }
  };
  const updateActiveSession = (
    patch: Pick<
      ActiveRuntimeSession,
      "respondApproval" | "respondUserInput" | "steer"
    >,
  ) => {
    if (abortRequested) {
      return;
    }
    upsertActiveSession({
      turnId,
      providerId: args.providerId,
      taskId: args.taskId,
      ...patch,
    });
  };
  const approvalRouter = createProviderApprovalRouter();
  upsertActiveSession({
    turnId,
    providerId: args.providerId,
    taskId: args.taskId,
    abort: abortTurn,
    respondApproval: approvalRouter.respond,
  });
  const turnTimeoutMs =
    args.runtimeOptions?.providerTimeoutMs ?? sdkTurnTimeoutMs;

  // Shared across every primary provider: a pausable timeout controller keeps
  // approval, user-input, and blocking-plan waits from silently timing out the
  // turn. See
  // `createTurnTimeoutController` for the full rationale.
  const timeoutController = createTurnTimeoutController({
    timeoutMs: turnTimeoutMs,
    onTimeout: () => {
      abortActive({ turnId });
    },
  });
  upsertActiveSession({
    turnId,
    providerId: args.providerId,
    taskId: args.taskId,
    timeoutController,
  });

  const runStreamWithPausableTimeout = async <T>(
    task: Promise<T>,
  ): Promise<T | null> => {
    return Promise.race([task, timeoutController.promise]);
  };

  const wrapStreamOnEvent =
    (downstream?: (event: BridgeEvent) => void) => (event: BridgeEvent) => {
      if (timeoutController.timedOut) {
        return;
      }
      // Pause the turn clock the moment we ask the user to decide, keyed by the
      // decision's request id. Resume is driven by the responder delivery in
      // `deliverResponderResult`, with defensive fallbacks below so a crashed
      // adapter can't leave the controller paused forever.
      const decisionRequestId = getProviderDecisionRequestId(event);
      if (decisionRequestId) {
        timeoutController.pauseForDecision({ key: decisionRequestId });
      } else if (event.type === "tool_result") {
        // "Decision processed" fallback: Claude's approval `requestId` *is* the
        // tool use id, so a tool finishing releases its own approval pause and
        // nobody else's. A `tool_use_id` that matches no pause is ignored.
        timeoutController.resumeAfterDecision({ key: event.tool_use_id });
      } else if (event.type === "error") {
        // The stream failed: no outstanding decision will ever be answered, so
        // holding their pauses would strand the turn with a stopped clock.
        timeoutController.resumeAllDecisions();
      }
      downstream?.(event);
    };

  let effectiveArgs: typeof args = {
    ...args,
    runtimeOptions: withoutAdvisorTarget(args.runtimeOptions),
  };
  // Sum of delegated model usage this turn. This includes Advisor consults and
  // ACP Workers, and is read lazily so late usage is included in the primary
  // turn's final total.
  let accumulatedDelegatedUsage:
    Extract<BridgeEvent, { type: "usage" }> | undefined;
  let advisorGrantHandle: ReturnType<
    typeof registerAdvisorConsultGrant
  > | null = null;
  const revokeAdvisorGrant = () => {
    advisorGrantHandle?.revoke();
    advisorGrantHandle = null;
  };
  const advisorTarget = normalizeAdvisorTarget(
    args.runtimeOptions?.advisorTarget,
  );
  if (
    advisorTarget &&
    shouldRunAdvisor({
      conversation: args.conversation,
      target: advisorTarget,
    }) &&
    effectiveArgs.conversation
  ) {
    // On-demand Advisor: instead of a blocking preflight, mint a turn-scoped
    // consult grant and brief the primary on how to use it. The primary calls
    // the `stave_consult_advisor` Local MCP tool with the grant's key whenever
    // it wants a second opinion; each consult streams its own
    // `advisor_activity` exchange into this turn.
    const consultKey = randomUUID();
    const consultLimit = normalizeAdvisorConsultLimit(
      args.runtimeOptions?.advisorConsultLimit,
    );
    advisorGrantHandle = registerAdvisorConsultGrant({
      consultKey,
      turnId,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      target: advisorTarget,
      primaryProviderId: args.providerId,
      ...(args.runtimeOptions?.model
        ? { primaryModel: args.runtimeOptions.model }
        : {}),
      consultLimit,
      cwd: args.cwd,
      runtimeOptions: {
        ...(args.runtimeOptions?.claudeBinaryPath
          ? { claudeBinaryPath: args.runtimeOptions.claudeBinaryPath }
          : {}),
        ...(args.runtimeOptions?.codexBinaryPath
          ? { codexBinaryPath: args.runtimeOptions.codexBinaryPath }
          : {}),
      },
      emit: (event) => lifecycle.emit(event),
      // A consult is another model's latency, not the primary provider's
      // generation budget. The per-exchange phase pause keeps a 90s consult
      // from consuming the whole `providerTimeoutMs`.
      pausePhase: (pauseArgs) => timeoutController.pausePhase(pauseArgs),
      resumePhase: (pauseArgs) => timeoutController.resumePhase(pauseArgs),
      addUsage: (usage) => {
        accumulatedDelegatedUsage = accumulatedDelegatedUsage
          ? mergeAdvisorUsage(accumulatedDelegatedUsage, usage)
          : usage;
      },
    });
    const grantHandle = advisorGrantHandle;
    upsertActiveSession({
      turnId,
      providerId: args.providerId,
      taskId: args.taskId,
      skipAdvisor: () => grantHandle.skipInFlight(),
    });
    // Announce the grant before the primary starts: a turn whose primary never
    // consults must still be visibly armed, otherwise "no consult" and "no
    // Advisor" look identical in every surface.
    lifecycle.emit(
      buildAdvisorArmedEvent({
        primaryProviderId: args.providerId,
        ...(args.runtimeOptions?.model
          ? { primaryModel: args.runtimeOptions.model }
          : {}),
        target: advisorTarget,
        at: Date.now(),
        consultLimit,
      }),
    );
    const injection = appendAdvisorConsultBriefing({
      conversation: effectiveArgs.conversation,
      target: advisorTarget,
      consultKey,
      consultLimit,
    });
    effectiveArgs = {
      ...effectiveArgs,
      conversation: injection.conversation,
    };
  }

  let acpWorkerGrant: {
    workerKey: string;
    profile: ResolvedWorkerProfile & { provider: "cursor" | "kiro" };
  } | null = null;
  let acpWorkerUnavailableDetail: string | null = null;
  if (
    (args.providerId === "cursor" || args.providerId === "kiro") &&
    args.runtimeOptions?.workerIntent
  ) {
    try {
      const catalog = await getProviderModelCatalog({
        providerId: args.providerId,
        cwd: args.cwd,
        runtimeOptions: {
          ...(args.runtimeOptions.cursorBinaryPath
            ? { cursorBinaryPath: args.runtimeOptions.cursorBinaryPath }
            : {}),
          ...(args.runtimeOptions.kiroBinaryPath
            ? { kiroBinaryPath: args.runtimeOptions.kiroBinaryPath }
            : {}),
        },
      });
      const resolution = resolveWorkerProfile({
        providerId: args.providerId,
        primaryModel: args.runtimeOptions.model?.trim() || "auto",
        intent: args.runtimeOptions.workerIntent,
        runtimeModels: catalog.models
          .filter((model) => !model.hidden)
          .map((model) => model.model),
      });
      if (
        resolution.status === "ready" &&
        resolution.profile.executionAdapter === "acp-tool"
      ) {
        const workerKey = randomUUID();
        acpWorkerGrant = {
          workerKey,
          profile: {
            ...resolution.profile,
            provider: args.providerId,
          },
        };
        effectiveArgs = effectiveArgs.conversation
          ? {
              ...effectiveArgs,
              conversation: appendAcpWorkerBriefing({
                conversation: effectiveArgs.conversation,
                profile: resolution.profile,
                workerKey,
              }),
            }
          : {
              ...effectiveArgs,
              prompt: [
                effectiveArgs.prompt,
                buildAcpWorkerPrimaryInstructions({
                  profile: resolution.profile,
                  workerKey,
                }),
              ]
                .filter(Boolean)
                .join("\n\n"),
            };
      } else if (resolution.status === "unavailable") {
        acpWorkerUnavailableDetail = resolution.detail;
      }
    } catch {
      acpWorkerUnavailableDetail =
        "The runtime model catalog could not be loaded. Refresh provider availability and try again.";
    }
  }

  const mapUsageForDownstream = createAdvisorUsageMerger(
    () => accumulatedDelegatedUsage,
  );
  flushAdvisorUsage = mapUsageForDownstream.flush;
  const emittedPrimaryEvents: BridgeEvent[] = [];
  const emitPrimaryEvent = (event: BridgeEvent) => {
    emittedPrimaryEvents.push(event);
    for (const mappedEvent of mapUsageForDownstream(event)) {
      lifecycle.emit(mappedEvent);
    }
  };
  let acpWorkerGrantHandle: ReturnType<typeof registerAcpWorkerGrant> | null =
    null;
  const revokeAcpWorkerGrant = () => {
    acpWorkerGrantHandle?.revoke();
    acpWorkerGrantHandle = null;
  };
  if (acpWorkerUnavailableDetail) {
    emitPrimaryEvent({
      type: "error",
      message: `Worker is unavailable for this turn: ${acpWorkerUnavailableDetail}`,
      recoverable: true,
    });
  }
  if (acpWorkerGrant) {
    acpWorkerGrantHandle = registerAcpWorkerGrant({
      workerKey: acpWorkerGrant.workerKey,
      turnId,
      ...(args.taskId ? { taskId: args.taskId } : {}),
      profile: acpWorkerGrant.profile,
      cwd: args.cwd,
      runtimeOptions: {
        ...(args.runtimeOptions?.cursorBinaryPath
          ? { cursorBinaryPath: args.runtimeOptions.cursorBinaryPath }
          : {}),
        ...(args.runtimeOptions?.kiroBinaryPath
          ? { kiroBinaryPath: args.runtimeOptions.kiroBinaryPath }
          : {}),
      },
      emit: wrapStreamOnEvent(emitPrimaryEvent),
      pausePhase: (pauseArgs) => timeoutController.pausePhase(pauseArgs),
      resumePhase: (pauseArgs) => timeoutController.resumePhase(pauseArgs),
      addUsage: (usage) => {
        accumulatedDelegatedUsage = accumulatedDelegatedUsage
          ? mergeAdvisorUsage(accumulatedDelegatedUsage, usage)
          : usage;
      },
      registerApprovalResponder: approvalRouter.registerNested,
    });
  }
  const emitMissingReturnedEvents = (events: BridgeEvent[]) => {
    const emittedCounts = new Map<string, number>();
    for (const event of emittedPrimaryEvents) {
      const key = JSON.stringify(event);
      emittedCounts.set(key, (emittedCounts.get(key) ?? 0) + 1);
    }
    for (const event of events) {
      // The shared lifecycle owns the final abort classification. A timed-out
      // adapter can return its locally collected user-abort terminal after the
      // live callback was correctly suppressed; replaying it here would hide
      // the outer runtime_failure terminal.
      if (abortRequested && event.type === "done") {
        continue;
      }
      const key = JSON.stringify(event);
      const remaining = emittedCounts.get(key) ?? 0;
      if (remaining > 0) {
        emittedCounts.set(key, remaining - 1);
        continue;
      }
      emitPrimaryEvent(event);
    }
  };
  if (effectiveArgs.providerId === "claude-code") {
    try {
      const events = await runStreamWithPausableTimeout(
        streamClaudeWithSdk({
          ...effectiveArgs,
          onEvent: wrapStreamOnEvent(emitPrimaryEvent),
          registerAbort: registerPhaseAborter,
          registerApprovalResponder: (responder) => {
            approvalRouter.registerPrimary(responder);
          },
          registerUserInputResponder: (responder) => {
            updateActiveSession({ respondUserInput: responder });
          },
          registerSteerResponder: (responder) => {
            updateActiveSession({ steer: responder });
          },
        }),
      );
      if (events && events.length > 0) {
        emitMissingReturnedEvents(events);
        return finishLifecycle(
          abortRequested
            ? timeoutController.timedOut
              ? "runtime_failure"
              : "user_abort"
            : "completed",
        );
      }
      if (abortRequested) {
        if (timeoutController.timedOut) {
          emitPrimaryEvent({
            type: "error",
            message: `Provider turn timed out. timeout=${turnTimeoutMs}ms`,
            recoverable: true,
          });
          return finishLifecycle("runtime_failure");
        }
        return finishLifecycle("user_abort");
      }
      const fallback = toClaudeErrorEvents({
        message: `Claude SDK unavailable/timeout. Check claude login and SDK environment. timeout=${turnTimeoutMs}ms`,
      });
      fallback.forEach((event) => emitPrimaryEvent(event));
      lastCompletedLifecycleSnapshot = lifecycle.snapshot();
      return lifecycle.events();
    } catch (error) {
      if (abortRequested && !timeoutController.timedOut) {
        return finishLifecycle("user_abort");
      }
      emitPrimaryEvent({
        type: "error",
        message: timeoutController.timedOut
          ? `Provider turn timed out. timeout=${turnTimeoutMs}ms`
          : `Claude provider stream failed: ${String(error)}`,
        recoverable: true,
      });
      return finishLifecycle("runtime_failure");
    } finally {
      revokeAdvisorGrant();
      revokeAcpWorkerGrant();
      timeoutController.dispose();
      clearActiveTurnState({ turnId });
    }
  }

  if (
    effectiveArgs.providerId === "cursor" ||
    effectiveArgs.providerId === "kiro"
  ) {
    const isCursor = effectiveArgs.providerId === "cursor";
    const providerLabel = isCursor ? "Cursor" : "Kiro";
    try {
      const events = await runStreamWithPausableTimeout(
        (isCursor ? streamCursorWithAcp : streamKiroWithAcp)({
          ...effectiveArgs,
          ...(acpWorkerGrantHandle
            ? { staveLocalMcpToolNames: [WORKER_DELEGATE_TOOL_NAME] }
            : {}),
          onEvent: wrapStreamOnEvent(emitPrimaryEvent),
          registerAbort: registerPhaseAborter,
          registerApprovalResponder: (responder) => {
            approvalRouter.registerPrimary(responder);
          },
          registerUserInputResponder: (responder) => {
            updateActiveSession({ respondUserInput: responder });
          },
          registerSteerResponder: (responder) => {
            updateActiveSession({ steer: responder });
          },
        }),
      );
      if (events && events.length > 0) {
        emitMissingReturnedEvents(events);
        return finishLifecycle(
          abortRequested
            ? timeoutController.timedOut
              ? "runtime_failure"
              : "user_abort"
            : "completed",
        );
      }
      if (abortRequested) {
        if (timeoutController.timedOut) {
          emitPrimaryEvent({
            type: "error",
            message: `Provider turn timed out. timeout=${turnTimeoutMs}ms`,
            recoverable: true,
          });
          return finishLifecycle("runtime_failure");
        }
        return finishLifecycle("user_abort");
      }
      const fallback = toInteractiveAcpErrorEvents({
        message: `${providerLabel} unavailable/timeout. Check CLI authentication and ACP support. timeout=${turnTimeoutMs}ms`,
      });
      fallback.forEach((event) => emitPrimaryEvent(event));
      lastCompletedLifecycleSnapshot = lifecycle.snapshot();
      return lifecycle.events();
    } catch (error) {
      if (abortRequested && !timeoutController.timedOut) {
        return finishLifecycle("user_abort");
      }
      emitPrimaryEvent({
        type: "error",
        message: timeoutController.timedOut
          ? `Provider turn timed out. timeout=${turnTimeoutMs}ms`
          : `${providerLabel} provider stream failed: ${String(error)}`,
        recoverable: true,
      });
      return finishLifecycle("runtime_failure");
    } finally {
      revokeAdvisorGrant();
      revokeAcpWorkerGrant();
      timeoutController.dispose();
      clearActiveTurnState({ turnId });
    }
  }

  try {
    const events = await runStreamWithPausableTimeout(
      streamCodexWithAppServer({
        ...effectiveArgs,
        onEvent: wrapStreamOnEvent(emitPrimaryEvent),
        registerAbort: registerPhaseAborter,
        registerApprovalResponder: (responder) => {
          approvalRouter.registerPrimary(responder);
        },
        registerUserInputResponder: (responder) => {
          updateActiveSession({ respondUserInput: responder });
        },
        registerSteerResponder: (responder) => {
          updateActiveSession({ steer: responder });
        },
      }),
    );
    if (events && events.length > 0) {
      emitMissingReturnedEvents(events);
      return finishLifecycle(
        abortRequested
          ? timeoutController.timedOut
            ? "runtime_failure"
            : "user_abort"
          : "completed",
      );
    }
    if (abortRequested) {
      if (timeoutController.timedOut) {
        emitPrimaryEvent({
          type: "error",
          message: `Provider turn timed out. timeout=${turnTimeoutMs}ms`,
          recoverable: true,
        });
        return finishLifecycle("runtime_failure");
      }
      return finishLifecycle("user_abort");
    }
    const fallback = toCodexErrorEvents({
      message: `Codex unavailable/timeout. Check codex auth and runtime environment. timeout=${turnTimeoutMs}ms`,
    });
    fallback.forEach((event) => emitPrimaryEvent(event));
    lastCompletedLifecycleSnapshot = lifecycle.snapshot();
    return lifecycle.events();
  } catch (error) {
    if (abortRequested && !timeoutController.timedOut) {
      return finishLifecycle("user_abort");
    }
    emitPrimaryEvent({
      type: "error",
      message: timeoutController.timedOut
        ? `Provider turn timed out. timeout=${turnTimeoutMs}ms`
        : `Codex provider stream failed: ${String(error)}`,
      recoverable: true,
    });
    return finishLifecycle("runtime_failure");
  } finally {
    revokeAdvisorGrant();
    revokeAcpWorkerGrant();
    timeoutController.dispose();
    clearActiveTurnState({ turnId });
  }
}

export const providerRuntime: ProviderRuntime = {
  streamTurn: (args) => runProviderTurn(args),
  startTurnStream: (args, options) => {
    pruneExpiredStreams();
    const streamId = randomUUID();
    const turnId = args.turnId ?? randomUUID();
    const shouldBufferForPolling = options?.bufferEvents ?? !options?.onEvent;
    const session: ActiveStreamSession = {
      events: [],
      done: false,
      updatedAt: Date.now(),
      baseCursor: 0,
      retainedBytes: 0,
    };
    activeStreams.set(streamId, session);
    const deliveryLifecycle = createProviderTurnLifecycle({
      onEvent: (event) => {
        if (shouldBufferForPolling) {
          appendStreamEvent(session, event);
        }
        session.updatedAt = Date.now();
        options?.onEvent?.(event);
      },
    });
    upsertActiveSession({
      turnId,
      providerId: args.providerId,
      taskId: args.taskId,
      streamId,
    });
    queueMicrotask(() => {
      const turnPromise = runProviderTurn({
        ...args,
        turnId,
        onEvent: (event) => {
          deliveryLifecycle.emit(event);
        },
      })
        .catch((error) => {
          const errorEvent: BridgeEvent = {
            type: "error",
            message: `Provider stream failed: ${String(error)}`,
            recoverable: true,
          };
          deliveryLifecycle.emit(errorEvent);
          deliveryLifecycle.finish("runtime_failure");
        })
        .finally(() => {
          if (!deliveryLifecycle.terminal) {
            deliveryLifecycle.finish("runtime_failure");
          }
          session.done = true;
          session.updatedAt = Date.now();
          clearActiveTurnState({ turnId });
          activeTurnPromises.delete(turnId);
          if (!shouldBufferForPolling) {
            activeStreams.delete(streamId);
          }
          options?.onDone?.();
        });
      activeTurnPromises.set(turnId, turnPromise);
    });
    return { ok: true, streamId };
  },
  readTurnStream: ({ streamId, cursor }) => {
    pruneExpiredStreams();
    const session = activeStreams.get(streamId);
    if (!session) {
      return {
        ok: false,
        events: [],
        cursor,
        done: true,
        message: "Stream session not found.",
      };
    }
    const safeCursor = Number.isFinite(cursor) ? cursor : 0;
    if (safeCursor < session.baseCursor) {
      return {
        ok: false,
        events: [],
        cursor: session.baseCursor,
        done: session.done,
        message: "Stream cursor is older than the retained replay window.",
      };
    }
    const nextCursor = compactStreamToCursor(session, safeCursor);
    const events = session.events.slice();
    const outCursor = nextCursor + events.length;
    const done = session.done;
    session.updatedAt = Date.now();
    if (done && session.events.length === 0) {
      activeStreams.delete(streamId);
    }
    return {
      ok: true,
      events,
      cursor: outCursor,
      done,
    };
  },
  ackTurnStream: ({ streamId, cursor }) => {
    pruneExpiredStreams();
    const session = activeStreams.get(streamId);
    if (!session) {
      return {
        ok: false,
        message: "Stream session not found.",
      };
    }
    const safeCursor = Number.isFinite(cursor) ? cursor : 0;
    if (safeCursor < session.baseCursor) {
      return {
        ok: false,
        message: "Stream cursor is older than the retained replay window.",
      };
    }
    compactStreamToCursor(session, safeCursor);
    session.updatedAt = Date.now();
    if (session.done && session.events.length === 0) {
      activeStreams.delete(streamId);
    }
    return {
      ok: true,
    };
  },
  abortTurn: ({ turnId }) => {
    const ok = abortActive({ turnId });
    if (!ok) {
      return { ok: false, message: "No active provider turn." };
    }
    return { ok: true, message: "Provider turn aborted." };
  },
  skipAdvisor: ({ turnId }) => {
    const ok = skipAdvisorForTurn({ turnId });
    if (!ok) {
      return { ok: false, message: "No Advisor preflight is running." };
    }
    return { ok: true, message: "Advisor preflight skipped." };
  },
  // The grant registry lives in this process because this is where grants are
  // minted; the Local MCP tool reaches it through `provider.consult-advisor`.
  consultAdvisor: (args) => consultAdvisor(args),
  runAcpWorker: (args) => runAcpWorker(args),
  cleanupTask: ({ taskId }) => {
    clearActiveTaskSessions({ taskId });
    cleanupProviderTaskState(taskId);
    return {
      ok: true,
      message: `Cleaned provider runtime state for task ${taskId}.`,
    };
  },
  respondApproval: ({ turnId, requestId, approved, reason, scope }) =>
    deliverResponderResult({
      kind: "approval",
      turnId,
      requestId,
      invoke: (responder) => responder({ requestId, approved, reason, scope }),
      selectResponder: (session) => session.respondApproval,
      timeoutMs: PROVIDER_STEER_ACK_TIMEOUT_MS,
    }),
  respondUserInput: ({ turnId, requestId, answers, denied }) =>
    deliverResponderResult({
      kind: "user-input",
      turnId,
      requestId,
      invoke: (responder) => responder({ requestId, answers, denied }),
      selectResponder: (session) => session.respondUserInput,
      timeoutMs: PROVIDER_STEER_ACK_TIMEOUT_MS,
    }),
  steerTurn: async ({ turnId, text, enabled, clientMessageId }) => {
    // `enabled` is the renderer's `settings.midTurnSteeringEnabled` toggle —
    // the primary, user-facing on/off switch. `STAVE_ENABLE_MID_TURN_STEERING`
    // remains as a legacy/ops fallback for builds where the setting hasn't
    // been surfaced or touched.
    if (
      enabled !== true &&
      process.env.STAVE_ENABLE_MID_TURN_STEERING !== "1"
    ) {
      return {
        ok: false,
        message:
          "Mid-turn steering is disabled. Enable it in Settings → Steer / Queue (or set STAVE_ENABLE_MID_TURN_STEERING=1).",
        delivery: "rejected" as const,
      };
    }
    const result = await deliverResponderResult({
      kind: "steer",
      turnId,
      requestId: clientMessageId ?? turnId,
      invoke: (responder) => responder({ text, clientMessageId }),
      selectResponder: (session) => session.steer,
      timeoutMs: PROVIDER_STEER_ACK_TIMEOUT_MS,
    });
    const { timedOut, ...response } = result;
    return {
      ...response,
      delivery: timedOut
        ? ("unknown" as const)
        : response.ok
          ? ("accepted" as const)
          : ("rejected" as const),
    };
  },
  checkAvailability: async ({ providerId, runtimeOptions }) => {
    if (providerId === "claude-code") {
      const result = describeClaudeAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    if (providerId === "codex") {
      const result = describeCodexAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    if (providerId === "cursor") {
      const result = await describeCursorAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    if (providerId === "kiro") {
      const result = await describeKiroAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    return {
      ok: false,
      available: false,
      detail: `Unsupported provider: ${providerId}`,
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  },
  getCommandCatalog: async ({ providerId, cwd, runtimeOptions }) => {
    if (providerId === "claude-code") {
      // Timeout and in-flight de-duplication live inside the runtime so a
      // timed-out probe actually tears down its `claude` subprocess instead of
      // leaking one that still holds MCP connector sessions.
      return await getClaudeCommandCatalog({ cwd, runtimeOptions });
    }

    if (providerId === "cursor" || providerId === "kiro") {
      return {
        ok: true,
        supported: false,
        commands: [],
        detail: `${providerId === "cursor" ? "Cursor" : "Kiro"} command catalog integration is not available.`,
      };
    }

    return {
      ok: true,
      supported: true,
      commands: listCodexSlashCommands(),
      detail: getCodexSlashCommandCatalogDetail(),
    };
  },
  getConnectedToolStatus: async (args) => getProviderConnectedToolStatus(args),
  shutdown: async () => {
    cleanupClaudeMcpOauthFlows();
    const taskIds = new Set<string>();
    for (const session of activeSessions.values()) {
      session.abort?.();
      if (session.taskId) {
        taskIds.add(session.taskId);
      }
    }
    disposeAllAcpWorkerGrants();

    // Wait for in-flight turn promises so their `.finally()` → `onDone()`
    // callbacks complete *before* the caller closes the persistence layer.
    // Without this, completeTurn() races with SQLite close.
    if (activeTurnPromises.size > 0) {
      await Promise.allSettled(Array.from(activeTurnPromises.values()));
    }

    activeSessions.clear();
    activeStreams.clear();
    activeTurnPromises.clear();
    cleanupProviderTaskState(DEFAULT_PROVIDER_TASK_KEY);
    for (const taskId of taskIds) {
      cleanupProviderTaskState(taskId);
    }
    // Terminate the shared `codex app-server` processes; without this they
    // outlive the host service as ghost children.
    disposeAllCodexAppServerClients();
  },
};
