import type {
  ProviderRuntimeOptions,
  ProviderId,
} from "../../src/lib/providers/provider.types";
import {
  SecondaryProviderCancelRequestSchema,
  SecondaryProviderExecutionRequestSchema,
  SecondaryProviderExecutionResultSchema,
  type SecondaryProviderExecutionRequest,
  type SecondaryProviderExecutionResult,
  type SecondaryRunRuntimeHints,
} from "../../src/lib/runs/secondary-run";
import type { RunPolicy } from "../../src/lib/runs/run-domain";
import type { BridgeEvent, ProviderRuntime, StreamTurnArgs } from "./types";

type SecondaryExecutionRuntime = Pick<
  ProviderRuntime,
  "streamTurn" | "cleanupTask"
>;

type SecondaryCancellationRuntime = Pick<ProviderRuntime, "abortTurn">;

const MAX_REMEMBERED_CANCELLATIONS = 1_024;
const cancelledExecutionIds = new Map<string, number>();

function rememberCancelledExecution(executionId: string) {
  cancelledExecutionIds.delete(executionId);
  cancelledExecutionIds.set(executionId, Date.now());
  while (cancelledExecutionIds.size > MAX_REMEMBERED_CANCELLATIONS) {
    const oldestExecutionId = cancelledExecutionIds.keys().next().value;
    if (typeof oldestExecutionId !== "string") {
      break;
    }
    cancelledExecutionIds.delete(oldestExecutionId);
  }
}

function sanitizeExecutionError(value: unknown, fallback: string) {
  const message =
    value instanceof Error
      ? value.message.trim()
      : typeof value === "string"
        ? value.trim()
        : "";
  return (message || fallback).slice(0, 1_000);
}

function truncateUtf8(value: string, maxBytes: number) {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(value);
  if (encoded.byteLength <= maxBytes) {
    return { value, byteLength: encoded.byteLength, truncated: false };
  }
  let truncated = new TextDecoder().decode(encoded.slice(0, maxBytes));
  while (encoder.encode(truncated).byteLength > maxBytes) {
    truncated = truncated.slice(0, -1);
  }
  return {
    value: truncated,
    byteLength: encoder.encode(truncated).byteLength,
    truncated: true,
  };
}

function resolveSecondaryOutcome(args: {
  events: BridgeEvent[];
  cancelled: boolean;
}) {
  const done = [...args.events]
    .reverse()
    .find(
      (event): event is Extract<BridgeEvent, { type: "done" }> =>
        event.type === "done",
    );
  const stopReason = done?.stop_reason?.trim() || null;
  if (
    args.cancelled ||
    stopReason === "user_abort" ||
    stopReason === "cancelled"
  ) {
    return {
      status: "cancelled" as const,
      stopReason,
      error: null,
    };
  }
  const policyViolation = args.events.find(
    (event) =>
      event.type === "approval" ||
      event.type === "user_input" ||
      event.type === "diff",
  );
  if (policyViolation) {
    return {
      status: "failed" as const,
      stopReason,
      error:
        "The secondary provider requested an operation outside its read-only policy.",
    };
  }
  const lastError = [...args.events]
    .reverse()
    .find(
      (event): event is Extract<BridgeEvent, { type: "error" }> =>
        event.type === "error",
    );
  if (
    !done ||
    stopReason === "runtime_failure" ||
    stopReason === "error" ||
    stopReason === "failed" ||
    stopReason === "aborted" ||
    stopReason === "output_overflow" ||
    lastError?.recoverable === false
  ) {
    return {
      status: "failed" as const,
      stopReason,
      error: sanitizeExecutionError(
        lastError?.message,
        !done
          ? "The secondary provider stopped without a terminal event."
          : "The secondary provider failed before producing a result.",
      ),
    };
  }
  return {
    status: "completed" as const,
    stopReason,
    error: null,
  };
}

export function buildSecondaryProviderRuntimeOptions(args: {
  providerId: ProviderId;
  model: string;
  policy: RunPolicy;
  runtimeHints?: SecondaryRunRuntimeHints;
}): ProviderRuntimeOptions {
  const hints = args.runtimeHints ?? {};
  const common: ProviderRuntimeOptions = {
    model: args.model,
    chatStreamingEnabled: false,
    providerTimeoutMs: args.policy.timeoutMs,
    responseStylePrompt: undefined,
    promptPrDescription: undefined,
    promptInlineCompletion: undefined,
    claudeResumeSessionId: undefined,
    claudeResumeSessionAt: undefined,
    codexResumeThreadId: undefined,
  };
  if (args.providerId === "claude-code") {
    return {
      ...common,
      claudeBinaryPath: hints.claudeBinaryPath,
      claudeEffort: hints.claudeEffort,
      claudeThinkingMode: hints.claudeThinkingMode,
      claudeMaxBudgetUsd: hints.claudeMaxBudgetUsd,
      claudeTaskBudgetTokens: hints.claudeTaskBudgetTokens,
      claudeFastMode: hints.claudeFastMode,
      claudePermissionMode: "plan",
      claudePlanModeApprovalScope: "bash",
      claudeAllowDangerouslySkipPermissions: false,
      claudeSandboxEnabled: true,
      claudeAllowUnsandboxedCommands: false,
      claudeAllowedTools: ["Read", "Glob", "Grep", "Bash"],
      claudeDisallowedTools: [
        "Write",
        "Edit",
        "MultiEdit",
        "NotebookEdit",
        "WebFetch",
        "WebSearch",
      ],
      claudeMaxTurns: args.policy.maxTurns,
      claudeSettingSources: [],
      claudeAgentProgressSummaries: false,
      claudePromptSuggestions: false,
      claudeForwardSubagentText: false,
      claudeEnableFileCheckpointing: false,
      claudeForkSession: false,
      claudeStrictMcpConfig: true,
      claudeSkills: [],
      claudePluginPaths: [],
    };
  }
  return {
    ...common,
    codexBinaryPath: hints.codexBinaryPath,
    codexReasoningEffort: hints.codexReasoningEffort,
    codexReasoningSummary: hints.codexReasoningSummary,
    codexReasoningSummarySupport: hints.codexReasoningSummarySupport,
    codexFastMode: hints.codexFastMode,
    codexApprovalPolicy: "never",
    codexFileAccess: "read-only",
    codexNetworkAccess: false,
    codexWebSearch: "disabled",
    codexShowRawReasoning: false,
    codexPlanMode: false,
  };
}

export async function executeSecondaryProviderRun(
  rawRequest: SecondaryProviderExecutionRequest,
  runtime: SecondaryExecutionRuntime,
): Promise<SecondaryProviderExecutionResult> {
  const request = SecondaryProviderExecutionRequestSchema.parse(rawRequest);
  const taskId = `secondary:${request.executionId}`;
  let events: BridgeEvent[] = [];
  let thrownError: string | null = null;
  try {
    if (!cancelledExecutionIds.has(request.executionId)) {
      const providerArgs: StreamTurnArgs = {
        turnId: request.executionId,
        taskId,
        executionPolicy: "secondary-read-only",
        providerId: request.input.providerId,
        prompt: request.input.prompt,
        conversation: undefined,
        cwd: request.input.cwd,
        runtimeOptions: buildSecondaryProviderRuntimeOptions({
          providerId: request.input.providerId,
          model: request.input.model,
          policy: request.policy,
          runtimeHints: request.input.runtimeHints,
        }),
      };
      events = await runtime.streamTurn(providerArgs);
    }
  } catch (error) {
    thrownError = sanitizeExecutionError(
      error,
      "The secondary provider failed unexpectedly.",
    );
  } finally {
    runtime.cleanupTask({ taskId });
  }

  const cancelled = cancelledExecutionIds.delete(request.executionId);
  const collectedEvents = events.slice(0, request.policy.maxEvents);
  const collectedText = collectedEvents
    .filter(
      (event): event is Extract<BridgeEvent, { type: "text" }> =>
        event.type === "text",
    )
    .map((event) => event.text)
    .join("");
  const boundedText = truncateUtf8(
    collectedText,
    request.policy.maxOutputBytes,
  );
  const outcome = thrownError
    ? {
        status: "failed" as const,
        stopReason: null,
        error: thrownError,
      }
    : resolveSecondaryOutcome({ events, cancelled });

  return SecondaryProviderExecutionResultSchema.parse({
    executionId: request.executionId,
    providerId: request.input.providerId,
    model: request.input.model,
    status: outcome.status,
    text: boundedText.value,
    eventCount: events.length,
    collectedEventCount: collectedEvents.length,
    outputBytes: boundedText.byteLength,
    truncated: boundedText.truncated || events.length > collectedEvents.length,
    stopReason: outcome.stopReason,
    error: outcome.error,
  });
}

export function cancelSecondaryProviderRun(
  rawRequest: { executionId: string },
  runtime: SecondaryCancellationRuntime,
) {
  const request = SecondaryProviderCancelRequestSchema.parse(rawRequest);
  rememberCancelledExecution(request.executionId);
  const result = runtime.abortTurn({ turnId: request.executionId });
  return {
    ok: true,
    message: result.ok
      ? "Secondary provider run cancellation requested."
      : "Secondary provider run will be cancelled before execution starts.",
  };
}
