import { formatDateTime, formatNumber } from "@/i18n/format";
import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { transition } from "@/components/ads/recipes/transition";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { USAGE_PROVIDER_NAMES, type UsageMetrics, type UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { USAGE_TURN_PAGE_SIZE, groupUsageTurnsByDay, usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";

export const exactNumber = (value: number) => formatNumber(value);
export const reportedCost = (value: number | null) => value === null ? i18n.t("usage:usageParts.notReported") : formatNumber(value, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function UsageFigures({ totals }: { totals: UsageMetrics }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const figures = [
    { label: t("usage:usageParts.tokensExcludingCacheReads"), value: totals.turns > 0 && totals.measuredTurns === 0 ? t("usage:usageParts.notReported") : exactNumber(totals.tokens), note: t("usage:usageParts.ofTurnsReportedTokens", { value1: totals.measuredTurns, value2: totals.turns }) },
    { label: t("usage:usageParts.inputOutputAsReported"), value: `${exactNumber(totals.inputTokens)} / ${exactNumber(totals.outputTokens)}`, note: t("usage:usageParts.providerInputCountersUseDifferentCache") },
    { label: t("usage:usageParts.cacheReadWrite"), value: `${exactNumber(totals.cacheReadTokens)} / ${exactNumber(totals.cacheCreationTokens)}`, note: t("usage:usageParts.reasoningTokensReportedNotAddedTo", { value1: exactNumber(totals.thoughtTokens) }) },
    { label: t("usage:usageParts.providerReportedCost"), value: reportedCost(totals.costUsd), note: t("usage:usageParts.ofTurnsReportedUSDNotAn", { value1: totals.costReportedTurns, value2: totals.turns }) },
  ];
  return <div className={sx(styles.figures)} aria-label={t("usage:usageParts.usageTotals")}>
    {figures.map((figure) => <div key={figure.label} className={sx(styles.figure)}>
      <p className={sx(styles.note)}>{figure.label}</p><p className={sx(styles.value)}>{figure.value}</p>
      <p className={sx(styles.note)}>{figure.note}</p>
    </div>)}
  </div>;
}

export type UsageChartMetric = "tokens" | "turns" | "costUsd";
const metricOptions = [{ value: "tokens", get label() { return i18n.t("usage:usageParts.tokens"); } }, { value: "turns", get label() { return i18n.t("settingsProviders:codexThreadsTab.metrics.turns"); } }, { value: "costUsd", get label() { return i18n.t("usage:usageParts.reportedUSD"); } }];

/** Exact buckets are also available as a table; daily bars drill into one day's hours. */
export function UsageTimeline(props: { report: UsageStatisticsReport; granularity: "day" | "hour"; timeZone: string; onDay: (day: string) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [metric, setMetric] = useState<UsageChartMetric>("tokens");
  const [showTable, setShowTable] = useState(false);
  const [page, setPage] = useState(0);
  const all = props.report.series;
  const points = props.granularity === "hour" ? all.slice(-168) : all;
  const max = Math.max(1, ...points.map((point) => point[metric] ?? 0));
  const value = (row: UsageMetrics) => metric === "costUsd" ? reportedCost(row.costUsd) : metric === "tokens" && row.turns > 0 && row.measuredTurns === 0 ? i18n.t("usage:usageParts.notReported") : exactNumber(row[metric] ?? 0);
  const metricName = metricOptions.find((option) => option.value === metric)?.label ?? t("usage:usageParts.tokens");
  const noMeasurements = metric === "costUsd" ? props.report.totals.costReportedTurns === 0 : metric === "tokens" && props.report.totals.measuredTurns === 0;
  const detailPage = Math.min(page, Math.max(0, Math.ceil(all.length / 24) - 1));
  return <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageOverTime")}>
    <div className={sx(styles.header)}>
      <div className={sx(styles.stack, styles.headerCopy)}><h2 className={sx(styles.heading)}>{t("usage:usageParts.usageOverTime")}</h2>
        <p className={sx(styles.note)}>{props.timeZone} · {props.granularity === "day" ? t("usage:usageParts.selectADayToSeeIts") : t("usage:usageParts.eachHourKeepsItsUTCOffset")}</p></div>
      <Select aria-label={t("usage:usageParts.chartMetric")} size="sm" options={metricOptions} value={metric} onValueChange={(v) => { if (v) setMetric(v as UsageChartMetric); }} />
    </div>
    {noMeasurements ? <p className={sx(styles.note)}>{t("usage:whole.noMeasurements", { metric: metricName })}</p> : <>
      <div className={sx(styles.chartScroll)}>
        <div className={sx(styles.chart)} role="group" aria-label={t("usage:usageParts.by", { value1: metricName, value2: props.granularity })}>
          {points.map((point) => <Button layout="host" press="none" key={point.at} type="button"
            title={t("usage:messages.barTitle", { date: point.at, value: value(point), metric: metricName.toLowerCase(), count: point.turns })}
            aria-label={t(props.granularity === "day" ? "usage:messages.barDayLabel" : "usage:messages.barLabel", { date: point.at, value: value(point), metric: metricName.toLowerCase(), count: point.turns })}
            xstyle={[styles.bar, focusRing.ring, transition.control, !(point[metric] ?? 0) && styles.barEmpty]}
            style={{ height: `${Math.max(1.5, ((point[metric] ?? 0) / max) * 100)}%` }}
            onClick={() => { if (props.granularity === "day") props.onDay(point.at); else setShowTable(true); }} />)}
        </div>
      </div>
      <div className={sx(styles.chartEnds)}><span>{points[0]?.at}</span><span>{t("usage:messages.chartPeak", { metric: metricName, value: metric === "costUsd" ? reportedCost(max) : exactNumber(max) })}</span><span>{points.at(-1)?.at}</span></div>
    </>}
    {all.length > points.length ? <p className={sx(styles.note)}>{t("usage:usageParts.chartShowsTheMostRecentHours")}</p> : null}
    <Button variant="quiet" size="sm" aria-expanded={showTable} onClick={() => setShowTable((value) => !value)}>{showTable ? t("usage:usageParts.hideTimeBuckets") : t("usage:usageParts.showExactTimeBuckets")}</Button>
    {showTable ? <div className={sx(styles.stack)}>
      <Table aria-label={t("usage:usageParts.exactTimeBuckets")}><TableHeader><TableRow><TableHead>{t("usage:messages.timeZoneHeading", { zone: props.timeZone })}</TableHead><TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead><TableHead>{t("usage:usageParts.tokens")}</TableHead><TableHead>{t("usage:usageParts.reportedUSD")}</TableHead></TableRow></TableHeader>
        <TableBody>{all.slice(detailPage * 24, (detailPage + 1) * 24).map((point) => <TableRow key={point.at}>
          <TableCell>{point.at}</TableCell><TableCell>{point.turns}</TableCell><TableCell>{point.measuredTurns > 0 || point.turns === 0 ? exactNumber(point.tokens) : i18n.t("usage:usageParts.notReported")}</TableCell><TableCell>{reportedCost(point.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
      <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={detailPage === 0} onClick={() => setPage(detailPage - 1)}>{t("usage:usageParts.previousBuckets")}</Button>
        <span className={sx(styles.note)}>{detailPage + 1} / {Math.max(1, Math.ceil(all.length / 24))}</span>
        <Button variant="quiet" size="sm" disabled={(detailPage + 1) * 24 >= all.length} onClick={() => setPage(detailPage + 1)}>{t("usage:usageParts.nextBuckets")}</Button></div>
    </div> : null}
  </section>;
}

export function UsageBreakdowns(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[];
  onAccount: (providerId: import("@/lib/providers/provider.types").ProviderId, id: string) => void;
  onModel: (providerId: import("@/lib/providers/provider.types").ProviderId, id: string | null) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return <div className={sx(styles.columns)}>
    <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageByAccount")}><h2 className={sx(styles.heading)}>{t("usage:usageParts.byAccount")}</h2>
      <Table><TableHeader><TableRow><TableHead>{t("settingsProviders:codexOverviewTab.runtime.account")}</TableHead><TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead><TableHead>{t("usage:usageParts.tokens")}</TableHead><TableHead>{t("usage:usageParts.reportedUSD")}</TableHead></TableRow></TableHeader>
        <TableBody>{props.report.accounts.map((row) => <TableRow key={`${row.providerId}:${row.accountProfileId}`}>
          <TableCell><Button variant="link" size="sm" onClick={() => props.onAccount(row.providerId, row.accountProfileId)}>{usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}</Button></TableCell>
          <TableCell>{row.turns}</TableCell><TableCell className={sx(styles.number)}>{row.measuredTurns ? exactNumber(row.tokens) : i18n.t("usage:usageParts.notReported")}</TableCell><TableCell className={sx(styles.number)}>{reportedCost(row.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
    </section>
    <section className={sx(styles.section)} aria-label={t("usage:usageParts.usageByModel")}><h2 className={sx(styles.heading)}>{t("usage:usageParts.byModel")}</h2>
      <p className={sx(styles.note)}>{t("usage:usageParts.selectAModelToInspectIts")}</p>
      <Table><TableHeader><TableRow><TableHead>{t("settingsProviders:auxiliaryInference.model.title")}</TableHead><TableHead>{t("settingsProviders:codexThreadsTab.metrics.turns")}</TableHead><TableHead>{t("usage:usageParts.tokens")}</TableHead><TableHead>{t("usage:usageParts.reportedUSD")}</TableHead></TableRow></TableHeader>
        <TableBody>{props.report.models.map((row) => <TableRow key={`${row.providerId}:${row.modelId}`}>
          <TableCell className={sx(styles.wrap)}><Button variant="link" size="sm" flushInline onClick={() => props.onModel(row.providerId, row.modelId)}>{row.modelId ?? i18n.t("usage:usageParts.modelNotRecorded")}</Button><p className={sx(styles.note)}>{USAGE_PROVIDER_NAMES[row.providerId]}</p></TableCell>
          <TableCell>{row.turns}</TableCell><TableCell className={sx(styles.number)}>{row.measuredTurns ? exactNumber(row.tokens) : i18n.t("usage:usageParts.notReported")}</TableCell><TableCell className={sx(styles.number)}>{reportedCost(row.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
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
                <span className={sx(styles.historyMetric)}><span className={sx(styles.note)} title={t("usage:usageParts.tokensExcludingCacheReadsAdditional")}>{t("usage:usageParts.tokens")}</span><span className={sx(styles.number)}>{row.measuredTurns ? exactNumber(row.tokens) : t("usage:usageParts.notReported")}</span></span>
                <span className={sx(styles.historyMetric)}><span className={sx(styles.note)}>{t("usage:usageParts.reportedUSD")}</span><span className={sx(styles.number)}>{reportedCost(row.costUsd)}</span></span>
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
