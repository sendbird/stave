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
import { Badge } from "@/components/ads/components/Badge";
import { CollapsibleResponse } from "@/components/ai-elements/collapsible-response";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { setResultReviewed } from "@/lib/reviews/result-review-client";
import type { ResultReview } from "@/lib/reviews/result-review";
import { useAppStore } from "@/store/app.store";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import { ResultFileSnapshots } from "./ResultFileSnapshots";
import { RunTurnDialog } from "./RunTurnDialog";
import { MissionReportView } from "@/components/missions/MissionReportView";
import { useMissionReportActions } from "@/components/missions/useMissionReportActions";
import { useTaskMission } from "@/store/missions-store";
import { hasAgentOrigin } from "@/lib/missions/agent-run";
import {
  formatActualRunModel,
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
 * "Show the turn".
 */
function RunEvidence(props: { result: ResultReview; onShowTurn: () => void }) {
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
      Show the turn
    </ActionButton>
  );
  if (loading && !evidence) {
    return (
      <p role="status" className={sx(styles.loading)}>
        Loading the saved answer…
      </p>
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
            Retry
          </ActionButton>
          {showTurn}
        </div>
      </div>
    );
  }
  if (!evidence) {
    return (
      <div className={sx(styles.evidence)}>
        <p className={sx(styles.caption)}>
          No answer was saved for this run.
        </p>
        <div>{showTurn}</div>
      </div>
    );
  }
  const modelLabel = formatActualRunModel({
    providerId: evidence.providerId,
    model: evidence.model,
    modelInfo: evidence.modelInfo,
  });
  return (
    <div className={sx(styles.evidence)}>
      <div className={sx(styles.answerSection)}>
        <div className={sx(styles.answerHeader)}>
          <div className={sx(styles.answerHeading)}>
            <h4 className={sx(styles.evidenceHeading)}>Final answer</h4>
            <p className={sx(styles.evidenceDescription)}>
              Saved when the run ended · {modelLabel}
            </p>
          </div>
          {showTurn}
        </div>
        {evidence.answer ? (
          <CollapsibleResponse text={evidence.answer} label="the final answer" />
        ) : (
          <p className={sx(styles.muted)}>No final answer was recorded.</p>
        )}
        {evidence.answerTruncated ? (
          <p className={sx(styles.muted)}>
            Only the start of a long answer was saved. Show the turn to read
            all of it.
          </p>
        ) : null}
      </div>
      <ResultFileSnapshots evidence={evidence} taskId={result.taskId} />
      <details className={sx(styles.reference)}>
        <summary className={sx(styles.disclosure, focusRing.ring)}>
          Run details
        </summary>
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
        <p className={sx(styles.runId)}>Run {result.turnId}</p>
        <p className={sx(styles.messageId)}>Message {evidence.messageId}</p>
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
  const { result } = props;
  const [turnOpen, setTurnOpen] = useState(false);
  const failed = result.outcome === "failed";
  const summary =
    result.summary.trim() || "No summary was recorded for this run.";
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
                  {failed ? "Failed" : "Finished"}
                </span>
                <time
                  className={sx(styles.timestamp)}
                  dateTime={result.createdAt}
                  title={new Date(result.createdAt).toLocaleString()}
                >
                  {formatRelativeTime(result.createdAt)}
                </time>
                {result.reviewedAt ? (
                  <Badge tone="success" variant="outline" dot>
                    Reviewed
                  </Badge>
                ) : (
                  <Badge tone="neutral" variant="outline">
                    Not reviewed
                  </Badge>
                )}
              </span>
            </span>
          </span>
        </AccordionTrigger>
        <ActionButton
          xstyle={styles.rowAction}
          size="xs"
          weight="quiet"
          loading={props.busy}
          disabled={props.disabled}
          onClick={props.onReview}
          title={
            result.reviewedAt
              ? "Reopen this run for review"
              : "Mark this run as reviewed"
          }
        >
          {result.reviewedAt ? "Reopen" : "Mark reviewed"}
        </ActionButton>
      </div>
      <AccordionContent mount="lazy" className={sx(styles.rowDetails)}>
        <RunEvidence result={result} onShowTurn={() => setTurnOpen(true)} />
        <div className={sx(styles.rowActions)}>
          <ActionButton size="xs" onClick={props.onFollowUp}>
            Request changes
          </ActionButton>
          <span className={sx(styles.caption)}>
            Adds a follow-up referencing this run to your draft.
          </span>
        </div>
      </AccordionContent>
      <RunTurnDialog
        open={turnOpen}
        onOpenChange={setTurnOpen}
        workspaceId={result.workspaceId}
        taskId={result.taskId}
        turnId={result.turnId}
        description={`${result.taskTitle} · ended ${formatRelativeTime(result.createdAt)}`}
      />
    </AccordionItem>
  );
}

/** The task's latest finished mission report heads its results. */
function TaskMissionReport(props: { workspaceId: string; taskId: string }) {
  const detail = useTaskMission(props.workspaceId, props.taskId);
  const actions = useMissionReportActions(detail);
  return detail?.report ? (
    <MissionReportView report={detail.report} actions={actions} agentOrigin={hasAgentOrigin(detail.mission)} />
  ) : null;
}

export function TaskResultReviews(props: {
  workspaceId: string;
  taskId: string;
}) {
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
  const inspect = (panel: RightRailPanelId) => {
    const state = useAppStore.getState();
    if (
      state.activeWorkspaceId !== props.workspaceId ||
      state.activeTaskId !== props.taskId
    )
      return;
    state.setLayout({
      patch: { sidebarOverlayVisible: true, sidebarOverlayTab: panel },
    });
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
          : "Review was not saved. Retry.",
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
    setDraftNotice("Added to your draft. Describe the changes before sending.");
  };

  const showPagination = page.total > PAGE_SIZE;
  const rangeStart = offset + 1;
  const rangeEnd = offset + page.results.length;

  return (
    <section aria-label="Task results" className={sx(styles.panel)}>
      <TaskMissionReport workspaceId={props.workspaceId} taskId={props.taskId} />
      <div className={sx(styles.header)}>
        <h3 className={sx(styles.heading)}>Run history</h3>
        <p className={sx(styles.introduction)}>
          One entry per finished run: its final answer, the files it reported,
          and whether you have reviewed it. Expand a run to read what it saved.
        </p>
      </div>
      <div className={sx(styles.toolbar)} role="group" aria-label="Filter runs">
        <div className={sx(styles.filterGroup)}>
          <ActionButton
            size="xs"
            weight={filter === "pending" ? "secondary" : "quiet"}
            aria-pressed={filter === "pending"}
            onClick={() => changeFilter("pending")}
          >
            Needs review
          </ActionButton>
          <ActionButton
            size="xs"
            weight={filter === "all" ? "secondary" : "quiet"}
            aria-pressed={filter === "all"}
            onClick={() => changeFilter("all")}
          >
            All runs
          </ActionButton>
        </div>
        <span className={sx(styles.caption)} aria-live="polite">
          {loading && page.total === 0
            ? "Loading…"
            : page.total === 0
              ? filter === "pending"
                ? "Nothing waiting"
                : "No runs yet"
              : showPagination
                ? `${rangeStart}–${rangeEnd} of ${page.total}`
                : `${page.total} ${page.total === 1 ? "run" : "runs"}`}
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
                Retry
              </ActionButton>
            ) : null}
          </div>
        ) : null}
        {!loading && !error && page.total === 0 ? (
          <p className={sx(styles.empty)}>
            {filter === "pending"
              ? "Every saved run has been reviewed."
              : "Finished runs will appear here with their saved answer. History stays even after notifications are cleared."}
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
              Newer
            </ActionButton>
            <span className={sx(styles.caption)}>
              {rangeStart}–{rangeEnd} of {page.total}
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
              Older
            </ActionButton>
          </div>
        ) : null}
        <div className={sx(styles.footer)}>
          <p className={sx(styles.guidance)}>
            Review marks are for your own tracking and do not change the task.
            Saved answers are historical; the workspace may have moved on.
          </p>
          <div
            className={sx(styles.navigation)}
            aria-label="Inspect the current workspace"
          >
            <ActionButton
              size="xs"
              weight="quiet"
              onClick={() => inspect("changes")}
            >
              Current changes
            </ActionButton>
            <ActionButton
              size="xs"
              weight="quiet"
              onClick={() => inspect("explorer")}
            >
              Files
            </ActionButton>
          </div>
        </div>
      </div>
    </section>
  );
}
