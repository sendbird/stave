import type { ProviderId, ProviderRuntimeOptions } from "./provider.types";

export type UtilityInferenceProvider = "auto" | ProviderId;
export type UtilityInferenceFeature =
  "task-name" | "route-classification" | "commit-message";
export type UtilityInferenceSelectionReason =
  "explicit" | "active-task" | "fallback";

export type UtilityInferenceAttempt = {
  providerId: ProviderId;
  model: string;
  ok: boolean;
  detail?: string;
};

export type UtilityInferenceMetadata = {
  providerId: ProviderId | null;
  model: string | null;
  selectionReason: UtilityInferenceSelectionReason | "unavailable";
  degraded: boolean;
  attempts: UtilityInferenceAttempt[];
  detail?: string;
};

export type UtilityInferenceContext = {
  cwd?: string;
  utilityProviderId?: UtilityInferenceProvider;
  activeProviderId?: ProviderId;
  runtimeOptions?: ProviderRuntimeOptions;
};

export type RouteClassification = {
  taskType:
    | "quick_edit"
    | "plan"
    | "implementation"
    | "debug"
    | "review"
    | "general"
    | "safety";
  complexity: "low" | "medium" | "high";
  recommendedTier: "light" | "standard" | "heavy" | "frontier";
  confidence: number;
  rationale?: string;
  stick?: boolean;
};

export function normalizeUtilityInferenceProvider(
  value: unknown,
): UtilityInferenceProvider {
  return value === "claude-code" || value === "codex" ? value : "auto";
}

export function createUnavailableUtilityInferenceMetadata(
  detail: string,
): UtilityInferenceMetadata {
  return {
    providerId: null,
    model: null,
    selectionReason: "unavailable",
    degraded: true,
    attempts: [],
    detail,
  };
}

export function buildTaskNameInferencePrompt(args: {
  prompt: string;
  history?: Array<{ role: string; content: string }>;
}) {
  const historyLines = (args.history ?? [])
    .slice(-6)
    .map(
      (message) =>
        `${message.role === "user" ? "User" : "Assistant"}: ${message.content.slice(0, 300)}`,
    )
    .join("\n");

  return [
    "Generate a short task title of 3-6 words in Title Case for this coding task.",
    "Return only the title: no quotes, punctuation, markdown, or explanation.",
    "",
    ...(historyLines ? [`Conversation so far:\n${historyLines}`, ""] : []),
    `Latest message: ${args.prompt.slice(0, 400)}`,
  ].join("\n");
}

export function parseTaskNameInference(text: string) {
  const title = text
    .trim()
    .split("\n")[0]
    ?.trim()
    .replace(/^["'`]+|["'`.,:;!?]+$/g, "")
    .slice(0, 100);
  return title || null;
}

export function buildRouteClassificationPrompt(args: {
  prompt: string;
  history?: Array<{
    role: "user" | "assistant";
    content: string;
    providerId?: ProviderId;
    model?: string;
  }>;
  fileContextCount?: number;
}) {
  const historyLines = (args.history ?? [])
    .slice(-8)
    .map((message) => {
      const provider = message.providerId ? ` ${message.providerId}` : "";
      const model = message.model ? ` ${message.model}` : "";
      return `${message.role}${provider}${model}: ${message.content.slice(0, 500)}`;
    })
    .join("\n");

  return [
    "Classify the next Stave coding turn for model routing.",
    "Return only valid compact JSON without markdown.",
    'Shape: {"taskType":"quick_edit|plan|implementation|debug|review|general|safety","complexity":"low|medium|high","recommendedTier":"light|standard|heavy|frontier","confidence":0.0,"rationale":"short","stick":false}',
    "Use stick=true when confidence is low or the existing provider should not be changed.",
    `Attached file context count: ${Math.max(0, args.fileContextCount ?? 0)}`,
    "",
    ...(historyLines ? [`History:\n${historyLines}`, ""] : []),
    `Prompt:\n${args.prompt.slice(0, 4000)}`,
  ].join("\n");
}

export function parseRouteClassification(
  text: string,
): RouteClassification | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const taskTypes = [
      "quick_edit",
      "plan",
      "implementation",
      "debug",
      "review",
      "general",
      "safety",
    ] as const;
    const complexities = ["low", "medium", "high"] as const;
    const tiers = ["light", "standard", "heavy", "frontier"] as const;
    if (
      typeof parsed.taskType !== "string" ||
      !taskTypes.includes(parsed.taskType as (typeof taskTypes)[number]) ||
      typeof parsed.complexity !== "string" ||
      !complexities.includes(
        parsed.complexity as (typeof complexities)[number],
      ) ||
      typeof parsed.recommendedTier !== "string" ||
      !tiers.includes(parsed.recommendedTier as (typeof tiers)[number])
    ) {
      return null;
    }
    const confidence =
      typeof parsed.confidence === "number" &&
      Number.isFinite(parsed.confidence)
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0;
    return {
      taskType: parsed.taskType as RouteClassification["taskType"],
      complexity: parsed.complexity as RouteClassification["complexity"],
      recommendedTier:
        parsed.recommendedTier as RouteClassification["recommendedTier"],
      confidence,
      ...(typeof parsed.rationale === "string"
        ? { rationale: parsed.rationale.slice(0, 400) }
        : {}),
      ...(typeof parsed.stick === "boolean" ? { stick: parsed.stick } : {}),
    };
  } catch {
    return null;
  }
}

export function buildCommitMessageInferencePrompt(args: {
  diff: string;
  fileList: string;
}) {
  return [
    "Generate one concise Conventional Commit message.",
    "Format: <type>(<optional scope>): <imperative description>",
    "Allowed types: feat, fix, refactor, chore, docs, test, perf, ci, build, revert",
    "Keep the subject at 72 characters or fewer. Do not end with a period.",
    "Return only the commit message without quotes, markdown, or explanation.",
    "",
    "Changed files:",
    args.fileList || "(no file list available)",
    ...(args.diff.length > 0
      ? ["", "Git diff (may be truncated):", args.diff.slice(0, 6000)]
      : []),
  ].join("\n");
}

export function parseCommitMessageInference(text: string) {
  const message = text
    .trim()
    .split("\n")[0]
    ?.trim()
    .replace(/^["'`]+|["'`]+$/g, "");
  return message || null;
}
