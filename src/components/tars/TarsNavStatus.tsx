import { useMemo } from "react";
import { i18n, useTranslation } from "@/i18n";
import { StateMark } from "@/components/aui/components/StateMark";
import { sx } from "@/components/aui/utils/stylex";
import { CountBadge } from "@/components/system/CountBadge";
import { selectTarsAttentionRows } from "@/lib/tars/attention";
import { isTarsWorkRunning } from "@/lib/tars/live-progress";
import { useFleetAttentionStore } from "@/store/fleet-attention-store";
import { useTarsResponsibilities } from "@/store/tars-snapshot-store";
import { tarsLiveStyles as styles } from "./tars-live.styles";

export interface TarsNavCounts {
  /** Work that actually runs now (never queued, paused, waiting or taken over). */
  running: number;
  /** Fleet's rows for Tars work, the number the Tars tray and Fleet show. */
  needsYou: number;
}

/**
 * The sidebar's Tars counts, from the app-wide Tars snapshot and Fleet's
 * attention rows. Both selectors return stored references; the counts are
 * derived outside them.
 */
export function useTarsNavCounts(): TarsNavCounts {
  const responsibilities = useTarsResponsibilities();
  const items = useFleetAttentionStore((state) => state.snapshot.items);
  return useMemo(() => ({
    running: responsibilities.filter(isTarsWorkRunning).length,
    needsYou: selectTarsAttentionRows(items, responsibilities).rows.length,
  }), [items, responsibilities]);
}

/** "1 running · 1 needs you", or null when nothing runs or waits on the user. */
export function describeTarsNavStatus(counts: TarsNavCounts): string | null {
  const parts = [
    counts.running > 0 ? i18n.t("shell:tars.tray.indicator.running", { count: counts.running }) : null,
    counts.needsYou > 0 ? i18n.t("shell:tars.tray.indicator.needsYou", { count: counts.needsYou }) : null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" · ") : null;
}

/** The accessible name of the sidebar's Tars entry: its name, then what runs and what needs the user. */
export function describeTarsNavLabel(counts: TarsNavCounts): string {
  const status = describeTarsNavStatus(counts);
  return status ? i18n.t("shell:tars.nav.label", { name: i18n.t("shell:tars.title"), status }) : i18n.t("shell:tars.title");
}

/**
 * The end of the sidebar's Tars row: the moving running mark with the number
 * of running work, then the warning count of what needs the user, as the
 * Agents row says its work. Nothing while nothing runs or waits.
 */
export function TarsNavStatus({ counts }: { counts: TarsNavCounts }) {
  useTranslation(["shell"]);
  if (!counts.running && !counts.needsYou) return null;
  return <span className={sx(styles.navStatus)} aria-hidden data-tars-nav-status="">
    {counts.running ? <span className={sx(styles.navRunning)} data-tars-nav-running={counts.running}>
      <StateMark state="working" size="xs" />{counts.running}</span> : null}
    {counts.needsYou ? <span data-tars-nav-needs-you={counts.needsYou}><CountBadge count={counts.needsYou} tone="warning" /></span> : null}
  </span>;
}
