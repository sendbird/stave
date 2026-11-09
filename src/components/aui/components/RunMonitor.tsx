import { i18n } from "@/i18n";
import { ArrowUpRight, Pause, Square } from "lucide-react";
import * as React from "react";

import { agentMotion, agentStagger } from "../recipes/agent-motion";
import { textShimmer } from "../recipes/text-shimmer";
import { themeProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import { agentStateWorkState, type AgentStepState } from "./agent-state";
import { AgentTextSwap, AgentHighlight, useArrivalRank } from "./agent-motion";
import { Button } from "./Button";
import { Loader } from "./Loader";
import type { PlanStepStatus } from "./Plan.parts";
import { RunRecapView, type RunMonitorRecapProps } from "./RunMonitor.recap";
import { StateMark } from "./StateMark";
import type { WorkState } from "./state-vocabulary";
import { nodeText } from "./Thinking.parts";
import { isLiveRunState } from "./ToolRun.parts";
import { VisuallyHidden } from "./VisuallyHidden";
import {
  DecisionWell,
  ProgressStrip,
  RunStatusTag,
  StepMark,
} from "./RunMonitor.parts";
import { runStyles as styles } from "./RunMonitor.styles";

export { RunStatusTag } from "./RunMonitor.parts";
export { runStyles } from "./RunMonitor.styles";
export type { RunMonitorRecapProps } from "./RunMonitor.recap";

/**
 * A recent step's mark. Plan's step states, narrowed to the three a finished
 * or running strip draws (F7): the vocabulary is shared, the row is not —
 * a monitor step carries a `tool` and a measured `duration` and has no
 * substeps, so `PlanStepItem` itself is not a clean fit.
 */
export type RunMonitorStepStatus = Extract<
  PlanStepStatus,
  "done" | "failed" | "running"
>;

export type RunMonitorStep = {
  /** Measured duration, caller-formatted ("0:06", "12.4s"). Never estimated. */
  duration?: React.ReactNode;
  id: string;
  label: React.ReactNode;
  /** @default "done" */
  status?: RunMonitorStepStatus;
  /** Machine name of the tool the step used: `db.describe`. */
  tool?: React.ReactNode;
};

export type RunMonitorDecision = {
  /** @default `ui:runMonitor.allowOnce` */
  allowLabel?: React.ReactNode;
  /** @default `ui:runMonitor.deny` */
  denyLabel?: React.ReactNode;
  /** What approving it does, in a sentence. */
  description?: React.ReactNode;
  /** Key facts the reader decides on: Database · ledger-prod. */
  facts?: ReadonlyArray<{ label: React.ReactNode; value: React.ReactNode }>;
  onAllow?: () => void;
  onDeny?: () => void;
  /** The action the run is waiting to take: "Run migration 0042_ledger". */
  title: React.ReactNode;
};

/** Host extension: one stage of a labelled strip. */
export type RunMonitorSegment = {
  /** The stage's name with its state, read by assistive tech and as a tooltip. */
  label: string;
  state: "done" | "now" | "pending" | "stopped";
};

export type RunMonitorProgress = {
  /** Steps finished. */
  completed: number;
  /**
   * Overrides the readout. Defaults to "3 / 5" (the step in hand) on a card
   * and `ui:runMonitor.doneOf` on a panel. `false` hides it (host extension:
   * a run that did not record a step count says nothing rather than a guess).
   */
  label?: React.ReactNode | false;
  /**
   * Host extension: one labelled segment per stage, drawn as an ordered list
   * instead of the anonymous `role="img"` strip, for a run whose stages have
   * names and can stop short. `completed`/`total` still drive the readout.
   */
  segments?: readonly RunMonitorSegment[];
  /** Host extension: the labelled strip's accessible name. */
  stripLabel?: string;
  total: number;
};

export type RunMonitorProps = Omit<
  React.ComponentProps<"section">,
  "children" | "title"
> &
  RunMonitorRecapProps & {
    /** Body under the header on a panel — typically a `Plan`. */
    children?: React.ReactNode;
    /** What the run is doing right now, with its own measured clock. */
    current?: {
      elapsed?: React.ReactNode;
      /**
       * Host: identity of the current step (step id + attempt). A new key
       * replays the highlight and swaps the label; without it they follow the
       * label's text, which a JSX label does not have.
       */
      key?: React.Key;
      label: React.ReactNode;
    };
    /** A decision the run is blocked on. Pair with `status="approval"`. */
    decision?: RunMonitorDecision;
    /** Run clock, caller-formatted from observed timestamps. Never estimated. */
    elapsed?: React.ReactNode;
    /** Object glyph in the 28px tile. Omit for no tile. */
    icon?: React.ReactNode;
    /** @default `ui:runMonitor.cancel` on a card, `ui:runMonitor.stop` on a panel */
    cancelLabel?: string;
    /** Who is running it, and against what: "Release agent · ledger-prod". */
    meta?: React.ReactNode;
    /** Rendered only when supplied — the runtime decides whether it can stop. */
    onCancel?: () => void;
    /** Opens the run's full log. Rendered only when supplied. */
    onOpenLog?: () => void;
    /** Rendered only when supplied — the runtime decides whether it can pause. */
    onPause?: () => void;
    /** @default `ui:runMonitor.log` */
    logLabel?: React.ReactNode;
    /** Host extension: the log button's accessible name, when its word is short. */
    logAriaLabel?: string;
    /** @default `ui:runMonitor.pause` on a card, `ui:runMonitor.pauseRun` on a panel */
    pauseLabel?: string;
    progress?: RunMonitorProgress;
    /** Recent steps with their tool and measured duration (card). */
    steps?: readonly RunMonitorStep[];
    /**
     * Steering input slot (P2 agent-steering) — a composer the runtime reads
     * between steps. Render it only when the runtime accepts notes.
     */
    steer?: React.ReactNode;
    status: AgentStepState;
    /**
     * The state word. Required in the host: the bundle's English
     * `runStatusLabel` table was not installed, and a run's domain names its
     * own states.
     */
    statusLabel: string;
    /**
     * Host extension: replaces the default state tag (a status chip with
     * the state's `StateMark`) for a domain that already draws its own states.
     */
    statusTag?: React.ReactNode;
    title: React.ReactNode;
    /** Host extension: controls at the end of the card footer, after the readout. */
    trailingActions?: React.ReactNode;
    /**
     * Host extension: the work state the marks draw, when the domain's state is
     * finer than `status` (a paused run is `paused` here, not `stopped`).
     * @default `agentStateWorkState[status]`
     */
    workState?: WorkState;
    /**
     * `card` (G1): a 360px-class object for side panels, inboxes and chat
     * results — current-step well, step strip, recent steps, in-surface actions.
     * `panel`: the steering surface — header with clock and icon actions,
     * progress line, a body (`Plan`) and the steer slot.
     * `recap` (F7, was `RunRecap`): a finished run reduced to what came back —
     * `summary`, `returned`, the `review` state and `actions`.
     * @default "card"
     */
    variant?: "card" | "panel" | "recap";
  } & XstyleProp;

/**
 * One agent run as an object you can put anywhere (#809 · G1, 2026-11-07).
 *
 * A run is a BOUNDED object, so it lifts off the tray (`elevationLift`, A3)
 * instead of resting flat like a section. Inside it, everything that is "now"
 * — the current step, the decision it waits on — sits in a recessed well;
 * history is quiet rows; actions are the 24px in-surface rung (A1) except a
 * decision, which keeps the 28px decision rung.
 *
 * Data authority: Pause, Cancel, Log, the steer slot and the decision buttons
 * render only when the caller supplies them; durations and clocks are only the
 * caller's observed values.
 */
export function RunMonitor({
  actions,
  cancelLabel,
  children,
  className,
  current,
  decision,
  elapsed,
  icon,
  logAriaLabel,
  logLabel = i18n.t("ui:runMonitor.log"),
  meta,
  onCancel,
  onOpenLog,
  onPause,
  pauseLabel,
  progress,
  returned,
  review,
  reviewedLabel,
  status,
  statusLabel,
  statusTag,
  steer,
  steps,
  summary,
  title,
  trailingActions,
  unreviewedLabel,
  variant = "card",
  workState,
  xstyle,
  ...props
}: RunMonitorProps) {
  const titleId = React.useId();
  const arrivalRank = useArrivalRank((steps ?? []).map((step) => step.id));
  if (variant === "recap") {
    return (
      <RunRecapView
        {...props}
        actions={actions}
        className={className}
        icon={icon}
        returned={returned}
        review={review}
        reviewedLabel={reviewedLabel}
        status={status}
        statusLabel={statusLabel}
        statusTag={statusTag}
        summary={summary}
        title={title}
        titleId={titleId}
        unreviewedLabel={unreviewedLabel}
        workState={workState}
        xstyle={xstyle}
      />
    );
  }
  const theme = themeProps("run-monitor", { variant });
  const live = isLiveRunState(status);
  const panel = variant === "panel";

  const strip = progress ? (
    <ProgressStrip live={live} progress={progress} />
  ) : null;
  const stepIndex = progress
    ? Math.min(
        progress.completed + (live || status === "approval" ? 1 : 0),
        progress.total,
      )
    : 0;
  const progressText =
    !progress || progress.label === false
      ? null
      : (progress.label ??
        (panel
          ? i18n.t("ui:runMonitor.doneOf", {
              completed: progress.completed,
              total: progress.total,
            })
          : `${stepIndex} / ${progress.total}`));

  return (
    <section
      {...props}
      {...theme}
      aria-labelledby={titleId}
      className={cx(
        sx(styles.card, panel && styles.panel, agentMotion.enterCard, xstyle),
        theme.className,
        className,
      )}
      data-run-status={status}
    >
      <div className={sx(styles.head, panel && styles.headPanel)}>
        {icon ? (
          <span aria-hidden className={sx(styles.tile)}>
            {icon}
          </span>
        ) : null}
        <div className={sx(styles.id)}>
          <h3 className={sx(styles.title)} id={titleId}>
            {title}
            <VisuallyHidden>{`, ${statusLabel}`}</VisuallyHidden>
          </h3>
          {meta != null ? <div className={sx(styles.meta)}>{meta}</div> : null}
        </div>
        {statusTag ?? (
          <RunStatusTag
            label={statusLabel}
            status={status}
            workState={workState}
          />
        )}
        {panel && elapsed != null ? (
          <span className={sx(styles.clock)}>{elapsed}</span>
        ) : null}
        {panel && onPause ? (
          <Button
            aria-label={pauseLabel ?? i18n.t("ui:runMonitor.pauseRun")}
            iconOnly
            onClick={onPause}
            size="2xs"
            variant="outlined"
          >
            <Pause aria-hidden size={14} />
          </Button>
        ) : null}
        {panel && onCancel ? (
          <Button
            aria-label={cancelLabel ?? i18n.t("ui:runMonitor.stop")}
            iconOnly
            onClick={onCancel}
            size="2xs"
            variant="outlined"
          >
            <Square aria-hidden size={12} />
          </Button>
        ) : null}
      </div>

      {panel && progress ? (
        <div className={sx(styles.progressRow)}>
          {strip}
          {progressText != null ? (
            <span className={sx(styles.meta)}>{progressText}</span>
          ) : null}
        </div>
      ) : null}

      {!panel && current ? (
        <div className={sx(styles.well, styles.now, agentMotion.layerHost)}>
          {/* A new live step is highlighted once; a settled one stays still. */}
          {live ? (
            <AgentHighlight
              highlightKey={current.key ?? nodeText(current.label) ?? undefined}
            />
          ) : null}
          {live ? (
            <span aria-hidden className={sx(styles.nowMark)}>
              <Loader aria-hidden size="xs" tone="inherit" variant="spinner" />
            </span>
          ) : (
            <span aria-hidden className={sx(styles.nowMarkSettled)}>
              <StateMark
                motion="still"
                size="sm"
                state={workState ?? agentStateWorkState[status]}
              />
            </span>
          )}
          <span className={sx(styles.nowText)}>
            <AgentTextSwap
              swapKey={current.key}
              truncate
              xstyle={live ? textShimmer.sweep : undefined}
            >
              {current.label}
            </AgentTextSwap>
          </span>
          {current.elapsed != null ? (
            <span className={sx(styles.clock)}>{current.elapsed}</span>
          ) : null}
        </div>
      ) : null}

      {!panel && strip && !decision ? strip : null}

      {!panel && steps && steps.length > 0 ? (
        <ol className={sx(styles.steps)}>
          {steps.map((step) => (
            <li
              className={sx(
                styles.step,
                agentMotion.enter,
                agentStagger(arrivalRank(step.id)),
                step.status === "running" && agentMotion.layerHost,
              )}
              key={step.id}
            >
              {step.status === "running" ? <AgentHighlight /> : null}
              <StepMark status={step.status ?? "done"} />
              <span className={sx(styles.stepLabel)}>
                {step.label}
                {step.tool != null ? (
                  <span className={sx(styles.stepTool)}>{step.tool}</span>
                ) : null}
              </span>
              {step.duration != null ? (
                <span className={sx(styles.clock)}>{step.duration}</span>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {decision ? <DecisionWell decision={decision} /> : null}

      {panel && children != null ? (
        <div className={sx(styles.body)}>{children}</div>
      ) : null}
      {!panel && children != null ? (
        <div className={sx(styles.cardBody)}>{children}</div>
      ) : null}

      {!panel &&
      (decision?.onAllow ||
        decision?.onDeny ||
        onPause ||
        onCancel ||
        onOpenLog ||
        actions != null ||
        trailingActions != null ||
        progressText != null) ? (
        <div className={sx(styles.foot)}>
          {decision?.onAllow ? (
            <Button onClick={decision.onAllow} size="xs" variant="primary">
              {decision.allowLabel ?? i18n.t("ui:runMonitor.allowOnce")}
            </Button>
          ) : null}
          {decision?.onDeny ? (
            <Button onClick={decision.onDeny} size="xs" variant="outlined">
              {decision.denyLabel ?? i18n.t("ui:runMonitor.deny")}
            </Button>
          ) : null}
          {actions}
          {!decision && onPause ? (
            <Button onClick={onPause} size="2xs" variant="secondary">
              {pauseLabel ?? i18n.t("ui:runMonitor.pause")}
            </Button>
          ) : null}
          {!decision && onCancel ? (
            <Button onClick={onCancel} size="2xs" variant="secondary">
              {cancelLabel ?? i18n.t("ui:runMonitor.cancel")}
            </Button>
          ) : null}
          <span className={sx(styles.spacer)} />
          {progressText != null ? (
            <span className={sx(styles.clock)}>{progressText}</span>
          ) : null}
          {onOpenLog ? (
            <Button
              aria-label={logAriaLabel}
              onClick={onOpenLog}
              size="2xs"
              variant="quiet"
            >
              {logLabel}
              <ArrowUpRight aria-hidden size={12} />
            </Button>
          ) : null}
          {trailingActions}
        </div>
      ) : null}

      {steer != null ? (
        <div className={sx(styles.steer, !panel && styles.steerCard)}>
          {steer}
        </div>
      ) : null}
    </section>
  );
}
