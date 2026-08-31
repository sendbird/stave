import { randomUUID } from "node:crypto";

import {
  WORKER_CONTEXT_MAX_CHARS,
  WORKER_TASK_MAX_CHARS,
  buildAcpWorkerPrompt,
  buildWorkerExecutionMetadata,
  formatWorkerExecutionMetadata,
  type ResolvedWorkerProfile,
  type WorkerExecutionMetadata,
} from "../../../src/lib/providers/worker-mode";
import type { ProviderRuntimeOptions } from "../../../src/lib/providers/provider.types";
import { truncateBufferedText } from "../provider-buffering";
import { streamCursorWorkerWithAcp } from "../cursor/cursor-acp-profile";
import { streamKiroWorkerWithAcp } from "../kiro/kiro-acp-profile";
import type {
  BridgeEvent,
  ProviderResponderResult,
} from "../types";

const ACP_WORKER_TIMEOUT_MS = 10 * 60_000;
const ACP_WORKER_OUTPUT_MAX_BYTES = 96 * 1024;
const ACP_WORKER_ERROR_MAX_CHARS = 1_000;
const ACP_WORKER_SESSION_LANE_TTL_MS = 30 * 60_000;
const ACP_WORKER_SESSION_LANE_LIMIT = 64;

type AcpWorkerProviderId = "cursor" | "kiro";
type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;
type ContextUsageEvent = Extract<BridgeEvent, { type: "context_usage" }>;
type ApprovalResponder = (args: {
  requestId: string;
  approved: boolean;
  reason?: string;
}) => ProviderResponderResult;

export type AcpWorkerGrant = {
  workerKey: string;
  turnId: string;
  taskId?: string;
  profile: ResolvedWorkerProfile & { provider: AcpWorkerProviderId };
  cwd: string;
  runtimeOptions?: Pick<
    ProviderRuntimeOptions,
    "cursorBinaryPath" | "kiroBinaryPath"
  >;
  emit: (event: BridgeEvent) => void;
  pausePhase: (args: { phase: string }) => void;
  resumePhase: (args: { phase: string }) => void;
  addUsage: (usage: UsageEvent) => void;
  registerApprovalResponder: (responder: ApprovalResponder) => () => void;
  /** Test seam for timeout races; production grants use the fixed policy. */
  workerTimeoutMs?: number;
  runners?: AcpWorkerRunnerDependencies;
};

type ActiveGrant = AcpWorkerGrant & {
  revoked: boolean;
  inFlightAbort: (() => void) | null;
  sessionLaneKey: string | null;
  nativeSessionId?: string;
};

export type AcpWorkerOutcome =
  | {
      ok: true;
      result: string;
      providerId: AcpWorkerProviderId;
      model: string;
      durationMs: number;
    }
  | {
      ok: false;
      code:
        | "unknown-worker-key"
        | "worker-in-flight"
        | "worker-cancelled"
        | "worker-timeout"
        | "worker-failed";
      message: string;
    };

type AcpWorkerRunnerArgs = {
  prompt: string;
  cwd: string;
  model: string;
  effort?: ResolvedWorkerProfile["resolvedWorkerEffort"];
  runtimeOptions?: ProviderRuntimeOptions;
  requestIdScope: string;
  resumeSessionId?: string;
  acpArgsForTest?: readonly string[];
  onEvent?: (event: BridgeEvent) => void;
  registerAbort?: (aborter: () => void) => void;
  registerApprovalResponder?: (responder: ApprovalResponder) => void;
};

export type AcpWorkerRunnerDependencies = {
  runCursor: (args: AcpWorkerRunnerArgs) => Promise<BridgeEvent[]>;
  runKiro: (args: AcpWorkerRunnerArgs) => Promise<BridgeEvent[]>;
};

const DEFAULT_RUNNERS: AcpWorkerRunnerDependencies = {
  runCursor: streamCursorWorkerWithAcp,
  runKiro: streamKiroWorkerWithAcp,
};

const grantsByKey = new Map<string, ActiveGrant>();
const workerSessionLaneByKey = new Map<
  string,
  { taskId: string; nativeSessionId: string; updatedAt: number }
>();
let defaultRunnersOverride: AcpWorkerRunnerDependencies | undefined;

function buildWorkerSessionLaneKey(grant: AcpWorkerGrant) {
  if (!grant.taskId) {
    return null;
  }
  return JSON.stringify([
    grant.taskId,
    grant.profile.provider,
    grant.profile.resolvedWorkerModel,
    grant.profile.resolvedWorkerEffort,
    grant.profile.presetId,
    grant.profile.instructions,
    grant.profile.maxTurns,
    grant.profile.tools,
    grant.cwd,
  ]);
}

function readWorkerSessionLane(key: string | null) {
  if (!key) {
    return undefined;
  }
  const lane = workerSessionLaneByKey.get(key);
  if (!lane) {
    return undefined;
  }
  if (Date.now() - lane.updatedAt > ACP_WORKER_SESSION_LANE_TTL_MS) {
    workerSessionLaneByKey.delete(key);
    return undefined;
  }
  return lane.nativeSessionId;
}

function rememberWorkerSessionLane(args: {
  key: string | null;
  taskId?: string;
  nativeSessionId: string;
}) {
  if (!args.key || !args.taskId) {
    return;
  }
  workerSessionLaneByKey.set(args.key, {
    taskId: args.taskId,
    nativeSessionId: args.nativeSessionId,
    updatedAt: Date.now(),
  });
  if (workerSessionLaneByKey.size <= ACP_WORKER_SESSION_LANE_LIMIT) {
    return;
  }
  const oldest = [...workerSessionLaneByKey.entries()].sort(
    (left, right) => left[1].updatedAt - right[1].updatedAt,
  )[0];
  if (oldest) {
    workerSessionLaneByKey.delete(oldest[0]);
  }
}

export function setDefaultAcpWorkerRunnersForTest(
  runners?: AcpWorkerRunnerDependencies,
) {
  defaultRunnersOverride = runners;
}

export function disposeAllAcpWorkerGrants() {
  for (const grant of grantsByKey.values()) {
    grant.revoked = true;
    grant.inFlightAbort?.();
  }
  grantsByKey.clear();
  workerSessionLaneByKey.clear();
}

export function cleanupAcpWorkerSessionsForTask(taskId: string) {
  for (const [key, lane] of workerSessionLaneByKey) {
    if (lane.taskId === taskId) {
      workerSessionLaneByKey.delete(key);
    }
  }
}

export function clearAcpWorkerGrantsForTest() {
  disposeAllAcpWorkerGrants();
}

export function registerAcpWorkerGrant(grant: AcpWorkerGrant) {
  const sessionLaneKey = buildWorkerSessionLaneKey(grant);
  const nativeSessionId = readWorkerSessionLane(sessionLaneKey);
  const active: ActiveGrant = {
    ...grant,
    revoked: false,
    inFlightAbort: null,
    sessionLaneKey,
    ...(nativeSessionId ? { nativeSessionId } : {}),
  };
  grantsByKey.set(grant.workerKey, active);
  return {
    workerKey: grant.workerKey,
    revoke: () => {
      active.revoked = true;
      grantsByKey.delete(grant.workerKey);
      active.inFlightAbort?.();
    },
  };
}

function buildFailureDetail(events: readonly BridgeEvent[]) {
  return events
    .filter(
      (event): event is Extract<BridgeEvent, { type: "error" }> =>
        event.type === "error",
    )
    .map((event) => event.message.trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, ACP_WORKER_ERROR_MAX_CHARS);
}

function collectWorkerText(events: readonly BridgeEvent[]) {
  return truncateBufferedText({
    value: events
      .filter(
        (event): event is Extract<BridgeEvent, { type: "text" }> =>
          event.type === "text",
      )
      .map((event) => event.text)
      .join(""),
    maxBytes: ACP_WORKER_OUTPUT_MAX_BYTES,
  }).trim();
}

function formatWorkerTimeout(timeoutMs: number) {
  return timeoutMs >= 60_000
    ? `${Math.round(timeoutMs / 60_000)} minutes`
    : `${Math.max(1, Math.round(timeoutMs / 1_000))} seconds`;
}

function emitWorkerEvent(args: {
  grant: ActiveGrant;
  event: BridgeEvent;
  workerExecution: WorkerExecutionMetadata;
  workerAgentId: string;
}) {
  if (args.grant.revoked) {
    return;
  }
  const { event } = args;
  if (event.type === "approval") {
    args.grant.emit({
      ...event,
      description: `Worker · ${event.description}`,
      workerExecution: args.workerExecution,
      ownerAgentId: event.ownerAgentId ?? args.workerAgentId,
    });
    return;
  }
  if (event.type === "tool") {
    args.grant.emit({
      ...event,
      workerExecution: args.workerExecution,
      ownerAgentId: event.ownerAgentId ?? args.workerAgentId,
    });
    return;
  }
  if (event.type === "usage") {
    return;
  }
}

export async function runAcpWorker(args: {
  workerKey: string;
  task: string;
  context?: string;
}): Promise<AcpWorkerOutcome> {
  const grant = grantsByKey.get(args.workerKey);
  if (!grant || grant.revoked) {
    return {
      ok: false,
      code: "unknown-worker-key",
      message:
        "No active Worker grant matches this workerKey. Worker grants are valid only during the turn that issued them.",
    };
  }
  if (grant.inFlightAbort) {
    return {
      ok: false,
      code: "worker-in-flight",
      message:
        "A Worker is already running for this turn. Wait for it to return before delegating more work.",
    };
  }
  const task = args.task.trim().slice(0, WORKER_TASK_MAX_CHARS);
  if (!task) {
    return {
      ok: false,
      code: "worker-failed",
      message: "The delegated Worker task is empty.",
    };
  }

  const startedAt = Date.now();
  const exchangeId = randomUUID();
  const pauseKey = `acp-worker:${exchangeId}`;
  const workerExecution = buildWorkerExecutionMetadata(grant.profile);
  const workerAgentId = `stave-worker:${exchangeId}`;
  const requestedResumeSessionId = grant.nativeSessionId;
  let reportedUsage: UsageEvent | undefined;
  let reportedContextUsage: ContextUsageEvent | undefined;
  let reportedSessionId: string | undefined;
  const runners = grant.runners ?? defaultRunnersOverride ?? DEFAULT_RUNNERS;
  const run = grant.profile.provider === "cursor"
    ? runners.runCursor
    : runners.runKiro;
  let removeApprovalResponder = () => {};
  let exchangeActive = true;
  let timedOut = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const prompt = buildAcpWorkerPrompt({
    profile: grant.profile,
    task,
    ...(args.context?.trim()
      ? { context: args.context.slice(0, WORKER_CONTEXT_MAX_CHARS) }
      : {}),
  });

  // Claim the one-worker slot synchronously. Waiting until the ACP adapter
  // registers its aborter leaves a window where two Local MCP calls can both
  // pass the in-flight check and launch concurrent workers.
  grant.inFlightAbort = () => {};
  grant.pausePhase({ phase: pauseKey });
  grant.emit({
    type: "tool",
    toolUseId: workerAgentId,
    toolName: "Worker",
    input: task,
    state: "input-available",
    workerExecution,
    agentId: workerAgentId,
  });
  try {
    const workerPromise = run({
      prompt,
      cwd: grant.cwd,
      model: grant.profile.resolvedWorkerModel,
      effort: grant.profile.resolvedWorkerEffort,
      runtimeOptions: grant.runtimeOptions,
      requestIdScope: `worker:${exchangeId}`,
      resumeSessionId: requestedResumeSessionId,
      registerAbort: (aborter) => {
        if (!exchangeActive || grant.revoked) {
          aborter();
          return;
        }
        grant.inFlightAbort = aborter;
      },
      registerApprovalResponder: (responder) => {
        if (!exchangeActive || grant.revoked) {
          return;
        }
        removeApprovalResponder();
        removeApprovalResponder = grant.registerApprovalResponder(responder);
      },
      onEvent: (event) => {
        if (!exchangeActive || grant.revoked) {
          return;
        }
        if (event.type === "usage") {
          reportedUsage = event;
          return;
        }
        if (event.type === "context_usage") {
          reportedContextUsage = event;
          return;
        }
        if (event.type === "provider_session") {
          reportedSessionId = event.nativeSessionId;
          return;
        }
        emitWorkerEvent({
          grant,
          event,
          workerExecution,
          workerAgentId,
        });
      },
    });
    const timeoutPromise = new Promise<BridgeEvent[]>((resolve) => {
      timeout = setTimeout(() => {
        timedOut = true;
        exchangeActive = false;
        grant.inFlightAbort?.();
        resolve([]);
      }, grant.workerTimeoutMs ?? ACP_WORKER_TIMEOUT_MS);
      timeout.unref?.();
    });
    const events = await Promise.race([workerPromise, timeoutPromise]);
    exchangeActive = false;
    const durationMs = Date.now() - startedAt;
    reportedUsage ??= [...events]
      .reverse()
      .find((event): event is UsageEvent => event.type === "usage");
    reportedContextUsage ??= [...events]
      .reverse()
      .find(
        (event): event is ContextUsageEvent =>
          event.type === "context_usage",
      );
    reportedSessionId ??= [...events]
      .reverse()
      .find(
        (event): event is Extract<BridgeEvent, { type: "provider_session" }> =>
          event.type === "provider_session",
      )?.nativeSessionId;
    if (!grant.revoked) {
      if (reportedUsage) {
        grant.addUsage(reportedUsage);
      }
      grant.emit({
        type: "delegated_usage",
        executionId: workerAgentId,
        role: "worker",
        providerId: grant.profile.provider,
        model: grant.profile.resolvedWorkerModel,
        ...(reportedUsage
          ? {
              inputTokens: reportedUsage.inputTokens,
              outputTokens: reportedUsage.outputTokens,
              ...(reportedUsage.cacheReadTokens !== undefined
                ? { cacheReadTokens: reportedUsage.cacheReadTokens }
                : {}),
              ...(reportedUsage.cacheCreationTokens !== undefined
                ? { cacheCreationTokens: reportedUsage.cacheCreationTokens }
                : {}),
              ...(reportedUsage.thoughtTokens !== undefined
                ? { thoughtTokens: reportedUsage.thoughtTokens }
                : {}),
              ...(reportedUsage.totalCostUsd !== undefined
                ? { totalCostUsd: reportedUsage.totalCostUsd }
                : {}),
            }
          : {}),
        ...(reportedContextUsage
          ? {
              contextUsedTokens: reportedContextUsage.usedTokens,
              contextWindowTokens: reportedContextUsage.sizeTokens,
              ...(reportedContextUsage.costAmount !== undefined
                ? { contextCostAmount: reportedContextUsage.costAmount }
                : {}),
              ...(reportedContextUsage.costCurrency
                ? { contextCostCurrency: reportedContextUsage.costCurrency }
                : {}),
            }
          : {}),
        sessionReused: Boolean(
          requestedResumeSessionId &&
            reportedSessionId === requestedResumeSessionId,
        ),
      });
    }
    if (timedOut) {
      grant.emit({
        type: "tool",
        toolUseId: workerAgentId,
        toolName: "Worker",
        input: task,
        output: `Timed out after ${formatWorkerTimeout(grant.workerTimeoutMs ?? ACP_WORKER_TIMEOUT_MS)}.`,
        state: "output-error",
        workerExecution,
        agentId: workerAgentId,
      });
      return {
        ok: false,
        code: "worker-timeout",
        message: `The Worker timed out after ${formatWorkerTimeout(grant.workerTimeoutMs ?? ACP_WORKER_TIMEOUT_MS)}.`,
      };
    }
    if (grant.revoked) {
      return {
        ok: false,
        code: "worker-cancelled",
        message: "The parent turn ended while the Worker was running.",
      };
    }

    const result = collectWorkerText(events);
    const terminal = [...events]
      .reverse()
      .find((event): event is Extract<BridgeEvent, { type: "done" }> =>
        event.type === "done",
      );
    const failed = terminal?.stop_reason === "runtime_failure" || !result;
    if (failed) {
      const detail = buildFailureDetail(events) ||
        "The Worker did not return a usable result.";
      grant.emit({
        type: "tool",
        toolUseId: workerAgentId,
        toolName: "Worker",
        input: task,
        output: detail,
        state: "output-error",
        workerExecution,
        agentId: workerAgentId,
      });
      return { ok: false, code: "worker-failed", message: detail };
    }

    if (reportedSessionId) {
      grant.nativeSessionId = reportedSessionId;
      rememberWorkerSessionLane({
        key: grant.sessionLaneKey,
        taskId: grant.taskId,
        nativeSessionId: reportedSessionId,
      });
    }

    grant.emit({
      type: "tool",
      toolUseId: workerAgentId,
      toolName: "Worker",
      input: task,
      output: result,
      state: "output-available",
      workerExecution,
      agentId: workerAgentId,
    });
    grant.emit({
      type: "system",
      content: `Worker completed with ${formatWorkerExecutionMetadata(workerExecution)} in ${Math.max(1, Math.round(durationMs / 1_000))}s.`,
    });
    return {
      ok: true,
      result,
      providerId: grant.profile.provider,
      model: grant.profile.resolvedWorkerModel,
      durationMs,
    };
  } catch (error) {
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, ACP_WORKER_ERROR_MAX_CHARS);
    if (!grant.revoked) {
      grant.emit({
        type: "tool",
        toolUseId: workerAgentId,
        toolName: "Worker",
        input: task,
        output: message || "The Worker failed before returning a result.",
        state: "output-error",
        workerExecution,
        agentId: workerAgentId,
      });
    }
    return {
      ok: false,
      code: grant.revoked ? "worker-cancelled" : "worker-failed",
      message: message || "The Worker failed before returning a result.",
    };
  } finally {
    exchangeActive = false;
    if (timeout) {
      clearTimeout(timeout);
    }
    removeApprovalResponder();
    grant.inFlightAbort = null;
    grant.resumePhase({ phase: pauseKey });
  }
}
