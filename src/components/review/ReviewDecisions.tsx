import { i18n, useTranslation } from "@/i18n";
import { useId, useState } from "react";
import { ApprovalBar } from "@/components/ads/components/ReviewStatus";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { AGENT_RUN_LIMITS } from "@/lib/agent-runs/domain";
import type { ReviewScope } from "@/lib/review/review-scope";
import { describeStageDecision, findStageRecord } from "@/lib/review/review-stage";
import { setResultMarkedReviewed } from "@/lib/reviews/result-review-client";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
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
}

/**
 * The decision at the end of Review (D13). A stage is signed off or sent back
 * with a note; a plain task is marked reviewed or gets its comments sent.
 * Each decision says its own state, apart from files read and checks passed.
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
  return (
    <div className={sx(styles.decisions)} role="region" aria-label={i18n.t("review:decisions.label")}>
      <ApprovalBar
        state={state}
        stateLabel={stateLabel}
        summary={readSummary(props) ?? undefined}
        busy={busy}
        approveLabel={i18n.t("review:decisions.stage.signOff")}
        requestChangesLabel={i18n.t("review:decisions.stage.askForChanges")}
        onApprove={decision.status === "waiting" ? () => runCommand("signOff", decision.signOff).then(() => undefined) : undefined}
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
  const state = result?.markedReviewedAt ? "approved" : result ? "in-review" : "draft";
  const stateLabel = result?.markedReviewedAt ? i18n.t("review:decisions.task.reviewed", { time: formatDateTime(result.markedReviewedAt) })
    : result ? i18n.t("review:decisions.task.notReviewed")
    : i18n.t("review:decisions.task.noResult");
  const summary = [readSummary(props), pending.length ? i18n.t("review:decisions.task.unsent", { count: pending.length }) : null].filter(Boolean).join(" · ");
  const markReviewed = result && !result.markedReviewedAt ? async () => {
    setError(null);
    try {
      await setResultMarkedReviewed({ repositoryPath: result.repositoryPath, workspaceId: result.workspaceId, taskId: result.taskId, turnId: result.turnId, markedReviewed: true });
    } catch {
      setError(i18n.t("review:decisions.task.markFailed"));
    }
  } : undefined;
  const sendComments = pending.length ? async () => {
    setError(null);
    const sent = await submitReviewFeedback({ taskId: props.taskId });
    if (sent.status === "blocked") setError(i18n.t("review:decisions.task.sendFailed"));
  } : undefined;
  return (
    <div className={sx(styles.decisions)} role="region" aria-label={i18n.t("review:decisions.label")}>
      <ApprovalBar
        state={state}
        stateLabel={stateLabel}
        summary={summary || undefined}
        approveLabel={i18n.t("review:decisions.task.markReviewed")}
        requestChangesLabel={i18n.t("review:decisions.task.sendComments")}
        onApprove={markReviewed}
        onRequestChanges={sendComments}
      />
      {error ? <p className={sx(styles.note)} role="alert">{error}</p> : null}
    </div>
  );
}
