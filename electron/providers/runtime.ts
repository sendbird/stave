import { providerAccountEventMapper } from "../provider-accounts/events";
import { withProviderAccountScope, providerAccountKey, providerAccountKeyMatchesTask } from "../provider-accounts/runtime-scope";
import { workspaceExecutionGate } from "../shared/workspace-execution-gate";
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
import path from "node:path";
import { runExecutableProbe } from "./runtime-shared";
import {
  createEmptyProviderRuntimeCapabilities,
  extractRuntimeVersion,
  resolveProviderRuntimeCapabilities,
} from "../../src/lib/providers/runtime-capabilities";
import {
  PROVIDER_STEER_ACK_TIMEOUT_MS,
  waitForSteerDelivery,
} from "../../src/lib/providers/steer-delivery";
import { registerAgentRunGrant } from "./agent-run-grants";
import { createProviderApprovalRouter } from "./provider-approval-router";
import {
  createProviderTurnLifecycle,
  type ProviderTurnLifecycleSnapshot,
} from "./provider-turn-lifecycle";
import { DEFAULT_PROVIDER_TIMEOUT_MS } from "../../src/lib/providers/runtime-option-contract";
import type { TaskAgentTurn } from "./task-agent-turn";
import { registerCallerGrant } from "./caller-grants";
import { applyTurnPolicy } from "./turn-policy-entry";

const sdkTurnTimeoutMs = Number(
  process.env.STAVE_PROVIDER_TIMEOUT_MS ?? DEFAULT_PROVIDER_TIMEOUT_MS,
);
const COMPLETED_STREAM_TTL_MS = 60 * 1000;
const ACTIVE_STREAM_RETAINED_BYTES_MAX = 512 * 1024;
const BATCH_TURN_RETAINED_BYTES_MAX = 2 * 1024 * 1024;
const DEFAULT_PROVIDER_TASK_KEY = "default";
/**
 * A resumed Codex thread keeps the Local MCP connection and tool catalog it
 * started with, so a changed grant key starts a fresh thread. The agent run key
 * is therefore stable per task, and later turns keep
 * sending it with no active grant behind it.
 */
const codexAgentRunChannelKeyByTask = new Map<string, string>();

function getProviderTaskKey(taskId?: string) {
  return providerAccountKey("codex", taskId?.trim() || DEFAULT_PROVIDER_TASK_KEY);
}

function getOrCreateCodexAgentRunChannelKey(taskId: string) {
  const taskKey = getProviderTaskKey(taskId);
  const existing = codexAgentRunChannelKeyByTask.get(taskKey);
  if (existing) return existing;
  const agentRunKey = randomUUID();
  codexAgentRunChannelKeyByTask.set(taskKey, agentRunKey);
  return agentRunKey;
}

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
let completedStreamExpiryTimer: ReturnType<typeof setTimeout> | null = null;
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
    responder: NoInfer<Responder>,
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
  if (completedStreamExpiryTimer) clearTimeout(completedStreamExpiryTimer);
  completedStreamExpiryTimer = null;
  let nextExpiry = Number.POSITIVE_INFINITY;
  for (const [streamId, session] of activeStreams) {
    // Silence is not completion: approvals and long tool calls still need replay.
    if (!session.done) continue;
    const expiresAt = session.updatedAt + COMPLETED_STREAM_TTL_MS;
    if (now >= expiresAt) activeStreams.delete(streamId);
    else nextExpiry = Math.min(nextExpiry, expiresAt);
  }
  if (Number.isFinite(nextExpiry)) {
    completedStreamExpiryTimer = setTimeout(
      () => pruneExpiredStreams(),
      nextExpiry - now,
    );
    completedStreamExpiryTimer.unref?.();
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
  for (const key of codexAgentRunChannelKeyByTask.keys()) {
    if (providerAccountKeyMatchesTask(key, taskId)) codexAgentRunChannelKeyByTask.delete(key);
  }
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

async function describeClaudeAvailability(
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

  const versionProbe = await runExecutableProbe({
    executablePath,
    commandArgs: ["--version"],
    timeoutMs: 2_000,
    maxBytes: 64 * 1024,
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

async function describeCodexAvailability(
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

  const versionProbe = await runExecutableProbe({
    executablePath,
    commandArgs: ["--version"],
    timeoutMs: 2_000,
    maxBytes: 64 * 1024,
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

/** Mandatory policy is captured once by the host before a primary turn starts. */
let taskAgentTurnResolver: ((turn: StreamTurnArgs) => TaskAgentTurn | null) | null = null;
export function setTaskAgentTurnResolver(resolver: typeof taskAgentTurnResolver) {
  taskAgentTurnResolver = resolver;
}
/**
 * The notice a task's turns carry once the user released its Agent; see
 * `releasedAgentInstructions` in `src/lib/agents/runtime-options.ts`.
 */
let releasedTaskAgentResolver: ((taskId: string) => string | null) | null = null;
export function setReleasedTaskAgentResolver(resolver: typeof releasedTaskAgentResolver) {
  releasedTaskAgentResolver = resolver;
}
/**
 * Cursor and Kiro have no instruction channel: a released Agent's notice
 * (carried as `agentInstructions`) goes into the prompt once per native
 * session, the same way the Agent's own preamble went in. In memory: after a
 * restart a session gets the notice once more, which is harmless.
 */
const deliveredReleasedAgentPrompts = new Set<string>();
const MAX_DELIVERED_RELEASED_AGENT_PROMPTS = 500;
function releasedAgentPromptHooks(args: { providerId: string; taskId?: string; notice?: string }) {
  const notice = args.notice?.trim();
  if (!args.taskId || !notice) return null;
  let pending: string | null = null;
  return {
    prepare: (nativeSessionId: string) => {
      const key = `${args.providerId}\u0000${args.taskId}\u0000${nativeSessionId}\u0000${notice}`;
      pending = deliveredReleasedAgentPrompts.has(key) ? null : key;
      return pending ? notice : null;
    },
    acknowledge: () => {
      if (!pending) return;
      if (deliveredReleasedAgentPrompts.size >= MAX_DELIVERED_RELEASED_AGENT_PROMPTS) {
        const oldest = deliveredReleasedAgentPrompts.values().next().value;
        if (oldest !== undefined) deliveredReleasedAgentPrompts.delete(oldest);
      }
      deliveredReleasedAgentPrompts.add(pending);
      pending = null;
    },
  };
}
let taskPermissionObserver: ((args: {
  taskId: string; providerId: StreamTurnArgs["providerId"];
  options: NonNullable<StreamTurnArgs["runtimeOptions"]>;
}) => void) | null = null;
export function setTaskPermissionObserver(observer: typeof taskPermissionObserver) {
  taskPermissionObserver = observer;
}

async function runProviderTurn(rawArgs: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void }) {
  rawArgs = { ...rawArgs, turnId: rawArgs.turnId ?? randomUUID() };
  const release = workspaceExecutionGate.acquire(rawArgs);
  let preparingPolicy = true;
  try {
    const agentTurn = rawArgs.taskId && !rawArgs.executionPolicy
      ? taskAgentTurnResolver?.(rawArgs) ?? null : null;
    // In-turn subagents come only from the task's agent; any other value is dropped.
    const { nativeSubagents: _unowned, ...ownOptions } = rawArgs.runtimeOptions ?? {};
    // A task whose Agent was released says so in the Agent channel, so the
    // model stops obeying the role its resumed session still remembers.
    const releasedNotice = !agentTurn && rawArgs.taskId && !rawArgs.executionPolicy && !ownOptions.agentInstructions
      ? releasedTaskAgentResolver?.(rawArgs.taskId) ?? null : null;
    const chatOptions = releasedNotice ? { ...ownOptions, agentInstructions: releasedNotice } : ownOptions;
    const turnArgs = applyTurnPolicy(agentTurn
      ? { ...rawArgs, runtimeOptions: agentTurn.runtimeOptions }
      : { ...rawArgs, ...(rawArgs.runtimeOptions || releasedNotice ? { runtimeOptions: chatOptions } : {}) }, agentTurn?.turnPolicy);
    // Delegation inherits the resolved policy, so a helper gets this turn's autonomy and never more.
    if (turnArgs.taskId && turnArgs.turnPolicy) {
      taskPermissionObserver?.({
        taskId: turnArgs.taskId,
        providerId: turnArgs.providerId,
        options: turnArgs.runtimeOptions ?? {},
      });
    }
    preparingPolicy = false;
    return await runScopedProviderTurn(turnArgs, agentTurn);
  } catch (error) {
    if (!preparingPolicy) throw error;
    // Mandatory task policy cannot fail open or escape the stream's terminal contract.
    const lifecycle = createProviderTurnLifecycle({ onEvent: rawArgs.onEvent });
    lifecycle.emit({ type: "error", recoverable: false,
      message: "The task's Agent configuration could not be applied. Check its assignment and provider before retrying." });
    lifecycle.finish("runtime_failure");
    return lifecycle.events();
  } finally { release(); }
}

async function runScopedProviderTurn(
  args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void },
  agentTurn?: TaskAgentTurn | null,
) {
  return await withProviderAccountScope(args.runtimeOptions, async () => {
    const stamp = providerAccountEventMapper(args);
    const events = await runProviderTurnImpl({
      ...args, onEvent: (event) => args.onEvent?.(stamp(event)),
    }, agentTurn);
    return events.map(stamp);
  });
}

async function runProviderTurnImpl(
  args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void },
  agentTurn?: TaskAgentTurn | null,
) {
  const lifecycle = createProviderTurnLifecycle({
    onEvent: args.onEvent,
  });
  if (agentTurn) lifecycle.emit({ type: "agent_provenance", provenance: agentTurn.provenance });
  const finishLifecycle = (
    reason: "completed" | "runtime_failure" | "user_abort",
  ) => {
    lifecycle.finish(reason);
    lastCompletedLifecycleSnapshot = lifecycle.snapshot();
    return lifecycle.events();
  };
  // A turn runs shell commands, file writes and git operations inside `cwd`.
  // Each adapter used to fall back to the host process directory when the
  // caller supplied no workspace path, which silently pointed a task at an
  // unrelated checkout. Refuse the turn here instead, once, for every provider.
  if (!args.cwd || !path.isAbsolute(args.cwd)) {
    lifecycle.emit({
      type: "error",
      message:
        "Provider turn refused: the task has no resolved workspace folder " +
        `(cwd=${JSON.stringify(args.cwd ?? null)}). ` +
        "Reopen or relink the workspace so the turn runs inside it.",
      recoverable: false,
    });
    return finishLifecycle("runtime_failure");
  }
  const turnId = args.turnId ?? randomUUID();
  let abortRequested = false;
  let revokeTurnGrants = () => {};
  let activePhaseAborter: (() => void) | null = null;
  const abortTurn = () => {
    if (abortRequested) {
      return;
    }
    abortRequested = true;
    revokeTurnGrants();
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

  const retainsCodexChannels = Boolean(
    args.taskId?.trim() &&
      args.executionPolicy !== "secondary-read-only" &&
      args.providerId === "codex",
  );
  const retainedCodexAgentRunChannelKey = retainsCodexChannels
    ? codexAgentRunChannelKeyByTask.get(getProviderTaskKey(args.taskId))
    : undefined;
  const effectiveArgs: typeof args = {
    ...args,
    staveTurnGrants: {
      ...(retainedCodexAgentRunChannelKey
        ? { agentRunKey: retainedCodexAgentRunChannelKey }
        : {}),
    },
  };
  const emittedPrimaryEvents: BridgeEvent[] = [];
  const emitPrimaryEvent = (event: BridgeEvent) => {
    const provenance = agentTurn?.observe(event);
    if (provenance) lifecycle.emit(provenance);
    emittedPrimaryEvents.push(event);
    lifecycle.emit(event);
  };
  // An agent run turn reports its stage through Local MCP. The grant names the
  // stage attempt, so the host resolves identity from the key and the model
  // never passes it. Agent runs run on Claude and Codex tasks only.
  let agentRunGrantHandle: ReturnType<typeof registerAgentRunGrant> | null = null;
  const agentRunTaskId = args.taskId?.trim();
  if (
    args.agentRunStage &&
    agentRunTaskId &&
    args.executionPolicy !== "secondary-read-only" &&
    (args.providerId === "claude-code" || args.providerId === "codex")
  ) {
    const agentRunKey =
      args.providerId === "codex"
        ? getOrCreateCodexAgentRunChannelKey(agentRunTaskId)
        : randomUUID();
    agentRunGrantHandle = registerAgentRunGrant({
      agentRunKey,
      ...args.agentRunStage,
      turnId,
      taskId: agentRunTaskId,
    });
    effectiveArgs.staveTurnGrants = {
      ...effectiveArgs.staveTurnGrants,
      agentRunKey,
    };
  }
  // Every task turn names itself to Local MCP, so a tool resolves its caller
  // from the host instead of trusting the ids a model passes.
  const callerGrantHandle = agentRunTaskId && args.executionPolicy !== "secondary-read-only"
    ? registerCallerGrant({
        taskId: agentRunTaskId,
        turnId,
        workspaceId: args.workspaceId?.trim() || null,
        providerId: args.providerId,
        autonomy: args.turnPolicy?.autonomy ?? null,
        agentMode: args.turnPolicy?.agentMode ?? false,
      })
    : null;
  if (callerGrantHandle) {
    effectiveArgs.staveTurnGrants = {
      ...effectiveArgs.staveTurnGrants,
      callerKey: callerGrantHandle.key,
    };
  }
  revokeTurnGrants = () => {
    callerGrantHandle?.revoke();
    agentRunGrantHandle?.revoke();
    agentRunGrantHandle = null;
  };
  if (abortRequested) revokeTurnGrants();
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
      revokeTurnGrants();
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
    const releasedPrompt = agentTurn ? null : releasedAgentPromptHooks({
      providerId: effectiveArgs.providerId, taskId: effectiveArgs.taskId, notice: effectiveArgs.runtimeOptions?.agentInstructions,
    });
    try {
      const events = await runStreamWithPausableTimeout(
        (isCursor ? streamCursorWithAcp : streamKiroWithAcp)({
          ...effectiveArgs,
          prepareTaskAgentPrompt: agentTurn?.prepareSessionPrompt ?? releasedPrompt?.prepare,
          acknowledgeTaskAgentPrompt: () => {
            releasedPrompt?.acknowledge();
            const evidence = agentTurn?.acknowledgeSessionPrompt();
            if (evidence) lifecycle.emit(evidence);
          },
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
      revokeTurnGrants();
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
    revokeTurnGrants();
    timeoutController.dispose();
    clearActiveTurnState({ turnId });
  }
}

export const providerRuntime: ProviderRuntime = {
  streamTurn: (args) => runProviderTurn(args),
  startTurnStream: (args, options) => {
    const releaseAdmission = workspaceExecutionGate.acquire(args);
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
    const stamp = providerAccountEventMapper(args);
    const deliveryLifecycle = createProviderTurnLifecycle({
      onEvent: (rawEvent) => {
        const event = stamp(rawEvent);
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
        .then(() => undefined)
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
          releaseAdmission();
          session.done = true;
          session.updatedAt = Date.now();
          clearActiveTurnState({ turnId });
          activeTurnPromises.delete(turnId);
          if (!shouldBufferForPolling) {
            activeStreams.delete(streamId);
          }
          pruneExpiredStreams();
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
  cleanupTask: ({ taskId }) => {
    clearActiveTaskSessions({ taskId });
    cleanupProviderTaskState(taskId);
    return {
      ok: true,
      message: `Cleaned provider runtime state for task ${taskId}.`,
    };
  },
  respondApproval: ({ turnId, requestId, approved, reason, scope }) =>
    deliverResponderResult<
      NonNullable<ActiveRuntimeSession["respondApproval"]>
    >({
      kind: "approval",
      turnId,
      requestId,
      invoke: (responder) => responder({ requestId, approved, reason, scope }),
      selectResponder: (session) => session.respondApproval,
      timeoutMs: PROVIDER_STEER_ACK_TIMEOUT_MS,
    }),
  respondUserInput: ({ turnId, requestId, answers, denied }) =>
    deliverResponderResult<
      NonNullable<ActiveRuntimeSession["respondUserInput"]>
    >({
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
    const result = await deliverResponderResult<
      NonNullable<ActiveRuntimeSession["steer"]>
    >({
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
      const result = await describeClaudeAvailability({ runtimeOptions });
      return { ok: true, ...result };
    }
    if (providerId === "codex") {
      const result = await describeCodexAvailability({ runtimeOptions });
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

    // Wait for in-flight turn promises so their `.finally()` → `onDone()`
    // callbacks complete *before* the caller closes the persistence layer.
    // Without this, completeTurn() races with SQLite close.
    if (activeTurnPromises.size > 0) {
      await Promise.allSettled(Array.from(activeTurnPromises.values()));
    }

    activeSessions.clear();
    activeStreams.clear();
    if (completedStreamExpiryTimer) clearTimeout(completedStreamExpiryTimer);
    completedStreamExpiryTimer = null;
    activeTurnPromises.clear();
    codexAgentRunChannelKeyByTask.clear();
    cleanupProviderTaskState(DEFAULT_PROVIDER_TASK_KEY);
    for (const taskId of taskIds) {
      cleanupProviderTaskState(taskId);
    }
    // Terminate the shared `codex app-server` processes; without this they
    // outlive the host service as ghost children.
    disposeAllCodexAppServerClients();
  },
};
