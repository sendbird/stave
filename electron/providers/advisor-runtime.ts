import {
  DEFAULT_ADVISOR_TIMEOUT_MS,
  boundAdvisorAdvice,
  buildAdvisorPrompt,
  isStaticAdvisorTarget,
  isSupportedAdvisorTarget,
  normalizeAdvisorTarget,
  shouldRunAdvisor,
} from "../../src/lib/providers/advisor";
import {
  getProviderLabel,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
} from "../../src/lib/providers/model-catalog";
import type { AdvisorTarget } from "../../src/lib/providers/provider.types";
import { runClaudeReadOnlyPrompt } from "./claude-sdk-runtime";
import {
  getCodexModelCatalog,
  runCodexReadOnlyPrompt,
} from "./codex-app-server-runtime";
import type { BridgeEvent, StreamTurnArgs } from "./types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;

export type AdvisorRunnerDependencies = {
  runClaude: typeof runClaudeReadOnlyPrompt;
  runCodex: typeof runCodexReadOnlyPrompt;
  getCodexModelCatalog?: typeof getCodexModelCatalog;
};

const DEFAULT_ADVISOR_RUNNERS: AdvisorRunnerDependencies = {
  runClaude: runClaudeReadOnlyPrompt,
  runCodex: runCodexReadOnlyPrompt,
  getCodexModelCatalog,
};

export type AdvisorPreflightResult =
  | {
      status: "completed";
      target: AdvisorTarget;
      advice: string;
      durationMs: number;
      usage?: UsageEvent;
      shouldTrace: true;
    }
  | {
      status: "failed" | "skipped";
      target: AdvisorTarget | null;
      detail: string;
      durationMs: number;
      usage?: UsageEvent;
      shouldTrace: boolean;
    }
  | {
      status: "aborted";
      target: AdvisorTarget | null;
      durationMs: number;
      usage?: UsageEvent;
      shouldTrace: false;
    };

function sumOptional(left?: number, right?: number) {
  if (left === undefined && right === undefined) {
    return undefined;
  }
  return (left ?? 0) + (right ?? 0);
}

export function mergeAdvisorUsage(
  advisorUsage: UsageEvent,
  primaryUsage: UsageEvent,
): UsageEvent {
  const cacheReadTokens = sumOptional(
    advisorUsage.cacheReadTokens,
    primaryUsage.cacheReadTokens,
  );
  const cacheCreationTokens = sumOptional(
    advisorUsage.cacheCreationTokens,
    primaryUsage.cacheCreationTokens,
  );
  const totalCostUsd = sumOptional(
    advisorUsage.totalCostUsd,
    primaryUsage.totalCostUsd,
  );
  return {
    type: "usage",
    inputTokens: advisorUsage.inputTokens + primaryUsage.inputTokens,
    outputTokens: advisorUsage.outputTokens + primaryUsage.outputTokens,
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(cacheCreationTokens !== undefined ? { cacheCreationTokens } : {}),
    ...(totalCostUsd !== undefined ? { totalCostUsd } : {}),
    ...(primaryUsage.ttftMs !== undefined
      ? { ttftMs: primaryUsage.ttftMs }
      : advisorUsage.ttftMs !== undefined
        ? { ttftMs: advisorUsage.ttftMs }
        : {}),
  };
}

export function createAdvisorUsageMerger(advisorUsage?: UsageEvent) {
  let usageEmitted = false;
  return (event: BridgeEvent): BridgeEvent[] => {
    if (!advisorUsage) {
      return [event];
    }
    if (event.type === "usage") {
      usageEmitted = true;
      return [mergeAdvisorUsage(advisorUsage, event)];
    }
    if (event.type === "done" && !usageEmitted) {
      usageEmitted = true;
      return [advisorUsage, event];
    }
    return [event];
  };
}

function describeTarget(target: AdvisorTarget | null) {
  if (!target) {
    return "configured target";
  }
  return `${getProviderLabel({ providerId: target.providerId })} · ${target.model}`;
}

function compactTraceDetail(detail: string) {
  const normalized = detail.replace(/\s+/g, " ").trim();
  return normalized.length > 240
    ? `${normalized.slice(0, 237)}...`
    : normalized;
}

export function formatAdvisorSystemTrace(result: AdvisorPreflightResult) {
  const target = describeTarget(result.target);
  const duration = `${Math.max(1, Math.round(result.durationMs / 100) / 10)}s`;
  if (result.status === "completed") {
    return `Advisor completed with ${target} in ${duration}.`;
  }
  if (result.status === "skipped") {
    return `Advisor skipped for ${target}: ${compactTraceDetail(result.detail)}`;
  }
  return `Advisor unavailable for ${target} after ${duration}: ${compactTraceDetail(result.detail)} The primary turn continued.`;
}

export async function runAdvisorPreflight(args: {
  turn: StreamTurnArgs;
  registerAbort: (aborter: () => void) => void;
  runners?: AdvisorRunnerDependencies;
  timeoutMs?: number;
}): Promise<AdvisorPreflightResult> {
  const startedAt = Date.now();
  const runners = args.runners ?? DEFAULT_ADVISOR_RUNNERS;
  const timeoutMs = Math.max(1, args.timeoutMs ?? DEFAULT_ADVISOR_TIMEOUT_MS);
  const target = normalizeAdvisorTarget(
    args.turn.runtimeOptions?.advisorTarget,
  );
  if (!target) {
    return {
      status: "skipped",
      target: null,
      detail: "the target is invalid",
      durationMs: Date.now() - startedAt,
      shouldTrace: true,
    };
  }
  if (!isSupportedAdvisorTarget(target)) {
    return {
      status: "skipped",
      target,
      detail: "the model is not in the current provider catalog",
      durationMs: Date.now() - startedAt,
      shouldTrace: true,
    };
  }
  if (
    !shouldRunAdvisor({
      conversation: args.turn.conversation,
      target,
    })
  ) {
    const unsupported = !args.turn.conversation
      ? "this call has no canonical conversation"
      : "this turn type or model is not eligible";
    return {
      status: "skipped",
      target,
      detail: unsupported,
      durationMs: Date.now() - startedAt,
      shouldTrace: false,
    };
  }

  const controller = new AbortController();
  let userAborted = false;
  let timedOut = false;
  let resolveCancellation = (_reason: "user" | "timeout") => {};
  const cancellation = new Promise<"user" | "timeout">((resolve) => {
    resolveCancellation = resolve;
  });
  let cancellationReason: "user" | "timeout" | null = null;
  const cancel = (reason: "user" | "timeout") => {
    if (cancellationReason) {
      return;
    }
    cancellationReason = reason;
    userAborted = reason === "user";
    timedOut = reason === "timeout";
    resolveCancellation(reason);
    controller.abort();
  };
  args.registerAbort(() => {
    cancel("user");
  });
  const timeoutHandle = setTimeout(() => {
    cancel("timeout");
  }, timeoutMs);
  const waitForCancellation = async <T>(task: Promise<T>) =>
    Promise.race([
      task.then(
        (value) => ({ status: "resolved" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
      cancellation.then((reason) => ({
        status: "cancelled" as const,
        reason,
      })),
    ]);
  const buildCancellationResult = (
    usage?: UsageEvent,
  ): AdvisorPreflightResult => {
    const durationMs = Date.now() - startedAt;
    if (userAborted) {
      return {
        status: "aborted",
        target,
        durationMs,
        usage,
        shouldTrace: false,
      };
    }
    return {
      status: "failed",
      target,
      detail: `timed out after ${Math.max(
        1,
        Math.round(timeoutMs / 1_000),
      )} seconds.`,
      durationMs,
      usage,
      shouldTrace: true,
    };
  };

  try {
    if (target.providerId === "codex" && !isStaticAdvisorTarget(target)) {
      const catalogOutcome = await waitForCancellation(
        (runners.getCodexModelCatalog ?? getCodexModelCatalog)({
          cwd: args.turn.cwd,
          runtimeOptions: {
            codexBinaryPath: args.turn.runtimeOptions?.codexBinaryPath,
          },
        }),
      );
      if (catalogOutcome.status === "cancelled") {
        return buildCancellationResult();
      }
      if (catalogOutcome.status === "rejected") {
        throw catalogOutcome.error;
      }
      const catalog = catalogOutcome.value;
      const durationMs = Date.now() - startedAt;
      if (userAborted || timedOut) {
        return buildCancellationResult();
      }
      if (!catalog.ok) {
        return {
          status: "failed",
          target,
          detail: `could not validate the Codex model catalog: ${catalog.detail}`,
          durationMs,
          shouldTrace: true,
        };
      }
      if (
        !catalog.models.some(
          (model) => !model.hidden && model.model === target.model,
        )
      ) {
        return {
          status: "skipped",
          target,
          detail: "the model is not in the current Codex App Server catalog",
          durationMs,
          shouldTrace: true,
        };
      }
    }

    const prompt = buildAdvisorPrompt({
      conversation: args.turn.conversation!,
    });
    const runnerTask =
      target.providerId === "claude-code"
        ? runners.runClaude({
            cwd: args.turn.cwd,
            prompt,
            model: target.model,
            effort: resolveDefaultClaudeEffortForModel({
              model: target.model,
            }),
            runtimeOptions: {
              model: target.model,
              claudeBinaryPath: args.turn.runtimeOptions?.claudeBinaryPath,
            },
            signal: controller.signal,
          })
        : runners.runCodex({
            cwd: args.turn.cwd,
            prompt,
            model: target.model,
            runtimeOptions: {
              model: target.model,
              codexBinaryPath: args.turn.runtimeOptions?.codexBinaryPath,
              codexReasoningEffort: resolveDefaultCodexEffortForModel({
                model: target.model,
              }),
            },
            signal: controller.signal,
            isolated: true,
          });
    const runnerOutcome = await waitForCancellation(runnerTask);
    if (runnerOutcome.status === "cancelled") {
      return buildCancellationResult();
    }
    if (runnerOutcome.status === "rejected") {
      throw runnerOutcome.error;
    }
    const result = runnerOutcome.value;
    const durationMs = Date.now() - startedAt;

    if (userAborted || timedOut) {
      return buildCancellationResult(result.usage);
    }
    const advice = boundAdvisorAdvice(result.text ?? "");
    if (!result.ok || !advice) {
      return {
        status: "failed",
        target,
        detail: result.detail?.trim() || "no usable advice was returned.",
        durationMs,
        usage: result.usage,
        shouldTrace: true,
      };
    }
    return {
      status: "completed",
      target,
      advice,
      durationMs,
      usage: result.usage,
      shouldTrace: true,
    };
  } catch (error) {
    if (userAborted || timedOut) {
      return buildCancellationResult();
    }
    return {
      status: "failed",
      target,
      detail:
        error instanceof Error ? error.message : "the Advisor call failed.",
      durationMs: Date.now() - startedAt,
      shouldTrace: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
