import { getStageDisplayTitle } from "@/lib/agent-runs/stage-display";
import { i18n, useTranslation } from "@/i18n";
import { useMemo } from "react";
import * as stylex from "@stylexjs/stylex";
import { Check, CircleAlert, Hand, type LucideIcon } from "lucide-react";
import { Progress, type ProgressTone } from "@/components/ads/components/Progress";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx, type StyleXValue } from "@/components/ads/utils/stylex";
import { STAGE_STATUS_PRESENTATION, type AgentRunStageRow, type StageState } from "@/lib/agent-runs/agent-run-view";
import { projectStageProgress } from "@/lib/agent-runs/stage-progress";
import { agentRunStyles } from "./agent-runs.styles";

/** Each stage tone fills the bar in the design system's matching tone. */
const PROGRESS_TONE: Record<StageState, ProgressTone> = {
  active: "default",
  waiting: "warning",
  attention: "danger",
  done: "success",
  idle: "default",
  skipped: "default",
};

/**
 * An agent run's stages as one determinate progress bar, led by the stage in
 * progress and where it stands ("Verify 3/6"). One line high, so it fits the
 * composer status line and a Fleet card as well as the Progress tab.
 *
 * Assistive technology reads the bar's value ("Stage 3 of 6, Verify,
 * running") and an ordered list of every stage with its status. The tone is
 * never carried by color alone: a waiting, failed or finished stage also
 * wears its mark before the name.
 *
 * Shared by the composer shelf's run line, the Agent run panel and Fleet cards,
 * so every surface draws the same run the same way.
 */
export function StageTrack(props: {
  rows: readonly AgentRunStageRow[];
  size?: "sm" | "md";
  /** The agent run is paused: the current stage reads as waiting, not running. */
  paused?: boolean;
  /** The run's own verdict when its stages do not name it, such as a stopped agent run. */
  tone?: StageState;
  /** The percent beside the bar. A one-line host that names the count already drops it. */
  showPercent?: boolean;
  "aria-label"?: string;
}) {
  useTranslation();
  const { rows, size = "sm", paused = false, tone, showPercent = true } = props;
  const progress = useMemo(() => projectStageProgress(rows, { paused, tone }), [rows, paused, tone, i18n.language]);
  if (!progress) return null;
  const { current } = progress;
  const title = getStageDisplayTitle(current.stage);
  const mark = MARKS[progress.tone];
  return (
    <div className={sx(styles.container)} data-stage-track="" data-stage-tone={progress.tone}>
      <span className={sx(styles.head, size === "md" && styles.headMd)} title={`${progress.count} · ${title} — ${progress.statusLabel}`} aria-hidden>
        {mark ? <mark.icon aria-hidden strokeWidth={2.5} className={sx(styles.mark, size === "md" && styles.markMd, mark.tone)} /> : null}
        <span className={sx(styles.label)}>{title}</span>
        <span className={sx(styles.count)}>{progress.count}</span>
      </span>
      <Progress
        label={props["aria-label"] ? i18n.t("agentRuns:stageTrack.ariaLabel", { value1: props["aria-label"] }) : i18n.t("agentRuns:stageTrack.ariaLabel2")}
        hideLabel
        hideValue
        size="sm"
        tone={PROGRESS_TONE[progress.tone]}
        value={progress.percent}
        getAriaValueText={() => progress.valueText}
        xstyle={styles.bar}
      />
      {showPercent ? (
        <span aria-hidden className={sx(styles.percent)}>
          {progress.percent}%
        </span>
      ) : null}
      <ol className={sx(agentRunStyles.visuallyHidden)} aria-label={props["aria-label"] ?? i18n.t("agentRuns:stageTrack.ariaLabel3")}>
        {rows.map((row) => {
          const heldByPause = paused && row.current && row.status === "running";
          const statusLabel = heldByPause ? i18n.t("agentRuns:stageTrack.statusLabel") : STAGE_STATUS_PRESENTATION[row.status].label;
          const asks = row.asksFirst && (row.status === "pending" || row.status === "awaiting-sign-off");
          return (
            <li key={row.stage.id} aria-current={row.current ? "step" : undefined}>
              {row.index + 1}. {getStageDisplayTitle(row.stage)} — {statusLabel}
              {asks ? i18n.t("agentRuns:stageTrack.copy") : ""}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

const styles = stylex.create({
  container: { position: "relative", display: "flex", alignItems: "center", gap: vars["--ads-space-8"], minWidth: 0 },
  /** The stage in progress and its count; it gives way before the bar does. */
  head: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-4"],
    flex: "0 1 auto",
    minWidth: 0,
    maxWidth: "60%",
    color: vars["--ads-color-text"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: vars["--ads-line-height-tight"],
    whiteSpace: "nowrap",
  },
  headMd: { fontSize: vars["--ads-font-size-body"] },
  label: { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontWeight: vars["--ads-font-weight-medium"] },
  count: { flex: "0 0 auto", color: vars["--ads-color-text-muted"], fontVariantNumeric: "tabular-nums" },
  mark: { flex: "0 0 auto", width: 12, height: 12 },
  markMd: { width: 14, height: 14 },
  bar: { flex: "1 1 auto", minWidth: "3rem" },
  percent: {
    flex: "0 0 auto",
    // "100%" is the widest value; the bar does not shift as the number grows.
    minWidth: "4ch",
    textAlign: "end",
    color: vars["--ads-color-text-muted"],
    fontSize: vars["--ads-font-size-caption"],
    lineHeight: 1,
    fontVariantNumeric: "tabular-nums",
  },
});

const MARK_TONES = stylex.create({
  waiting: { color: vars["--ads-color-warning-text"] },
  attention: { color: vars["--ads-color-danger-text"] },
  done: { color: vars["--ads-color-success-text"] },
});

/** The head's mark: the tone is never carried by color alone. */
const MARKS: Partial<Record<StageState, { icon: LucideIcon; tone: StyleXValue }>> = {
  waiting: { icon: Hand, tone: MARK_TONES.waiting },
  attention: { icon: CircleAlert, tone: MARK_TONES.attention },
  done: { icon: Check, tone: MARK_TONES.done },
};
