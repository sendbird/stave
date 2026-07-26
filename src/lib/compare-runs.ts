import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

export interface CompareRunVariantConfig {
  provider: ProviderId;
  model?: string;
  label?: string;
}

export interface CompareRunJudgeConfig {
  provider: ProviderId;
  model?: string;
}

export type CompareRunJudgeStatus =
  "pending" | "running" | "completed" | "failed";

export interface CompareRunJudgeCriterionScore {
  criterion: string;
  score: number;
  rationale: string;
}

export interface CompareRunJudgeCandidateScore {
  variantId: string;
  score: number;
  summary: string;
  strengths: string[];
  risks: string[];
  criteria: CompareRunJudgeCriterionScore[];
}

export interface CompareRunJudgeProvenance {
  rubricVersion: string;
  judgeProvider: ProviderId;
  judgeModel: string;
  attempt: number;
}

export interface CompareRunJudgment {
  recommendedVariantId: string;
  confidence: "low" | "medium" | "high";
  rationale: string;
  candidateScores: CompareRunJudgeCandidateScore[];
  /** Missing only on comparison results persisted before provenance tracking. */
  provenance?: CompareRunJudgeProvenance;
}

export interface CompareRunJudge extends CompareRunJudgeConfig {
  status: CompareRunJudgeStatus;
  attempt: number;
  requestId?: string;
  startedAt?: string;
  completedAt?: string;
  judgment?: CompareRunJudgment;
  error?: string;
}

export type CompareRunStatus =
  "starting" | "running" | "completed" | "failed" | "cancelled";

export type CompareRunVariantStatus =
  | "pending"
  | "creating"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "kept"
  | "discarded";

export interface CompareRunVariant extends CompareRunVariantConfig {
  id: string;
  status: CompareRunVariantStatus;
  workspaceId?: string;
  workspaceName?: string;
  workspacePath?: string;
  branchName?: string;
  taskId?: string;
  error?: string;
}

export interface CompareRun {
  id: string;
  seedPrompt: string;
  baseWorkspaceId: string;
  baseTaskId?: string;
  baseBranch?: string;
  createdAt: string;
  updatedAt: string;
  status: CompareRunStatus;
  variants: CompareRunVariant[];
  reviewCriteria?: string[];
  judge?: CompareRunJudge;
  keptVariantId?: string;
  error?: string;
}

export interface StartCompareRunResult {
  ok: boolean;
  compareRunId?: string;
  message?: string;
}

export interface StartCompareRunInput {
  seedPrompt: string;
  variants?: CompareRunVariantConfig[];
  judge?: CompareRunJudgeConfig;
  reviewCriteria?: string[];
}

export type StartCompareRun = (
  args: StartCompareRunInput,
) => Promise<StartCompareRunResult>;

export const DEFAULT_COMPARE_REVIEW_CRITERIA = [
  "Correctness",
  "Tests and verification",
  "Maintainability",
] as const;

export const COMPARE_JUDGE_RUBRIC_VERSION = "1";

export interface CompareRunJudgeCandidateAlias {
  candidateId: string;
  variantId: string;
}

const COMPARE_RUN_STATUSES = new Set<CompareRunStatus>([
  "starting",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const COMPARE_VARIANT_STATUSES = new Set<CompareRunVariantStatus>([
  "pending",
  "creating",
  "running",
  "completed",
  "failed",
  "cancelled",
  "kept",
  "discarded",
]);

const COMPARE_IN_FLIGHT_VARIANT_STATUSES = new Set<CompareRunVariantStatus>([
  "pending",
  "creating",
  "running",
]);

const COMPARE_JUDGE_STATUSES = new Set<CompareRunJudgeStatus>([
  "pending",
  "running",
  "completed",
  "failed",
]);

export type CompareTurnOutcome =
  | { status: "completed" }
  | { status: "failed"; error: string }
  | { status: "cancelled"; error: string };

export function buildDefaultCompareVariants(args: {
  modelClaude: string;
  modelCodex: string;
}): CompareRunVariantConfig[] {
  return [
    {
      provider: "claude-code",
      model: args.modelClaude,
      label: "Claude",
    },
    {
      provider: "codex",
      model: args.modelCodex,
      label: "Codex",
    },
  ];
}

export function normalizeCompareVariants(
  variants: CompareRunVariantConfig[] | undefined,
): CompareRunVariantConfig[] {
  const normalized = (variants ?? []).flatMap((variant) => {
    if (variant.provider !== "claude-code" && variant.provider !== "codex") {
      return [];
    }
    return [
      {
        provider: variant.provider,
        model: variant.model?.trim() || undefined,
        label: variant.label?.trim() || undefined,
      },
    ];
  });

  return normalized.slice(0, 3);
}

export function normalizeCompareJudgeConfig(
  judge: CompareRunJudgeConfig | undefined,
): CompareRunJudgeConfig {
  const provider =
    judge?.provider === "claude-code" || judge?.provider === "codex"
      ? judge.provider
      : "codex";
  return {
    provider,
    model: judge?.model?.trim() || undefined,
  };
}

export function normalizeCompareReviewCriteria(
  criteria: readonly string[] | undefined,
) {
  const normalized = (criteria ?? DEFAULT_COMPARE_REVIEW_CRITERIA)
    .map((criterion) => criterion.trim().replace(/\s+/g, " ").slice(0, 120))
    .filter(Boolean);
  const unique = [...new Set(normalized)].slice(0, 6);
  return unique.length > 0 ? unique : [...DEFAULT_COMPARE_REVIEW_CRITERIA];
}

export function isCompareJudgeReady(run: CompareRun) {
  if (
    run.keptVariantId ||
    run.status === "cancelled" ||
    run.judge?.status !== "pending"
  ) {
    return false;
  }
  if (
    run.variants.some((variant) =>
      COMPARE_IN_FLIGHT_VARIANT_STATUSES.has(variant.status),
    )
  ) {
    return false;
  }
  return (
    run.variants.filter((variant) => variant.status === "completed").length >= 2
  );
}

function normalizeJudgeText(value: unknown, fallback: string, maxLength = 800) {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : fallback;
}

function normalizeJudgeScore(value: unknown, fallback = 0) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.round(Math.min(10, Math.max(0, resolved)) * 10) / 10;
}

function normalizeJudgeList(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeJudgeText(entry, "", 240))
    .filter(Boolean)
    .slice(0, 4);
}

function extractJudgeJson(text: string) {
  const tagged = text.match(
    /<stave_compare_judgment>\s*([\s\S]*?)\s*<\/stave_compare_judgment>/i,
  )?.[1];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = tagged ?? fenced ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  return start >= 0 && end > start ? source.slice(start, end + 1) : "";
}

export function buildCompareJudgeCandidateAliases(
  variants: readonly CompareRunVariant[],
): CompareRunJudgeCandidateAlias[] {
  return variants
    .filter((variant) => variant.status === "completed")
    .map((variant, index) => ({
      candidateId: String.fromCharCode("A".charCodeAt(0) + index),
      variantId: variant.id,
    }));
}

export function parseCompareJudgment(args: {
  text: string;
  variants: readonly CompareRunVariant[];
  reviewCriteria: readonly string[];
  candidateAliases?: readonly CompareRunJudgeCandidateAlias[];
  provenance?: CompareRunJudgeProvenance;
}): CompareRunJudgment | null {
  const json = extractJudgeJson(args.text);
  if (!json) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  const record = parsed as Record<string, unknown>;
  const rawCandidates = Array.isArray(record.candidateScores)
    ? record.candidateScores
    : Array.isArray(record.candidates)
      ? record.candidates
      : [];
  const completedVariants = args.variants.filter(
    (variant) => variant.status === "completed",
  );
  const candidateAliases =
    args.candidateAliases ?? buildCompareJudgeCandidateAliases(args.variants);
  const aliasByVariantId = new Map(
    candidateAliases.map((alias) => [alias.variantId, alias.candidateId]),
  );
  const variantIdByCandidateId = new Map(
    candidateAliases.map((alias) => [alias.candidateId, alias.variantId]),
  );
  const allowedIds = new Set(completedVariants.map((variant) => variant.id));
  const reviewCriteria = normalizeCompareReviewCriteria(args.reviewCriteria);
  const candidateScores = completedVariants.flatMap((variant) => {
    const candidateId = aliasByVariantId.get(variant.id);
    const raw = rawCandidates.find((candidate) => {
      if (!candidate || typeof candidate !== "object") {
        return false;
      }
      const candidateRecord = candidate as Record<string, unknown>;
      return (
        candidateRecord.candidateId === candidateId ||
        candidateRecord.variantId === candidateId ||
        candidateRecord.variantId === variant.id
      );
    });
    if (!raw || typeof raw !== "object") {
      return [];
    }
    const rawRecord = raw as Record<string, unknown>;
    const score = normalizeJudgeScore(
      rawRecord.score ?? rawRecord.overallScore,
    );
    const summary = normalizeJudgeText(
      rawRecord.summary,
      "No candidate summary was returned.",
    );
    const rawCriteria = Array.isArray(rawRecord.criteria)
      ? rawRecord.criteria
      : [];
    const criteria = reviewCriteria.map((criterion) => {
      const rawCriterion = rawCriteria.find((entry) => {
        if (!entry || typeof entry !== "object") {
          return false;
        }
        return (
          normalizeJudgeText(
            (entry as Record<string, unknown>).criterion,
            "",
            120,
          ).toLowerCase() === criterion.toLowerCase()
        );
      }) as Record<string, unknown> | undefined;
      return {
        criterion,
        score: normalizeJudgeScore(rawCriterion?.score, score),
        rationale: normalizeJudgeText(rawCriterion?.rationale, summary, 360),
      };
    });
    return [
      {
        variantId: variant.id,
        score,
        summary,
        strengths: normalizeJudgeList(rawRecord.strengths),
        risks: normalizeJudgeList(rawRecord.risks),
        criteria,
      },
    ];
  });

  if (candidateScores.length !== completedVariants.length) {
    return null;
  }
  const requestedRecommendation =
    typeof record.recommendedCandidateId === "string"
      ? (variantIdByCandidateId.get(record.recommendedCandidateId) ?? "")
      : typeof record.recommendedVariantId === "string"
        ? (variantIdByCandidateId.get(record.recommendedVariantId) ??
          record.recommendedVariantId)
        : "";
  const recommendedVariantId = allowedIds.has(requestedRecommendation)
    ? requestedRecommendation
    : [...candidateScores].sort((left, right) => right.score - left.score)[0]
        ?.variantId;
  if (!recommendedVariantId) {
    return null;
  }
  const confidence =
    record.confidence === "low" ||
    record.confidence === "medium" ||
    record.confidence === "high"
      ? record.confidence
      : "medium";

  return {
    recommendedVariantId,
    confidence,
    rationale: normalizeJudgeText(
      record.rationale,
      candidateScores.find(
        (candidate) => candidate.variantId === recommendedVariantId,
      )?.summary ?? "The recommended candidate scored highest.",
      1_200,
    ),
    candidateScores,
    ...(args.provenance ? { provenance: args.provenance } : {}),
  };
}

export function deriveCompareRunStatus(args: {
  variants: CompareRunVariant[];
  keptVariantId?: string;
}): CompareRunStatus {
  if (
    args.keptVariantId ||
    args.variants.some((variant) => variant.status === "kept")
  ) {
    return "completed";
  }
  if (
    args.variants.some((variant) =>
      COMPARE_IN_FLIGHT_VARIANT_STATUSES.has(variant.status),
    )
  ) {
    return "running";
  }
  if (args.variants.some((variant) => variant.status === "completed")) {
    return "completed";
  }
  if (args.variants.some((variant) => variant.status === "failed")) {
    return "failed";
  }
  return "cancelled";
}

export function patchCompareRunVariant(args: {
  runsById: Record<string, CompareRun | undefined>;
  compareRunId: string;
  variantId: string;
  patch: Partial<CompareRunVariant>;
  expectedStatuses?: readonly CompareRunVariantStatus[];
  now: string;
}) {
  const currentRun = args.runsById[args.compareRunId];
  const currentVariant = currentRun?.variants.find(
    (variant) => variant.id === args.variantId,
  );
  if (
    !currentRun ||
    !currentVariant ||
    currentRun.keptVariantId ||
    currentRun.status === "cancelled" ||
    (args.expectedStatuses &&
      !args.expectedStatuses.includes(currentVariant.status))
  ) {
    return args.runsById;
  }

  return {
    ...args.runsById,
    [args.compareRunId]: {
      ...currentRun,
      updatedAt: args.now,
      variants: currentRun.variants.map((variant) =>
        variant.id === args.variantId ? { ...variant, ...args.patch } : variant,
      ),
    },
  };
}

export function finalizeCompareRunLaunch(args: {
  runsById: Record<string, CompareRun | undefined>;
  compareRunId: string;
  now: string;
}) {
  const currentRun = args.runsById[args.compareRunId];
  if (!currentRun) {
    return args.runsById;
  }
  const status = deriveCompareRunStatus({
    variants: currentRun.variants,
    keptVariantId: currentRun.keptVariantId,
  });
  return {
    ...args.runsById,
    [args.compareRunId]: {
      ...currentRun,
      status,
      updatedAt: args.now,
      ...(status === "failed" && !currentRun.error
        ? { error: "No compare variants could be started." }
        : {}),
    },
  };
}

export function resolveCompareTurnOutcome(
  events: readonly NormalizedProviderEvent[],
): CompareTurnOutcome {
  let doneIndex = -1;
  let errorIndex = -1;
  events.forEach((event, index) => {
    if (event.type === "done") {
      doneIndex = index;
    } else if (event.type === "error") {
      errorIndex = index;
    }
  });
  const doneEvent = events[doneIndex] as
    Extract<NormalizedProviderEvent, { type: "done" }> | undefined;
  if (!doneEvent) {
    return {
      status: "failed",
      error: "The provider stream ended without a completion event.",
    };
  }

  const errorEvent = events[errorIndex] as
    Extract<NormalizedProviderEvent, { type: "error" }> | undefined;
  const recoveredAfterError =
    errorIndex >= 0 &&
    events.slice(errorIndex + 1, doneIndex).some((event) => {
      return (
        event.type === "text" ||
        event.type === "tool" ||
        event.type === "tool_result" ||
        event.type === "diff" ||
        event.type === "plan_ready"
      );
    });
  if (errorEvent && (!errorEvent.recoverable || !recoveredAfterError)) {
    return {
      status: "failed",
      error: errorEvent.message.trim() || "The provider run failed.",
    };
  }

  const stopReason = doneEvent.stop_reason?.trim().toLowerCase();
  if (
    stopReason === "user_abort" ||
    stopReason === "cancelled" ||
    stopReason === "canceled" ||
    stopReason === "interrupted"
  ) {
    return {
      status: "cancelled",
      error: "The candidate run was cancelled.",
    };
  }
  if (
    stopReason === "aborted" ||
    stopReason === "output_overflow" ||
    stopReason === "max_tokens" ||
    stopReason === "runtime_failure" ||
    stopReason === "error" ||
    stopReason === "failed"
  ) {
    return {
      status: "failed",
      error:
        stopReason === "aborted"
          ? "The provider stream ended unexpectedly."
          : `The provider stopped before completing (${stopReason}).`,
    };
  }

  return { status: "completed" };
}

export function normalizePersistedCompareRuns(args: {
  runsById: Record<string, CompareRun | undefined> | undefined;
  now: string;
}): Record<string, CompareRun | undefined> {
  if (!args.runsById) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(args.runsById).map(([compareRunId, run]) => {
      if (!run) {
        return [compareRunId, run] as const;
      }

      const persistedRunStatus = COMPARE_RUN_STATUSES.has(run.status)
        ? run.status
        : "failed";
      const wasInterrupted =
        persistedRunStatus === "starting" || persistedRunStatus === "running";
      const variants = Array.isArray(run.variants)
        ? run.variants.map((variant) => {
            const persistedStatus = COMPARE_VARIANT_STATUSES.has(variant.status)
              ? variant.status
              : "failed";
            if (
              wasInterrupted &&
              COMPARE_IN_FLIGHT_VARIANT_STATUSES.has(persistedStatus)
            ) {
              return {
                ...variant,
                status: "failed" as const,
                error:
                  variant.error ||
                  "Stave restarted before this candidate finished.",
              };
            }
            if (
              persistedRunStatus === "failed" &&
              COMPARE_IN_FLIGHT_VARIANT_STATUSES.has(persistedStatus)
            ) {
              return {
                ...variant,
                status: "failed" as const,
                error: variant.error || run.error || "Candidate run failed.",
              };
            }
            return { ...variant, status: persistedStatus };
          })
        : [];
      const status = wasInterrupted
        ? deriveCompareRunStatus({
            variants,
            keptVariantId: run.keptVariantId,
          })
        : persistedRunStatus;
      const persistedJudgeStatus = run.judge?.status;
      const judge = run.judge
        ? {
            ...run.judge,
            ...normalizeCompareJudgeConfig(run.judge),
            status:
              persistedJudgeStatus === "running"
                ? ("failed" as const)
                : COMPARE_JUDGE_STATUSES.has(
                      persistedJudgeStatus as CompareRunJudgeStatus,
                    )
                  ? (persistedJudgeStatus as CompareRunJudgeStatus)
                  : ("failed" as const),
            attempt:
              typeof run.judge.attempt === "number" &&
              Number.isFinite(run.judge.attempt)
                ? Math.max(0, Math.floor(run.judge.attempt))
                : 0,
            ...(persistedJudgeStatus === "running"
              ? {
                  error:
                    "Stave restarted before the fresh-context judge finished.",
                }
              : {}),
          }
        : undefined;

      return [
        compareRunId,
        {
          ...run,
          status,
          variants,
          reviewCriteria: normalizeCompareReviewCriteria(run.reviewCriteria),
          judge,
          ...(wasInterrupted ? { updatedAt: args.now } : {}),
          ...(status === "failed" && !run.error
            ? { error: "Comparison was interrupted before it finished." }
            : {}),
        },
      ] as const;
    }),
  );
}

export function buildCompareRunVariantId(args: {
  compareRunId: string;
  index: number;
}) {
  return `${args.compareRunId}:variant-${args.index + 1}`;
}

export function deriveCompareSeedTitle(seedPrompt: string) {
  const firstLine = seedPrompt
    .split("\n")
    .find((line) => line.trim().length > 0)
    ?.trim();
  return firstLine?.slice(0, 48) || "Compare run";
}

export function buildCompareWorkspaceName(args: {
  seedPrompt: string;
  compareRunId: string;
  index: number;
}) {
  const title = deriveCompareSeedTitle(args.seedPrompt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const suffix = args.compareRunId.slice(0, 8);
  const candidateId = String.fromCharCode(
    "a".charCodeAt(0) + Math.max(0, args.index),
  );
  return ["compare", suffix, `candidate-${candidateId}`, title]
    .filter(Boolean)
    .join("/");
}

export function buildInitialCompareRun(args: {
  id: string;
  seedPrompt: string;
  baseWorkspaceId: string;
  baseTaskId?: string;
  baseBranch?: string;
  variants: CompareRunVariantConfig[];
  reviewCriteria?: readonly string[];
  judge?: CompareRunJudgeConfig;
  now: string;
}): CompareRun {
  const judge = normalizeCompareJudgeConfig(args.judge);
  return {
    id: args.id,
    seedPrompt: args.seedPrompt,
    baseWorkspaceId: args.baseWorkspaceId,
    ...(args.baseTaskId ? { baseTaskId: args.baseTaskId } : {}),
    baseBranch: args.baseBranch,
    createdAt: args.now,
    updatedAt: args.now,
    status: "starting",
    reviewCriteria: normalizeCompareReviewCriteria(args.reviewCriteria),
    judge: {
      ...judge,
      status: "pending",
      attempt: 0,
    },
    variants: args.variants.map((variant, index) => ({
      id: buildCompareRunVariantId({ compareRunId: args.id, index }),
      provider: variant.provider,
      model: variant.model,
      label: variant.label,
      status: "pending",
    })),
  };
}

export function finishCompareVariantForTask(args: {
  run: CompareRun;
  taskId: string;
  outcome?: CompareTurnOutcome["status"];
  /** @deprecated Use outcome. */
  failed?: boolean;
  error?: string;
  now: string;
}): CompareRun {
  if (args.run.keptVariantId || args.run.status === "cancelled") {
    return args.run;
  }
  const targetIndex = args.run.variants.findIndex(
    (variant) =>
      variant.taskId === args.taskId &&
      COMPARE_IN_FLIGHT_VARIANT_STATUSES.has(variant.status),
  );
  if (targetIndex < 0) {
    return args.run;
  }

  const outcome = args.outcome ?? (args.failed ? "failed" : "completed");
  const variants = args.run.variants.map((variant, index) =>
    index === targetIndex
      ? {
          ...variant,
          status: outcome,
          ...(outcome !== "completed" && args.error
            ? { error: args.error }
            : {}),
        }
      : variant,
  );
  const status = deriveCompareRunStatus({
    variants,
    keptVariantId: args.run.keptVariantId,
  });

  return {
    ...args.run,
    variants,
    updatedAt: args.now,
    status,
    ...(status === "failed"
      ? {
          error:
            args.run.error || "No compare candidates completed successfully.",
        }
      : status === "cancelled"
        ? { error: args.run.error || "All compare candidates were cancelled." }
        : {}),
  };
}

export function finishCompareRunsForTask(args: {
  runsById: Record<string, CompareRun | undefined>;
  taskId: string;
  outcome?: CompareTurnOutcome["status"];
  /** @deprecated Use outcome. */
  failed?: boolean;
  error?: string;
  now: string;
}) {
  let changed = false;
  const runsById = Object.fromEntries(
    Object.entries(args.runsById).map(([compareRunId, compareRun]) => {
      if (!compareRun) {
        return [compareRunId, compareRun] as const;
      }
      const nextRun = finishCompareVariantForTask({
        run: compareRun,
        taskId: args.taskId,
        outcome: args.outcome,
        failed: args.failed,
        error: args.error,
        now: args.now,
      });
      changed ||= nextRun !== compareRun;
      return [compareRunId, nextRun] as const;
    }),
  );
  return changed ? runsById : args.runsById;
}
