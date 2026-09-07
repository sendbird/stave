import * as stylex from "@stylexjs/stylex";
import type * as React from "react";

import { vars } from "../tokens/tokens.stylex";
import { cx, sx, type XstyleProp } from "../utils/stylex";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type PriorityIconProps = Omit<
  React.ComponentProps<"span">,
  "children"
> & {
  /** Issue priority the glyph communicates. */
  priority: Priority;
} & XstyleProp;

export type WorkflowState =
  "backlog" | "todo" | "inProgress" | "inReview" | "done" | "canceled";

export type StateIconProps = Omit<React.ComponentProps<"span">, "children"> & {
  /** Workflow state the glyph communicates. */
  state: WorkflowState;
  /**
   * Completion fraction (0–1) for the `inProgress` pie arc. Ignored by other
   * states. Defaults to a half pie so "in progress" is legible without data.
   */
  progress?: number;
} & XstyleProp;

const priorityText: Record<Priority, string> = {
  high: "High priority",
  low: "Low priority",
  medium: "Medium priority",
  none: "No priority",
  urgent: "Urgent priority",
};

/** Bars filled per priority level (ascending: short → tall). */
const priorityFilledBars: Record<Exclude<Priority, "urgent">, number> = {
  high: 3,
  low: 1,
  medium: 2,
  none: 0,
};

const PRIORITY_BOX = 16;

/**
 * Issue priority glyph (five priority levels: No / Low / Medium / High /
 * Urgent). Three ascending bars fill left-to-right by level; `urgent` swaps to
 * a filled warning square with an exclamation mark. The filled mark follows the
 * ordinal priority family (blue → amber → orange → brand coral-red); empty bars
 * stay neutral, and semantic color remains confined to the small glyph.
 *
 * Purely presentational: exposes `role="img"` with an auto `aria-label`
 * naming the level, so color/shape is never the only signal.
 */
export function PriorityIcon({
  className,
  priority,
  xstyle,
  ...props
}: PriorityIconProps) {
  return (
    <span
      {...props}
      aria-label={priorityText[priority]}
      className={cx(
        sx(styles.root, priorityToneStyles[priority], xstyle),
        className,
      )}
      role="img"
    >
      {priority === "urgent" ? (
        <svg
          aria-hidden
          height={PRIORITY_BOX}
          viewBox={`0 0 ${PRIORITY_BOX} ${PRIORITY_BOX}`}
          width={PRIORITY_BOX}
        >
          <rect
            className={sx(styles.urgentSquare)}
            height={13}
            rx={3.5}
            width={13}
            x={1.5}
            y={1.5}
          />
          <rect
            className={sx(styles.urgentMark)}
            height={5.5}
            rx={0.75}
            width={1.5}
            x={7.25}
            y={3.75}
          />
          <circle className={sx(styles.urgentMark)} cx={8} cy={11.5} r={1} />
        </svg>
      ) : (
        <svg
          aria-hidden
          height={PRIORITY_BOX}
          viewBox={`0 0 ${PRIORITY_BOX} ${PRIORITY_BOX}`}
          width={PRIORITY_BOX}
        >
          {[6, 9, 12].map((barHeight, index) => (
            <rect
              className={sx(
                index < priorityFilledBars[priority]
                  ? styles.barFilled
                  : styles.barMuted,
              )}
              height={barHeight}
              key={barHeight}
              rx={1}
              width={3}
              x={1.5 + index * 5}
              y={14.5 - barHeight}
            />
          ))}
        </svg>
      )}
    </span>
  );
}

const stateText: Record<WorkflowState, string> = {
  backlog: "Backlog",
  canceled: "Canceled",
  done: "Done",
  inProgress: "In Progress",
  inReview: "In Review",
  todo: "Todo",
};

const STATE_BOX = 16;
const STATE_CENTER = STATE_BOX / 2;
const RING_RADIUS = 6;
const RING_STROKE = 2;
const PIE_RADIUS = 3.5;

function clampProgress(progress: number): number {
  return Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
}

/**
 * `M center → top → arc` pie wedge covering `fraction` of the inner disc,
 * starting at 12 o'clock and sweeping clockwise (the fractional
 * in-progress ring).
 */
function piePath(fraction: number): string {
  const bounded = clampProgress(fraction);
  const angle = 2 * Math.PI * bounded;
  const endX = STATE_CENTER + PIE_RADIUS * Math.sin(angle);
  const endY = STATE_CENTER - PIE_RADIUS * Math.cos(angle);
  const largeArc = bounded > 0.5 ? 1 : 0;
  return [
    `M ${STATE_CENTER} ${STATE_CENTER}`,
    `L ${STATE_CENTER} ${STATE_CENTER - PIE_RADIUS}`,
    `A ${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${endX} ${endY}`,
    "Z",
  ].join(" ");
}

/**
 * Workflow-state glyph (six workflow states): dashed ring for
 * `backlog`, hollow ring for `todo`, ring with a fractional pie fill for
 * `inProgress` (pass `progress` 0–1), three-quarter pie for `inReview`,
 * filled circle + check for `done`, muted filled × for `canceled`.
 *
 * Semantic color stays on the 16px glyph only: backlog/todo use neutral text
 * tokens, in-progress = workflow blue, in-review = workflow amber, done =
 * workflow green, canceled = subtle ink. Shape differs per state, so color is
 * never the only signal, and `role="img"` + auto `aria-label` name the state
 * for assistive tech.
 */
export function StateIcon({
  className,
  progress,
  state,
  xstyle,
  ...props
}: StateIconProps) {
  const pieFraction =
    state === "inReview"
      ? 0.75
      : state === "inProgress"
        ? (progress ?? 0.5)
        : 0;
  const boundedFraction = clampProgress(pieFraction);

  const ariaLabel =
    state === "inProgress" && progress != null
      ? `${stateText.inProgress} (${Math.round(boundedFraction * 100)}%)`
      : stateText[state];

  return (
    <span
      {...props}
      aria-label={ariaLabel}
      className={cx(sx(styles.root, stateToneStyles[state], xstyle), className)}
      role="img"
    >
      <svg
        aria-hidden
        height={STATE_BOX}
        viewBox={`0 0 ${STATE_BOX} ${STATE_BOX}`}
        width={STATE_BOX}
      >
        {state === "done" || state === "canceled" ? (
          <circle
            className={sx(styles.discFill)}
            cx={STATE_CENTER}
            cy={STATE_CENTER}
            r={RING_RADIUS + RING_STROKE / 2}
          />
        ) : (
          <circle
            className={sx(styles.ring)}
            cx={STATE_CENTER}
            cy={STATE_CENTER}
            fill="none"
            r={RING_RADIUS}
            // Eight rounded dashes around the 37.7px circumference.
            strokeDasharray={state === "backlog" ? "1 3.71" : undefined}
            strokeLinecap="round"
            strokeWidth={RING_STROKE}
          />
        )}
        {(state === "inProgress" || state === "inReview") &&
        boundedFraction > 0 ? (
          boundedFraction >= 1 ? (
            <circle
              className={sx(styles.discFill)}
              cx={STATE_CENTER}
              cy={STATE_CENTER}
              r={PIE_RADIUS}
            />
          ) : (
            <path
              className={sx(styles.discFill)}
              d={piePath(boundedFraction)}
            />
          )
        ) : null}
        {state === "done" ? (
          <path
            className={sx(styles.glyphStroke)}
            d="M5 8.3 L7.1 10.4 L11.2 5.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={RING_STROKE}
          />
        ) : null}
        {state === "canceled" ? (
          <path
            className={sx(styles.glyphStroke)}
            d="M5.2 5.2 L10.8 10.8 M10.8 5.2 L5.2 10.8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={RING_STROKE}
          />
        ) : null}
      </svg>
    </span>
  );
}

const styles = stylex.create({
  root: {
    display: "inline-flex",
    flexShrink: 0,
    lineHeight: 0,
    verticalAlign: "middle",
  },
  barFilled: {
    fill: "currentColor",
  },
  barMuted: {
    fill: vars.colorBorder,
  },
  urgentSquare: {
    fill: "currentColor",
  },
  urgentMark: {
    fill: vars.colorTextInverted,
  },
  ring: {
    stroke: "currentColor",
  },
  discFill: {
    fill: "currentColor",
  },
  glyphStroke: {
    stroke: vars.colorTextInverted,
  },
  stateBacklog: {
    color: vars.colorTextSubtle,
  },
  stateTodo: {
    color: vars.colorTextMuted,
  },
  stateInProgress: {
    color: vars.colorWorkflowInProgress,
  },
  stateInReview: {
    color: vars.colorWorkflowInReview,
  },
  stateDone: {
    color: vars.colorWorkflowDone,
  },
  stateCanceled: {
    color: vars.colorTextMuted,
  },
  priorityNone: {
    // The quietest step of the priority ramp, not a text colour. Borrowing
    // `colorTextMuted` here made "no priority" the only level painted from
    // outside the ramp, so it read as label text rather than as the ramp's
    // zero — and it tracked the text ramp whenever that moved.
    color: vars.colorPriorityNone,
  },
  priorityLow: {
    color: vars.colorPriorityLow,
  },
  priorityMedium: {
    color: vars.colorPriorityMedium,
  },
  priorityHigh: {
    color: vars.colorPriorityHigh,
  },
  priorityUrgent: {
    color: vars.colorPriorityUrgent,
  },
});

const priorityToneStyles = {
  high: styles.priorityHigh,
  low: styles.priorityLow,
  medium: styles.priorityMedium,
  none: styles.priorityNone,
  urgent: styles.priorityUrgent,
} as const;

const stateToneStyles = {
  backlog: styles.stateBacklog,
  canceled: styles.stateCanceled,
  done: styles.stateDone,
  inProgress: styles.stateInProgress,
  inReview: styles.stateInReview,
  todo: styles.stateTodo,
} as const;
