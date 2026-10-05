import * as stylex from "@stylexjs/stylex";
import { Bot } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { describeSubagentState, subagentResultLine } from "@/lib/delegation/subagent-summary";
import { agentRunStyles as styles } from "./agent-runs.styles";

export function AgentRunSubagents({ rows }: { rows: readonly DelegationExchange[] }) {
  if (!rows.length) return null;
  return (
    <section className={sx(styles.section, styles.sectionRule)} aria-label="Subagents">
      <div className={sx(styles.sectionHeader)}>
        <Bot aria-hidden className={sx(styles.sectionIcon)} />
        <h3 className={sx(styles.sectionTitle)}>Subagents</h3>
      </div>
      <ul className={sx(styles.checkList)}>
        {rows.map((row) => (
          <li key={row.id} className={sx(localStyles.row)}>
            <div className={sx(styles.checkText)}>
              <span>{row.title} · {describeSubagentState(row)}</span>
              {row.outcome.progress?.at(-1) ? <p className={sx(styles.notice)}>{row.outcome.progress.at(-1)}</p> : null}
              {subagentResultLine(row) ? <p className={sx(styles.notice)} title={row.outcome.error ?? row.outcome.result}>{subagentResultLine(row)}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const localStyles = stylex.create({
  row: {
    minWidth: 0,
    fontSize: vars["--ads-font-size-body"],
    lineHeight: vars["--ads-line-height-normal"],
    color: vars["--ads-color-text"],
  },
});
