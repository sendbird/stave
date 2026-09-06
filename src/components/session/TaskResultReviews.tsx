import { sx } from "../ads/utils/stylex";
import { resultStyles as styles } from "./result-review.styles";
import { focusRing } from "../ads/recipes/focus-ring";
import { useState } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import { useResultReviews } from "@/lib/reviews/useResultReviews";
import { setResultReviewed } from "@/lib/reviews/result-review-client";
import type { ResultReview } from "@/lib/reviews/result-review";
import { useAppStore } from "@/store/app.store";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import { ResultFileSnapshots } from "./ResultFileSnapshots";
import { ModelResolutionSummary } from "./ModelResolutionSummary";
import { appendWorkflowDraft } from "@/lib/collaboration/workflows";

export function ResultReviewRows(props: {
  results: readonly ResultReview[];
  busyId: string | null;
  onReview: (result: ResultReview) => void;
  onFollowUp?: (result: ResultReview) => void;
}) {
  return (
    <ul className={sx(styles.list)}>
      {props.results.map((result) => (
        <li key={result.id} className={sx(styles.row)}>
          <div className={sx(styles.rowHeader)}>
            <span className={sx(styles.status)}>
              {result.outcome === "failed" ? "Run failed" : "Run finished"}
              <span className={sx(styles.reviewState)}>
                {result.reviewedAt ? " · Reviewed" : " · Not reviewed"}
              </span>
            </span>
            <time className={sx(styles.timestamp)} dateTime={result.createdAt}>
              {new Date(result.createdAt).toLocaleString()}
            </time>
          </div>
          <p className={sx(styles.summary)}>
            {result.summary ||
              "No result summary was recorded. Check the conversation before reviewing."}
          </p>
          {result.evidence ? (
            <section className={sx(styles.evidence)}>
              <h4 className={sx(styles.evidenceHeading)}>
                Captured result · {result.evidence.model}
              </h4>
              <p className={sx(styles.evidenceDescription)}>
                Saved when this run ended. Reviewing this result applies to this
                captured answer.
              </p>
              <p className={sx(styles.answer)}>
                {result.evidence.answer || "No final answer was recorded."}
              </p>
              {result.evidence.answerTruncated ? (
                <p className={sx(styles.excerptNotice)}>
                  This is an excerpt. Read the conversation for the full answer.
                </p>
              ) : null}
              {result.evidence.files.length ? (
                <div className={sx(styles.files)}>
                  <h4 className={sx(styles.evidenceHeading)}>
                    Files reported by this run
                  </h4>
                  {!result.evidence.snapshots?.length ? (
                    result.evidence.files.map((file) => (
                      <p key={file} className={sx(styles.filePath)}>
                        {file}
                      </p>
                    ))
                  ) : (
                    <p>
                      Reported files: {result.evidence.files.length}. Expand the
                      recorded changes below to inspect saved content.
                    </p>
                  )}
                  <p className={sx(styles.muted)}>
                    File contents may have changed since this run.
                  </p>
                  {result.evidence.filesTruncated ? (
                    <p className={sx(styles.muted)}>
                      The recorded file list is incomplete.
                    </p>
                  ) : null}
                </div>
              ) : null}
              <ResultFileSnapshots evidence={result.evidence} />
            </section>
          ) : (
            <p className={sx(styles.caption)}>
              No answer snapshot is available for this run.
            </p>
          )}
          <div className={sx(styles.rowHeader)}>
            <details className={sx(styles.reference)}>
              <summary className={sx(styles.disclosure, focusRing.ring)}>
                Execution reference
              </summary>
              {result.evidence?.modelResolution ? (
                <div className={sx(styles.resolution)}>
                  <ModelResolutionSummary
                    actual={{
                      providerId: result.evidence.providerId,
                      model: result.evidence.model,
                    }}
                    resolution={result.evidence.modelResolution}
                  />
                </div>
              ) : null}
              <p className={sx(styles.runId)}>{result.turnId}</p>
              {result.evidence ? (
                <p className={sx(styles.messageId)}>
                  Source message: {result.evidence.messageId}
                </p>
              ) : null}
              {result.reviewedAt ? (
                <p>Reviewed {new Date(result.reviewedAt).toLocaleString()}</p>
              ) : null}
            </details>
            {props.onFollowUp ? (
              <ActionButton
                size="xs"
                weight="quiet"
                onClick={() => props.onFollowUp?.(result)}
              >
                Request changes
              </ActionButton>
            ) : null}
            <ActionButton
              size="xs"
              loading={props.busyId === result.id}
              disabled={props.busyId !== null}
              onClick={() => props.onReview(result)}
            >
              {result.reviewedAt ? "Reopen review" : "Mark reviewed"}
            </ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TaskResultReviews(props: {
  workspaceId: string;
  taskId: string;
}) {
  const [offset, setOffset] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [draftNotice, setDraftNotice] = useState("");
  const { page, loading, error, refresh } = useResultReviews({
    ...props,
    limit: 20,
    offset,
    includeEvidence: true,
  });
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
        projectPath: result.projectPath,
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
  return (
    <section aria-label="Task results" className={sx(styles.panel)}>
      <h3 className={sx(styles.heading)}>
        Run history{page.total > 0 ? ` · ${page.total}` : ""}
      </h3>
      <div className={sx(styles.body)}>
        <p className={sx(styles.introduction)}>
          Saved answers and reported changes for this task. Review marks are
          optional and do not change task completion.
        </p>
        <div
          className={sx(styles.navigation)}
          aria-label="Inspect output and continue work"
        >
          <ActionButton size="xs" onClick={() => inspect("changes")}>
            Inspect current changes
          </ActionButton>
          <ActionButton size="xs" onClick={() => inspect("explorer")}>
            Open files & documents
          </ActionButton>
          <ActionButton
            size="xs"
            weight="quiet"
            onClick={() => inspect("information")}
          >
            Workspace information
          </ActionButton>
        </div>
        <p className={sx(styles.guidance)}>
          Files and changes show the current workspace. Use the run's
          conversation to check what it produced and verified.
        </p>
        {loading ? (
          <p role="status" className={sx(styles.loading)}>
            Loading saved results…
          </p>
        ) : null}
        {error || saveError ? (
          <p role="alert" className={sx(styles.error)}>
            {error || saveError}
          </p>
        ) : null}
        {error ? (
          <ActionButton size="xs" onClick={refresh}>
            Retry loading
          </ActionButton>
        ) : null}
        {!loading && !error && page.total === 0 ? (
          <p className={sx(styles.empty)}>
            Finished runs will appear here. Review history stays saved when
            notifications are cleared.
          </p>
        ) : null}
        <ResultReviewRows
          results={page.results}
          busyId={busyId}
          onReview={(result) => void review(result)}
          onFollowUp={followUp}
        />
        {draftNotice ? (
          <p role="status" className={sx(styles.notice)}>
            {draftNotice}
          </p>
        ) : null}
        {page.total > 20 ? (
          <div className={sx(styles.pagination)}>
            <ActionButton
              size="xs"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - 20))}
            >
              Newer results
            </ActionButton>
            <span className={sx(styles.caption)}>
              {offset + 1}–{offset + page.results.length} of {page.total}
            </span>
            <ActionButton
              size="xs"
              disabled={!page.hasMore || loading}
              onClick={() => setOffset(offset + 20)}
            >
              Older results
            </ActionButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}
