import { formatCost, formatDateRange, formatDateTime, formatNumber, formatPercent, formatTokenCount } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronRight } from "lucide-react";
import * as stylex from "@stylexjs/stylex";
import { Button } from "@/components/aui/components/Button";
import { Meter } from "@/components/aui/components/Meter";
import { Select } from "@/components/aui/components/Select";
import { VisuallyHidden } from "@/components/aui/components/VisuallyHidden";
import { transition } from "@/components/aui/recipes/transition";
import { focusRing } from "@/components/aui/recipes/focus-ring";
import { vars } from "@/components/aui/tokens/tokens.stylex";
import { sx } from "@/components/aui/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import type { ProviderId } from "@/lib/providers/provider.types";
import { USAGE_PROVIDER_NAMES, type UsageMetrics, type UsageSeriesPoint, type UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { USAGE_TURN_PAGE_SIZE, groupUsageTurnsByDay, usageAccountLabel, usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { deltaPercentParts, usageDelta, usageShare, type UsageDelta, type UsageMeasurement, type UsageNotComparedReason, type UsageRangeBounds } from "./usage-compare";
import { usageStyles as styles } from "./usage.styles";
import { NotReported, UsageInfo } from "./UsageInfo";

export const exactNumber = (value: number) => formatNumber(value);
export const reportedCost = (value: number | null) => value === null ? i18n.t("usage:usageParts.notReported") : formatNumber(value, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 4 });
/** `$125.90`, `<$0.01`: totals read in cents; the exact amount stays in the tooltip and the bucket table. */
const summaryCost = (value: number | null) => value === null ? i18n.t("usage:usageParts.notReported") : formatCost(value);

/** Token counts read as `6.8M`, `69k`; hovering shows every digit. */
function Tokens({ value }: { value: number }) {
  return <span title={exactNumber(value)}>{formatTokenCount(value)}</span>;
}
/** `cell` marks a table or row slot, where a missing amount reads as a dash. */
function Cost({ value, cell = false }: { value: number | null; cell?: boolean }) {
  if (value === null) return cell ? <NotReported /> : <>{summaryCost(value)}</>;
  return <span title={reportedCost(value)}>{summaryCost(value)}</span>;
}

/** One reading a figure compares: how it is measured, read and written. */
type FigureReading = { measurement: UsageMeasurement; read: (metrics: UsageMetrics) => number; format: (value: number) => string };
const TOKENS: FigureReading = { measurement: "tokens", read: (metrics) => metrics.tokens, format: (value) => formatTokenCount(value) };
const INPUT: FigureReading = { measurement: "tokens", read: (metrics) => metrics.inputTokens, format: (value) => formatTokenCount(value) };
const OUTPUT: FigureReading = { measurement: "tokens", read: (metrics) => metrics.outputTokens, format: (value) => formatTokenCount(value) };
const CACHE_READ: FigureReading = { measurement: "tokens", read: (metrics) => metrics.cacheReadTokens, format: (value) => formatTokenCount(value) };
const CACHE_WRITE: FigureReading = { measurement: "tokens", read: (metrics) => metrics.cacheCreationTokens, format: (value) => formatTokenCount(value) };
const COST: FigureReading = { measurement: "cost", read: (metrics) => metrics.costUsd ?? 0, format: (value) => formatCost(value) };

const NOT_COMPARED = {
  "no-earlier-turns": "usage:compare.notCompared.noEarlierTurns",
  "earlier-not-reported": "usage:compare.notCompared.earlierNotReported",
  "not-reported": "usage:compare.notCompared.notReported",
} as const satisfies Record<UsageNotComparedReason, string>;

/** The direction as an arrow and a percent; the words beside it say the same for assistive technology. */
function DeltaChip({ delta }: { delta: Exclude<UsageDelta, { kind: "not-compared" }> }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (delta.kind === "same") return <span className={sx(parts.chip)} aria-hidden>{t("usage:compare.sameChip")}</span>;
  const arrow = delta.kind === "up" ? "↑" : "↓";
  if (delta.ratio === null) return <span className={sx(parts.chip)} aria-hidden>{t("usage:compare.fromZeroChip", { arrow })}</span>;
  const { lessThanOne, percent } = deltaPercentParts(delta.ratio);
  return <span className={sx(parts.chip)} aria-hidden>{arrow}{lessThanOne ? t("usage:compare.underOnePercent") : formatPercent(percent / 100)}</span>;
}
function deltaWords(delta: Exclude<UsageDelta, { kind: "not-compared" }>) {
  if (delta.kind === "same") return i18n.t("usage:compare.same");
  if (delta.ratio === null) return i18n.t(delta.kind === "up" ? "usage:compare.upFromZero" : "usage:compare.downToZero");
  const { lessThanOne, percent } = deltaPercentParts(delta.ratio);
  const amount = lessThanOne ? i18n.t("usage:compare.underOnePercent") : formatPercent(percent / 100);
  return i18n.t(delta.kind === "up" ? "usage:compare.up" : "usage:compare.down", { percent: amount });
}

/**
 * How a figure moved since the period of equal length before this one:
 * an arrow and a percent in a neutral chip (more tokens is not good or bad
 * by itself), the earlier period's dates and, for a single reading, its
 * value. A reading either period did not measure is not compared.
 */
function FigureDelta(props: { readings: readonly FigureReading[]; current: UsageMetrics; previous: UsageMetrics | null; period: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (!props.previous) return null;
  const previous = props.previous;
  const deltas = props.readings.map((reading) => ({ reading, delta: usageDelta({ current: props.current, previous, measurement: reading.measurement, read: reading.read }) }));
  const notCompared = deltas.find((entry) => entry.delta.kind === "not-compared")?.delta;
  if (notCompared?.kind === "not-compared") {
    return <p className={sx(parts.delta, styles.note)} data-usage-delta="not-compared">
      {t(NOT_COMPARED[notCompared.reason], { period: props.period })}</p>;
  }
  const compared = deltas as Array<{ reading: FigureReading; delta: Exclude<UsageDelta, { kind: "not-compared" }> }>;
  const single = compared.length === 1 ? compared[0]! : null;
  const sentence = single
    ? t("usage:compare.sentenceWithValue", { change: deltaWords(single.delta), period: props.period, previous: single.reading.format(single.delta.previous) })
    : t("usage:compare.sentence", { change: compared.map((entry) => deltaWords(entry.delta)).join(" / "), period: props.period });
  return <p className={sx(parts.delta)} data-usage-delta="compared">
    <span className={sx(parts.chips)} aria-hidden>
      {compared.map((entry, index) => <span key={index} className={sx(parts.chipGroup)}>
        {index > 0 ? <span className={sx(styles.note)}>/</span> : null}<DeltaChip delta={entry.delta} />
      </span>)}
    </span>
    <span className={sx(styles.note)} aria-hidden>{single
      ? t("usage:compare.versusWithValue", { period: props.period, previous: single.reading.format(single.delta.previous) })
      : t("usage:compare.versus", { period: props.period })}</span>
    <VisuallyHidden>{sentence}</VisuallyHidden>
  </p>;
}

export function UsageFigures(props: { totals: UsageMetrics; previousTotals?: UsageMetrics | null; previous?: UsageRangeBounds | null; timeZone?: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { totals } = props;
  const period = props.previous ? formatDateRange(props.previous.from, new Date(Date.parse(props.previous.to) - 1), { month: "short", day: "numeric", ...(props.timeZone ? { timeZone: props.timeZone } : {}) }) : "";
  const figures = [
    { label: t("usage:usageParts.tokensExcludingCacheReads"), info: t("usage:usageView.tokenTotalsExcludeCacheReadsClaude"), value: totals.turns > 0 && totals.measuredTurns === 0 ? t("usage:usageParts.notReported") : <Tokens value={totals.tokens} />, readings: [TOKENS], note: t("usage:usageParts.ofTurnsReportedTokens", { value1: totals.measuredTurns, value2: totals.turns }) },
    { label: t("usage:usageParts.inputOutputAsReported"), value: <><Tokens value={totals.inputTokens} /> / <Tokens value={totals.outputTokens} /></>, readings: [INPUT, OUTPUT], note: t("usage:usageParts.providerInputCountersUseDifferentCache") },
    { label: t("usage:usageParts.cacheReadWrite"), value: <><Tokens value={totals.cacheReadTokens} /> / <Tokens value={totals.cacheCreationTokens} /></>, readings: [CACHE_READ, CACHE_WRITE], note: t("usage:usageParts.reasoningTokensReportedNotAddedTo", { value1: formatTokenCount(totals.thoughtTokens) }) },
    { label: t("usage:usageParts.providerReportedCost"), value: <Cost value={totals.costUsd} />, readings: [COST], note: t("usage:usageParts.ofTurnsReportedUSDNotAn", { value1: totals.costReportedTurns, value2: totals.turns }) },
  ];
  return <div className={sx(styles.figures)} aria-label={t("usage:usageParts.usageTotals")}>
    {figures.map((figure) => <div key={figure.label} className={sx(styles.figure)}>
      <div className={sx(styles.titleRow)}><p className={sx(styles.note)}>{figure.label}</p>
        {"info" in figure && figure.info ? <UsageInfo title={t("usage:usageParts.tokenCountingTitle")}><p className={sx(styles.infoBody)}>{figure.info}</p></UsageInfo> : null}</div>
      <p className={sx(styles.value)}>{figure.value}</p>
      <FigureDelta readings={figure.readings} current={totals} previous={props.previousTotals ?? null} period={period} />
      <p className={sx(styles.note)}>{figure.note}</p>
    </div>)}
  </div>;
}

export type UsageChartMetric = "tokens" | "turns" | "costUsd";
const metricOptions = [{ value: "tokens", get label() { return i18n.t("usage:usageParts.tokens"); } }, { value: "turns", get label() { return i18n.t("settingsProviders:codexThreadsTab.metrics.turns"); } }, { value: "costUsd", get label() { return i18n.t("usage:usageParts.reportedUSD"); } }];
export type UsageChartSplit = "none" | "provider";
const splitOptions = [{ value: "none", get label() { return i18n.t("usage:chart.splitNone"); } }, { value: "provider", get label() { return i18n.t("usage:chart.splitProvider"); } }];

/** Stacking order and ink: each provider keeps its chart color whichever others are shown. */
export const USAGE_CHART_PROVIDERS: readonly ProviderId[] = ["claude-code", "codex", "cursor", "kiro", "opencode"];
const SERIES = stylex.create({
  "claude-code": { backgroundColor: vars["--aui-chart-1"] },
  codex: { backgroundColor: vars["--aui-chart-2"] },
  cursor: { backgroundColor: vars["--aui-chart-3"] },
  kiro: { backgroundColor: vars["--aui-chart-4"] },
  opencode: { backgroundColor: vars["--aui-chart-5"] },
});
/** A hidden series keeps its color as a ring, so the legend still says which button is which. */
const SERIES_RING = stylex.create({
  "claude-code": { boxShadow: `inset 0 0 0 1.5px ${vars["--aui-chart-1"]}` },
  codex: { boxShadow: `inset 0 0 0 1.5px ${vars["--aui-chart-2"]}` },
  cursor: { boxShadow: `inset 0 0 0 1.5px ${vars["--aui-chart-3"]}` },
  kiro: { boxShadow: `inset 0 0 0 1.5px ${vars["--aui-chart-4"]}` },
  opencode: { boxShadow: `inset 0 0 0 1.5px ${vars["--aui-chart-5"]}` },
});

const metricValue = (metrics: UsageMetrics | undefined, metric: UsageChartMetric) => metric === "costUsd" ? metrics?.costUsd ?? 0 : metrics?.[metric] ?? 0;
const formatMetric = (value: number, metric: UsageChartMetric) => metric === "costUsd" ? summaryCost(value) : metric === "tokens" ? formatTokenCount(value) : exactNumber(value);

/**
 * The next bar a key moves to: arrows step one bar, Home and End jump to the
 * ends. Null for any other key, which the bar keeps (Enter, Space, Tab).
 */
export function nextChartIndex(key: string, from: number, count: number): number | null {
  if (count <= 0) return null;
  const next = key === "ArrowRight" ? from + 1 : key === "ArrowLeft" ? from - 1 : key === "Home" ? 0 : key === "End" ? count - 1 : null;
  return next === null ? null : Math.max(0, Math.min(count - 1, next));
}

/**
 * Usage over time as one bar per bucket. The bars are one tab stop: arrows
 * move between them, Enter on a day shows its hours, and the line above the
 * bars reads the bar under the pointer or focus. Split by provider stacks
 * each bar by the provider that ran the turns, with a legend whose buttons
 * show or hide a provider. Exact buckets are also available as a table.
 */
export function UsageTimeline(props: { report: UsageStatisticsReport; granularity: "day" | "hour"; timeZone: string; onDay: (day: string) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [metric, setMetric] = useState<UsageChartMetric>("tokens");
  const [split, setSplit] = useState<UsageChartSplit>("none");
  const [hiddenProviders, setHiddenProviders] = useState<readonly ProviderId[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const [page, setPage] = useState(0);
  const bars = useRef<Array<HTMLButtonElement | null>>([]);
  const all = props.report.series;
  const points: readonly UsageSeriesPoint[] = props.granularity === "hour" ? all.slice(-168) : all;
  const providers = split === "provider" ? USAGE_CHART_PROVIDERS.filter((id) => points.some((point) => metricValue(point.providers?.[id], metric) > 0)) : [];
  const shown = providers.filter((id) => !hiddenProviders.includes(id));
  const barValue = (point: UsageSeriesPoint) => split === "provider" ? shown.reduce((sum, id) => sum + metricValue(point.providers?.[id], metric), 0) : metricValue(point, metric);
  const max = Math.max(1, ...points.map(barValue));
  const value = (row: UsageMetrics) => metric === "costUsd" ? reportedCost(row.costUsd) : metric === "tokens" && row.turns > 0 && row.measuredTurns === 0 ? i18n.t("usage:usageParts.notReported") : exactNumber(row[metric] ?? 0);
  /** A bucket whose turns reported none of this measurement: its zero is unknown, not nothing. */
  const unreported = (row: UsageMetrics) => row.turns > 0 && (metric === "costUsd" ? row.costReportedTurns === 0 : metric === "tokens" && row.measuredTurns === 0);
  const metricName = metricOptions.find((option) => option.value === metric)?.label ?? t("usage:usageParts.tokens");
  const noMeasurements = metric === "costUsd" ? props.report.totals.costReportedTurns === 0 : metric === "tokens" && props.report.totals.measuredTurns === 0;
  const detailPage = Math.min(page, Math.max(0, Math.ceil(all.length / 24) - 1));
  // One bar holds the tab stop; it starts on the newest bucket and follows the arrows.
  const active = Math.min(current ?? points.length - 1, points.length - 1);
  const readIndex = hovered ?? active;
  const read = points[readIndex];
  const providerWords = (point: UsageSeriesPoint) => shown.map((id) => t("usage:chart.providerValue", { provider: USAGE_PROVIDER_NAMES[id], value: formatMetric(metricValue(point.providers?.[id], metric), metric) })).join(", ");
  const barLabel = (point: UsageSeriesPoint) => {
    const label = t(props.granularity === "day" ? "usage:messages.barDayLabel" : "usage:messages.barLabel", { date: point.at, value: value(point), metric: metricName.toLowerCase(), count: point.turns });
    return split === "provider" && shown.length > 0 ? t("usage:chart.barSplitLabel", { label, providers: providerWords(point) }) : label;
  };
  const move = (event: KeyboardEvent<HTMLButtonElement>, from: number) => {
    const next = nextChartIndex(event.key, from, points.length);
    if (next === null) return;
    event.preventDefault();
    setCurrent(next);
    setHovered(null);
    const bar = bars.current[next];
    bar?.focus();
    bar?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  return <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageOverTime")}>
    <div className={sx(styles.stack)}>
      <h2 className={sx(styles.heading)}>{t("usage:usageParts.usageOverTime")}</h2>
      <p className={sx(styles.note)}>{props.timeZone} · {props.granularity === "day" ? t("usage:usageParts.selectADayToSeeIts") : t("usage:usageParts.eachHourKeepsItsUTCOffset")}</p>
    </div>
    <div className={sx(parts.controls)} data-usage-chart-controls="">
      <Select aria-label={t("usage:usageParts.chartMetric")} size="sm" options={metricOptions} value={metric} xstyle={parts.control}
        onValueChange={(next) => { if (next) setMetric(next as UsageChartMetric); }} />
      <Select aria-label={t("usage:chart.split")} size="sm" options={splitOptions} value={split} xstyle={parts.control}
        onValueChange={(next) => { if (next) setSplit(next as UsageChartSplit); }} />
      {providers.length > 0 ? <div className={sx(parts.legend)} role="group" aria-label={t("usage:chart.legend")} data-usage-chart-legend="">
        {providers.map((id) => {
          const visible = !hiddenProviders.includes(id);
          return <Button key={id} variant="quiet" size="sm" aria-pressed={visible} data-usage-legend={id}
            onClick={() => setHiddenProviders((previous) => visible ? [...previous, id] : previous.filter((entry) => entry !== id))}>
            <span aria-hidden className={sx(parts.swatch, visible ? SERIES[id] : SERIES_RING[id])} />
            {USAGE_PROVIDER_NAMES[id]}
          </Button>;
        })}
      </div> : null}
    </div>
    {noMeasurements ? <p className={sx(styles.note)}>{t("usage:whole.noMeasurements", { metric: metricName })}</p> : <>
      {read ? <div className={sx(parts.readout)} data-usage-chart-readout="">
        <span className={sx(parts.readoutMain)}>
          <strong className={sx(parts.readoutDate)}>{read.at}</strong>
          <span className={sx(styles.number)}>{unreported(read)
            ? t("usage:chart.readoutNotReported", { metric: metricName, count: read.turns })
            : t("usage:chart.readout", { value: formatMetric(barValue(read), metric), metric: metricName.toLowerCase(), count: read.turns })}</span>
          {split === "provider" ? shown.map((id) => <span key={id} className={sx(parts.readoutProvider)}>
            <span aria-hidden className={sx(parts.swatch, SERIES[id])} />{t("usage:chart.providerValue", { provider: USAGE_PROVIDER_NAMES[id], value: formatMetric(metricValue(read.providers?.[id], metric), metric) })}
          </span>) : null}
        </span>
        <span className={sx(parts.readoutHint)}>{t(props.granularity === "day" ? "usage:chart.hintDay" : "usage:chart.hintHour")}</span>
      </div> : null}
      <div className={sx(styles.chartScroll)}>
        <div className={sx(styles.chart)} role="group" data-usage-chart="" onPointerLeave={() => setHovered(null)}
          aria-label={t("usage:usageParts.by", { value1: metricName, value2: props.granularity })}>
          {points.map((point, index) => {
            const total = barValue(point);
            return <Button layout="host" press="none" key={point.at} type="button" data-usage-bar={point.at}
              ref={(node: HTMLButtonElement | null) => { bars.current[index] = node; }}
              tabIndex={index === active ? 0 : -1}
              aria-label={barLabel(point)}
              xstyle={[styles.bar, split === "provider" && parts.barStacked, focusRing.ring, transition.control, !total && styles.barEmpty, index === readIndex && parts.barRead]}
              style={{ height: `${Math.max(1.5, (total / max) * 100)}%` }}
              onFocus={() => setCurrent(index)}
              onPointerEnter={() => setHovered(index)}
              onKeyDown={(event) => move(event, index)}
              onClick={() => { setCurrent(index); if (props.granularity === "day") props.onDay(point.at); else setShowTable(true); }}>
              {split === "provider" && total > 0 ? shown.map((id) => {
                const share = metricValue(point.providers?.[id], metric);
                return share > 0 ? <span key={id} aria-hidden className={sx(parts.segment, SERIES[id])} style={{ flexGrow: share }} /> : null;
              }) : null}
            </Button>;
          })}
        </div>
      </div>
      <div className={sx(styles.chartEnds)}><span>{points[0]?.at}</span><span>{t("usage:messages.chartPeak", { metric: metricName, value: formatMetric(max, metric) })}</span><span>{points.at(-1)?.at}</span></div>
    </>}
    {all.length > points.length ? <p className={sx(styles.note)}>{t("usage:usageParts.chartShowsTheMostRecentHours")}</p> : null}
    <Button variant="quiet" size="sm" aria-expanded={showTable} onClick={() => setShowTable((open) => !open)}>{showTable ? t("usage:usageParts.hideTimeBuckets") : t("usage:usageParts.showExactTimeBuckets")}</Button>
    {showTable ? <div className={sx(styles.stack)}>
      <Table aria-label={t("usage:usageParts.exactTimeBuckets")}><TableHeader><TableRow><TableHead>{t("usage:messages.timeZoneHeading", { zone: props.timeZone })}</TableHead><TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead><TableHead>{t("usage:usageParts.tokens")}</TableHead><TableHead>{t("usage:usageParts.reportedUSD")}</TableHead></TableRow></TableHeader>
        <TableBody>{all.slice(detailPage * 24, (detailPage + 1) * 24).map((point) => <TableRow key={point.at}>
          <TableCell>{point.at}</TableCell><TableCell>{point.turns}</TableCell><TableCell>{point.measuredTurns > 0 || point.turns === 0 ? exactNumber(point.tokens) : <NotReported />}</TableCell><TableCell>{point.costUsd === null ? <NotReported /> : reportedCost(point.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
      <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={detailPage === 0} onClick={() => setPage(detailPage - 1)}>{t("usage:usageParts.previousBuckets")}</Button>
        <span className={sx(styles.note)}>{detailPage + 1} / {Math.max(1, Math.ceil(all.length / 24))}</span>
        <Button variant="quiet" size="sm" disabled={(detailPage + 1) * 24 >= all.length} onClick={() => setPage(detailPage + 1)}>{t("usage:usageParts.nextBuckets")}</Button></div>
    </div> : null}
  </section>;
}

/** A row's share of the measured tokens: a small meter with its percent beside it, or a dash when the row reported none. */
function ShareCell(props: { name: string; value: number; total: number; measured: boolean }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const share = usageShare(props.value, props.total, props.measured);
  if (share === null) return <NotReported />;
  const text = share > 0 && share < 0.005 ? t("usage:compare.underOnePercent") : formatPercent(share);
  return <span className={sx(parts.share)} data-usage-share="">
    <Meter label={t("usage:usageParts.shareOf", { name: props.name })} hideLabel hideValue size="sm" value={share * 100}
      getAriaValueText={() => text} xstyle={parts.shareMeter} />
    <span className={sx(styles.number, parts.sharePercent)} aria-hidden>{text}</span>
  </span>;
}

export function UsageBreakdowns(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[];
  onAccount: (providerId: ProviderId, id: string) => void;
  onModel: (providerId: ProviderId, id: string | null) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const total = props.report.totals.tokens;
  return <div className={sx(styles.columns)}>
    <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageByAccount")}><h2 className={sx(styles.heading)}>{t("usage:usageParts.byAccount")}</h2>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("settingsProviders:codexOverviewTab.runtime.account")}</TableHead>
          <TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead>
          <TableHead>{t("usage:usageParts.tokens")}</TableHead>
          <TableHead>{t("usage:usageParts.share")}</TableHead>
          <TableHead>{t("usage:usageParts.reportedUSD")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{props.report.accounts.map((row) => {
          const name = usageAccountLabel(row.providerId, row.accountProfileId, props.profiles);
          return <TableRow key={`${row.providerId}:${row.accountProfileId}`}>
            <TableCell className={sx(styles.wrap)}><Button variant="link" size="sm" flushInline onClick={() => props.onAccount(row.providerId, row.accountProfileId)}>{name}</Button><p className={sx(styles.note)}>{USAGE_PROVIDER_NAMES[row.providerId]}</p></TableCell>
            <TableCell>{row.turns}</TableCell>
            <TableCell className={sx(styles.number)}>{row.measuredTurns ? <Tokens value={row.tokens} /> : <NotReported />}</TableCell>
            <TableCell><ShareCell name={name} value={row.tokens} total={total} measured={row.measuredTurns > 0} /></TableCell>
            <TableCell className={sx(styles.number)}><Cost value={row.costUsd} cell /></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </section>
    <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageByModel")}><h2 className={sx(styles.heading)}>{t("usage:usageParts.byModel")}</h2>
      <p className={sx(styles.note)}>{t("usage:usageParts.selectAModelToInspectIts")}</p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>{t("settingsProviders:auxiliaryInference.model.title")}</TableHead>
          <TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead>
          <TableHead>{t("usage:usageParts.tokens")}</TableHead>
          <TableHead>{t("usage:usageParts.share")}</TableHead>
          <TableHead>{t("usage:usageParts.reportedUSD")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>{props.report.models.map((row) => {
          const name = row.modelId ?? i18n.t("usage:usageParts.modelNotRecorded");
          return <TableRow key={`${row.providerId}:${row.modelId}`}>
            <TableCell className={sx(styles.wrap)}><Button variant="link" size="sm" flushInline onClick={() => props.onModel(row.providerId, row.modelId)}>{name}</Button><p className={sx(styles.note)}>{USAGE_PROVIDER_NAMES[row.providerId]}</p></TableCell>
            <TableCell>{row.turns}</TableCell>
            <TableCell className={sx(styles.number)}>{row.measuredTurns ? <Tokens value={row.tokens} /> : <NotReported />}</TableCell>
            <TableCell><ShareCell name={`${name} · ${USAGE_PROVIDER_NAMES[row.providerId]}`} value={row.tokens} total={total} measured={row.measuredTurns > 0} /></TableCell>
            <TableCell className={sx(styles.number)}><Cost value={row.costUsd} cell /></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </section>
  </div>;
}

export function UsageTurnHistory(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[]; timeZone: string; offset: number; onPage: (offset: number) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const groups = groupUsageTurnsByDay(props.report.turns, props.timeZone);
  const date = (value: string) => formatDateTime(value, { timeZone: props.timeZone, dateStyle: "full" });
  const time = (value: string) => formatDateTime(value, { timeZone: props.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return <section className={sx(styles.section, styles.history)} aria-label={t("usage:usageParts.turnUsageHistory")}>
    <h2 className={sx(styles.heading)}>{t("usage:usageParts.turnHistory")}</h2>
    <p className={sx(styles.note)}>{t("usage:usageParts.historyDescription", { zone: props.timeZone, pageSize: USAGE_TURN_PAGE_SIZE })}</p>
    {groups.length === 0 ? <p className={sx(styles.note)}>{t("usage:usageParts.noCompletedTurns")}</p> : groups.map((group) => <section key={group.day} className={sx(styles.stack)}>
      <h3 className={sx(styles.historyDate)}>{date(group.turns[0]!.createdAt)}</h3>
      <ul className={sx(styles.historyList)}>
        {group.turns.map((row) => <li key={row.id}>
          <details className={sx(styles.historyTurn)}>
            <summary className={sx(styles.historySummary, focusRing.ring)}>
              <time dateTime={row.createdAt} title={usageTimestamp(row.createdAt, props.timeZone)} className={sx(styles.note, styles.number)}>{time(row.createdAt)}</time>
              <span className={sx(styles.historyIdentity)}>
                <span className={sx(styles.historyModel)}>{row.modelId ?? t("usage:usageParts.modelNotRecorded")}</span>
                <span className={sx(styles.note, styles.historyAccount)} title={usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}>{usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}</span>
              </span>
              <span className={sx(styles.historyMetrics)}>
                <span className={sx(styles.historyMetric)}><span className={sx(styles.note)} title={t("usage:usageParts.tokensExcludingCacheReadsAdditional")}>{t("usage:usageParts.tokens")}</span><span className={sx(styles.number)}>{row.measuredTurns ? <Tokens value={row.tokens} /> : <NotReported />}</span></span>
                <span className={sx(styles.historyMetric)}><span className={sx(styles.note)}>{t("usage:usageParts.reportedUSD")}</span><span className={sx(styles.number)}><Cost value={row.costUsd} cell /></span></span>
              </span>
              <ChevronRight aria-hidden="true" className={sx(styles.historyChevron)} />
            </summary>
            <dl className={sx(styles.historyDetails)}>
              {[{ label: t("settingsProviders:codexOverviewTab.runtime.account"), value: usageScopeLabel(row.providerId, row.accountProfileId, props.profiles) },
                { label: t("usage:usageParts.started"), value: usageTimestamp(row.createdAt, props.timeZone) },
                { label: t("usage:usageParts.input"), value: row.measuredTurns ? exactNumber(row.inputTokens) : t("usage:usageParts.notReported") },
                { label: t("usage:usageParts.output"), value: row.measuredTurns ? exactNumber(row.outputTokens) : t("usage:usageParts.notReported") },
                { label: t("usage:usageParts.cacheReadWrite"), value: row.measuredTurns ? `${exactNumber(row.cacheReadTokens)} / ${exactNumber(row.cacheCreationTokens)}` : t("usage:usageParts.notReported") }].map((item) => <div key={item.label} className={sx(styles.stack)}>
                  <dt className={sx(styles.note)}>{item.label}</dt><dd className={sx(styles.historyDetailValue)}>{item.value}</dd>
                </div>)}
            </dl>
          </details>
        </li>)}
      </ul>
    </section>)}
    <p className={sx(styles.note)}>{t("usage:usageParts.historyMeasurements")}</p>
    <div className={sx(styles.row)}>
      <Button variant="outline" size="sm" disabled={props.offset === 0} onClick={() => props.onPage(Math.max(0, props.offset - USAGE_TURN_PAGE_SIZE))}>{t("usage:usageParts.previousTurns")}</Button>
      <p className={sx(styles.note)}>{props.report.totals.turns === 0 ? t("usage:usageParts.turns") : t("usage:usageParts.ofTurns", { value1: props.offset + 1, value2: props.offset + props.report.turns.length, value3: exactNumber(props.report.totals.turns) })}</p>
      <Button variant="outline" size="sm" disabled={props.offset + USAGE_TURN_PAGE_SIZE >= props.report.totals.turns} onClick={() => props.onPage(props.offset + USAGE_TURN_PAGE_SIZE)}>{t("usage:usageParts.nextTurns")}</Button>
    </div>
  </section>;
}

/** Chart, comparison and share geometry owned by these parts; the page-level styles stay in `usage.styles`. */
const parts = stylex.create({
  delta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], margin: 0, minInlineSize: 0,
    fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-normal"] },
  chips: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"] },
  chipGroup: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"] },
  /** Neutral on purpose: more tokens or spend is not good or bad by itself, so the direction is the arrow and the words. */
  chip: { display: "inline-flex", alignItems: "center", paddingInline: vars["--aui-space-4"], borderRadius: vars["--aui-radius-full"],
    borderWidth: vars["--aui-border-width-hairline"], borderStyle: "solid", borderColor: vars["--aui-color-border"],
    color: vars["--aui-color-text"], fontVariantNumeric: "tabular-nums", fontWeight: vars["--aui-font-weight-medium"], whiteSpace: "nowrap" },
  controls: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-8"], minInlineSize: 0 },
  control: { inlineSize: "auto", minInlineSize: "10rem" },
  legend: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: vars["--aui-space-4"], minInlineSize: 0 },
  swatch: { display: "inline-block", flexShrink: 0, inlineSize: vars["--aui-space-8"], blockSize: vars["--aui-space-8"], borderRadius: vars["--aui-radius-mark"] },
  readout: { display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: vars["--aui-space-8"], minInlineSize: 0,
    fontSize: vars["--aui-font-size-caption"], lineHeight: vars["--aui-line-height-normal"], color: vars["--aui-color-text"] },
  readoutMain: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: vars["--aui-space-8"], minInlineSize: 0 },
  readoutDate: { fontWeight: vars["--aui-font-weight-semibold"], fontVariantNumeric: "tabular-nums" },
  readoutProvider: { display: "inline-flex", alignItems: "center", gap: vars["--aui-space-4"], color: vars["--aui-color-text-muted"], fontVariantNumeric: "tabular-nums" },
  readoutHint: { color: vars["--aui-color-text-muted"], whiteSpace: "nowrap" },
  /** A split bar is its segments: the bar keeps the geometry, the providers paint it bottom-up. */
  barStacked: { display: "flex", flexDirection: "column-reverse", overflow: "hidden", backgroundColor: "transparent" },
  barRead: { opacity: 1 },
  segment: { flexBasis: 0, flexShrink: 0, minBlockSize: 0, inlineSize: "100%" },
  share: { display: "inline-grid", gridTemplateColumns: "minmax(2.5rem, 4.5rem) 4ch", justifyContent: "start", alignItems: "center", gap: vars["--aui-space-8"], minInlineSize: 0 },
  shareMeter: { minInlineSize: 0 },
  sharePercent: { textAlign: "end", minInlineSize: "3ch" },
});
