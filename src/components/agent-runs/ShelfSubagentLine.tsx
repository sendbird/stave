import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { StatusDot, type StatusDotStatus } from "@/components/ads/components/StatusDot";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import { WORK_STATE } from "@/components/ads/components/state-vocabulary";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { shelfStyles } from "@/components/session/composer-shelf/composer-shelf.styles";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import {
  describeSubagentState,
  planSubagentLine,
  subagentCurrentStep,
  subagentLineState,
  type SubagentLineState,
} from "@/lib/delegation/subagent-summary";

const LIFECYCLE_DOT: Partial<Record<SubagentLineState, StatusDotStatus>> = {
  working: "running",
  queued: "queued",
  done: "ready",
  failed: "error",
  stopped: "canceled",
};

/**
 * The run's delegates under its shelf line: `✋ Writer needs you · ● Reviewer
 * running · Reading the diff · 2 done`. Each wears its state's mark from the
 * shared vocabulary; only a working one moves, and it names the step it is on.
 * While the lead run waits its own mark is the settled clock, so this is where
 * a reader sees the work moving. While the lead's own line is moving (its turn
 * runs and says what it does), the delegates hold still so one thing moves.
 */
export function ShelfSubagentLine(props: {
  rows: readonly DelegationExchange[];
  reducedMotion: boolean;
  /** False while the run's own line is moving. */
  moving: boolean;
}) {
  useTranslation();
  if (!props.rows.length) return null;
  const { shown, folded } = planSubagentLine(props.rows);
  const foldedText = folded.map((group) => i18n.t(`agentRuns:subagentSummary.folded.${group.state}`, { count: group.count }));
  const summary = [
    ...shown.map((row) => [`${row.title} ${describeSubagentState(row)}`, subagentCurrentStep(row)].filter(Boolean).join(" · ")),
    ...foldedText,
  ].join(" · ");
  return (
    <p className={sx(shelfStyles.text, shelfStyles.subagents)} data-testid="shelf-subagents" title={summary}>
      {shown.map((row, index) => {
        const state = subagentLineState(row);
        const step = subagentCurrentStep(row);
        const working = state === "working" && props.moving;
        return (
          <span key={row.id} data-subagent-state={state}>
            {index > 0 ? " · " : null}
            <SubagentMark state={state} moving={props.moving} />
            <span className={sx(state === "needs-you" ? shelfStyles.labelWaiting : shelfStyles.strong)}>{row.title}</span>
            {` ${describeSubagentState(row)}`}
            {step ? (
              <>
                {" · "}
                <TextShimmer active={working && !props.reducedMotion}>{step}</TextShimmer>
              </>
            ) : null}
          </span>
        );
      })}
      {foldedText.map((text) => (
        <span key={text}>{` · ${text}`}</span>
      ))}
    </p>
  );
}

function SubagentMark(props: { state: SubagentLineState; moving: boolean }) {
  if (props.state === "needs-you" || props.state === "waiting") {
    const Icon = WORK_STATE[props.state].icon;
    return <Icon aria-hidden className={sx(styles.glyph, props.state === "needs-you" ? styles.warning : styles.muted)} />;
  }
  // A working delegate pulses; while the run's own line moves it holds the working color still.
  if (props.state === "working" && !props.moving) {
    return <StatusDot tone={WORK_STATE.working.tone} size="sm" aria-hidden xstyle={styles.dot} />;
  }
  return <StatusDot status={LIFECYCLE_DOT[props.state]!} size="sm" aria-hidden xstyle={styles.dot} />;
}

const styles = stylex.create({
  dot: { marginInlineEnd: vars["--ads-space-4"] },
  glyph: {
    display: "inline-block",
    width: 12,
    height: 12,
    marginInlineEnd: vars["--ads-space-4"],
    verticalAlign: "-2px",
  },
  warning: { color: vars["--ads-color-warning-text"] },
  muted: { color: vars["--ads-color-text-muted"] },
});
