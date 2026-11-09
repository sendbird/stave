import { i18n } from "@/i18n";
import { Check, X } from "lucide-react";
import * as React from "react";

import { agentMotion } from "../recipes/agent-motion";
import { sx } from "../utils/stylex";
import {
  agentStateTone,
  agentStateWorkState,
  type AgentStepState,
} from "./agent-state";
import { AgentGlyphSwap, AgentTextSwap } from "./agent-motion";
import { Badge } from "./Badge";
import { Loader } from "./Loader";
import type {
  RunMonitorDecision,
  RunMonitorProgress,
  RunMonitorStepStatus,
} from "./RunMonitor";
import { runStyles as styles } from "./RunMonitor.styles";
import { StateMark } from "./StateMark";
import type { WorkState } from "./state-vocabulary";
import { VisuallyHidden } from "./VisuallyHidden";

/*
 * RunMonitor's leaf parts, split out for the 500-line source ceiling: the
 * state tag (shared with the recap variant), the decision well, the step strip
 * and the recent-step mark.
 */

/**
 * The default state tag: a status chip with the work state's mark (host; the
 * bundle draws a dot). The word fades to its new text when it changes; the
 * label string is the swap key, so a domain state that is finer than
 * `status` (paused vs. blocked) still swaps.
 */
export function RunStatusTag({
  label,
  status,
  workState,
}: {
  label: string;
  status: AgentStepState;
  workState?: WorkState;
}) {
  return (
    <Badge size="md" tone={badgeTone(status)} xstyle={styles.badge}>
      <StateMark
        motion="still"
        size="xs"
        state={workState ?? agentStateWorkState[status]}
      />
      <AgentTextSwap>{label}</AgentTextSwap>
    </Badge>
  );
}

export function DecisionWell({ decision }: { decision: RunMonitorDecision }) {
  return (
    <div className={sx(styles.well, styles.ask)}>
      <div>
        <div className={sx(styles.askTitle)}>{decision.title}</div>
        {decision.description != null ? (
          <div className={sx(styles.askText)}>{decision.description}</div>
        ) : null}
      </div>
      {decision.facts && decision.facts.length > 0 ? (
        <dl className={sx(styles.facts)}>
          {decision.facts.map((fact, index) => (
            <React.Fragment key={index}>
              <dt className={sx(styles.factLabel)}>{fact.label}</dt>
              <dd className={sx(styles.factValue)}>{fact.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

export function badgeTone(status: AgentStepState) {
  // Running reads as the info hue the step strip uses, not the brand accent.
  return status === "running" || status === "retrying" || status === "resumed"
    ? ("info" as const)
    : agentStateTone[status];
}

const SEGMENT_STYLE = {
  done: styles.segmentDone,
  now: styles.segmentNow,
  pending: null,
  stopped: styles.segmentStopped,
} as const;

export function ProgressStrip({
  live,
  progress,
}: {
  live: boolean;
  progress: RunMonitorProgress;
}) {
  if (progress.segments) {
    return (
      <ol
        aria-label={progress.stripLabel}
        className={sx(styles.strip, styles.stripList)}
        data-run-segments={progress.segments.map((s) => s.state).join(",")}
      >
        {progress.segments.map((segment, index) => (
          <li
            aria-current={segment.state === "now" ? "step" : undefined}
            className={sx(
              styles.segment,
              agentMotion.tone,
              SEGMENT_STYLE[segment.state],
              segment.state === "now" && live && agentMotion.liveFill,
            )}
            key={index}
            title={segment.label}
          >
            <VisuallyHidden>{segment.label}</VisuallyHidden>
          </li>
        ))}
      </ol>
    );
  }
  const total = Math.max(0, Math.floor(progress.total));
  const done = Math.min(total, Math.max(0, Math.floor(progress.completed)));
  return (
    <div
      aria-label={i18n.t("ui:runMonitor.stepOf", {
        step: Math.min(done + 1, total),
        total,
      })}
      className={sx(styles.strip)}
      role="img"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          className={sx(
            styles.segment,
            agentMotion.tone,
            index < done && styles.segmentDone,
            index === done && live && styles.segmentNow,
            index === done && live && agentMotion.liveFill,
          )}
          key={index}
        />
      ))}
    </div>
  );
}

/** A recent step's mark; a changed state cross-fades to its new glyph. */
export function StepMark({ status }: { status: RunMonitorStepStatus }) {
  return (
    <AgentGlyphSwap swapKey={status}>
      <StepShape status={status} />
    </AgentGlyphSwap>
  );
}

function StepShape({ status }: { status: RunMonitorStepStatus }) {
  if (status === "running") {
    return (
      <span aria-hidden className={sx(styles.markLive)}>
        <Loader aria-hidden size="xs" tone="inherit" variant="spinner" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={sx(status === "failed" ? styles.markFailed : styles.markDone)}
    >
      {status === "failed" ? (
        <X size={14} strokeWidth={2} />
      ) : (
        <Check size={14} strokeWidth={2} />
      )}
    </span>
  );
}
