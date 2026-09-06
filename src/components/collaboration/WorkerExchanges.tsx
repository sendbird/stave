import { useMemo } from "react";
import { ActionButton } from "@/components/system/ActionButton";
import { StatusBadge } from "@/components/system/WorkspaceSurface";
import { selectWorkerExchanges } from "@/lib/collaboration/worker-exchanges";
import { mergeCollaborationRows } from "@/lib/collaboration/history";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { CollaborationHistoryControls } from "./CollaborationHistoryControls";
import type { CollaborationHistoryState } from "./useCollaborationHistory";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { focusRing } from "../ads/recipes/focus-ring";
const EMPTY: readonly ChatMessage[] = [];
export function WorkerExchanges({
  taskId,
  history,
  showHistory = true,
}: {
  taskId: string;
  history: CollaborationHistoryState;
  showHistory?: boolean;
}) {
  const messages = useAppStore((s) => s.messagesByTask[taskId] ?? EMPTY);
  const liveRows = useMemo(() => selectWorkerExchanges(messages), [messages]);
  const rows = useMemo(
    () => mergeCollaborationRows(liveRows, history.page?.workers ?? []),
    [history.page?.workers, liveRows],
  );
  return (
    <section {...stylex.props(styles.contentStack)}>
      {rows.length ? (
        rows.map((row) => (
          <article key={row.id} {...stylex.props(styles.article)}>
            <h4 {...stylex.props(styles.body)}>
              {row.model} ·{" "}
              {row.state === "output-available"
                ? "Result returned"
                : row.state === "output-error"
                  ? "Failed"
                  : "In progress"}
            </h4>
            <h4 {...stylex.props(styles.heading, styles.marginTop3)}>
              Assignment
            </h4>
            <p
              {...stylex.props(
                styles.body,
                styles.preWrap,
                styles.breakWords,
                styles.marginTop1,
              )}
            >
              {row.assignment}
            </p>
            {row.progress.length ? (
              <div {...stylex.props(styles.compactStack, styles.marginY3)}>
                <span {...stylex.props(styles.selfStart)}>
                  <StatusBadge>Reported progress</StatusBadge>
                </span>
                {row.progress.map((p, i) => (
                  <p
                    key={i}
                    {...stylex.props(
                      styles.body,
                      styles.breakWords,
                      styles.muted,
                    )}
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
            <h4 {...stylex.props(styles.heading, styles.marginTop3)}>
              Returned result
            </h4>
            <p
              {...stylex.props(
                styles.body,
                styles.preWrap,
                styles.breakWords,
                styles.marginY2,
              )}
            >
              {row.result || "No result returned yet."}
            </p>
            <details {...stylex.props(styles.detailsMuted, styles.marginTop3)}>
              <summary {...stylex.props(styles.cursor, focusRing.ring)}>
                Execution details
              </summary>
              <dl {...stylex.props(styles.definitionList, styles.marginTop3)}>
                <dt {...stylex.props(styles.muted)}>Run model</dt>
                <dd {...stylex.props(styles.minZero, styles.breakWords)}>
                  {row.runtimeModel ?? "Not reported"}
                </dd>
                {row.resolvedModel ? (
                  <>
                    <dt {...stylex.props(styles.muted)}>Selected target</dt>
                    <dd {...stylex.props(styles.minZero, styles.breakWords)}>
                      {row.resolvedModel}
                    </dd>
                  </>
                ) : null}
                {row.requestedModel ? (
                  <>
                    <dt {...stylex.props(styles.muted)}>Requested</dt>
                    <dd {...stylex.props(styles.minZero, styles.breakWords)}>
                      {row.requestedModel}
                    </dd>
                  </>
                ) : null}
                {row.modelSource ? (
                  <>
                    <dt {...stylex.props(styles.muted)}>Selection</dt>
                    <dd>
                      {row.modelSource === "preset"
                        ? "Worker preset"
                        : row.modelSource === "explicit"
                          ? "Explicit model"
                          : "Provider default"}
                    </dd>
                  </>
                ) : null}
                {row.modelRationale ? (
                  <>
                    <dt {...stylex.props(styles.muted)}>Reason</dt>
                    <dd {...stylex.props(styles.preWrap, styles.breakWords)}>
                      {row.modelRationale}
                    </dd>
                  </>
                ) : null}
              </dl>
            </details>
            {row.toolUseId ? (
              <ActionButton
                xstyle={styles.selfStart}
                onClick={() =>
                  useAppStore
                    .getState()
                    .focusTranscriptTool({ taskId, toolUseId: row.toolUseId! })
                }
              >
                Show in conversation
              </ActionButton>
            ) : null}
          </article>
        ))
      ) : (
        <p {...stylex.props(styles.body, styles.muted)}>
          No worker exchanges in the current conversation or this saved slice.
          Browse older messages or configure Worker in the composer.
        </p>
      )}
      {showHistory ? (
        <CollaborationHistoryControls history={history} exchangeKind="worker" />
      ) : null}
    </section>
  );
}
