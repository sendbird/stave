import { useMemo } from "react";
import { mergeCollaborationRows } from "@/lib/collaboration/history";
import { selectAdvisorTranscriptExchanges } from "@/lib/collaboration/advisor-transcript";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { CollaborationHistoryControls } from "./CollaborationHistoryControls";
import type { CollaborationHistoryState } from "./useCollaborationHistory";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";
import { focusRing } from "../ads/recipes/focus-ring";

const EMPTY: readonly ChatMessage[] = [];

export function AdvisorTranscript({
  taskId,
  history,
  showHistory = true,
}: {
  taskId: string;
  history: CollaborationHistoryState;
  showHistory?: boolean;
}) {
  const messages = useAppStore(
    (state) => state.messagesByTask[taskId] ?? EMPTY,
  );
  const rows = useMemo(
    () =>
      mergeCollaborationRows(
        selectAdvisorTranscriptExchanges(messages),
        history.page?.advisors ?? [],
      ),
    [history.page?.advisors, messages],
  );
  return (
    <section {...stylex.props(styles.contentStack)}>
      {rows.length ? (
        <div {...stylex.props(styles.contentStack)}>
          {rows.map((row) => (
            <article key={row.id} {...stylex.props(styles.articleCompact)}>
              <h4 {...stylex.props(styles.heading)}>Question</h4>
              <p
                {...stylex.props(
                  styles.body,
                  styles.preWrap,
                  styles.breakWords,
                )}
              >
                {row.question}
              </p>
              <h4 {...stylex.props(styles.heading)}>
                Advisor response ·{" "}
                {row.state === "output-available"
                  ? "Answer returned"
                  : row.state === "output-error"
                    ? "Failed"
                    : "In progress"}
              </h4>
              <p
                {...stylex.props(
                  styles.body,
                  styles.preWrap,
                  styles.breakWords,
                )}
              >
                {row.answer}
              </p>
            </article>
          ))}
        </div>
      ) : !history.loading && !history.error ? (
        <p {...stylex.props(styles.bodyRelaxed, styles.muted)}>
          No advisor exchanges in the current conversation or this saved slice.
          Browse older messages or configure Advisor in the composer.
        </p>
      ) : null}
      {showHistory ? (
        <CollaborationHistoryControls
          history={history}
          exchangeKind="advisor"
        />
      ) : null}
    </section>
  );
}
