import { i18n, useTranslation } from "@/i18n";
import { useMemo, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { useAsync } from "@/components/ads/utils/async";
import { sx } from "@/components/ads/utils/stylex";
import { AgentRunDoneWhen } from "@/components/agent-runs/AgentRunDoneWhen";
import { ApprovalRecordView } from "@/components/approvals/ApprovalRecord";
import { describeLensReviewVerdict, LensReviewRecordView } from "@/components/panes/surfaces/lens/LensReviewRecordView";
import { AsyncBoundary } from "@/components/system/AsyncBoundary";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { describeAgentRunResult } from "@/lib/agent-runs/agent-run-status";
import type { LensReviewRecord } from "@/lib/lens/lens-review-record";
import type { ReviewScope } from "@/lib/review/review-scope";
import { findStageRecord } from "@/lib/review/review-stage";
import type { AgentRunStageRecord } from "@/lib/agent-runs/domain";
import type { AsyncState } from "@/components/ads/utils/async";
import { useTaskApprovals, useTurnApprovals, useWindowApprovals, type ReviewApprovals as ReviewApprovalsData } from "./useReviewApprovals";
import { useAppStore } from "@/store/app.store";
import { EMPTY_SENT_REVIEW_COMMENTS, useSentReviewCommentsStore } from "@/store/sent-review-comments-store";
import type { ChatMessage } from "@/types/chat";
import type { ReviewComment } from "@/types/review";
import { reviewStyles as styles } from "./review.styles";

const NO_COMMENTS: readonly ReviewComment[] = [];

/**
 * What Review weighs besides the diff: the completion checks Stave ran, the
 * approvals asked in the scope and who decided them, the Lens verifications
 * kept for the task, and the diff comments, pending and sent. Each says what
 * it is, so passing checks never read as a review.
 */
export function ReviewInspector(props: { taskId: string; workspaceId: string; scope: ReviewScope; detail: AgentRunDetail | undefined }) {
  useTranslation();
  return (
    <div className={sx(styles.section)}>
      <ReviewChecks detail={props.detail} />
      <ReviewApprovals taskId={props.taskId} workspaceId={props.workspaceId} scope={props.scope} detail={props.detail} />
      <ReviewLensRecords taskId={props.taskId} />
      <ReviewComments taskId={props.taskId} />
    </div>
  );
}

/**
 * The approval requests of the scope and who decided them: the turn's (read
 * from saved history when the conversation no longer holds it), those of the
 * turns the stage ran, or the whole task's loaded conversation.
 */
function ReviewApprovals(props: { taskId: string; workspaceId: string; scope: ReviewScope; detail: AgentRunDetail | undefined }) {
  useTranslation();
  const { scope } = props;
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("session:approvalRecord.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("session:approvalRecord.title")}</h3>
      {scope.kind === "turn" ? <TurnApprovals workspaceId={props.workspaceId} taskId={props.taskId} turnId={scope.turnId} />
        : scope.kind === "stage" ? <StageApprovals workspaceId={props.workspaceId} taskId={props.taskId} record={findStageRecord(props.detail, scope)} />
        : <TaskApprovals taskId={props.taskId} />}
    </section>
  );
}

function ApprovalsBoundary(props: { state: AsyncState<ReviewApprovalsData>; onRetry?: () => void; emptyText: string }) {
  useTranslation();
  return (
    <AsyncBoundary state={props.state} onRetry={props.onRetry} describeError={() => i18n.t("review:approvals.readFailed")}>
      {(entries) => entries === null
        ? <p className={sx(styles.note)}>{i18n.t("review:files.turnMissing")}</p>
        : <ApprovalRecordView entries={entries} emptyText={props.emptyText} testId="review-approvals" />}
    </AsyncBoundary>
  );
}

function TurnApprovals(props: { workspaceId: string; taskId: string; turnId: string }) {
  const { state, refresh } = useTurnApprovals(props);
  return <ApprovalsBoundary state={state} onRetry={refresh} emptyText={i18n.t("session:approvalRecord.none.turn")} />;
}

function StageApprovals(props: { workspaceId: string; taskId: string; record: AgentRunStageRecord | undefined }) {
  const { startedAt, endedAt } = props.record ?? {};
  const window = useMemo(() => (startedAt ? { startedAt, endedAt: endedAt ?? null } : null), [startedAt, endedAt]);
  const { state, refresh } = useWindowApprovals({ workspaceId: props.workspaceId, taskId: props.taskId, window });
  return <ApprovalsBoundary state={state} onRetry={refresh} emptyText={i18n.t("session:approvalRecord.none.stage")} />;
}

function TaskApprovals(props: { taskId: string }) {
  const state = useTaskApprovals(props.taskId);
  return <ApprovalsBoundary state={state} emptyText={i18n.t("session:approvalRecord.none.task")} />;
}

function ReviewChecks(props: { detail: AgentRunDetail | undefined }) {
  useTranslation();
  const result = useMemo(() => (props.detail ? describeAgentRunResult(props.detail, Date.now()) : null), [props.detail]);
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:checks.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:checks.title")}</h3>
      {!result ? <p className={sx(styles.note)}>{i18n.t("review:checks.noRun")}</p>
        : result.doneWhen.length === 0 && result.staveChecks.length === 0 ? <p className={sx(styles.note)}>{i18n.t("review:checks.none")}</p>
        : <AgentRunDoneWhen lines={result.doneWhen} staveChecks={result.staveChecks} />}
    </section>
  );
}

function ReviewLensRecords(props: { taskId: string }) {
  useTranslation();
  const records = useAsync(async () => {
    const list = typeof window === "undefined" ? undefined : window.api?.lens?.listReviewRecords;
    if (!list) return [];
    const result = await list({ taskId: props.taskId });
    if (!result.ok) throw new Error(result.message || "unavailable"); // i18n-ignore: replaced by the boundary's own words
    return result.records ?? [];
  }, [props.taskId]);
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:lens.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:lens.title")}</h3>
      <AsyncBoundary state={records.state} onRetry={records.refresh} describeError={() => i18n.t("review:lens.readFailed")}
        isEmpty={(list) => list.length === 0} empty={<p className={sx(styles.note)}>{i18n.t("review:lens.none")}</p>}>
        {(list) => (
          <ul className={sx(styles.list)}>
            {list.map((record) => <ReviewLensRecord key={record.id} taskId={props.taskId} record={record} />)}
          </ul>
        )}
      </AsyncBoundary>
    </section>
  );
}

/** The sent feedback image a record compared against, when the conversation still holds it. */
function findSentImage(messages: readonly ChatMessage[] | undefined, record: LensReviewRecord): string | undefined {
  for (const message of messages ?? []) {
    for (const part of message.displayParts ?? []) {
      if (part.type === "image_context" && part.lensFeedback?.annotation.id === record.annotationId && part.lensFeedback.workspaceId === record.workspaceId) return part.dataUrl;
    }
  }
  return undefined;
}

function ReviewLensRecord(props: { taskId: string; record: LensReviewRecord }) {
  useTranslation();
  const { record } = props;
  const [open, setOpen] = useState(false);
  const messages = useAppStore((state) => state.messagesByTask[props.taskId]);
  return (
    <li className={sx(styles.lensRecord)}>
      <span className={sx(styles.note)}>{describeLensReviewVerdict(record)}</span>
      <span className={sx(styles.lensPage)}>{record.pageUrl}</span>
      <Button size="xs" variant="quiet" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? i18n.t("review:lens.hide") : i18n.t("review:lens.show")}
      </Button>
      {open ? <ReviewLensComparison record={record} original={findSentImage(messages, record)} /> : null}
    </li>
  );
}

function ReviewLensComparison(props: { record: LensReviewRecord; original?: string }) {
  useTranslation();
  const image = useAsync(async () => {
    const read = typeof window === "undefined" ? undefined : window.api?.lens?.readReviewRecordImage;
    const result = read ? await read({ id: props.record.id }) : null;
    return result?.ok ? result.dataUrl : undefined;
  }, [props.record.id]);
  return (
    <AsyncBoundary state={image.state} onRetry={image.refresh} describeError={() => i18n.t("review:lens.readFailed")}>
      {(dataUrl) => (
        <LensReviewRecordView record={props.record} image={dataUrl} original={props.original} aspectRatio={16 / 9} />
      )}
    </AsyncBoundary>
  );
}

function ReviewComments(props: { taskId: string }) {
  useTranslation();
  const pending = useAppStore((state) => state.reviewCommentsByTask[props.taskId] ?? NO_COMMENTS);
  const sent = useSentReviewCommentsStore((state) => state.byTask[props.taskId] ?? EMPTY_SENT_REVIEW_COMMENTS);
  const where = (comment: ReviewComment) => comment.line ? i18n.t("review:comments.where", { path: comment.filePath, line: comment.line }) : comment.filePath;
  return (
    <section className={sx(styles.section)} aria-label={i18n.t("review:comments.title")}>
      <h3 className={sx(styles.sectionTitle)}>{i18n.t("review:comments.title")}</h3>
      {pending.length === 0 && sent.length === 0 ? <p className={sx(styles.note)}>{i18n.t("review:comments.none")}</p> : null}
      {pending.length ? (
        <>
        <h4 className={sx(styles.groupTitle)}>{i18n.t("review:comments.pending", { count: pending.length })}</h4>
        <ul className={sx(styles.list)}>
          {pending.map((comment) => (
            <li key={comment.id} className={sx(styles.comment)}>
              <span className={sx(styles.commentWhere)}>{where(comment)}</span>
              <p className={sx(styles.commentBody)}>{comment.body}</p>
            </li>
          ))}
        </ul>
        </>
      ) : null}
      {sent.length ? (
        <>
        <h4 className={sx(styles.groupTitle)}>{i18n.t("review:comments.sent", { count: sent.length })}</h4>
        <ul className={sx(styles.list)}>
          {sent.map((entry) => (
            <li key={entry.comment.id} className={sx(styles.comment)}>
              <span className={sx(styles.commentWhere)}>{i18n.t("review:comments.sentWhere", { where: where(entry.comment), time: formatDateTime(entry.sentAt) })}</span>
              <p className={sx(styles.commentBody)}>{entry.comment.body}</p>
            </li>
          ))}
        </ul>
        </>
      ) : null}
    </section>
  );
}
