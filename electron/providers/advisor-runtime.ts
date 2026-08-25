import {
  boundAdvisorAdvice,
  isStaticAdvisorTarget,
  resolveAdvisorEffort,
  resolveAdvisorTimeoutMs,
} from "../../src/lib/providers/advisor";
import { getProviderLabel } from "../../src/lib/providers/model-catalog";
import type {
  AdvisorIsolationMode,
  AdvisorTarget,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import { formatAdvisorDuration } from "../../src/lib/providers/advisor-activity";
import {
  runClaudeReadOnlyPrompt,
  type ClaudeReadOnlyPromptProgress,
} from "./claude-sdk-runtime";
import {
  getCodexModelCatalog,
  runCodexReadOnlyPrompt,
} from "./codex-app-server-runtime";
import { ADVISOR_READ_ONLY_PROMPT_LABEL } from "./read-only-prompt-labels";
import type { BridgeEvent } from "./types";

type UsageEvent = Extract<BridgeEvent, { type: "usage" }>;

/**
 * Floor between heartbeats. Long enough that a chatty provider cannot turn the
 * turn stream into a firehose, short enough that a stalled consult is obvious
 * well before its multi-minute deadline.
 */
const ADVISOR_HEARTBEAT_MIN_INTERVAL_MS = 5_000;

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

export type AdvisorCallResult =
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
       * `detail`. Both are graceful fallbacks — the primary turn keeps running.
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
       * `user` means the user cancelled this consult from the exchange monitor;
       * the primary keeps running. `ineligible` means the call was never
       * runnable (unknown Codex model).
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
  // Accepts a getter as well as a value because consults land *while the turn
  // is running* and a cancelled consult reports its usage after the fact.
  // Reading eagerly would pin the value and drop everything spent later.
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

export function formatAdvisorSystemTrace(
  result: AdvisorCallResult,
  args?: { consultIndex?: number; consultLimit?: number },
) {
  const target = describeTarget(result.target);
  const duration = formatAdvisorDuration(result.durationMs);
  const consult =
    args?.consultIndex !== undefined && args?.consultLimit !== undefined
      ? `Advisor consult ${args.consultIndex}/${args.consultLimit}`
      : "Advisor consult";
  if (result.status === "completed") {
    return `${consult} completed with ${target} in ${duration}.`;
  }
  if (result.status === "skipped") {
    return `${consult} skipped for ${target}: ${compactTraceDetail(result.detail)} The primary turn continued.`;
  }
  if (result.status === "aborted") {
    return `${consult} aborted for ${target} after ${duration}.`;
  }
  return `${consult} unavailable for ${target} after ${duration}: ${compactTraceDetail(result.detail)} The primary turn continued.`;
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

/** Consult identity every event of one exchange carries. */
export type AdvisorConsultDescriptor = {
  exchangeId: string;
  consultIndex: number;
  consultLimit: number;
};

/**
 * Emitted once when a turn grants the primary an Advisor, before any consult.
 *
 * On-demand delegation trades a guarantee for efficiency: the Advisor may cost
 * nothing this turn because the primary never asks. Without this event that is
 * indistinguishable from "the Advisor was never armed" or "the tool never
 * reached the model" — the exact ambiguity the preflight design did not have.
 * The runtime reports it because only the runtime knows the grant was minted.
 */
export function buildAdvisorArmedEvent(args: {
  primaryProviderId: ProviderId;
  primaryModel?: string;
  target: AdvisorTarget | null;
  at: number;
  consultLimit: number;
}): AdvisorActivityEvent {
  return {
    type: "advisor_activity",
    phase: "armed",
    consultLimit: args.consultLimit,
    primaryProviderId: args.primaryProviderId,
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...describeAdvisorIdentity(args.target),
    at: args.at,
  };
}

/**
 * Emitted the moment a consult starts so the renderer can show that the primary
 * turn is waiting on another model instead of looking like a slow tool call for
 * up to the advisor deadline.
 */
export function buildAdvisorStartedEvent(args: {
  primaryProviderId: ProviderId;
  primaryModel?: string;
  target: AdvisorTarget | null;
  at: number;
  timeoutMs?: number;
  consult?: AdvisorConsultDescriptor;
  question?: string;
}): AdvisorActivityEvent {
  return {
    type: "advisor_activity",
    phase: "started",
    ...(args.consult ?? {}),
    ...(args.question ? { question: args.question } : {}),
    primaryProviderId: args.primaryProviderId,
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...describeAdvisorIdentity(args.target),
    at: args.at,
    timeoutMs: Math.max(
      1,
      args.timeoutMs ?? resolveAdvisorTimeoutMs(args.target),
    ),
  };
}

/**
 * Heartbeat event. Carries only identity plus the timestamp: it must never look
 * like an outcome, and the reducer folds it without touching the stage list.
 */
export function buildAdvisorProgressEvent(args: {
  primaryProviderId: ProviderId;
  primaryModel?: string;
  target: AdvisorTarget | null;
  at: number;
  detail?: string;
  consult?: AdvisorConsultDescriptor;
}): AdvisorActivityEvent {
  return {
    type: "advisor_activity",
    phase: "progress",
    ...(args.consult ?? {}),
    primaryProviderId: args.primaryProviderId,
    ...(args.primaryModel ? { primaryModel: args.primaryModel } : {}),
    ...describeAdvisorIdentity(args.target),
    at: args.at,
    ...(args.detail ? { detail: args.detail } : {}),
  };
}

export function buildAdvisorOutcomeEvent(args: {
  primaryProviderId: ProviderId;
  result: AdvisorCallResult;
  at: number;
  consult?: AdvisorConsultDescriptor;
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
    ...(args.consult ?? {}),
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
 * Runs one isolated, read-only Advisor call and returns its outcome.
 *
 * The caller (the consult grant in `advisor-consult.ts`) owns eligibility —
 * the target arriving here is already normalized and supported. This function
 * owns everything about a single call: the deadline, cancellation, the Codex
 * dynamic-catalog check, and late-usage harvesting.
 */
export async function runAdvisorCall(args: {
  target: AdvisorTarget;
  prompt: string;
  cwd: string;
  runtimeOptions?: {
    claudeBinaryPath?: string;
    codexBinaryPath?: string;
  };
  registerAbort: (aborter: () => void) => void;
  /**
   * Registers a *consult-scoped* cancel. Unlike `registerAbort` this drops the
   * consult and lets the primary turn proceed, so the user is never forced to
   * kill their whole turn just to escape a slow advisor.
   */
  registerSkip?: (skip: () => void) => void;
  /**
   * Reports usage that lands *after* this function returned.
   *
   * On cancellation the runner promise is deliberately abandoned, but the
   * tokens it already spent are real. A 90s consult that timed out mid-answer
   * is the single most expensive outcome the feature has, and reporting it as
   * zero made the exchange monitor claim "no advisor usage was reported" for
   * precisely the consult that cost the most.
   */
  reportLateUsage?: (usage: UsageEvent) => void;
  /**
   * Sign-of-life while the advisor works, throttled to
   * `ADVISOR_HEARTBEAT_MIN_INTERVAL_MS`.
   *
   * Both providers resolve only when generation has finished, so a consult is
   * otherwise silent for its entire duration — minutes, at the effort tiers
   * Codex models default to. `detail` names what the provider was last seen
   * doing so the UI can distinguish thinking from wedged.
   */
  onHeartbeat?: (heartbeat: { at: number; detail?: string }) => void;
  runners?: AdvisorRunnerDependencies;
  timeoutMs?: number;
}): Promise<AdvisorCallResult> {
  const startedAt = Date.now();
  const runners = args.runners ?? DEFAULT_ADVISOR_RUNNERS;
  const target = args.target;
  const timeoutMs = Math.max(
    1,
    args.timeoutMs ?? resolveAdvisorTimeoutMs(target),
  );

  type CancellationReason = "user" | "timeout" | "skip";
  let providerProgress: ClaudeReadOnlyPromptProgress | undefined;
  // Throttled so a chatty provider cannot flood the turn event stream: the
  // point is "still alive", which one tick per interval conveys completely.
  let lastHeartbeatAt = 0;
  const heartbeat = (detail?: string) => {
    if (!args.onHeartbeat) {
      return;
    }
    const at = Date.now();
    if (at - lastHeartbeatAt < ADVISOR_HEARTBEAT_MIN_INTERVAL_MS) {
      return;
    }
    lastHeartbeatAt = at;
    args.onHeartbeat({ at, ...(detail ? { detail } : {}) });
  };
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
  const buildCancellationResult = (usage?: UsageEvent): AdvisorCallResult => {
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
        detail: "you cancelled this Advisor consult",
        skipKind: "user",
        durationMs,
        usage,
        shouldTrace: true,
      };
    }
    const progressDetail =
      target.providerId === "claude-code" && providerProgress
        ? providerProgress.stage === "loading_runtime"
          ? " while loading the Claude runtime"
          : providerProgress.lastMessageType
            ? ` while waiting for Claude's final result (last SDK event: ${providerProgress.lastMessageType})`
            : " while waiting for Claude's final result"
        : "";
    return {
      status: "failed",
      target,
      detail: `timed out after ${Math.max(
        1,
        Math.round(timeoutMs / 1_000),
      )} seconds${progressDetail}.`,
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
          cwd: args.cwd,
          runtimeOptions: {
            codexBinaryPath: args.runtimeOptions?.codexBinaryPath,
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

    // Resolved through the same helper the renderer labels with, so the tier
    // the composer promised is the tier the call requests.
    const runnerTask =
      target.providerId === "claude-code"
        ? runners.runClaude({
            cwd: args.cwd,
            prompt: args.prompt,
            effort: resolveAdvisorEffort(target),
            model: target.model,
            runtimeOptions: {
              model: target.model,
              claudeBinaryPath: args.runtimeOptions?.claudeBinaryPath,
            },
            signal: controller.signal,
            label: ADVISOR_READ_ONLY_PROMPT_LABEL,
            onProgress: (progress) => {
              providerProgress = progress;
              heartbeat(
                progress.stage === "loading_runtime"
                  ? "Loading the Claude runtime"
                  : progress.lastMessageType
                    ? `Claude event: ${progress.lastMessageType}`
                    : undefined,
              );
            },
          })
        : runners.runCodex({
            cwd: args.cwd,
            prompt: args.prompt,
            model: target.model,
            runtimeOptions: {
              model: target.model,
              codexBinaryPath: args.runtimeOptions?.codexBinaryPath,
              codexReasoningEffort: resolveAdvisorEffort(target),
            },
            signal: controller.signal,
            isolated: true,
            label: ADVISOR_READ_ONLY_PROMPT_LABEL,
            onProgress: ({ lastItemType }) => {
              heartbeat(`Codex item: ${lastItemType}`);
            },
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
