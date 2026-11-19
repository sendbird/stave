import { useCallback, useEffect, useState } from "react";
import { CircleAlert } from "lucide-react";
import { i18n, useTranslation } from "@/i18n";
import { formatDuration, formatTimeAgo } from "@/i18n/format";
import { Button } from "@/components/ui";
import { StatusDot } from "@/components/aui/components/StatusDot";
import { sx } from "@/components/aui/utils/stylex";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { isTarsResponsibilityTerminal } from "@/lib/tars/attention";
import type { TarsLiveProgress, TarsLiveStage, TarsProgressEntry } from "@/lib/tars/live-progress";
import type { TarsResponsibility } from "@/lib/tars/types";
import { TarsWorkMark } from "./TarsRunMonitor";
import { useTarsLiveProgress } from "./use-tars-live-progress";
import { tarsLiveStyles as styles } from "./tars-live.styles";

type LiveRow = Pick<TarsResponsibility, "id" | "title" | "state" | "agentRunId" | "taskId">;

/**
 * What Stave last observed about the work, in one line:
 * - running, turn streaming: what the turn is doing and when it was seen;
 * - running between turns: that no turn runs now, and the last update;
 * - running with nothing observed for a while: how long, in the warning ink;
 * - no run observed in this window: says so, never a guess;
 * - waiting, paused or queued work with a run: its last update.
 * Ended work, and work that never had a run, shows no line.
 */
/** Whether `TarsLiveLine` has anything to say, so a caller can leave out its slot. */
export function tarsLiveLineShows(row: Pick<TarsResponsibility, "state">, live: TarsLiveProgress) {
  if (isTarsResponsibilityTerminal(row)) return false;
  return live.running || (live.freshness !== "none" && live.observedAt !== null);
}

export function TarsLiveLine({ row, live, now }: { row: Pick<TarsResponsibility, "state" | "agentRunId">; live: TarsLiveProgress; now: number }) {
  const { t } = useTranslation(["shell"]);
  if (!tarsLiveLineShows(row, live)) return null;
  const age = live.observedAt !== null ? formatTimeAgo(live.observedAt, now) : null;
  if (!live.running) {
    if (live.freshness === "none" || age === null) return null;
    return <p className={sx(styles.line)} data-tars-live-line="" data-tars-live-freshness="recent">
      <span className={sx(styles.lineText)}>{t("shell:tars.live.lastUpdate", { time: age })}</span></p>;
  }
  if (live.freshness === "none") {
    return <p className={sx(styles.line)} data-tars-live-line="" data-tars-live-freshness="none">
      <span className={sx(styles.lineText)}>{t(row.agentRunId ? "shell:tars.live.notObserved" : "shell:tars.live.notStarted")}</span></p>;
  }
  if (live.freshness === "stale") {
    const quiet = live.observedAt !== null ? formatDuration(Math.max(0, now - live.observedAt), { units: 1 }) : null;
    return <p className={sx(styles.line, styles.lineStale)} data-tars-live-line="" data-tars-live-freshness="stale" role="status">
      <CircleAlert aria-hidden className={sx(styles.lineIcon)} />
      <span className={sx(styles.lineText)}>{live.activity
        ? t("shell:tars.live.staleStep", { activity: live.activity.text, duration: formatDuration(Math.max(0, now - live.activity.at), { units: 1 }) })
        : quiet ? t("shell:tars.live.stale", { duration: quiet }) : t("shell:tars.live.staleUnknown")}</span></p>;
  }
  if (live.activity) {
    return <p className={sx(styles.line)} data-tars-live-line="" data-tars-live-freshness={live.freshness}>
      <span className={sx(styles.lineText, styles.activity)} data-tars-live-activity="">{live.activity.text}</span>
      <span aria-hidden>·</span>
      <span className={sx(styles.age)}>{t("shell:tars.live.observed", { time: formatTimeAgo(live.activity.at, now) })}</span></p>;
  }
  // No step to name: say what is known about the turn, never that one runs or ended when it was not observed.
  const turnKey = live.turn === "active" ? "shell:tars.live.turnNoStep" : live.turn === "ended" ? "shell:tars.live.betweenTurns" : "shell:tars.live.turnUnknown";
  return <p className={sx(styles.line)} data-tars-live-line="" data-tars-live-freshness={live.freshness} data-tars-live-turn={live.turn}>
    <span className={sx(styles.lineText)}>{t(turnKey)}</span>
    {age ? <><span aria-hidden>·</span><span className={sx(styles.age)}>{t("shell:tars.live.lastUpdate", { time: age })}</span></> : null}</p>;
}

/** "Stage 2 of 3 · Find the cause · attempt 2": where the active run stands. */
export function describeTarsLiveStage(stage: TarsLiveStage) {
  return stage.attempt > 1
    ? i18n.t("shell:tars.live.stageAttempt", { position: stage.position, total: stage.total, title: stage.title, attempt: stage.attempt })
    : i18n.t("shell:tars.live.stage", { position: stage.position, total: stage.total, title: stage.title });
}

const ENTRY_TONE = { done: "success", attention: "warning", neutral: "neutral" } as const satisfies Record<TarsProgressEntry["tone"], "success" | "warning" | "neutral">;

/**
 * The run's recent progress, newest first, each with how long ago it happened.
 * `compact` is the tray card's history: muted rows (still the 13px live-text
 * row) under the live line, so what happened never outweighs what needs the
 * user below it.
 */
export function TarsRecentProgress({ entries, now, title, compact }: { entries: readonly TarsProgressEntry[]; now: number; title?: boolean; compact?: boolean }) {
  const { t } = useTranslation(["shell"]);
  if (!entries.length) return null;
  const label = t("shell:tars.live.recent");
  return <div className={sx(styles.recent)} data-tars-recent-progress={compact ? "compact" : ""}>
    {title ? <p className={sx(styles.recentTitle)}>{label}</p> : null}
    <ol className={sx(styles.recent)} aria-label={label}>
      {entries.map((entry) => <li key={entry.id} className={sx(styles.recentRow)} data-tars-recent-entry={entry.tone}>
        <StatusDot tone={ENTRY_TONE[entry.tone]} size="sm" xstyle={styles.recentDot} />
        <span className={sx(styles.recentText, compact && styles.recentTextCompact)}>{entry.text}</span>
        <time className={sx(styles.recentAge)} dateTime={entry.at}>{formatTimeAgo(entry.at, now)}</time>
      </li>)}
    </ol>
  </div>;
}

/** Reads one running piece of work's progress to tell the strip when it has gone quiet; it draws nothing. */
function TarsRunningWatch({ row, run, onStale }: {
  row: LiveRow; run: AgentRunDetail | null | undefined;
  onStale: (id: string, stale: boolean) => void;
}) {
  const { live } = useTarsLiveProgress(row, run, { recentLimit: 0 });
  const stale = live.running && live.freshness === "stale";
  useEffect(() => { onStale(row.id, stale); }, [onStale, row.id, stale]);
  useEffect(() => () => onStale(row.id, false), [onStale, row.id]);
  return null;
}

/**
 * The composer band's one status line, above the message field: how much work
 * runs now, and how many of those have gone quiet (nothing observed for a
 * while). What each piece of work is doing is its card's to say, so the line
 * opens the Work tray instead of listing the work again. Nothing shows while
 * nothing runs.
 */
export function TarsRunningStrip({ items, onShowAll }: {
  items: ReadonlyArray<{ row: LiveRow; run: AgentRunDetail | null | undefined }>;
  /** Opens the Work tray, where each running card is; absent, the line is plain text. */
  onShowAll?: () => void;
}) {
  const { t } = useTranslation(["shell"]);
  const [staleIds, setStaleIds] = useState<ReadonlySet<string>>(() => new Set());
  const onStale = useCallback((id: string, stale: boolean) => setStaleIds((current) => {
    if (current.has(id) === stale) return current;
    const next = new Set(current);
    if (stale) next.add(id); else next.delete(id);
    return next;
  }), []);
  if (!items.length) return null;
  const stale = items.filter((item) => staleIds.has(item.row.id)).length;
  const summary = <>
    <span className={sx(styles.stripMark)} data-tars-running-mark=""><TarsWorkMark state="running" /></span>
    <span className={sx(styles.stripSummary)}>
      <span className={sx(styles.stripCount)}>{t("shell:tars.live.stripSummary", { count: items.length })}</span>
      {stale ? <><span aria-hidden>·</span>
        <span className={sx(styles.stripAttention)} data-tars-running-stale={stale}>
          <CircleAlert aria-hidden className={sx(styles.lineIcon)} />{t("shell:tars.live.stripStale", { count: stale })}</span></> : null}
    </span>
  </>;
  return <section aria-label={t("shell:tars.live.stripLabel", { count: items.length })} data-tars-running-strip={items.length} className={sx(styles.stripSection)}>
    {items.map((item) => <TarsRunningWatch key={item.row.id} row={item.row} run={item.run} onStale={onStale} />)}
    {onShowAll ? <Button variant="ghost" size="sm" layout="host" xstyle={[styles.stripStatus, styles.stripOpener]} data-tars-running-status=""
      title={t("shell:tars.tray.indicator.show")} onClick={onShowAll}
      aria-label={stale ? t("shell:tars.live.stripSummaryWithStale", { count: items.length, stale }) : undefined}>{summary}</Button>
      : <p data-tars-running-status="" className={sx(styles.stripStatus)}>{summary}</p>}
  </section>;
}
