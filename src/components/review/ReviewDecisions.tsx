import { i18n, useTranslation } from "@/i18n";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ApprovalBar } from "@/components/ads/components/ReviewStatus";
import { Button } from "@/components/ads/components/Button";
import { Kbd } from "@/components/ads/components/Kbd";
import { sx } from "@/components/ads/utils/stylex";
import { showTaskConversation } from "@/components/panes/task-surface-entry";
import { toast } from "@/components/ui";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { AGENT_RUN_LIMITS } from "@/lib/agent-runs/domain";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { offerUndoToast } from "@/lib/notifications/pending-undo";
import type { ReviewScope } from "@/lib/review/review-scope";
import { describeStageDecision, findStageRecord } from "@/lib/review/review-stage";
import type { ResultReview } from "@/lib/reviews/result-review";
import { setResultMarkedReviewed } from "@/lib/reviews/result-review-client";
import { undoResultMarkedReviewed } from "@/lib/reviews/result-review-undo";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { openReviewQueueItem } from "./useReviewQueue";
import { agentRunStageKey, useAgentRunFailure, useAgentRunsStore } from "@/store/agent-runs-store";
import { useAppStore } from "@/store/app.store";
import type { ReviewComment } from "@/types/review";
import { reviewStyles as styles } from "./review.styles";
import type { ReviewData } from "./useReviewData";

const NO_COMMENTS: readonly ReviewComment[] = [];
/** Matches no result: a task without a finished turn has nothing to mark. */
const NO_TURN = "no-turn";

interface DecisionProps {
  taskId: string;
  workspaceId: string;
  scope: ReviewScope;
  detail: AgentRunDetail | undefined;
  read: readonly string[];
  data: ReviewData | null;
  latestTurnId: string | null;
  /** The review that follows this one in Fleet's order, offered once this one is decided. */
  nextReview?: FleetAttentionItem | null;
}

/** `Next review · <title>` with its J key, in the decision's place once it is made. */
function NextReviewLabel(props: { item: FleetAttentionItem }) {
  useTranslation();
  return (
    <>
      {i18n.t("review:queue.next", { title: props.item.taskTitle?.trim() || props.item.workspaceName })}
      <Kbd size="sm" aria-hidden>J</Kbd>
    </>
  );
}

/**
 * The approve slot's "Next review" once there is nothing left to decide here.
 * Focus moves onto it right after a decision, so Enter (or J) goes on.
 */
function nextReviewAction(nextReview: FleetAttentionItem | null | undefined): {
  label: ReactNode;
  run: () => Promise<void>;
} | null {
  if (!nextReview?.taskId) return null;
  return {
    label: <NextReviewLabel item={nextReview} />,
    run: () => openReviewQueueItem(nextReview),
  };
}

/**
 * After a decision lands (`settled` turns true), focus goes to the bar's
 * primary button, which is "Next review" by then, or to the decision region
 * when nothing follows. `expect` arms it right before the decision is sent;
 * `cancel` disarms it when the decision fails, so a later change made
 * elsewhere never pulls focus.
 */
function useFocusAfterDecision(region: RefObject<HTMLElement | null>, settled: boolean) {
  const wanted = useRef(false);
  useEffect(() => {
    if (!wanted.current || !settled) return;
    wanted.current = false;
    const primary = region.current?.querySelector<HTMLElement>('[data-approval-action="approve"]');
    (primary ?? region.current)?.focus();
  }, [region, settled]);
  return {
    expect: () => {
      wanted.current = true;
    },
    cancel: () => {
      wanted.current = false;
    },
  };
}

/**
 * The decision at the end of Review (D13). A stage is signed off or sent back
 * with a note; a plain task is marked reviewed or gets its comments sent.
 * Each decision says its own state, apart from files read and checks passed.
 * Signing off or sending work back to the agent returns the task to its
 * conversation, where the run's next stage or the agent's next turn and any
 * request it makes are shown.
 */
export function ReviewDecisions(props: DecisionProps) {
  return props.scope.kind === "stage" ? <StageDecisions {...props} scope={props.scope} /> : <TaskDecisions {...props} />;
}

/** Files read in this scope; nothing while the files are still being read. */
function readSummary(props: Pick<DecisionProps, "read" | "data">): string | null {
  if (!props.data) return null;
  const { files } = props.data;
  return i18n.t("review:decisions.summary", { read: files.filter((file) => props.read.includes(file.path)).length, count: files.length });
}

function StageDecisions(props: DecisionProps & { scope: Extract<ReviewScope, { kind: "stage" }> }) {
  useTranslation();
  const feedbackId = useId();
  const decision = describeStageDecision(props.detail, props.scope);
  const runCommand = useAgentRunsStore((state) => state.runCommand);
  const busy = useAgentRunsStore((state) => Boolean(state.pendingByAgentRun[props.scope.agentRunId]));
  const waitingRecord = decision.status === "waiting" ? findStageRecord(props.detail, decision.signOff) : undefined;
  const failure = useAgentRunFailure(props.scope.agentRunId, waitingRecord ? agentRunStageKey(waitingRecord) : null);
  const [asking, setAsking] = useState(false);
  const [feedback, setFeedback] = useState("");
  const state = decision.status === "waiting" ? "in-review" : decision.status === "signed-off" ? "approved" : decision.status === "changes-asked" ? "changes-requested" : "draft";
  const stateLabel = decision.status === "waiting" ? i18n.t("review:decisions.stage.waiting")
    : decision.status === "signed-off" ? i18n.t("review:decisions.stage.signedOff", { time: formatDateTime(decision.at) })
    : decision.status === "changes-asked" ? i18n.t("review:decisions.stage.changesAsked", { time: formatDateTime(decision.at) })
    : i18n.t("review:decisions.stage.none");
  // Nothing to sign off here: the next waiting review takes the primary place.
  const next = decision.status === "waiting" ? null : nextReviewAction(props.nextReview);
  return (
    <div className={sx(styles.decisions)} role="region" aria-label={i18n.t("review:decisions.label")}>
      <ApprovalBar
        state={state}
        stateLabel={stateLabel}
        summary={readSummary(props) ?? undefined}
        busy={busy}
        approveLabel={next ? next.label : i18n.t("review:decisions.stage.signOff")}
        requestChangesLabel={i18n.t("review:decisions.stage.askForChanges")}
        onApprove={decision.status === "waiting" ? () => runCommand("signOff", decision.signOff).then((result) => {
          if (!result.ok) return;
          // Like Ask for changes: the run goes on in the conversation, where its next stage shows.
          showTaskConversation(props.taskId);
          toast.success(i18n.t("review:decisions.stage.signedOffToast"));
        }) : next?.run}
        onRequestChanges={decision.status === "waiting" && decision.canAskForChanges && !asking ? () => setAsking(true) : undefined}
      />
      {asking && decision.status === "waiting" ? (
        <form
          className={sx(styles.feedbackForm)}
          onSubmit={(event) => {
            event.preventDefault();
            const note = feedback.trim();
            if (!note) return;
            void runCommand("requestChanges", { ...decision.signOff, feedback: note }).then((result) => {
              if (result.ok) {
                setAsking(false);
                setFeedback("");
                showTaskConversation(props.taskId);
              }
            });
          }}
        >
          <label htmlFor={feedbackId} className={sx(styles.note)}>{i18n.t("review:decisions.stage.feedbackLabel")}</label>
          <Textarea id={feedbackId} value={feedback} maxLength={AGENT_RUN_LIMITS.maxFeedbackChars} rows={3} autoFocus onChange={(event) => setFeedback(event.target.value)} />
          <div className={sx(styles.feedbackActions)}>
            <Button type="button" size="sm" variant="quiet" onClick={() => setAsking(false)}>{i18n.t("review:decisions.stage.cancel")}</Button>
            <Button type="submit" size="sm" disabled={busy || !feedback.trim()}>{i18n.t("review:decisions.stage.send")}</Button>
          </div>
        </form>
      ) : null}
      {failure ? <p className={sx(styles.note)} role="alert">{failure}</p> : null}
    </div>
  );
}

function TaskDecisions(props: DecisionProps) {
  useTranslation();
  const turnId = props.scope.kind === "turn" ? props.scope.turnId : props.latestTurnId;
  const reviews = useResultReviews({ workspaceId: props.workspaceId, taskId: props.taskId, turnId: turnId ?? NO_TURN, limit: 1, includeEvidence: false });
  const result = turnId ? reviews.page.results[0] ?? null : null;
  const pending = useAppStore((state) => state.reviewCommentsByTask[props.taskId] ?? NO_COMMENTS);
  const submitReviewFeedback = useAppStore((state) => state.submitReviewFeedback);
  const [error, setError] = useState<string | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const focusAfter = useFocusAfterDecision(regionRef, Boolean(result?.markedReviewedAt));
  const state = result?.markedReviewedAt ? "approved" : result ? "in-review" : "draft";
  const stateLabel = result?.markedReviewedAt ? i18n.t("review:decisions.task.reviewed", { time: formatDateTime(result.markedReviewedAt) })
    : result ? i18n.t("review:decisions.task.notReviewed")
    : i18n.t("review:decisions.task.noResult");
  const summary = [readSummary(props), pending.length ? i18n.t("review:decisions.task.unsent", { count: pending.length }) : null].filter(Boolean).join(" · ");
  const canMark = Boolean(result && !result.markedReviewedAt);
  const markReviewed = result && canMark ? async () => {
    setError(null);
    const before = result;
    focusAfter.expect();
    try {
      const saved = await setResultMarkedReviewed({ repositoryPath: result.repositoryPath, workspaceId: result.workspaceId, taskId: result.taskId, turnId: result.turnId, markedReviewed: true });
      offerUndoToast(i18n.t("review:decisions.task.markedToast"), {
        description: saved.taskTitle,
        undoLabel: i18n.t("review:decisions.task.undo"),
        onUndo: () => void undoMarkReviewed(before, saved),
      });
    } catch {
      focusAfter.cancel();
      setError(i18n.t("review:decisions.task.markFailed"));
    }
  } : undefined;
  // Once this result is reviewed, the next waiting review takes the primary place.
  const next = canMark ? null : nextReviewAction(props.nextReview);
  const sendComments = pending.length ? async () => {
    setError(null);
    const sent = await submitReviewFeedback({ taskId: props.taskId });
    if (sent.status === "blocked") setError(i18n.t("review:decisions.task.sendFailed"));
    else showTaskConversation(props.taskId);
  } : undefined;
  return (
    <div ref={regionRef} tabIndex={-1} className={sx(styles.decisions)} role="region" aria-label={i18n.t("review:decisions.label")}>
      <ApprovalBar
        state={state}
        stateLabel={stateLabel}
        summary={summary || undefined}
        approveLabel={next ? next.label : i18n.t("review:decisions.task.markReviewed")}
        requestChangesLabel={i18n.t("review:decisions.task.sendComments")}
        onApprove={markReviewed ?? next?.run}
        onRequestChanges={sendComments}
      />
      {error ? <p className={sx(styles.note)} role="alert">{error}</p> : null}
    </div>
  );
}

/**
 * The Undo of one "Mark reviewed": restores the result through the same
 * writers, and says so when another surface changed the mark since.
 */
async function undoMarkReviewed(before: ResultReview, saved: ResultReview) {
  try {
    const outcome = await undoResultMarkedReviewed({ before, saved });
    if (outcome === "changed-elsewhere") toast.warning(i18n.t("review:decisions.task.undoChangedElsewhere"));
  } catch {
    toast.error(i18n.t("review:decisions.task.undoFailed"));
  }
}
