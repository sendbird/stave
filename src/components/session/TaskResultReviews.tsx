import { formatDateTime } from "@/i18n/format";
import { i18n, useTranslation } from "@/i18n";
import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import { focusRing } from "../ads/recipes/focus-ring";
import { useEffect, useState } from "react";
import { ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ActionButton } from "@/components/system/ActionButton";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { setResultReviewed } from "@/lib/reviews/result-review-client";
import type { ResultReview } from "@/lib/reviews/result-review";
import { useAppStore } from "@/store/app.store";
import { ResultFileSnapshots } from "./ResultFileSnapshots";
import { RunTurnDialog } from "./RunTurnDialog";
import { AgentRunReportView } from "@/components/agent-runs/AgentRunReportView";
import { useAgentRunReportActions } from "@/components/agent-runs/useAgentRunReportActions";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { hasAgentOrigin } from "@/lib/agent-runs/agent-run";
import {
  ModelResolutionSummary,
} from "./ModelResolutionSummary";
import { appendWorkflowDraft } from "@/lib/collaboration/workflows";
import { formatRelativeTime } from "@/components/layout/automation-center/automation-center.utils";

const PAGE_SIZE = 20;
type Filter = "all" | "pending";

/**
 * The saved answer, files and run details of one run. Mounted only while its
 * row is expanded, so a long history never holds every answer body in the
 * tree at once; the list itself is fetched without evidence. The answer
 * renders like the conversation and opens collapsed when long, so the row
 * needs no scroll box of its own; the whole run is one click away in
 * "View execution".
 */
function RunEvidence(props: { result: ResultReview; onShowTurn: () => void }) {
  useTranslation();
  const { result } = props;
  const { page, loading, error, refresh } = useResultReviews({
    workspaceId: result.workspaceId,
    taskId: result.taskId,
    turnId: result.turnId,
    includeEvidence: true,
    limit: 1,
  });
  const evidence = page.results[0]?.evidence;
  const showTurn = (
    <ActionButton
      size="xs"
      weight="quiet"
      xstyle={styles.answerAction}
      onClick={props.onShowTurn}
    >
      {i18n.t("session:taskResultReviews.showTurn")}</ActionButton>
  );
  if (loading && !evidence) {
    return (
      <p role="status" className={sx(styles.loading)}>
        {i18n.t("session:taskResultReviews.runEvidence")}</p>
    );
  }
  if (error) {
    return (
      <div className={sx(styles.evidence)}>
        <p role="alert" className={sx(styles.error)}>
          {error}
        </p>
        <div className={sx(styles.alertRow)}>
          <ActionButton size="xs" onClick={refresh}>
            {i18n.t("session:taskResultReviews.runEvidence2")}</ActionButton>
          {showTurn}
        </div>
      </div>
    );
  }
  if (!evidence) {
    return (
      <div className={sx(styles.evidence)}>
        <p className={sx(styles.caption)}>
          {i18n.t("session:taskResultReviews.runEvidence3")}</p>
        <div>{showTurn}</div>
      </div>
    );
  }
  return (
    <div className={sx(styles.evidence)}>
      <div className={sx(styles.answerSection)}>
        <div className={sx(styles.answerHeader)}>
          <div className={sx(styles.answerHeading)}>
            <h4 className={sx(styles.evidenceHeading)}>{i18n.t("session:taskResultReviews.runEvidence4")}</h4>
          </div>
          {showTurn}
        </div>
        {evidence.answer ? (
          <CollapsibleResponse text={evidence.answer} label={i18n.t("session:taskResultReviews.label")} />
        ) : (
          <p className={sx(styles.muted)}>{i18n.t("session:taskResultReviews.runEvidence6")}</p>
        )}
        {evidence.answerTruncated ? (
          <p className={sx(styles.muted)}>
            {i18n.t("session:taskResultReviews.runEvidence7")}</p>
        ) : null}
      </div>
      <ResultFileSnapshots evidence={evidence} taskId={result.taskId} />
      <details className={sx(styles.reference)}>
        <summary className={sx(styles.disclosure, focusRing.ring)}>
          {i18n.t("session:taskResultReviews.runEvidence8")}</summary>
        <div className={sx(styles.resolution)}>
          <ModelResolutionSummary
            actual={{
              providerId: evidence.providerId,
              model: evidence.model,
              modelInfo: evidence.modelInfo,
            }}
            resolution={evidence.modelResolution}
          />
        </div>
      </details>
    </div>
  );
}

export function RunHistoryRow(props: {
  result: ResultReview;
  expanded: boolean;
  busy: boolean;
  disabled: boolean;
  onReview: () => void;
  onFollowUp: () => void;
}) {
  useTranslation();
  const { result } = props;
  const [turnOpen, setTurnOpen] = useState(false);
  const failed = result.outcome === "failed";
  const summary =
    result.summary.trim() || i18n.t("session:taskResultReviews.summary");
  return (
    <AccordionItem
      value={result.id}
      className={sx(styles.row, props.expanded && styles.rowExpanded)}
    >
      <div className={sx(styles.rowMain)}>
        <AccordionTrigger className={sx(styles.rowToggle)}>
          <span className={sx(styles.rowInner)}>
            <span
              className={sx(
                styles.rowChevron,
                props.expanded && styles.rowChevronOpen,
              )}
              aria-hidden="true"
            >
              <ChevronRight size={14} />
            </span>
            <span className={sx(styles.rowText)}>
              <span
                className={sx(
                  styles.summary,
                  !props.expanded && styles.summaryClamped,
                )}
              >
                {summary}
              </span>
              <span className={sx(styles.rowMeta)}>
                <span
                  className={sx(
                    styles.outcomeIcon,
                    failed ? styles.outcomeFailed : styles.outcomeFinished,
                  )}
                  aria-hidden="true"
                >
                  {failed ? <CircleAlert size={14} /> : <CircleCheck size={14} />}
                </span>
                <span className={sx(styles.status)}>
                  {failed ? i18n.t("session:taskResultReviews.runHistoryRow") : i18n.t("session:taskResultReviews.runHistoryRow2")}
                </span>
                <time
                  className={sx(styles.timestamp)}
                  dateTime={result.createdAt}
                  title={formatDateTime(new Date(result.createdAt))}
                >
                  {formatRelativeTime(result.createdAt)}
                </time>
                <span className={sx(styles.caption)}>
                  {result.reviewedAt ? i18n.t("session:taskResultReviews.runHistoryRow3") : i18n.t("session:taskResultReviews.runHistoryRow4")}
                </span>
              </span>
            </span>
          </span>
        </AccordionTrigger>
      </div>
      <AccordionContent mount="lazy" className={sx(styles.rowDetails)}>
        <RunEvidence result={result} onShowTurn={() => setTurnOpen(true)} />
        <div className={sx(styles.rowActions)}>
          <ActionButton
            size="xs"
            weight="quiet"
            loading={props.busy}
            disabled={props.disabled}
            onClick={props.onReview}
            title={
              result.reviewedAt
                ? i18n.t("session:taskResultReviews.title")
                : i18n.t("session:taskResultReviews.title2")
            }
          >
            {result.reviewedAt ? i18n.t("session:taskResultReviews.runHistoryRow5") : i18n.t("session:taskResultReviews.runHistoryRow6")}
          </ActionButton>
          <ActionButton size="xs" onClick={props.onFollowUp}>
            {i18n.t("session:taskResultReviews.runHistoryRow7")}</ActionButton>
        </div>
        <p className={sx(styles.caption)}>{i18n.t("session:taskResultReviews.runHistoryRow8")}</p>
      </AccordionContent>
      <RunTurnDialog
        open={turnOpen}
        onOpenChange={setTurnOpen}
        workspaceId={result.workspaceId}
        taskId={result.taskId}
        turnId={result.turnId}
        description={i18n.t("session:remaining.presentationCopy285", { v1: result.taskTitle, v2: formatRelativeTime(result.createdAt) })}
      />
    </AccordionItem>
  );
}

/** Optional run-level detail stays available without preceding the saved answers. */
function TaskAgentRunReport(props: { workspaceId: string; taskId: string }) {
  useTranslation();
  const detail = useTaskAgentRun(props.workspaceId, props.taskId);
  const actions = useAgentRunReportActions(detail);
  return detail?.report ? (
    <details className={sx(styles.agentReport)}>
      <summary className={sx(styles.disclosure, focusRing.ring)}>{i18n.t("session:taskResultReviews.agentRunReport")}</summary>
      <AgentRunReportView report={detail.report} actions={actions} agentOrigin={hasAgentOrigin(detail.agentRun)} />
    </details>
  ) : null;
}

export function TaskResultReviews(props: {
  workspaceId: string;
  taskId: string;
}) {
  useTranslation();
  const [filter, setFilter] = useState<Filter>("pending");
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const { page, loading, error, refresh } = useResultReviews({
    workspaceId: props.workspaceId,
    taskId: props.taskId,
    limit: PAGE_SIZE,
    offset,
    includeEvidence: false,
    ...(filter === "pending" ? { pendingOnly: true } : {}),
  });
  useEffect(() => {
    if (loading || error) return;
    // Reviewing the last row may remove the page itself (21 pending -> 20).
    const lastOffset = Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1) * PAGE_SIZE;
    if (offset > lastOffset) setOffset(lastOffset);
  }, [error, loading, offset, page.total]);
  useEffect(() => {
    // A row that paged or filtered out of view must not stay "expanded".
    if (expandedId && !page.results.some((row) => row.id === expandedId)) {
      setExpandedId(null);
    }
  }, [expandedId, page.results]);

  const changeFilter = (next: Filter) => {
    if (next === filter) return;
    setFilter(next);
    setOffset(0);
    setExpandedId(null);
  };
  const review = async (result: ResultReview) => {
    if (busyId) return;
    setBusyId(result.id);
    setSaveError("");
    try {
      await setResultReviewed({
        repositoryPath: result.repositoryPath,
        workspaceId: result.workspaceId,
        taskId: result.taskId,
        turnId: result.turnId,
        reviewed: !result.reviewedAt,
      });
    } catch (failure) {
      setSaveError(
        failure instanceof Error
          ? failure.message
          : i18n.t("session:taskResultReviews.extraCopy116"),
      );
    } finally {
      setBusyId(null);
    }
  };
  const followUp = (result: ResultReview) => {
    const state = useAppStore.getState();
    if (
      state.activeWorkspaceId !== props.workspaceId ||
      state.activeTaskId !== props.taskId
    )
      return;
    state.updatePromptDraft({
      taskId: props.taskId,
      patch: {
        text: appendWorkflowDraft(
          state.promptDraftByTask[props.taskId]?.text ?? "",
          `Revise the result from run ${result.turnId}.\n${result.summary ? `Result: ${result.summary}\n` : ""}Requested changes:\n`,
        ),
      },
    });
    setDraftNotice(i18n.t("session:taskResultReviews.extraCopy119"));
  };

  const showPagination = page.total > PAGE_SIZE;
  const rangeStart = offset + 1;
  const rangeEnd = offset + page.results.length;

  return (
    <section aria-label={i18n.t("session:taskResultReviews.ariaLabel")} className={sx(styles.panel)}>
      <div className={sx(styles.header)}>
        <h3 className={sx(styles.heading)}>{i18n.t("session:taskResultReviews.taskResultReviews")}</h3>
        <p className={sx(styles.introduction)}>
          {i18n.t("session:taskResultReviews.taskResultReviews2")}</p>
      </div>
      <TaskAgentRunReport workspaceId={props.workspaceId} taskId={props.taskId} />
      <div className={sx(styles.toolbar)} role="group" aria-label={i18n.t("session:taskResultReviews.ariaLabel2")}>
        <div className={sx(styles.filterGroup)}>
          <ActionButton
            size="xs"
            weight={filter === "pending" ? "secondary" : "quiet"}
            aria-pressed={filter === "pending"}
            onClick={() => changeFilter("pending")}
          >
            {i18n.t("session:taskResultReviews.taskResultReviews3")}</ActionButton>
          <ActionButton
            size="xs"
            weight={filter === "all" ? "secondary" : "quiet"}
            aria-pressed={filter === "all"}
            onClick={() => changeFilter("all")}
          >
            {i18n.t("session:taskResultReviews.taskResultReviews4")}</ActionButton>
        </div>
        <span className={sx(styles.caption)} aria-live="polite">
          {loading && page.total === 0
            ? i18n.t("session:taskResultReviews.taskResultReviews5")
            : page.total === 0
              ? filter === "pending"
                ? i18n.t("session:taskResultReviews.taskResultReviews6")
                : i18n.t("session:taskResultReviews.taskResultReviews7")
              : showPagination
                ? i18n.t("session:taskResultReviews.taskResultReviews8", { value1: rangeStart, value2: rangeEnd, value3: page.total })
                : i18n.t("session:taskResultReviews.runCount", { count: page.total })}
        </span>
      </div>
      <div className={sx(styles.body)}>
        {error || saveError ? (
          <div className={sx(styles.alertRow)}>
            <p role="alert" className={sx(styles.error)}>
              {error || saveError}
            </p>
            {error ? (
              <ActionButton size="xs" onClick={refresh}>
                {i18n.t("session:taskResultReviews.taskResultReviews9")}</ActionButton>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && page.total === 0 ? (
          <p className={sx(styles.empty)}>
            {filter === "pending"
              ? i18n.t("session:taskResultReviews.taskResultReviews10")
              : i18n.t("session:taskResultReviews.taskResultReviews11")}
          </p>
        ) : null}
        <Accordion
          className={sx(styles.list)}
          value={expandedId ? [expandedId] : []}
          onValueChange={(value) =>
            setExpandedId(
              ((value as string[])[0] as string | undefined) ?? null,
            )
          }
        >
          {page.results.map((result) => (
            <RunHistoryRow
              key={result.id}
              result={result}
              expanded={expandedId === result.id}
              busy={busyId === result.id}
              disabled={busyId !== null}
              onReview={() => void review(result)}
              onFollowUp={() => followUp(result)}
            />
          ))}
        </Accordion>
        {draftNotice ? (
          <p role="status" className={sx(styles.notice)}>
            {draftNotice}
          </p>
        ) : null}
        {showPagination ? (
          <div className={sx(styles.pagination)}>
            <ActionButton
              size="xs"
              weight="quiet"
              disabled={offset === 0 || loading}
              onClick={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
                setExpandedId(null);
              }}
            >
              {i18n.t("session:taskResultReviews.taskResultReviews12")}</ActionButton>
            <span className={sx(styles.caption)}>
              {i18n.t("session:taskResultReviews.taskResultReviews8", { value1: rangeStart, value2: rangeEnd, value3: page.total })}
            </span>
            <ActionButton
              size="xs"
              weight="quiet"
              disabled={!page.hasMore || loading}
              onClick={() => {
                setOffset(offset + PAGE_SIZE);
                setExpandedId(null);
              }}
            >
              {i18n.t("session:taskResultReviews.taskResultReviews14")}</ActionButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}
