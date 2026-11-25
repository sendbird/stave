import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";

interface AgentSummaryProps {
  title: ReactNode;
  status?: ReactNode;
  activity?: ReactNode;
  facts?: ReactNode;
  actions?: ReactNode;
}

/** The host owns navigation, selection and buttons. This row adds no tab stop. */
export function AgentLine({ title, status, activity, facts, actions, stacked }: AgentSummaryProps & { stacked?: boolean }) {
  return (
    <span className={sx(styles.line, stacked && styles.stacked)} data-agent-summary="line">
      {status && <span className={sx(styles.mark)}>{status}</span>}
      {stacked ? (
        <span className={sx(styles.stackBody)}>
          {title}
          {activity}
        </span>
      ) : (
        <>
          <span className={sx(styles.lineTitle)}>{title}</span>
          {activity && <span className={sx(styles.lineActivity)}>{activity}</span>}
        </>
      )}
      {facts && <span className={sx(styles.lineFacts)}>{facts}</span>}
      {actions && <span className={sx(styles.actions)}>{actions}</span>}
    </span>
  );
}

/** A card keeps longer titles and the current step readable on separate lines. */
export function AgentCard({ title, status, activity, facts, actions }: AgentSummaryProps) {
  return (
    <div className={sx(styles.card)} data-agent-summary="card">
      <div className={sx(styles.header)}>
        {status && <div className={sx(styles.mark)}>{status}</div>}
        <div className={sx(styles.cardTitle)}>{title}</div>
        {actions && <div className={sx(styles.actions)}>{actions}</div>}
      </div>
      {activity && <div className={sx(styles.cardActivity)}>{activity}</div>}
      {facts && <div className={sx(styles.cardFacts)}>{facts}</div>}
    </div>
  );
}

const styles = stylex.create({
  line: {
    display: "flex", flex: "1 1 auto", alignItems: "center", gap: vars["--aui-space-8"],
    minWidth: 0, maxWidth: "100%",
  },
  mark: {
    display: "inline-flex", alignItems: "center", flexShrink: 0, gap: vars["--aui-space-4"], maxWidth: "100%",
  },
  stacked: { alignItems: "flex-start" },
  stackBody: { flex: "1 1 auto", display: "flex", flexDirection: "column", minWidth: 0, whiteSpace: "normal" },
  lineTitle: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  lineActivity: {
    flex: "1 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    color: vars["--aui-color-text-muted"],
  },
  lineFacts: {
    marginInlineStart: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    fontVariantNumeric: "tabular-nums", color: vars["--aui-color-text-muted"],
  },
  actions: { display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], maxWidth: "100%" },
  card: { display: "flex", flexDirection: "column", minWidth: 0, gap: vars["--aui-space-4"] },
  header: { display: "flex", flexWrap: "wrap", alignItems: "center", minWidth: 0, gap: vars["--aui-space-8"] },
  cardTitle: {
    flex: "1 1 8rem", minWidth: 0, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 2,
    overflow: "hidden", overflowWrap: "anywhere", fontWeight: vars["--aui-font-weight-medium"],
  },
  cardActivity: { minWidth: 0, overflowWrap: "anywhere", fontSize: vars["--aui-font-size-caption"] },
  cardFacts: {
    display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: vars["--aui-space-8"], rowGap: vars["--aui-space-4"],
    minWidth: 0, color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums",
    fontSize: vars["--aui-font-size-caption"],
  },
});
