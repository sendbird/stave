import type {
  RouteClassification,
  UtilityInferenceContext,
  UtilityInferenceMetadata,
  UtilityInferenceSelectionReason,
} from "../../src/lib/providers/utility-inference";
import {
  buildCommitMessageInferencePrompt,
  buildRouteClassificationPrompt,
  buildTaskNameInferencePrompt,
  parseCommitMessageInference,
  parseRouteClassification,
  parseTaskNameInference,
} from "../../src/lib/providers/utility-inference";
import { getUtilityInferenceCapability } from "../../src/lib/providers/model-catalog";
import type { ProviderId } from "./types";
import { runClaudeReadOnlyPrompt } from "./claude-sdk-runtime";
import { runCodexReadOnlyPrompt } from "./codex-app-server-runtime";

type ReadOnlyPromptResult = {
  ok: boolean;
  text?: string;
  aborted?: boolean;
  detail?: string;
};

export type UtilityInferenceRunners = Record<
  ProviderId,
  (args: {
    cwd?: string;
    prompt: string;
    model: string;
    runtimeOptions?: UtilityInferenceContext["runtimeOptions"];
  }) => Promise<ReadOnlyPromptResult>
>;

type Candidate = {
  providerId: ProviderId;
  reason: UtilityInferenceSelectionReason;
};

function resolveCandidates(args: UtilityInferenceContext): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (providerId: ProviderId, reason: Candidate["reason"]) => {
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
  if (args.activeProviderId) {
    add(args.activeProviderId, "active-task");
  }
  add("claude-code", "fallback");
  add("codex", "fallback");
  return candidates;
}

function defaultRunners(): UtilityInferenceRunners {
  return {
    "claude-code": (args) =>
      runClaudeReadOnlyPrompt({
        ...args,
        effort: "low",
      }),
    codex: (args) =>
      runCodexReadOnlyPrompt({
        ...args,
        isolated: true,
        runtimeOptions: {
          ...args.runtimeOptions,
          model: args.model,
          codexApprovalPolicy: "never",
          codexFileAccess: "read-only",
          codexNetworkAccess: false,
          codexReasoningEffort: "low",
          codexWebSearch: "disabled",
        },
      }),
  };
}

async function executeUtilityInference<T>(args: {
  context: UtilityInferenceContext;
  prompt: string;
  parse: (text: string) => T | null;
  runners?: UtilityInferenceRunners;
}): Promise<{ value: T | null; utility: UtilityInferenceMetadata }> {
  const attempts: UtilityInferenceMetadata["attempts"] = [];
  const runners = args.runners ?? defaultRunners();

  for (const candidate of resolveCandidates(args.context)) {
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
    const model = capability.defaultModel;
    try {
      const result = await runners[candidate.providerId]({
        cwd: args.context.cwd,
        prompt: args.prompt,
        model,
        runtimeOptions: args.context.runtimeOptions,
      });
      const parsed = result.ok && result.text ? args.parse(result.text) : null;
      attempts.push({
        providerId: candidate.providerId,
        model,
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
            model,
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
) {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildTaskNameInferencePrompt(args),
    parse: parseTaskNameInference,
    runners,
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
) {
  const result = await executeUtilityInference({
    context: args,
    prompt: buildCommitMessageInferencePrompt(args),
    parse: parseCommitMessageInference,
    runners,
  });
  return {
    ok: result.value !== null,
    message: result.value ?? undefined,
    utility: result.utility,
  };
}
