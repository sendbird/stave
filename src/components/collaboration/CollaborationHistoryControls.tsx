import { ActionButton } from "@/components/system/ActionButton";
import type { CollaborationHistoryState } from "./useCollaborationHistory";
import * as stylex from "@stylexjs/stylex";
import { collaborationStyles as styles } from "./collaboration.styles";

export function CollaborationHistoryControls({
  history,
  exchangeKind,
}: {
  history: CollaborationHistoryState;
  exchangeKind: "advisor" | "worker" | "all";
}) {
  const coverage = history.page?.coverage;
  const exchangeCount = history.page
    ? exchangeKind === "all"
      ? history.page.advisorExchangeCount + history.page.workerExchangeCount
      : exchangeKind === "advisor"
        ? history.page.advisorExchangeCount
        : history.page.workerExchangeCount
    : 0;
  const shownExchangeCount = history.page
    ? exchangeKind === "all"
      ? history.page.advisors.length + history.page.workers.length
      : exchangeKind === "advisor"
        ? history.page.advisors.length
        : history.page.workers.length
    : 0;
  if (!history.loading && !history.error && !coverage?.scannedMessageCount)
    return null;
  return (
    <div {...stylex.props(styles.sectionDivider, styles.compactStack)}>
      <h3 {...stylex.props(styles.heading)}>Saved transcript history</h3>
      {coverage ? (
        <p {...stylex.props(styles.body, styles.muted)}>
          {coverage.scannedMessageCount
            ? `Showing messages ${coverage.firstMessageNumber.toLocaleString()}–${coverage.lastMessageNumber.toLocaleString()} of ${coverage.totalMessageCount.toLocaleString()}.`
            : "This task has no saved messages."}{" "}
          {exchangeCount.toLocaleString()} saved{" "}
          {exchangeKind === "all" ? "collaboration" : exchangeKind}
          {exchangeCount === 1 ? " exchange" : " exchanges"}
          {shownExchangeCount < exchangeCount
            ? `; newest ${shownExchangeCount.toLocaleString()} shown`
            : ""}
          .
        </p>
      ) : null}
      {history.loading ? (
        <p role="status" {...stylex.props(styles.body, styles.muted)}>
          Loading saved history…
        </p>
      ) : null}
      {history.error ? (
        <p role="alert" {...stylex.props(styles.body, styles.danger)}>
          {history.error}{" "}
          <ActionButton size="xs" onClick={history.retry}>
            Retry
          </ActionButton>
        </p>
      ) : null}
      {coverage && (coverage.hasOlder || coverage.hasNewer) ? (
        <div {...stylex.props(styles.wrap)}>
          <ActionButton
            size="xs"
            disabled={history.loading || !coverage.hasOlder}
            onClick={history.loadOlder}
          >
            Older saved messages
          </ActionButton>
          <ActionButton
            size="xs"
            disabled={history.loading || !coverage.hasNewer}
            onClick={history.loadNewer}
          >
            Newer saved messages
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
