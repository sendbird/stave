import {
  DEFAULT_ADVISOR_TIMEOUT_MS,
  boundAdvisorAdvice,
  buildAdvisorPrompt,
  isStaticAdvisorTarget,
  isSupportedAdvisorTarget,
  normalizeAdvisorTarget,
  resolveAdvisorEffort,
  shouldRunAdvisor,
} from "../../src/lib/providers/advisor";
import { getProviderLabel } from "../../src/lib/providers/model-catalog";
import type {
  AdvisorIsolationMode,
  AdvisorTarget,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import { formatAdvisorDuration } from "../../src/lib/providers/advisor-activity";
import { runClaudeReadOnlyPrompt } from "./claude-sdk-runtime";
import {
  getCodexModelCatalog,
  runCodexReadOnlyPrompt,
} from "./codex-app-server-runtime";
import { ADVISOR_READ_ONLY_PROMPT_LABEL } from "./read-only-prompt-labels";
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
      status: "failed";
      target: AdvisorTarget | null;
      detail: string;
      /**
       * Distinguishes a deadline from a provider error without re-parsing
       * `detail`. Both are graceful fallbacks — the primary turn still runs.
       */
      failureKind: "timeout" | "error";
      durationMs: number;
      usage?: UsageEvent;
      shouldTrace: boolean;
    }
  | {
      status: "skipped";
      target: AdvisorTarget | null;
      detail: string;
      /**
       * `user` means the user pressed skip while the advisor was holding the
       * turn; the primary must still run. `ineligible` means the advisor was
       * never applicable to this turn.
       */
      skipKind: "user" | "ineligible";
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

/**
 * Folds advisor usage into the turn's usage reporting exactly once.
 *
 * A turn can legitimately emit more than one `usage` event (a steer buffered
 * before the first result produces a second one), so the merge must be guarded
 * — without the guard the advisor's tokens and cost were added to every usage
 * event in the stream.
 *
 * `flush()` covers the inverse leak: terminal `done` events synthesised by the
 * turn lifecycle bypass this mapper entirely, which silently dropped advisor
 * usage whenever the primary turn timed out or aborted.
 */
export function createAdvisorUsageMerger(
  // Accepts a getter as well as a value because a cancelled advisor reports its
  // usage *after* this merger is constructed. Reading it eagerly would pin the
  // value to `undefined` and drop the tokens a timed-out advisor already spent.
  advisorUsage?: UsageEvent | (() => UsageEvent | undefined),
) {
  const resolveUsage = () =>
    typeof advisorUsage === "function" ? advisorUsage() : advisorUsage;
  let usageEmitted = false;
  const map = (event: BridgeEvent): BridgeEvent[] => {
    const usage = resolveUsage();
    if (!usage) {
      return [event];
    }
    if (event.type === "usage" && !usageEmitted) {
      usageEmitted = true;
      return [mergeAdvisorUsage(usage, event)];
    }
    if (event.type === "done" && !usageEmitted) {
      usageEmitted = true;
      return [usage, event];
    }
    return [event];
  };
  map.flush = (): BridgeEvent[] => {
    const usage = resolveUsage();
    if (!usage || usageEmitted) {
      return [];
    }
    usageEmitted = true;
    return [usage];
  };
  return map;
}

/**
 * The isolation actually applied by each runner. Reported from here rather than
 * derived in the renderer so the UI's "tools were isolated" claim is evidence
 * from the code path that enforced it.
 */
export function resolveAdvisorIsolationMode(
  providerId: ProviderId,
): AdvisorIsolationMode {
  return providerId === "claude-code"
    ? "claude-tools-disabled"
    : "codex-ephemeral-read-only";
}

function describeTarget(target: AdvisorTarget | null) {
  if (!target) {
    return "configured target";
  }
  return `${getProviderLabel({ providerId: target.providerId })} · ${target.model}`;
}

/**
 * Details arrive both with and without terminal punctuation ("the target is
 * invalid" vs "Claude authentication is required."), and every caller appends
 * another sentence after them. Without normalising, the trace ran two sentences
 * together: "...the target is invalid The primary turn continued."
 */
function compactTraceDetail(detail: string) {
  const normalized = detail.replace(/\s+/g, " ").trim();
  const bounded =
    normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
  if (!bounded || /[.!?]$/.test(bounded)) {
    return bounded;
  }
  return `${bounded}.`;
}

export { formatAdvisorDuration };

export function formatAdvisorSystemTrace(result: AdvisorPreflightResult) {
  const target = describeTarget(result.target);
  const duration = formatAdvisorDuration(result.durationMs);
  if (result.status === "completed") {
    return `Advisor completed with ${target} in ${duration}.`;
  }
  if (result.status === "skipped") {
    return `Advisor skipped for ${target}: ${compactTraceDetail(result.detail)} The primary turn continued.`;
  }
  if (result.status === "aborted") {
    return `Advisor aborted for ${target} after ${duration}.`;
  }
  return `Advisor unavailable for ${target} after ${duration}: ${compactTraceDetail(result.detail)} The primary turn continued.`;
}

type AdvisorActivityEvent = Extract<BridgeEvent, { type: "advisor_activity" }>;

function describeAdvisorIdentity(target: AdvisorTarget | null) {
  return target
    ? {
        advisorProviderId: target.providerId,
        advisorModel: target.model,
        // Reported post-resolution, so a tier that was defaulted or clamped
        // shows the value the call carried rather than the one that was asked
        // for. Same rule as `isolation`: never a renderer-side guess.
        advisorEffort: resolveAdvisorEffort(target),
        isolation: resolveAdvisorIsolationMode(target.providerId),
      }
    : {};
}

/**
 * Emitted *before* the blocking preflight so the renderer can show that the
 * primary turn is waiting on another model instead of looking like a slow
 * "thinking" phase for up to the advisor deadline.
 */
export function buildAdvisorStartedEvent(args: {
  primaryProviderId: ProviderId;
  primaryModel?: string;
  target: AdvisorTarget | null;
  at: number;
  timeoutMs?: number;
}): AdvisorActivityEvent {
  return {
    type: "advisor_activity",
    phase: "started",
    primaryProviderId: args.primaryProviderId,
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...describeAdvisorIdentity(args.target),
    at: args.at,
    timeoutMs: Math.max(
      1,
      args.timeoutMs ?? DEFAULT_ADVISOR_TIMEOUT_MS,
    ),
  };
}

export function buildAdvisorOutcomeEvent(args: {
  primaryProviderId: ProviderId;
  result: AdvisorPreflightResult;
  at: number;
}): AdvisorActivityEvent {
  const { result } = args;
  const phase: AdvisorActivityEvent["phase"] =
    result.status === "completed"
      ? "completed"
      : result.status === "aborted"
        ? "aborted"
        : result.status === "skipped"
          ? "skipped"
          : result.failureKind === "timeout"
            ? "timeout"
            : "failed";
  return {
    type: "advisor_activity",
    phase,
    primaryProviderId: args.primaryProviderId,
    ...describeAdvisorIdentity(result.target),
    at: args.at,
    durationMs: result.durationMs,
    ...(result.status === "completed"
      ? { advice: result.advice, adviceChars: result.advice.length }
      : {}),
    ...(result.status !== "completed" && result.status !== "aborted"
      ? { detail: result.detail }
      : {}),
    ...(result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          ...(result.usage.totalCostUsd !== undefined
            ? { totalCostUsd: result.usage.totalCostUsd }
            : {}),
        }
      : {}),
  };
}

/**
 * The primary must still run for a graceful advisor fallback. Only a user abort
 * of the whole turn stops it.
 */
export function shouldContinuePrimaryTurn(result: AdvisorPreflightResult) {
  return result.status !== "aborted";
}

export async function runAdvisorPreflight(args: {
  turn: StreamTurnArgs;
  registerAbort: (aborter: () => void) => void;
  /**
   * Registers a *advisor-scoped* cancel. Unlike `registerAbort` this drops the
   * advisor and lets the primary turn proceed, so the user is never forced to
   * kill their whole turn just to escape a slow advisor.
   */
  registerSkip?: (skip: () => void) => void;
  /**
   * Reports usage that lands *after* this function returned.
   *
   * On cancellation the runner promise is deliberately abandoned, but the
   * tokens it already spent are real. A 90s advisor that timed out mid-answer
   * is the single most expensive outcome the feature has, and reporting it as
   * zero made the exchange monitor claim "no advisor usage was reported" for
   * precisely the turn that cost the most.
   */
  reportLateUsage?: (usage: UsageEvent) => void;
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
      skipKind: "ineligible",
      durationMs: Date.now() - startedAt,
      shouldTrace: true,
    };
  }
  if (!isSupportedAdvisorTarget(target)) {
    return {
      status: "skipped",
      target,
      detail: "the model is not in the current provider catalog",
      skipKind: "ineligible",
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
      skipKind: "ineligible",
      durationMs: Date.now() - startedAt,
      shouldTrace: false,
    };
  }

  type CancellationReason = "user" | "timeout" | "skip";
  const controller = new AbortController();
  let resolveCancellation = (_reason: CancellationReason) => {};
  const cancellation = new Promise<CancellationReason>((resolve) => {
    resolveCancellation = resolve;
  });
  let cancellationReason: CancellationReason | null = null;
  const cancel = (reason: CancellationReason) => {
    if (cancellationReason) {
      return;
    }
    cancellationReason = reason;
    resolveCancellation(reason);
    controller.abort();
  };
  args.registerAbort(() => {
    cancel("user");
  });
  args.registerSkip?.(() => {
    cancel("skip");
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
    if (cancellationReason === "user") {
      return {
        status: "aborted",
        target,
        durationMs,
        usage,
        shouldTrace: false,
      };
    }
    if (cancellationReason === "skip") {
      return {
        status: "skipped",
        target,
        detail: "you skipped the Advisor for this turn",
        skipKind: "user",
        durationMs,
        usage,
        shouldTrace: true,
      };
    }
    return {
      status: "failed",
      target,
      detail: `timed out after ${Math.max(
        1,
        Math.round(timeoutMs / 1_000),
      )} seconds.`,
      failureKind: "timeout",
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
          // Without the signal the paginated `model/list` sweep keeps running
          // after the turn is already gone.
          signal: controller.signal,
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
      if (cancellationReason) {
        return buildCancellationResult();
      }
      if (!catalog.ok) {
        return {
          status: "failed",
          target,
          detail: `could not validate the Codex model catalog: ${catalog.detail}`,
          failureKind: "error",
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
          skipKind: "ineligible",
          durationMs,
          shouldTrace: true,
        };
      }
    }

    const prompt = buildAdvisorPrompt({
      conversation: args.turn.conversation!,
    });
    // Resolved through the same helper the renderer labels with, so the tier
    // the composer promised is the tier the call requests.
    const runnerTask =
      target.providerId === "claude-code"
        ? runners.runClaude({
            cwd: args.turn.cwd,
            prompt,
            effort: resolveAdvisorEffort(target),
            model: target.model,
            runtimeOptions: {
              model: target.model,
              claudeBinaryPath: args.turn.runtimeOptions?.claudeBinaryPath,
            },
            signal: controller.signal,
            label: ADVISOR_READ_ONLY_PROMPT_LABEL,
          })
        : runners.runCodex({
            cwd: args.turn.cwd,
            prompt,
            model: target.model,
            runtimeOptions: {
              model: target.model,
              codexBinaryPath: args.turn.runtimeOptions?.codexBinaryPath,
              codexReasoningEffort: resolveAdvisorEffort(target),
            },
            signal: controller.signal,
            isolated: true,
            label: ADVISOR_READ_ONLY_PROMPT_LABEL,
          });
    const runnerOutcome = await waitForCancellation(runnerTask);
    if (runnerOutcome.status === "cancelled") {
      // The runner promise is intentionally not awaited here: its own `finally`
      // performs the interrupt + thread teardown, and the turn must not wait on
      // a provider that already ignored the abort.
      //
      // It is not discarded either. Whatever it spent before the cancellation
      // landed still gets billed, so harvest the usage whenever it settles and
      // hand it back out of band. For a skip or a timeout the primary turn is
      // still running and its usage event comes much later, so this reliably
      // makes it into the turn total; for a user abort the turn may already be
      // over, in which case the report is simply too late to fold in.
      void runnerTask.then(
        (late) => {
          if (late.usage) {
            args.reportLateUsage?.(late.usage);
          }
        },
        () => {
          // A rejected runner reports no usage; the failure itself is already
          // surfaced through the cancellation result.
        },
      );
      return buildCancellationResult();
    }
    if (runnerOutcome.status === "rejected") {
      throw runnerOutcome.error;
    }
    const result = runnerOutcome.value;
    const durationMs = Date.now() - startedAt;

    if (cancellationReason) {
      // Tokens were still spent before the cancellation landed, so they must
      // reach the turn's usage total.
      return buildCancellationResult(result.usage);
    }
    const advice = boundAdvisorAdvice(result.text ?? "");
    if (!result.ok || !advice) {
      return {
        status: "failed",
        target,
        detail: result.detail?.trim() || "no usable advice was returned.",
        failureKind: "error",
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
    if (cancellationReason) {
      return buildCancellationResult();
    }
    return {
      status: "failed",
      target,
      detail:
        error instanceof Error ? error.message : "the Advisor call failed.",
      failureKind: "error",
      durationMs: Date.now() - startedAt,
      shouldTrace: true,
    };
  } finally {
    clearTimeout(timeoutHandle);
  }
}
