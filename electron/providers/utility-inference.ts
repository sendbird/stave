import fs from "node:fs/promises";
import path from "node:path";
import {
  PROMPT_ENHANCEMENT_REPO_GUIDANCE_CHARS,
  type PromptEnhancementContext,
} from "../../src/lib/providers/prompt-enhancement-context";
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
import {
  getUtilityInferenceCapability,
  inferProviderIdFromModel,
} from "../../src/lib/providers/model-catalog";
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
 * Default ceiling on how many providers a single utility call may *run*.
 *
 * A parse failure used to fan out across every runner, so one cheap call could
 * silently become four. Two runs keep the useful "primary failed, try the other
 * managed provider" recovery without the tail.
 *
 * The cap counts executed runs, not candidates: a provider skipped because it
 * is unsupported or unauthenticated costs no model call, so it must not consume
 * the budget. That is what keeps the last-resort runners reachable for a user
 * who has only Cursor or Kiro installed — exactly the case the fan-out existed
 * for.
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
  return candidates;
}

/** Ceiling on executed runs for one utility call. */
export function resolveUtilityMaxProviderAttempts(
  context: UtilityInferenceContext,
) {
  return Math.max(
    1,
    context.utilityMaxProviderAttempts ?? DEFAULT_UTILITY_MAX_PROVIDER_ATTEMPTS,
  );
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

  const maxAttempts = resolveUtilityMaxProviderAttempts(args.context);
  let executedRuns = 0;
  for (const candidate of resolveUtilityInferenceCandidates(args.context)) {
    if (executedRuns >= maxAttempts) {
      break;
    }
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
    // A configured utility model belongs to exactly one provider. Applying it
    // to a different runner would send an unknown model id and fail the call
    // outright, so it is honored only when the model's own provider is the one
    // about to run. This has to be derived from the model rather than from the
    // `explicit` reason: the legacy `utilityInferenceProvider` setting defaults
    // to "auto", under which every candidate is a fallback and the user's
    // Background AI model choice would otherwise never be applied.
    const configuredModel = args.context.utilityModel?.trim();
    const model =
      configuredModel &&
      inferProviderIdFromModel({ model: configuredModel }) ===
        candidate.providerId
        ? configuredModel
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
      executedRuns += 1;
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

const REPO_GUIDANCE_FILES = ["AGENTS.md", "CLAUDE.md"] as const;

/**
 * Repo policy the rewrite may lean on, read here because the utility runner
 * has no tools. Missing files cost nothing; present ones are clipped.
 */
export async function readPromptEnhancementRepoGuidance(cwd?: string) {
  if (!cwd || !path.isAbsolute(cwd)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const name of REPO_GUIDANCE_FILES) {
    try {
      const text = (await fs.readFile(path.join(cwd, name), "utf8")).trim();
      if (text) {
        parts.push(`# ${name}\n${text}`);
      }
    } catch {
      // Absent or unreadable: the block is simply omitted.
    }
  }
  if (parts.length === 0) {
    return undefined;
  }
  return parts.join("\n\n").slice(0, PROMPT_ENHANCEMENT_REPO_GUIDANCE_CHARS);
}

export async function enhanceUtilityPrompt(
  args: UtilityInferenceContext &
    Omit<PromptEnhancementContext, "repoGuidance"> & { prompt: string },
  runners?: UtilityInferenceRunners,
  authGate?: UtilityInferenceAuthGate,
) {
  const repoGuidance = await readPromptEnhancementRepoGuidance(args.cwd);
  const result = await executeUtilityInference({
    context: args,
    prompt: buildPromptEnhancementInferencePrompt({
      ...args,
      ...(repoGuidance ? { repoGuidance } : {}),
    }),
    parse: (text) => parsePromptEnhancementInference(text, args.prompt),
    runners,
    authGate,
  });
  return {
    ok: result.value !== null,
    prompt: result.value ?? undefined,
    utility: result.utility,
  };
}
