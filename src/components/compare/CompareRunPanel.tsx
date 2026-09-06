import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  GitBranch,
  ListChecks,
  RefreshCw,
  RotateCcw,
  SplitSquareHorizontal,
  Trophy,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
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
  Loader,
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
import { useAppStore } from "@/store/app.store";
import {
  launchReadyCompareJudges,
  retryCompareJudge,
  type CompareJudgeStoreAccess,
} from "@/store/compare-run-judge";
import type { SourceControlStatusItem } from "@/lib/source-control-status";
import { compareRunPanelStyles as styles } from "./compare-run-panel.styles";

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

function getVariantStatusStyle(status: CompareRunVariant["status"]) {
  if (status === "failed") {
    return styles.statusFailed;
  }
  if (status === "cancelled") {
    return styles.statusMuted;
  }
  if (status === "kept") {
    return styles.statusKept;
  }
  if (status === "completed") {
    return styles.statusCompleted;
  }
  if (status === "discarded") {
    return styles.statusMuted;
  }
  if (status === "running" || status === "creating") {
    return styles.statusRunning;
  }
  return styles.statusPending;
}

function VariantStatusIcon(props: { status: CompareRunVariant["status"] }) {
  if (props.status === "failed" || props.status === "cancelled") {
    return <XCircle className={sx(styles.icon14)} />;
  }
  if (props.status === "kept" || props.status === "completed") {
    return <CheckCircle2 className={sx(styles.icon14)} />;
  }
  if (props.status === "running" || props.status === "creating") {
    return <Loader aria-hidden size="xs" variant="parallel" />;
  }
  return <GitBranch className={sx(styles.icon14)} />;
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
      <div className={sx(styles.emptyViewport)}>
        <Empty xstyle={styles.emptyRoot}>
          <EmptyHeader className={sx(styles.emptyHeader)}>
            <EmptyMedia variant="icon" xstyle={styles.emptyMedia}>
              <SplitSquareHorizontal className={sx(styles.icon28)} strokeWidth={1.6} />
            </EmptyMedia>
            <div className={sx(styles.emptyTextGroup)}>
              <EmptyTitle xstyle={styles.emptyTitle}>
                No compare run selected
              </EmptyTitle>
              <EmptyDescription xstyle={styles.emptyDescription}>
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
    <div className={sx(styles.root)}>
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

      <div className={sx(styles.header)}>
        <div className={sx(styles.headerRow)}>
          <div className={sx(styles.headerMain)}>
            <div className={sx(styles.headerTitleRow)}>
              <SplitSquareHorizontal className={sx(styles.headerIcon)} />
              <h2 className={sx(styles.headerTitle)}>Compare candidates</h2>
              <Badge variant="outline">
                {judge?.status === "running"
                  ? "Judging"
                  : formatRunStatus(compareRun.status)}
              </Badge>
            </div>
            <div className={sx(styles.promptRow)}>
              <span className={sx(styles.promptLabel)}>Prompt</span>
              <p className={sx(styles.promptText)}>{seedPreview}</p>
            </div>
          </div>
          <div className={sx(styles.headerActions)}>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={sx(styles.actionButton)}
              onClick={() => setRefreshNonce((value) => value + 1)}
            >
              <RefreshCw className={sx(styles.icon14)} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={sx(styles.actionButton)}
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

      <ol aria-label="Compare workflow" className={sx(styles.stepper)}>
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
              className={sx(
                styles.step,
                index < 4 && styles.stepDivider,
                active && styles.stepActive,
              )}
            >
              <div className={sx(styles.stepHeadRow)}>
                <span
                  className={sx(
                    styles.stepBadge,
                    active && styles.stepBadgeActive,
                    complete && styles.stepBadgeComplete,
                  )}
                >
                  {complete ? "✓" : number}
                </span>
                <span
                  className={sx(
                    styles.stepLabel,
                    (active || complete) && styles.stepLabelActive,
                  )}
                >
                  {label}
                </span>
              </div>
              <p className={sx(styles.stepDescription)}>{description}</p>
              {active ? <span className={sx(styles.stepUnderline)} /> : null}
            </li>
          );
        })}
      </ol>

      {terminalNotice ? (
        <section
          role="status"
          aria-label="Compare terminal status"
          className={sx(
            styles.notice,
            terminalNotice.destructive
              ? styles.noticeDestructive
              : styles.noticeNeutral,
          )}
        >
          <XCircle
            className={sx(
              styles.noticeIcon,
              terminalNotice.destructive
                ? styles.noticeIconDestructive
                : styles.noticeIconNeutral,
            )}
          />
          <div className={sx(styles.noticeBody)}>
            <p className={sx(styles.noticeTitle)}>{terminalNotice.title}</p>
            <p className={sx(styles.noticeDescription)}>
              {terminalNotice.description}
            </p>
          </div>
        </section>
      ) : null}

      {!terminalNotice && judge && comparePhase >= 3 ? (
        <section
          aria-label="Fresh-context judge"
          aria-live="polite"
          className={sx(
            styles.judge,
            judge.status === "failed"
              ? styles.judgeFailed
              : judge.status === "completed"
                ? styles.judgeCompleted
                : styles.judgeNeutral,
          )}
        >
          <span
            className={sx(
              styles.judgeMark,
              judge.status === "failed"
                ? styles.judgeMarkFailed
                : styles.judgeMarkNeutral,
            )}
          >
            {judge.status === "running" || judge.status === "pending" ? (
              <Loader aria-hidden size="xs" variant="parallel" />
            ) : judge.status === "failed" ? (
              <XCircle className={sx(styles.icon16)} />
            ) : (
              <BrainCircuit className={sx(styles.icon16)} />
            )}
          </span>
          <div className={sx(styles.judgeBody)}>
            <div className={sx(styles.judgeHeadRow)}>
              <p className={sx(styles.judgeTitle)}>
                {judge.status === "completed" && recommendedTitle
                  ? `Recommended: ${recommendedTitle}`
                  : judge.status === "failed"
                    ? "Independent judge unavailable"
                    : "Independent judge reviewing candidates"}
              </p>
              {judge.status === "completed" &&
              typeof recommendedScore === "number" ? (
                <span className={sx(styles.judgeScore)}>
                  {recommendedScore.toFixed(1)} / 10
                </span>
              ) : null}
              <span className={sx(styles.judgeMeta)}>
                {getProviderLabel({
                  providerId: displayedJudgeProvider ?? judge.provider,
                })}
                {displayedJudgeModel
                  ? ` · ${toHumanModelName({ model: displayedJudgeModel })}`
                  : ""}
                {judge.effort ? ` · ${judge.effort}` : ""}
                {" · Fresh context · Read only"}
                {judge.status === "completed" && judgeProvenance
                  ? ` · Rubric v${judgeProvenance.rubricVersion} · Attempt ${judgeProvenance.attempt}`
                  : ""}
              </span>
            </div>
            <p className={sx(styles.judgeRationale)}>
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
              className={sx(styles.actionButtonShrink)}
              disabled={pendingAction === `judge:${compareRun.id}`}
              onClick={() => void handleRetryJudge()}
            >
              <RotateCcw className={sx(styles.icon14)} />
              Retry
            </Button>
          ) : null}
        </section>
      ) : null}

      {!terminalNotice && comparePhase >= 4 ? (
        <section
          aria-label="Compare review contract"
          className={sx(styles.review)}
        >
          <div className={sx(styles.reviewHead)}>
            <ListChecks className={sx(styles.reviewIcon)} />
            <span className={sx(styles.reviewHeadLabel)}>
              {comparePhase === 5 ? "Candidate kept" : "Ready for review"}
            </span>
          </div>
          <div className={sx(styles.reviewCriteria)}>
            {reviewCriteria.map((criterion) => (
              <span key={criterion} className={sx(styles.reviewCriterion)}>
                <span className={sx(styles.reviewDot)} aria-hidden />
                {criterion}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <div className={sx(styles.scroller)}>
        <div
          className={sx(styles.grid)}
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
                className={sx(
                  styles.variant,
                  index > 0 && styles.variantDivider,
                  recommended && styles.variantRecommended,
                )}
              >
                <div className={sx(styles.variantHeader)}>
                  <div className={sx(styles.variantHeaderRow)}>
                    <div className={sx(styles.headerMain)}>
                      <div className={sx(styles.variantTitleRow)}>
                        <span className={sx(styles.variantIndex)}>
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <h3 className={sx(styles.variantTitle)}>{title}</h3>
                        <span
                          className={sx(
                            styles.statusChip,
                            getVariantStatusStyle(variant.status),
                          )}
                        >
                          <VariantStatusIcon status={variant.status} />
                          {getVariantStatusLabel(variant.status)}
                        </span>
                        {recommended ? (
                          <span className={sx(styles.recommendedTag)}>
                            <Trophy className={sx(styles.icon12)} />
                            Recommended
                          </span>
                        ) : null}
                      </div>
                      <div className={sx(styles.variantModelRow)}>
                        <p className={sx(styles.variantModelText)}>
                          {getProviderLabel({ providerId: variant.provider })}
                          {variant.model
                            ? ` / ${toHumanModelName({ model: variant.model })}`
                            : ""}
                          {variant.effort ? ` · ${variant.effort}` : ""}
                        </p>
                        {candidateScore ? (
                          <span className={sx(styles.variantScoreInline)}>
                            {candidateScore.score.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className={sx(styles.variantMetaRow)}>
                    {variant.branchName || sourceState?.branch ? (
                      <span className={sx(styles.variantMetaItem)}>
                        <GitBranch className={sx(styles.icon12)} aria-hidden="true" />
                        {sourceState?.branch ?? variant.branchName}
                      </span>
                    ) : null}
                    <span>
                      {summary.workingTreeCount + summary.stagedCount} changed
                    </span>
                    {summary.conflictCount > 0 ? (
                      <span className={sx(styles.variantConflicts)}>
                        {summary.conflictCount} conflicts
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={sx(styles.variantBody)}>
                  {variant.error ? (
                    <p className={sx(styles.variantError)}>{variant.error}</p>
                  ) : sourceState?.status === "loading" ? (
                    <div className={sx(styles.variantLoading)}>
                      <Loader aria-hidden size="xs" variant="parallel" />
                      Loading changes
                    </div>
                  ) : sourceState?.status === "error" ? (
                    <p className={sx(styles.variantWarning)}>
                      {sourceState.error}
                    </p>
                  ) : items.length === 0 ? (
                    <p className={sx(styles.variantEmptyFiles)}>
                      No changed files yet.
                    </p>
                  ) : (
                    <div className={sx(styles.fileList)}>
                      {items.map((item, itemIndex) => (
                        <div
                          key={`${item.code}:${item.path}`}
                          className={sx(
                            styles.fileRow,
                            itemIndex === items.length - 1 &&
                              styles.fileRowLast,
                          )}
                        >
                          <span className={sx(styles.fileCode)}>
                            {item.code.trim() || "??"}
                          </span>
                          <span className={sx(styles.filePath)}>
                            {truncatePath(item.path)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {candidateScore ? (
                    <div className={sx(styles.assessment)}>
                      <div className={sx(styles.assessmentHead)}>
                        <span className={sx(styles.assessmentHeadLabel)}>
                          Judge assessment
                        </span>
                        <span className={sx(styles.assessmentScore)}>
                          {candidateScore.score.toFixed(1)} / 10
                        </span>
                      </div>
                      <p className={sx(styles.assessmentSummary)}>
                        {candidateScore.summary}
                      </p>
                      <dl className={sx(styles.criteriaList)}>
                        {candidateScore.criteria.map((criterion, criterionIndex) => (
                          <div
                            key={criterion.criterion}
                            className={sx(
                              styles.criteriaRow,
                              criterionIndex === 0 && styles.criteriaRowFirst,
                            )}
                          >
                            <div className={sx(styles.criteriaMain)}>
                              <dt className={sx(styles.criteriaTerm)}>
                                {criterion.criterion}
                              </dt>
                              <dd className={sx(styles.criteriaRationale)}>
                                {criterion.rationale}
                              </dd>
                            </div>
                            <dd className={sx(styles.criteriaScore)}>
                              {criterion.score.toFixed(1)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      {candidateScore.risks[0] ? (
                        <p className={sx(styles.risk)}>
                          Risk · {candidateScore.risks[0]}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className={sx(styles.variantFooter)}>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={sx(styles.actionButton)}
                    disabled={!variant.workspaceId || !variant.taskId}
                    onClick={() =>
                      void openCompareVariant({
                        compareRunId: compareRun.id,
                        variantId: variant.id,
                      })
                    }
                  >
                    <Eye className={sx(styles.icon14)} />
                    Open candidate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className={sx(styles.actionButton)}
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
                    <Trophy className={sx(styles.icon14)} />
                    Keep
                    <ArrowRight className={sx(styles.icon14)} />
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
