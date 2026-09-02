import type {
  RouteClassification,
  UtilityInferenceContext,
  UtilityInferenceMetadata,
  UtilityInferenceSelectionReason,
  UtilityRunnerProviderId,
} from "../../src/lib/providers/utility-inference";
import {
  UTILITY_CODEX_FAST_MODE,
  UTILITY_CODEX_REASONING_EFFORT,
  UTILITY_RUNNER_PROVIDER_IDS,
  buildCommitMessageInferencePrompt,
  buildPromptEnhancementInferencePrompt,
  buildRouteClassificationPrompt,
  buildTaskNameInferencePrompt,
  parseCommitMessageInference,
  parsePromptEnhancementInference,
  parseRouteClassification,
  parseTaskNameInference,
} from "../../src/lib/providers/utility-inference";
import { getUtilityInferenceCapability } from "../../src/lib/providers/model-catalog";
import { inspectUtilityRunnerReadiness } from "../main/utils/tooling-status";
import { runAcpUtilityPrompt } from "./acp/acp-utility-prompt";
import { runClaudeReadOnlyPrompt } from "./claude-sdk-runtime";
import { runCodexReadOnlyPrompt } from "./codex-app-server-runtime";
import type { ProviderId } from "../../src/lib/providers/provider.types";

type ReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  aborted?: boolean;
  detail?: string;
  resolvedModel?: string;
};

export type UtilityInferenceRunners = Record<
  UtilityRunnerProviderId,
  (args: {
    cwd?: string;
    prompt: string;
    model: string;
    runtimeOptions?: UtilityInferenceContext["runtimeOptions"];
  }) => Promise<ReadOnlyPromptResult>
>;

export type UtilityInferenceAuthGate = (args: {
  providerId: UtilityRunnerProviderId;
  runtimeOptions?: UtilityInferenceContext["runtimeOptions"];
}) => Promise<{ ready: boolean; detail?: string }>;

type Candidate = {
  providerId: UtilityRunnerProviderId;
  reason: UtilityInferenceSelectionReason;
};

export function buildUtilityCodexRuntimeOptions(args: {
  model: string;
  runtimeOptions?: UtilityInferenceContext["runtimeOptions"];
}): NonNullable<UtilityInferenceContext["runtimeOptions"]> {
  return {
    ...args.runtimeOptions,
    model: args.model,
    codexApprovalPolicy: "never",
    codexFileAccess: "read-only",
    codexNetworkAccess: false,
    codexReasoningEffort: UTILITY_CODEX_REASONING_EFFORT,
    codexFastMode: UTILITY_CODEX_FAST_MODE,
    codexWebSearch: "disabled",
  };
}

/**
 * Default ceiling on how many providers a single utility call may try.
 *
 * A parse failure used to fan out across every runner, so one cheap call could
 * silently become four — including two last-resort providers that are usually
 * not even installed. Two attempts keep the useful "primary failed, try the
 * other managed provider" recovery without the tail.
 */
export const DEFAULT_UTILITY_MAX_PROVIDER_ATTEMPTS = 2;

export function resolveUtilityInferenceCandidates(
  args: UtilityInferenceContext,
): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (
    providerId: UtilityRunnerProviderId,
    reason: Candidate["reason"],
  ) => {
    if (!candidates.some((candidate) => candidate.providerId === providerId)) {
      candidates.push({ providerId, reason });
    }
  };

  if (
    args.utilityProviderId === "claude-code" ||
    args.utilityProviderId === "codex"
  ) {
    add(args.utilityProviderId, "explicit");
  }
  for (const providerId of UTILITY_RUNNER_PROVIDER_IDS) {
    add(providerId, "fallback");
  }
  const maxAttempts = Math.max(
    1,
    args.utilityMaxProviderAttempts ?? DEFAULT_UTILITY_MAX_PROVIDER_ATTEMPTS,
  );
  return candidates.slice(0, maxAttempts);
}

export async function defaultUtilityAuthGate(args: {
  providerId: UtilityRunnerProviderId;
  runtimeOptions?: UtilityInferenceContext["runtimeOptions"];
}) {
  return inspectUtilityRunnerReadiness({
    providerId: args.providerId,
    claudeBinaryPath: args.runtimeOptions?.claudeBinaryPath,
    codexBinaryPath: args.runtimeOptions?.codexBinaryPath,
    cursorBinaryPath: args.runtimeOptions?.cursorBinaryPath,
    kiroBinaryPath: args.runtimeOptions?.kiroBinaryPath,
  });
}

function allowAllAuthGate(): Promise<{ ready: boolean }> {
  return Promise.resolve({ ready: true });
}

function resolveAuthGate(args: {
  runners?: UtilityInferenceRunners;
  authGate?: UtilityInferenceAuthGate;
}): UtilityInferenceAuthGate {
  if (args.authGate) {
    return args.authGate;
  }
  if (args.runners) {
    return allowAllAuthGate;
  }
  return defaultUtilityAuthGate;
}

function defaultRunners(): UtilityInferenceRunners {
  return {
    // Haiku 4.5 rejects `effort` (400). Worker mode already drops the field.
    "claude-code": (args) => runClaudeReadOnlyPrompt(args),
    codex: (args) =>
      runCodexReadOnlyPrompt({
        ...args,
        isolated: true,
        runtimeOptions: buildUtilityCodexRuntimeOptions(args),
      }),
    cursor: async (args) => {
      const result = await runAcpUtilityPrompt({
        providerId: "cursor",
        cwd: args.cwd,
        prompt: args.prompt,
        model: args.model,
        runtimeOptions: args.runtimeOptions,
      });
      return {
        ok: result.ok,
        text: result.text,
        aborted: result.aborted,
        detail: result.detail,
        resolvedModel: result.resolvedModel,
      };
    },
    kiro: async (args) => {
      const result = await runAcpUtilityPrompt({
        providerId: "kiro",
        cwd: args.cwd,
        prompt: args.prompt,
        model: args.model,
        runtimeOptions: args.runtimeOptions,
      });
      return {
        ok: result.ok,
        text: result.text,
        aborted: result.aborted,
        detail: result.detail,
        resolvedModel: result.resolvedModel,
      };
    },
  };
}

async function executeUtilityInference<T>(args: {
  context: UtilityInferenceContext;
  prompt: string;
  parse: (text: string) => T | null;
  runners?: UtilityInferenceRunners;
  authGate?: UtilityInferenceAuthGate;
}): Promise<{ value: T | null; utility: UtilityInferenceMetadata }> {
  const attempts: UtilityInferenceMetadata["attempts"] = [];
  const runners = args.runners ?? defaultRunners();
  const authGate = resolveAuthGate(args);
  let hasAttemptedRunner = false;

  for (const candidate of resolveUtilityInferenceCandidates(args.context)) {
    const capability = getUtilityInferenceCapability({
      providerId: candidate.providerId,
    });
    if (!capability.supported) {
      attempts.push({
        providerId: candidate.providerId,
        model: capability.defaultModel,
        ok: false,
        detail: "Provider does not support utility inference.",
      });
      continue;
    }
    // A configured utility model belongs to the provider the user picked. A
    // fallback runner is a different provider, and handing it another
    // provider's model id fails the call outright.
    const model =
      candidate.reason === "explicit" && args.context.utilityModel?.trim()
        ? args.context.utilityModel.trim()
        : capability.defaultModel;
    if (hasAttemptedRunner) {
      const auth = await authGate({
        providerId: candidate.providerId,
        runtimeOptions: args.context.runtimeOptions,
      });
      if (!auth.ready) {
        attempts.push({
          providerId: candidate.providerId,
          model,
          ok: false,
          detail: auth.detail || "Provider is not authenticated.",
        });
        continue;
      }
    }
    try {
      hasAttemptedRunner = true;
      const result = await runners[candidate.providerId]({
        cwd: args.context.cwd,
        prompt: args.prompt,
        model,
        runtimeOptions: args.context.runtimeOptions,
      });
      const parsed = result.ok && result.text ? args.parse(result.text) : null;
      const effectiveModel = result.resolvedModel ?? model;
      attempts.push({
        providerId: candidate.providerId,
        model: effectiveModel,
        ok: parsed !== null,
        detail:
          parsed !== null
            ? undefined
            : result.detail || "The provider returned no usable result.",
      });
      if (parsed !== null) {
        return {
          value: parsed,
          utility: {
            providerId: candidate.providerId,
            model: effectiveModel,
            selectionReason: candidate.reason,
            degraded: attempts.length > 1,
            attempts,
          },
        };
      }
    } catch (error) {
      attempts.push({
        providerId: candidate.providerId,
        model,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    value: null,
    utility: {
      providerId: null,
      model: null,
      selectionReason: "unavailable",
      degraded: true,
      attempts,
      detail: attempts
        .map(
          (attempt) =>
            `${attempt.providerId}: ${attempt.detail ?? "unavailable"}`,
        )
        .join("; "),
    },
  };
}

export async function suggestUtilityTaskName(
  args: UtilityInferenceContext & {
    prompt: string;
    history?: Array<{ role: string; content: string }>;
  },
  runners?: UtilityInferenceRunners,
  authGate?: UtilityInferenceAuthGate,
) {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildTaskNameInferencePrompt(args),
    parse: parseTaskNameInference,
    runners,
    authGate,
  });
  return {
    ok: result.value !== null,
    title: result.value ?? undefined,
    utility: result.utility,
  };
}

export async function classifyUtilityRoute(
  args: UtilityInferenceContext & {
    prompt: string;
    history?: Array<{
      role: "user" | "assistant";
      content: string;
      providerId?: ProviderId;
      model?: string;
    }>;
    fileContextCount?: number;
  },
  runners?: UtilityInferenceRunners,
  authGate?: UtilityInferenceAuthGate,
): Promise<{
  ok: boolean;
  classification?: RouteClassification;
  utility: UtilityInferenceMetadata;
}> {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildRouteClassificationPrompt(args),
    parse: parseRouteClassification,
    runners,
    authGate,
  });
  return {
    ok: result.value !== null,
    classification: result.value ?? undefined,
    utility: result.utility,
  };
}

export async function suggestUtilityCommitMessage(
  args: UtilityInferenceContext & {
    diff: string;
    fileList: string;
  },
  runners?: UtilityInferenceRunners,
  authGate?: UtilityInferenceAuthGate,
) {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildCommitMessageInferencePrompt(args),
    parse: parseCommitMessageInference,
    runners,
    authGate,
  });
  return {
    ok: result.value !== null,
    message: result.value ?? undefined,
    utility: result.utility,
  };
}

export async function enhanceUtilityPrompt(
  args: UtilityInferenceContext & { prompt: string },
  runners?: UtilityInferenceRunners,
  authGate?: UtilityInferenceAuthGate,
) {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildPromptEnhancementInferencePrompt(args),
    parse: parsePromptEnhancementInference,
    runners,
    authGate,
  });
  return {
    ok: result.value !== null,
    prompt: result.value ?? undefined,
    utility: result.utility,
  };
}
