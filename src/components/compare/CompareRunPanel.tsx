import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  GitBranch,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  SplitSquareHorizontal,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildSourceControlSummary } from "@/components/layout/editor-panel.utils";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  toast,
} from "@/components/ui";
import {
  getProviderLabel,
  toHumanModelName,
} from "@/lib/providers/model-catalog";
import {
  DEFAULT_COMPARE_REVIEW_CRITERIA,
  type CompareRunVariant,
} from "@/lib/compare-runs";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app.store";
import {
  launchReadyCompareJudges,
  retryCompareJudge,
  type CompareJudgeStoreAccess,
} from "@/store/compare-run-judge";
import type { SourceControlStatusItem } from "@/lib/source-control-status";

interface VariantSourceControlState {
  status: "idle" | "loading" | "ready" | "error";
  branch?: string;
  items: SourceControlStatusItem[];
  error?: string;
}

const EMPTY_STATUS_ITEMS: SourceControlStatusItem[] = [];
const COMPARE_JUDGE_STORE_ACCESS = {
  getState: () => useAppStore.getState(),
  updateRuns: (updater) =>
    useAppStore.setState((state) => ({
      compareRunsById: updater(state.compareRunsById),
    })),
} satisfies CompareJudgeStoreAccess;

function getVariantStatusLabel(status: CompareRunVariant["status"]) {
  switch (status) {
    case "creating":
      return "Creating";
    case "running":
      return "Running";
    case "completed":
      return "Ready";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "kept":
      return "Kept";
    case "discarded":
      return "Discarded";
    case "pending":
    default:
      return "Pending";
  }
}

function getVariantStatusClassName(status: CompareRunVariant["status"]) {
  if (status === "failed") {
    return "border-destructive/40 bg-destructive/10 text-destructive";
  }
  if (status === "cancelled") {
    return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
  if (status === "kept") {
    return "border-success/40 bg-success/10 text-success";
  }
  if (status === "completed") {
    return "border-primary/35 bg-primary/8 text-primary";
  }
  if (status === "discarded") {
    return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
  if (status === "running" || status === "creating") {
    return "border-warning/40 bg-warning/10 text-warning";
  }
  return "border-border/70 bg-muted text-muted-foreground";
}

function VariantStatusIcon(props: { status: CompareRunVariant["status"] }) {
  if (props.status === "failed" || props.status === "cancelled") {
    return <XCircle className="size-3.5" />;
  }
  if (props.status === "kept" || props.status === "completed") {
    return <CheckCircle2 className="size-3.5" />;
  }
  if (props.status === "running" || props.status === "creating") {
    return <LoaderCircle className="size-3.5 animate-spin" />;
  }
  return <GitBranch className="size-3.5" />;
}

function formatVariantTitle(variant: CompareRunVariant, index: number) {
  return variant.label?.trim() || `Variant ${index + 1}`;
}

function truncatePath(path: string) {
  return path.length > 72 ? `...${path.slice(-69)}` : path;
}

function formatRunStatus(status: string) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export interface CompareRunPanelProps {
  /**
   * Explicit compare run to render. When provided (pane host usage) the
   * panel is scoped to that run instead of following the active surface.
   */
  compareRunId?: string;
}

export function CompareRunPanel(props: CompareRunPanelProps) {
  const activeCompareRunId = useAppStore(
    (state) =>
      props.compareRunId ??
      (state.activeSurface.kind === "compare-run"
        ? state.activeSurface.compareRunId
        : state.activeCompareRunId),
  );
  const compareRun = useAppStore((state) =>
    activeCompareRunId
      ? (state.compareRunsById[activeCompareRunId] ?? null)
      : null,
  );
  const openCompareVariant = useAppStore((state) => state.openCompareVariant);
  const keepCompareVariant = useAppStore((state) => state.keepCompareVariant);
  const cancelCompareRun = useAppStore((state) => state.cancelCompareRun);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [statusByVariantId, setStatusByVariantId] = useState<
    Record<string, VariantSourceControlState | undefined>
  >({});
  const [keepTarget, setKeepTarget] = useState<CompareRunVariant | null>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const variants = compareRun?.variants ?? [];
  const completedVariantCount = variants.filter(
    (variant) => variant.status === "completed",
  ).length;
  const judge = compareRun?.judge;
  const judgment = judge?.judgment;
  const judgeProvenance = judgment?.provenance;
  const displayedJudgeProvider =
    judgeProvenance?.judgeProvider ?? judge?.provider;
  const displayedJudgeModel = judgeProvenance?.judgeModel ?? judge?.model;
  const recommendedVariantId = judgment?.recommendedVariantId;
  const recommendedVariantIndex = variants.findIndex(
    (variant) => variant.id === recommendedVariantId,
  );
  const recommendedVariant =
    recommendedVariantIndex >= 0 ? variants[recommendedVariantIndex] : null;
  const recommendedTitle = recommendedVariant
    ? formatVariantTitle(recommendedVariant, recommendedVariantIndex)
    : null;
  const recommendedScore = judgment?.candidateScores.find(
    (candidate) => candidate.variantId === recommendedVariantId,
  )?.score;
  const comparePhase = compareRun?.keptVariantId
    ? 5
    : compareRun?.status === "failed" || compareRun?.status === "cancelled"
      ? 2
      : variants.some(
            (variant) =>
              variant.status === "pending" ||
              variant.status === "creating" ||
              variant.status === "running",
          )
        ? 2
        : judge?.status === "pending" || judge?.status === "running"
          ? 3
          : 4;
  const terminalNotice =
    compareRun?.status === "failed"
      ? {
          title: "Comparison failed",
          description:
            compareRun.error ||
            "No candidate completed successfully. Inspect each candidate for details, then discard their workspaces when finished.",
          destructive: true,
        }
      : compareRun?.status === "cancelled"
        ? {
            title: "Candidates discarded",
            description:
              "The comparison ended and its candidate workspaces were closed.",
            destructive: false,
          }
        : null;
  const configuredReviewCriteria = compareRun?.reviewCriteria;
  const reviewCriteria =
    configuredReviewCriteria && configuredReviewCriteria.length > 0
      ? configuredReviewCriteria
      : [...DEFAULT_COMPARE_REVIEW_CRITERIA];
  const seedPreview = useMemo(() => {
    const seedPrompt = compareRun?.seedPrompt.trim() ?? "";
    return seedPrompt.length > 180
      ? `${seedPrompt.slice(0, 177).trimEnd()}...`
      : seedPrompt;
  }, [compareRun?.seedPrompt]);

  useEffect(() => {
    if (compareRun?.judge?.status !== "pending") {
      return;
    }
    void launchReadyCompareJudges(COMPARE_JUDGE_STORE_ACCESS);
  }, [compareRun]);

  useEffect(() => {
    if (!compareRun) {
      setStatusByVariantId({});
      return;
    }

    let cancelled = false;
    setStatusByVariantId((current) => {
      const next = { ...current };
      for (const variant of compareRun.variants) {
        if (!variant.workspacePath || variant.status === "discarded") {
          continue;
        }
        next[variant.id] = {
          status: "loading",
          items: next[variant.id]?.items ?? EMPTY_STATUS_ITEMS,
          branch: next[variant.id]?.branch,
        };
      }
      return next;
    });

    void Promise.all(
      compareRun.variants.map(async (variant) => {
        if (!variant.workspacePath || variant.status === "discarded") {
          return;
        }
        const getStatus = window.api?.sourceControl?.getStatus;
        if (!getStatus) {
          if (!cancelled) {
            setStatusByVariantId((current) => ({
              ...current,
              [variant.id]: {
                status: "error",
                items: EMPTY_STATUS_ITEMS,
                error: "Source control bridge is unavailable.",
              },
            }));
          }
          return;
        }
        try {
          const result = await getStatus({ cwd: variant.workspacePath });
          if (cancelled) {
            return;
          }
          setStatusByVariantId((current) => ({
            ...current,
            [variant.id]: result.ok
              ? {
                  status: "ready",
                  branch: result.branch,
                  items: result.items,
                }
              : {
                  status: "error",
                  items: EMPTY_STATUS_ITEMS,
                  error: result.stderr || "Unable to read source status.",
                },
          }));
        } catch (error) {
          if (cancelled) {
            return;
          }
          setStatusByVariantId((current) => ({
            ...current,
            [variant.id]: {
              status: "error",
              items: EMPTY_STATUS_ITEMS,
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to read source status.",
            },
          }));
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [compareRun, refreshNonce]);

  if (!compareRun) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <Empty className="border-none bg-transparent p-0">
          <EmptyHeader className="gap-3">
            <EmptyMedia
              variant="icon"
              className="size-14 rounded-2xl bg-primary/10 text-primary [&_svg:not([class*='size-'])]:size-7"
            >
              <SplitSquareHorizontal className="size-7" strokeWidth={1.6} />
            </EmptyMedia>
            <div className="flex flex-col gap-1">
              <EmptyTitle className="text-xl font-semibold">
                No compare run selected
              </EmptyTitle>
              <EmptyDescription className="max-w-md text-sm">
                Write a prompt in the composer, then choose Compare beside the
                send controls. Choose each candidate model and an independent
                judge before starting.
              </EmptyDescription>
            </div>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  async function confirmKeepVariant() {
    if (!compareRun || !keepTarget) {
      return;
    }
    setPendingAction(`keep:${keepTarget.id}`);
    try {
      const result = await keepCompareVariant({
        compareRunId: compareRun.id,
        variantId: keepTarget.id,
      });
      if (!result.ok) {
        toast.error("Unable to keep compare variant", {
          description: result.message,
        });
      } else {
        toast.success("Compare variant kept");
      }
      setKeepTarget(null);
    } finally {
      setPendingAction(null);
    }
  }

  async function confirmCancelRun() {
    if (!compareRun) {
      return;
    }
    setPendingAction(`cancel:${compareRun.id}`);
    try {
      const result = await cancelCompareRun({ compareRunId: compareRun.id });
      if (!result.ok) {
        toast.error("Unable to discard compare candidates", {
          description: result.message,
        });
      } else {
        toast.success("Compare candidates discarded");
      }
      setCancelConfirmOpen(false);
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRetryJudge() {
    if (!compareRun) {
      return;
    }
    setPendingAction(`judge:${compareRun.id}`);
    try {
      await retryCompareJudge({
        compareRunId: compareRun.id,
        access: COMPARE_JUDGE_STORE_ACCESS,
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <ConfirmDialog
        open={Boolean(keepTarget)}
        title="Keep this candidate?"
        description="The selected candidate workspace will stay open. Stave will discard the other candidate workspaces; this does not merge code."
        confirmLabel="Keep candidate"
        cancelLabel="Cancel"
        loading={pendingAction?.startsWith("keep:")}
        onCancel={() => setKeepTarget(null)}
        onConfirm={() => void confirmKeepVariant()}
      />
      <ConfirmDialog
        open={cancelConfirmOpen}
        title="Discard all candidates?"
        description="Every candidate workspace in this comparison will be closed and cleaned up, including completed candidates."
        confirmLabel="Discard all"
        cancelLabel="Go back"
        loading={pendingAction?.startsWith("cancel:")}
        onCancel={() => setCancelConfirmOpen(false)}
        onConfirm={() => void confirmCancelRun()}
      />

      <div className="shrink-0 border-b border-border/65 bg-surface px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <SplitSquareHorizontal className="size-4 text-primary" />
              <h2 className="font-heading truncate text-base font-semibold tracking-[-0.01em] text-foreground">
                Compare candidates
              </h2>
              <Badge variant="outline">
                {judge?.status === "running"
                  ? "Judging"
                  : formatRunStatus(compareRun.status)}
              </Badge>
            </div>
            <div className="mt-2 flex max-w-3xl items-start gap-2 text-xs">
              <span className="shrink-0 font-semibold tracking-[0.1em] text-muted-foreground uppercase">
                Prompt
              </span>
              <p className="line-clamp-2 text-foreground/85">{seedPreview}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCw className="size-3.5" />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8"
              disabled={
                Boolean(compareRun.keptVariantId) ||
                compareRun.status === "cancelled" ||
                Boolean(pendingAction)
              }
              onClick={() => setCancelConfirmOpen(true)}
            >
              Discard all
            </Button>
          </div>
        </div>
      </div>

      <ol
        aria-label="Compare workflow"
        className="grid shrink-0 grid-cols-5 border-b border-border/60 bg-background"
      >
        {[
          ["1", "Prepare", "Shared brief and review contract."],
          ["2", "Run", "Candidates work in isolation."],
          ["3", "Judge", "Fresh-context scoring and recommendation."],
          ["4", "Review", "Inspect evidence against one rubric."],
          ["5", "Keep", "Preserve one workspace; discard the rest."],
        ].map(([number, label, description], index) => {
          const step = index + 1;
          const active = comparePhase === step;
          const complete = comparePhase > step;
          return (
            <li
              key={number}
              className={cn(
                "relative min-w-0 px-4 py-3",
                index < 4 && "border-r border-border/55",
                active && "bg-primary/6",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "inline-flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
                    active &&
                      "border-primary bg-primary text-primary-foreground",
                    complete && "border-success/40 bg-success/12 text-success",
                    !active &&
                      !complete &&
                      "border-border/80 text-muted-foreground",
                  )}
                >
                  {complete ? "✓" : number}
                </span>
                <span
                  className={cn(
                    "text-xs font-semibold",
                    active || complete
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </div>
              <p className="mt-1 truncate pl-7 text-[11px] text-muted-foreground">
                {description}
              </p>
              {active ? (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              ) : null}
            </li>
          );
        })}
      </ol>

      {terminalNotice ? (
        <section
          role="status"
          aria-label="Compare terminal status"
          className={cn(
            "flex shrink-0 items-start gap-3 border-b px-5 py-3",
            terminalNotice.destructive
              ? "border-destructive/25 bg-destructive/8"
              : "border-border/60 bg-surface",
          )}
        >
          <XCircle
            className={cn(
              "mt-0.5 size-4 shrink-0",
              terminalNotice.destructive
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {terminalNotice.title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
              {terminalNotice.description}
            </p>
          </div>
        </section>
      ) : null}

      {!terminalNotice && judge && comparePhase >= 3 ? (
        <section
          aria-label="Fresh-context judge"
          aria-live="polite"
          className={cn(
            "flex shrink-0 items-start gap-3 border-b px-5 py-3.5",
            judge.status === "failed"
              ? "border-warning/25 bg-warning/6"
              : judge.status === "completed"
                ? "border-primary/20 bg-primary/5"
                : "border-border/60 bg-surface",
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
              judge.status === "failed"
                ? "bg-warning/12 text-warning"
                : "bg-primary/10 text-primary",
            )}
          >
            {judge.status === "running" || judge.status === "pending" ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : judge.status === "failed" ? (
              <XCircle className="size-4" />
            ) : (
              <BrainCircuit className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-foreground">
                {judge.status === "completed" && recommendedTitle
                  ? `Recommended: ${recommendedTitle}`
                  : judge.status === "failed"
                    ? "Independent judge unavailable"
                    : "Independent judge reviewing candidates"}
              </p>
              {judge.status === "completed" &&
              typeof recommendedScore === "number" ? (
                <span className="font-mono text-xs font-semibold text-primary">
                  {recommendedScore.toFixed(1)} / 10
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {getProviderLabel({
                  providerId: displayedJudgeProvider ?? judge.provider,
                })}
                {displayedJudgeModel
                  ? ` · ${toHumanModelName({ model: displayedJudgeModel })}`
                  : ""}
                {" · Fresh context · Read only"}
                {judge.status === "completed" && judgeProvenance
                  ? ` · Rubric v${judgeProvenance.rubricVersion} · Attempt ${judgeProvenance.attempt}`
                  : ""}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {judge.status === "completed"
                ? judgment?.rationale
                : judge.status === "failed"
                  ? judge.error
                  : "Inspecting actual worktree changes against the shared review contract. No candidate context is reused."}
            </p>
          </div>
          {judge.status === "failed" && completedVariantCount >= 2 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              disabled={pendingAction === `judge:${compareRun.id}`}
              onClick={() => void handleRetryJudge()}
            >
              <RotateCcw className="size-3.5" />
              Retry
            </Button>
          ) : null}
        </section>
      ) : null}

      {!terminalNotice && comparePhase >= 4 ? (
        <section
          aria-label="Compare review contract"
          className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 border-b border-border/60 bg-surface px-5 py-3"
        >
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {comparePhase === 5 ? "Candidate kept" : "Ready for review"}
            </span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            {reviewCriteria.map((criterion) => (
              <span
                key={criterion}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="size-1 rounded-full bg-primary" aria-hidden />
                {criterion}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div
          className="grid min-w-[760px] overflow-hidden rounded-lg border border-border/70 bg-surface shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_5%,transparent)]"
          style={{
            gridTemplateColumns: `repeat(${Math.max(variants.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {variants.map((variant, index) => {
            const sourceState = statusByVariantId[variant.id];
            const items = sourceState?.items ?? EMPTY_STATUS_ITEMS;
            const summary = buildSourceControlSummary({ items });
            const pending = pendingAction === `keep:${variant.id}`;
            const title = formatVariantTitle(variant, index);
            const candidateScore = judgment?.candidateScores.find(
              (candidate) => candidate.variantId === variant.id,
            );
            const recommended = recommendedVariantId === variant.id;

            return (
              <section
                key={variant.id}
                className={cn(
                  "flex min-h-[23rem] min-w-0 flex-col",
                  index > 0 && "border-l border-border/65",
                  recommended && "bg-primary/[0.025]",
                )}
              >
                <div className="border-b border-border/60 bg-surface px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h3 className="truncate text-sm font-semibold text-foreground">
                          {title}
                        </h3>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 rounded-[0.3rem] border px-1.5 py-0.5 text-[10px] font-medium",
                            getVariantStatusClassName(variant.status),
                          )}
                        >
                          <VariantStatusIcon status={variant.status} />
                          {getVariantStatusLabel(variant.status)}
                        </span>
                        {recommended ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold text-primary">
                            <Trophy className="size-3" />
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2">
                        <p className="truncate text-xs text-muted-foreground">
                          {getProviderLabel({ providerId: variant.provider })}
                          {variant.model
                            ? ` / ${toHumanModelName({ model: variant.model })}`
                            : ""}
                        </p>
                        {candidateScore ? (
                          <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                            {candidateScore.score.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {variant.branchName || sourceState?.branch ? (
                      <span className="inline-flex items-center gap-1">
                        <GitBranch className="size-3" aria-hidden="true" />
                        {sourceState?.branch ?? variant.branchName}
                      </span>
                    ) : null}
                    <span>
                      {summary.workingTreeCount + summary.stagedCount} changed
                    </span>
                    {summary.conflictCount > 0 ? (
                      <span className="font-medium text-destructive">
                        {summary.conflictCount} conflicts
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto px-4 py-3">
                  {variant.error ? (
                    <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-2 text-xs text-destructive">
                      {variant.error}
                    </p>
                  ) : sourceState?.status === "loading" ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
                      <LoaderCircle className="size-3.5 animate-spin" />
                      Loading changes
                    </div>
                  ) : sourceState?.status === "error" ? (
                    <p className="rounded-md border border-warning/30 bg-warning/10 px-2 py-2 text-xs text-warning">
                      {sourceState.error}
                    </p>
                  ) : items.length === 0 ? (
                    <p className="py-6 text-xs text-muted-foreground">
                      No changed files yet.
                    </p>
                  ) : (
                    <div className="flex flex-col">
                      {items.map((item) => (
                        <div
                          key={`${item.code}:${item.path}`}
                          className="flex min-w-0 items-center gap-2 border-b border-border/45 px-1 py-2 last:border-b-0"
                        >
                          <span className="w-8 shrink-0 font-mono text-[10px] font-medium text-muted-foreground">
                            {item.code.trim() || "??"}
                          </span>
                          <span className="min-w-0 truncate text-xs text-foreground">
                            {truncatePath(item.path)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {candidateScore ? (
                    <div className="mt-4 border-t border-border/55 pt-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                          Judge assessment
                        </span>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {candidateScore.score.toFixed(1)} / 10
                        </span>
                      </div>
                      <p className="text-xs leading-5 text-foreground/85">
                        {candidateScore.summary}
                      </p>
                      <dl className="mt-3 divide-y divide-border/45 border-y border-border/50">
                        {candidateScore.criteria.map((criterion) => (
                          <div
                            key={criterion.criterion}
                            className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2"
                          >
                            <div className="min-w-0">
                              <dt className="text-xs font-medium text-foreground">
                                {criterion.criterion}
                              </dt>
                              <dd className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                                {criterion.rationale}
                              </dd>
                            </div>
                            <dd className="font-mono text-xs font-semibold text-foreground">
                              {criterion.score.toFixed(1)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {candidateScore.risks[0] ? (
                        <p className="mt-2 text-[11px] leading-4 text-warning">
                          Risk · {candidateScore.risks[0]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-background px-4 py-2.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    disabled={!variant.workspaceId || !variant.taskId}
                    onClick={() =>
                      void openCompareVariant({
                        compareRunId: compareRun.id,
                        variantId: variant.id,
                      })
                    }
                  >
                    <Eye className="size-3.5" />
                    Open candidate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8"
                    disabled={
                      !variant.workspaceId ||
                      !variant.taskId ||
                      variant.status !== "completed" ||
                      judge?.status === "pending" ||
                      judge?.status === "running" ||
                      pending
                    }
                    onClick={() => setKeepTarget(variant)}
                  >
                    <Trophy className="size-3.5" />
                    Keep
                    <ArrowRight className="size-3.5" />
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
