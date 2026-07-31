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
  streamCodexWithAppServer,
} from "./codex-app-server-runtime";
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
  appendAdvisorAdvice,
  withoutAdvisorTarget,
} from "../../src/lib/providers/advisor";
import {
  createAdvisorUsageMerger,
  formatAdvisorSystemTrace,
  runAdvisorPreflight,
} from "./advisor-runtime";
import {
  createProviderTurnLifecycle,
  type ProviderTurnLifecycleSnapshot,
} from "./provider-turn-lifecycle";

const sdkTurnTimeoutMs = Number(
  process.env.STAVE_PROVIDER_TIMEOUT_MS ?? 300000,
);
const ACTIVE_STREAM_TTL_MS = 15 * 60 * 1000;
const COMPLETED_STREAM_TTL_MS = 60 * 1000;
const ACTIVE_STREAM_RETAINED_BYTES_MAX = 512 * 1024;
const BATCH_TURN_RETAINED_BYTES_MAX = 2 * 1024 * 1024;
const DEFAULT_PROVIDER_TASK_KEY = "default";
type TurnTimeoutController = {
  promise: Promise<null>;
  pauseForDecision: () => void;
  resumeAfterDecision: () => void;
  dispose: () => void;
  readonly timedOut: boolean;
};

type ActiveRuntimeSession = {
  turnId: string;
  providerId: StreamTurnArgs["providerId"];
  taskId?: string;
  streamId?: string;
  abort?: () => void;
  respondApproval?: (args: {
    requestId: string;
    approved: boolean;
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
    // Steering is additive (it does not answer a paused decision), but the
    // controller ignores a resume when nothing is paused, so this is safe.
    session.timeoutController?.resumeAfterDecision();
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

async function withTimeout<T>(args: {
  task: Promise<T>;
  timeoutMs: number;
  onTimeout?: () => void;
}): Promise<T | null> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<null>((resolve) => {
    timeoutHandle = setTimeout(() => {
      args.onTimeout?.();
      resolve(null);
    }, args.timeoutMs);
  });
  try {
    return await Promise.race([args.task, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Turn-level timeout that can be paused while the UI is waiting on a user
 * decision (approval / user_input elicitation).
 *
 * Why pausing matters: without this, an unattended approval prompt that sits
 * idle for longer than `sdkTurnTimeoutMs` (5 min by default) silently aborts
 * the turn the moment the user finally clicks Approve. That produces the
 * "plan completed but UI is stuck" symptom because the abort races with
 * the tool_result, corrupting replay state.
 *
 * Semantics:
 * - The timer starts when the turn is created.
 * - `pauseForDecision()` is called each time the bridge emits `approval` or
 *   `user_input`. Multiple simultaneous decisions are refcounted.
 * - `resumeAfterDecision()` is called when a responder fires successfully
 *   (via respondApproval/respondUserInput) OR on a matching tool_result event.
 * - On resume we deliberately **reset** the remaining budget to the full
 *   `timeoutMs` rather than continue where we paused: the user's
 *   deliberation latency should never eat the provider's generation budget.
 * - `dispose()` is called from the finally block regardless of outcome.
 */
export function createTurnTimeoutController(args: {
  timeoutMs: number;
  onTimeout: () => void;
}): TurnTimeoutController {
  let remainingMs = args.timeoutMs;
  let handle: NodeJS.Timeout | null = null;
  let disposed = false;
  let timedOut = false;
  let pendingDecisionCount = 0;

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

  const pauseForDecision = () => {
    if (disposed || timedOut) {
      return;
    }
    pendingDecisionCount += 1;
    if (pendingDecisionCount === 1) {
      stopTimer();
    }
  };

  const resumeAfterDecision = () => {
    if (pendingDecisionCount === 0 || disposed || timedOut) {
      return;
    }
    pendingDecisionCount -= 1;
    if (pendingDecisionCount === 0) {
      remainingMs = args.timeoutMs;
      start();
    }
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
    dispose,
    get timedOut() {
      return timedOut;
    },
  };
}

async function runProviderTurn(
  args: StreamTurnArgs & { onEvent?: (event: BridgeEvent) => void },
) {
  const lifecycle = createProviderTurnLifecycle({
    onEvent: args.onEvent,
  });
  const finishLifecycle = (
    reason: "completed" | "runtime_failure" | "user_abort",
  ) => {
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
  upsertActiveSession({
    turnId,
    providerId: args.providerId,
    taskId: args.taskId,
    abort: abortTurn,
  });
  const turnTimeoutMs =
    args.runtimeOptions?.providerTimeoutMs ?? sdkTurnTimeoutMs;

  // Shared across Claude + Codex: a pausable timeout controller keeps the
  // approval/user_input wait from silently timing out the turn. See
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
      // Pause the turn clock the moment we ask the user to decide. Resume is
      // driven by the responder delivery in `deliverResponderResult`, with a
      // defensive fallback on `tool_result` / `error` events so a crashed
      // adapter can't leave the controller paused forever.
      if (event.type === "approval" || event.type === "user_input") {
        timeoutController.pauseForDecision();
      } else if (event.type === "tool_result" || event.type === "error") {
        // These are the observable "decision processed" / "stream failed"
        // signals. If we're still paused, resume so the remaining turn time
        // still applies.
        timeoutController.resumeAfterDecision();
      }
      downstream?.(event);
    };

  const advisorEvents: BridgeEvent[] = [];
  let effectiveArgs: typeof args = {
    ...args,
    runtimeOptions: withoutAdvisorTarget(args.runtimeOptions),
  };
  let advisorUsage: Extract<BridgeEvent, { type: "usage" }> | undefined;
  if (args.runtimeOptions?.advisorTarget) {
    const advisorResult = await runAdvisorPreflight({
      turn: args,
      registerAbort: registerPhaseAborter,
    });
    if (advisorResult.status === "aborted" || abortRequested) {
      const terminalEvents: BridgeEvent[] = timeoutController.timedOut
        ? [
            {
              type: "error",
              message: `Provider turn timed out during Advisor preflight. timeout=${turnTimeoutMs}ms`,
              recoverable: true,
            },
            {
              type: "done",
              stop_reason: "runtime_failure",
            },
          ]
        : [
            {
              type: "done",
              stop_reason: "user_abort",
            },
          ];
      const mapUsage = createAdvisorUsageMerger(advisorResult.usage);
      const mappedTerminalEvents = terminalEvents.flatMap((event) =>
        mapUsage(event),
      );
      mappedTerminalEvents.forEach((event) => lifecycle.emit(event));
      timeoutController.dispose();
      clearActiveTurnState({ turnId });
      lastCompletedLifecycleSnapshot = lifecycle.snapshot();
      return lifecycle.events();
    }
    if (advisorResult.shouldTrace) {
      const trace: BridgeEvent = {
        type: "system",
        content: formatAdvisorSystemTrace(advisorResult),
      };
      advisorEvents.push(trace);
      lifecycle.emit(trace);
    }
    advisorUsage = advisorResult.usage;
    if (advisorResult.status === "completed" && effectiveArgs.conversation) {
      effectiveArgs = {
        ...effectiveArgs,
        conversation: appendAdvisorAdvice({
          conversation: effectiveArgs.conversation,
          target: advisorResult.target,
          advice: advisorResult.advice,
        }),
      };
    }
  }

  const mapUsageForDownstream = createAdvisorUsageMerger(advisorUsage);
  const emittedPrimaryEvents: BridgeEvent[] = [];
  const emitPrimaryEvent = (event: BridgeEvent) => {
    emittedPrimaryEvents.push(event);
    for (const mappedEvent of mapUsageForDownstream(event)) {
      lifecycle.emit(mappedEvent);
    }
  };
  const emitMissingReturnedEvents = (events: BridgeEvent[]) => {
    const emittedCounts = new Map<string, number>();
    for (const event of emittedPrimaryEvents) {
      const key = JSON.stringify(event);
      emittedCounts.set(key, (emittedCounts.get(key) ?? 0) + 1);
    }
    for (const event of events) {
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
            updateActiveSession({ respondApproval: responder });
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
          updateActiveSession({ respondApproval: responder });
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
  cleanupTask: ({ taskId }) => {
    clearActiveTaskSessions({ taskId });
    cleanupProviderTaskState(taskId);
    return {
      ok: true,
      message: `Cleaned provider runtime state for task ${taskId}.`,
    };
  },
  respondApproval: ({ turnId, requestId, approved }) =>
    deliverResponderResult({
      kind: "approval",
      turnId,
      requestId,
      invoke: (responder) => responder({ requestId, approved }),
      selectResponder: (session) => session.respondApproval,
    }),
  respondUserInput: ({ turnId, requestId, answers, denied }) =>
    deliverResponderResult({
      kind: "user-input",
      turnId,
      requestId,
      invoke: (responder) => responder({ requestId, answers, denied }),
      selectResponder: (session) => session.respondUserInput,
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
    return {
      ok: false,
      available: false,
      detail: `Unsupported provider: ${providerId}`,
      capabilities: createEmptyProviderRuntimeCapabilities(),
    };
  },
  getCommandCatalog: async ({ providerId, cwd, runtimeOptions }) => {
    if (providerId === "claude-code") {
      const result = await withTimeout({
        task: getClaudeCommandCatalog({ cwd, runtimeOptions }),
        timeoutMs: 15_000,
      });
      return (
        result ?? {
          ok: false,
          supported: false,
          commands: [],
          detail: "Timed out loading the Claude command catalog.",
        }
      );
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
    activeTurnPromises.clear();
    cleanupProviderTaskState(DEFAULT_PROVIDER_TASK_KEY);
    for (const taskId of taskIds) {
      cleanupProviderTaskState(taskId);
    }
  },
};
