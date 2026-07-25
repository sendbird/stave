import {
  deriveCompareSeedTitle,
  type CompareRun,
  type CompareRunStatus,
} from "@/lib/compare-runs";

export type CompareRunHistoryStatusFilter = "all" | CompareRunStatus;

export const COMPARE_RUN_HISTORY_STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "starting", label: "Preparing" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
] as const satisfies readonly {
  value: CompareRunHistoryStatusFilter;
  label: string;
}[];

export interface CompareRunHistoryEntry {
  id: string;
  title: string;
  seedPrompt: string;
  status: CompareRunStatus;
  stateLabel: string;
  progressLabel: string;
  judgeLabel: string | null;
  createdAt: string;
  updatedAt: string;
}

function getRecommendedVariantLabel(run: CompareRun) {
  const recommendedVariantId = run.judge?.judgment?.recommendedVariantId;
  if (!recommendedVariantId) {
    return null;
  }
  const index = run.variants.findIndex(
    (variant) => variant.id === recommendedVariantId,
  );
  if (index < 0) {
    return null;
  }
  return run.variants[index]?.label?.trim() || `Candidate ${index + 1}`;
}

export function getCompareRunStateLabel(run: CompareRun) {
  if (run.keptVariantId) {
    return "Result kept";
  }
  if (run.judge?.status === "running") {
    return "Judge scoring";
  }
  if (run.judge?.status === "failed" && run.status === "completed") {
    return "Judge needs retry";
  }
  if (run.judge?.status === "completed" && run.status === "completed") {
    return "Ready to review";
  }
  switch (run.status) {
    case "starting":
      return "Preparing candidates";
    case "running":
      return "Candidates running";
    case "completed":
      return "Completed";
    case "failed":
      return "Run failed";
    case "cancelled":
      return "Cancelled";
  }
}

function buildCompareRunHistoryEntry(run: CompareRun): CompareRunHistoryEntry {
  const completedCount = run.variants.filter((variant) =>
    ["completed", "kept", "discarded"].includes(variant.status),
  ).length;
  const recommendedVariantLabel = getRecommendedVariantLabel(run);
  const judgeLabel = recommendedVariantLabel
    ? `Judge recommends ${recommendedVariantLabel}`
    : run.judge?.status === "running"
      ? "Fresh-context judge is scoring"
      : run.judge?.status === "pending"
        ? "Judge starts after candidates finish"
        : run.judge?.status === "failed"
          ? "Fresh-context judge needs retry"
          : null;

  return {
    id: run.id,
    title: deriveCompareSeedTitle(run.seedPrompt) || "Compare run",
    seedPrompt: run.seedPrompt,
    status: run.status,
    stateLabel: getCompareRunStateLabel(run),
    progressLabel: `${completedCount}/${run.variants.length} candidates completed`,
    judgeLabel,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

export function listCompareRunHistoryEntries(args: {
  runsById: Record<string, CompareRun | undefined>;
  query?: string;
  status?: CompareRunHistoryStatusFilter;
}) {
  const query = args.query?.trim().toLocaleLowerCase() ?? "";
  const status = args.status ?? "all";

  return Object.values(args.runsById)
    .filter((run): run is CompareRun => Boolean(run))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .map(buildCompareRunHistoryEntry)
    .filter((entry) => {
      if (status !== "all" && entry.status !== status) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        entry.title,
        entry.seedPrompt,
        entry.stateLabel,
        entry.progressLabel,
        entry.judgeLabel,
      ].some((value) => value?.toLocaleLowerCase().includes(query));
    });
}
