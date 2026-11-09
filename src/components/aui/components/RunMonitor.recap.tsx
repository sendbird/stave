import { i18n } from "@/i18n";
import type * as React from "react";

import { agentMotion } from "../recipes/agent-motion";
import { themeProps } from "../theming/theme-props";
import { cx, sx, type XstyleProp } from "../utils/stylex";
import type { AgentStepState } from "./agent-state";
import { AgentTextSwap } from "./agent-motion";
import { RunStatusTag } from "./RunMonitor.parts";
import { runStyles as styles } from "./RunMonitor.styles";
import type { WorkState } from "./state-vocabulary";

/**
 * The props `RunMonitor variant="recap"` reads (F7, 2026-11-08) — what a
 * finished run returned and whether a person has checked it. It replaced the
 * separate `RunRecap` component, which was removed on 2026-11-08.
 */
export type RunMonitorRecapProps = {
  /**
   * Recap: trailing slot for what the runtime supports — Review, Open PR.
   * On a card it is the host extension that leads the footer.
   */
  actions?: React.ReactNode;
  /** Recap: when it came back, caller-formatted — "Returned 1h ago". */
  returned?: React.ReactNode;
  /**
   * Recap: whether a person has checked the result. A returned run is not a
   * verified run. Host change: without a value the recap states no review at
   * all (upstream defaults to "unreviewed"), because a host that does not
   * track review must not claim either answer.
   */
  review?: "unreviewed" | "reviewed";
  /** Recap. @default `ui:runRecap.reviewed` */
  reviewedLabel?: React.ReactNode;
  /** Recap: what came back, in a sentence — "Opened pull request #1284". */
  summary?: React.ReactNode;
  /** Recap. @default `ui:runRecap.unreviewed` */
  unreviewedLabel?: React.ReactNode;
};

type RunRecapViewProps = Omit<
  React.ComponentProps<"section">,
  "children" | "title"
> &
  RunMonitorRecapProps & {
    icon?: React.ReactNode;
    status: AgentStepState;
    statusLabel: string;
    statusTag?: React.ReactNode;
    title: React.ReactNode;
    titleId: string;
    workState?: WorkState;
  } & XstyleProp;

/**
 * A finished run, returned to wherever the reader is (G1, 2026-11-07): the
 * same lifted object as the card, reduced to what came back. "Done" means the
 * agent returned, not that the work is right, so the meta line carries the
 * review state when the caller knows it.
 *
 * It keeps the `run-recap` theme target and the DOM the removed `RunRecap`
 * shipped (`data-run-review`, `data-run-status`), so a theme or test written
 * against that markup still matches.
 */
export function RunRecapView({
  actions,
  className,
  icon,
  returned,
  review,
  reviewedLabel = i18n.t("ui:runRecap.reviewed"),
  status,
  statusLabel,
  statusTag,
  summary,
  title,
  titleId,
  unreviewedLabel = i18n.t("ui:runRecap.unreviewed"),
  workState,
  xstyle,
  ...props
}: RunRecapViewProps) {
  const theme = themeProps("run-recap");
  const reviewText =
    review === "reviewed"
      ? reviewedLabel
      : review === "unreviewed"
        ? unreviewedLabel
        : null;

  return (
    <section
      {...props}
      {...theme}
      aria-labelledby={titleId}
      className={cx(
        sx(styles.card, styles.recap, agentMotion.enterCard, xstyle),
        theme.className,
        className,
      )}
      data-run-review={review}
      data-run-status={status}
    >
      {icon ? (
        <span aria-hidden className={sx(styles.tile)}>
          {icon}
        </span>
      ) : null}
      <div className={sx(styles.recapBody)}>
        <div className={sx(styles.head)}>
          <div className={sx(styles.id)}>
            <h3 className={sx(styles.title)} id={titleId}>
              {title}
            </h3>
          </div>
          {statusTag ?? (
            <RunStatusTag
              label={statusLabel}
              status={status}
              workState={workState}
            />
          )}
        </div>
        {summary != null ? (
          <div className={sx(styles.recapResult)}>{summary}</div>
        ) : null}
        {returned != null || reviewText != null ? (
          <div className={sx(styles.meta)}>
            {returned}
            {returned != null && reviewText != null ? " · " : null}
            {/* Marking the run reviewed fades the word over rather than cutting it. */}
            {reviewText != null ? (
              <AgentTextSwap swapKey={review}>{reviewText}</AgentTextSwap>
            ) : null}
          </div>
        ) : null}
      </div>
      {actions != null ? (
        <div className={sx(styles.foot)}>{actions}</div>
      ) : null}
    </section>
  );
}
