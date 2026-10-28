import { i18n, useTranslation } from "@/i18n";
import * as stylex from "@stylexjs/stylex";
import { StateMark } from "@/components/ads/components/StateMark";
import { TextShimmer } from "@/components/ads/components/TextShimmer";
import type { WorkState } from "@/components/ads/components/state-vocabulary";
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

/** Each delegate state as a shared work state, for `StateMark`. */
const SUBAGENT_WORK_STATE: Record<SubagentLineState, WorkState> = {
  working: "working",
  queued: "queued",
  done: "ready",
  failed: "failed",
  stopped: "stopped",
  "needs-you": "needs-you",
  waiting: "waiting",
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

/** A working delegate moves; while the run's own line moves it holds still in the working color. */
function SubagentMark(props: { state: SubagentLineState; moving: boolean }) {
  return (
    <StateMark
      state={SUBAGENT_WORK_STATE[props.state]}
      size="xs"
      motion={props.state === "working" && props.moving ? "moving" : "still"}
      xstyle={styles.mark}
    />
  );
}

const styles = stylex.create({
  mark: {
    marginInlineEnd: vars["--ads-space-4"],
    verticalAlign: "-2px",
  },
});
