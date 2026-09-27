import { useEffect, useState } from "react";
import * as stylex from "@stylexjs/stylex";
import { BarChart3 } from "lucide-react";
import { vars } from "@/components/ads/tokens/tokens.stylex";
import { sx } from "@/components/ads/utils/stylex";
import { formatCompletionRate, type MissionInsightRow, type MissionInsights } from "@/lib/missions/insights";
import { formatAge } from "@/lib/missions/mission-view";
import { formatCostUsd } from "@/lib/missions/usage";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import { Segmented } from "./Segmented";

const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

export type MissionInsightsLoader = (days: number) => Promise<MissionInsights | null>;

async function loadInsights(days: number): Promise<MissionInsights | null> {
  const response = await window.api?.missions?.insights?.({ days });
  return response?.ok ? response.insights : null;
}

const provider = (providerId: string) => getProviderLabel({ providerId: providerId as ProviderId });
const wait = (row: MissionInsightRow) => (row.signOffWaitAverageMs === null ? "—" : formatAge(row.signOffWaitAverageMs));
const cost = (row: MissionInsightRow) => (row.costPerMission === null ? "—" : formatCostUsd(row.costPerMission));

function ProviderCard({ row }: { row: MissionInsightRow }) {
  const figures: Array<[string, string]> = [
    ["Completed", formatCompletionRate(row)],
    ["Replies from you", String(row.repliesPerMission)],
    ["Reminders to report", String(row.remindersPerMission)],
    ["Stuck stages", String(row.stuckPerMission)],
    ["Sign-offs waited", wait(row)],
    ["Cost each", cost(row)],
  ];
  return (
    <section className={sx(styles.providerCard)} aria-label={`${provider(row.providerId)} missions`}>
      <p className={sx(styles.providerTitle)}>
        {provider(row.providerId)}
        <span className={sx(styles.providerCount)}>
          {row.missions} {row.missions === 1 ? "mission" : "missions"}
        </span>
      </p>
      <dl className={sx(styles.figures)}>
        {figures.map(([label, value]) => (
          <div key={label} className={sx(styles.figure)}>
            <dt className={sx(styles.figureLabel)}>{label}</dt>
            <dd className={sx(styles.figureValue)}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Mission insights: how missions went over a period, per provider and per
 * playbook — the diagnostics behind the report footer's metrics.
 */
export function MissionInsightsView(props: { load?: MissionInsightsLoader } = {}) {
  const [period, setPeriod] = useState<Period>("30");
  const [insights, setInsights] = useState<MissionInsights | null | undefined>(undefined);
  const load = props.load ?? loadInsights;
  useEffect(() => {
    let cancelled = false;
    setInsights(undefined);
    void load(Number(period))
      .catch(() => null)
      .then((result) => {
        if (!cancelled) setInsights(result);
      });
    return () => {
      cancelled = true;
    };
  }, [load, period]);

  return (
    <div className={sx(styles.scroll)}>
      <div className={sx(styles.page)}>
        <header className={sx(styles.header)}>
          <div className={sx(styles.headerText)}>
            <h2 className={sx(styles.title)}>
              <BarChart3 aria-hidden className={sx(styles.titleIcon)} />
              Mission insights
            </h2>
            <p className={sx(styles.lead)}>
              How missions that ended went. Fewer replies and reminders mean a playbook carried the work on its own;
              reminders and stuck stages show where an agent stopped reporting.
            </p>
          </div>
          <span className={sx(styles.period)}>
            <Segmented aria-label="Period" size="xs" value={period} options={PERIODS} onChange={setPeriod} />
          </span>
        </header>

        {insights === undefined ? (
          <p className={sx(styles.note)}>Reading missions…</p>
        ) : insights === null ? (
          <p className={sx(styles.note)}>Mission insights are available in the desktop app.</p>
        ) : insights.rows.length === 0 ? (
          <p className={sx(styles.empty)}>No mission ended in the last {period} days.</p>
        ) : (
          <>
            <div className={sx(styles.providers)}>
              {insights.providers.map((row) => (
                <ProviderCard key={row.providerId} row={row} />
              ))}
            </div>
            <div className={sx(styles.table)} role="table" aria-label="Missions by playbook">
              <div className={sx(styles.tableRow, styles.tableHead)} role="row">
                {["Playbook", "Runs on", "Missions", "Completed", "Replies", "Reminders", "Stuck", "Sign-off wait", "Cost each"].map(
                  (label, index) => (
                    <span key={label} role="columnheader" className={sx(index > 1 && styles.numeric)}>
                      {label}
                    </span>
                  ),
                )}
              </div>
              {insights.rows.map((row) => (
                <div key={`${row.playbookName}:${row.providerId}`} className={sx(styles.tableRow)} role="row">
                  <span role="cell" className={sx(styles.playbook)} title={row.playbookName}>
                    {row.playbookName}
                  </span>
                  <span role="cell" className={sx(styles.muted)}>
                    {provider(row.providerId)}
                  </span>
                  <span role="cell" className={sx(styles.numeric)}>{row.missions}</span>
                  <span role="cell" className={sx(styles.numeric)}>{formatCompletionRate(row)}</span>
                  <span role="cell" className={sx(styles.numeric)}>{row.repliesPerMission}</span>
                  <span role="cell" className={sx(styles.numeric, row.remindersPerMission >= 1 && styles.warn)}>
                    {row.remindersPerMission}
                  </span>
                  <span role="cell" className={sx(styles.numeric, row.stuckPerMission > 0 && styles.warn)}>
                    {row.stuckPerMission}
                  </span>
                  <span role="cell" className={sx(styles.numeric)}>{wait(row)}</span>
                  <span role="cell" className={sx(styles.numeric)}>{cost(row)}</span>
                </div>
              ))}
            </div>
            <p className={sx(styles.note)}>Replies, reminders and stuck stages are per mission, on average.</p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = stylex.create({
  scroll: { flex: "1 1 auto", minHeight: 0, overflowY: "auto" },
  page: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-20"],
    width: "100%",
    maxWidth: "64rem",
    marginInline: "auto",
    paddingInline: vars["--ads-space-24"],
    paddingBlock: vars["--ads-space-24"],
  },
  header: { display: "flex", alignItems: "flex-start", gap: vars["--ads-space-16"] },
  period: { flex: "0 0 auto" },
  headerText: { display: "flex", flexDirection: "column", gap: vars["--ads-space-4"], flex: "1 1 auto", minWidth: 0 },
  title: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars["--ads-space-8"],
    margin: 0,
    fontSize: vars["--ads-font-size-title"],
    fontWeight: vars["--ads-font-weight-semibold"],
    color: vars["--ads-color-text"],
  },
  titleIcon: { width: 18, height: 18, color: vars["--ads-color-text-muted"] },
  lead: { margin: 0, fontSize: vars["--ads-font-size-body"], lineHeight: vars["--ads-line-height-relaxed"], color: vars["--ads-color-text-muted"] },
  providers: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))", gap: vars["--ads-space-12"] },
  providerCard: {
    display: "flex",
    flexDirection: "column",
    gap: vars["--ads-space-12"],
    padding: vars["--ads-space-16"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
  },
  providerTitle: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    margin: 0,
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
  },
  providerCount: { fontSize: vars["--ads-font-size-caption"], fontWeight: vars["--ads-font-weight-regular"], color: vars["--ads-color-text-subtle"] },
  figures: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: vars["--ads-space-12"], margin: 0 },
  figure: { display: "flex", flexDirection: "column-reverse", gap: 2, minWidth: 0 },
  figureLabel: { fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  figureValue: {
    margin: 0,
    fontSize: vars["--ads-font-size-lead"],
    fontWeight: vars["--ads-font-weight-medium"],
    color: vars["--ads-color-text"],
    fontVariantNumeric: "tabular-nums",
  },
  table: {
    display: "flex",
    flexDirection: "column",
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "solid",
    borderColor: vars["--ads-color-border"],
    backgroundColor: vars["--ads-color-surface"],
    overflowX: "auto",
  },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "minmax(10rem, 1.6fr) minmax(5rem, 0.8fr) repeat(7, minmax(4.5rem, 0.7fr))",
    alignItems: "center",
    columnGap: vars["--ads-space-12"],
    minHeight: 44,
    paddingInline: vars["--ads-space-16"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text"],
    borderTopWidth: { default: vars["--ads-border-width-hairline"], ":first-child": 0 },
    borderTopStyle: "solid",
    borderTopColor: vars["--ads-color-border-subtle"],
  },
  tableHead: { minHeight: 36, color: vars["--ads-color-text-subtle"], fontWeight: vars["--ads-font-weight-medium"] },
  playbook: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: vars["--ads-font-size-body"],
    fontWeight: vars["--ads-font-weight-medium"],
  },
  muted: { color: vars["--ads-color-text-muted"] },
  numeric: { textAlign: "end", fontVariantNumeric: "tabular-nums" },
  warn: { color: vars["--ads-color-warning-text"] },
  note: { margin: 0, fontSize: vars["--ads-font-size-caption"], color: vars["--ads-color-text-subtle"] },
  empty: {
    margin: 0,
    paddingBlock: vars["--ads-space-16"],
    paddingInline: vars["--ads-space-16"],
    borderRadius: vars["--ads-radius-panel"],
    borderWidth: vars["--ads-border-width-hairline"],
    borderStyle: "dashed",
    borderColor: vars["--ads-color-border"],
    fontSize: vars["--ads-font-size-caption"],
    color: vars["--ads-color-text-muted"],
  },
});
