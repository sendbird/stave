import { i18n } from "@/i18n/runtime";
import {
  deriveCompareSeedTitle,
  type CompareRun,
  type CompareRunStatus,
} from "@/lib/compare-runs";

export type CompareRunHistoryStatusFilter = "all" | CompareRunStatus;

export const COMPARE_RUN_HISTORY_STATUS_FILTERS = [
  { value: "all", get label() { return i18n.t("common:labels.all"); } },
  { value: "starting", get label() { return i18n.t("compare:compareRunHistory.preparing"); } },
  { value: "running", get label() { return i18n.t("common:status.running"); } },
  { value: "completed", get label() { return i18n.t("common:status.completed"); } },
  { value: "failed", get label() { return i18n.t("common:status.failed"); } },
  { value: "cancelled", get label() { return i18n.t("common:status.cancelled"); } },
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
  return run.variants[index]?.label?.trim() || i18n.t("compare:compareRunHistory.candidate", { value1: index + 1 });
}

export function getCompareRunStateLabel(run: CompareRun) {
  if (run.keptVariantId) {
    return i18n.t("compare:compareRunHistory.resultKept");
  }
  if (run.judge?.status === "running") {
    return i18n.t("compare:compareRunHistory.judgeScoring");
  }
  if (run.judge?.status === "failed" && run.status === "completed") {
    return i18n.t("compare:compareRunHistory.judgeNeedsRetry");
  }
  if (run.judge?.status === "completed" && run.status === "completed") {
    return i18n.t("compare:compareRunHistory.readyToReview");
  }
  switch (run.status) {
    case "starting":
      return i18n.t("compare:compareRunHistory.preparingCandidates");
    case "running":
      return i18n.t("compare:compareRunHistory.candidatesRunning");
    case "completed":
      return i18n.t("common:status.completed");
    case "failed":
      return i18n.t("compare:compareRunHistory.runFailed");
    case "cancelled":
      return i18n.t("common:status.cancelled");
  }
}

function buildCompareRunHistoryEntry(run: CompareRun): CompareRunHistoryEntry {
  const completedCount = run.variants.filter((variant) =>
    ["completed", "kept", "discarded"].includes(variant.status),
  ).length;
  const recommendedVariantLabel = getRecommendedVariantLabel(run);
  const judgeLabel = recommendedVariantLabel
    ? i18n.t("compare:compareRunHistory.judgeRecommends", { value1: recommendedVariantLabel })
    : run.judge?.status === "running"
      ? i18n.t("compare:compareRunHistory.freshContextJudgeIsScoring")
      : run.judge?.status === "pending"
        ? i18n.t("compare:compareRunHistory.judgeStartsAfterCandidatesFinish")
        : run.judge?.status === "failed"
          ? i18n.t("compare:compareRunHistory.freshContextJudgeNeedsRetry")
          : null;

  return {
    id: run.id,
    title: deriveCompareSeedTitle(run.seedPrompt) || i18n.t("compare:compareRunHistory.compareRun"),
    seedPrompt: run.seedPrompt,
    status: run.status,
    stateLabel: getCompareRunStateLabel(run),
    progressLabel: i18n.t("compare:compareRunHistory.candidatesCompleted", { value1: completedCount, value2: run.variants.length }),
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
