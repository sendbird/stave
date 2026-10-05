import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { transition } from "@/components/ads/recipes/transition";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { sx } from "@/components/ads/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { USAGE_PROVIDER_NAMES, type UsageMetrics, type UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";

export const exactNumber = (value: number) => value.toLocaleString();
export const reportedCost = (value: number | null) => value === null ? "Not reported" : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export function UsageFigures({ totals }: { totals: UsageMetrics }) {
  const figures = [
    { label: "Tokens · excluding cache reads", value: totals.turns > 0 && totals.measuredTurns === 0 ? "Not reported" : exactNumber(totals.tokens), note: `${totals.measuredTurns} of ${totals.turns} turns reported tokens` },
    { label: "Input / output · as reported", value: `${exactNumber(totals.inputTokens)} / ${exactNumber(totals.outputTokens)}`, note: "Provider input counters use different cache conventions" },
    { label: "Cache read / write", value: `${exactNumber(totals.cacheReadTokens)} / ${exactNumber(totals.cacheCreationTokens)}`, note: `${exactNumber(totals.thoughtTokens)} reasoning tokens reported; not added to output` },
    { label: "Provider-reported cost", value: reportedCost(totals.costUsd), note: `${totals.costReportedTurns} of ${totals.turns} turns reported USD · not an invoice` },
  ];
  return <div className={sx(styles.figures)} aria-label="Usage totals">
    {figures.map((figure) => <div key={figure.label} className={sx(styles.figure)}>
      <p className={sx(styles.note)}>{figure.label}</p><p className={sx(styles.value)}>{figure.value}</p>
      <p className={sx(styles.note)}>{figure.note}</p>
    </div>)}
  </div>;
}

export type UsageChartMetric = "tokens" | "turns" | "costUsd";
const metricOptions = [{ value: "tokens", label: "Tokens" }, { value: "turns", label: "Turns" }, { value: "costUsd", label: "Reported USD" }];

/** Exact buckets are also available as a table; daily bars drill into one day's hours. */
export function UsageTimeline(props: { report: UsageStatisticsReport; granularity: "day" | "hour"; timeZone: string; onDay: (day: string) => void }) {
  const [metric, setMetric] = useState<UsageChartMetric>("tokens");
  const [showTable, setShowTable] = useState(false);
  const [page, setPage] = useState(0);
  const all = props.report.series;
  const points = props.granularity === "hour" ? all.slice(-168) : all;
  const max = Math.max(1, ...points.map((point) => point[metric] ?? 0));
  const value = (row: UsageMetrics) => metric === "costUsd" ? reportedCost(row.costUsd) : metric === "tokens" && row.turns > 0 && row.measuredTurns === 0 ? "Not reported" : exactNumber(row[metric] ?? 0);
  const metricName = metricOptions.find((option) => option.value === metric)?.label ?? "Tokens";
  const noMeasurements = metric === "costUsd" ? props.report.totals.costReportedTurns === 0 : metric === "tokens" && props.report.totals.measuredTurns === 0;
  const detailPage = Math.min(page, Math.max(0, Math.ceil(all.length / 24) - 1));
  return <section className={sx(styles.section)} aria-label="Usage over time">
    <div className={sx(styles.header)}>
      <div className={sx(styles.stack, styles.headerCopy)}><h2 className={sx(styles.heading)}>Usage over time</h2>
        <p className={sx(styles.note)}>{props.timeZone} · {props.granularity === "day" ? "Select a day to see its hours." : "Each hour keeps its UTC offset."}</p></div>
      <Select aria-label="Chart metric" size="sm" options={metricOptions} value={metric} onValueChange={(v) => { if (v) setMetric(v as UsageChartMetric); }} />
    </div>
    {noMeasurements ? <p className={sx(styles.note)}>No {metricName.toLowerCase()} measurements were reported in this period. Select Turns to see activity.</p> : <>
      <div className={sx(styles.chartScroll)}>
        <div className={sx(styles.chart)} role="group" aria-label={`${metricName} by ${props.granularity}`}>
          {points.map((point) => <Button layout="host" press="none" key={point.at} type="button"
            title={`${point.at} · ${value(point)} ${metricName.toLowerCase()} · ${point.turns} turns`}
            aria-label={`${point.at}: ${value(point)} ${metricName.toLowerCase()}, ${point.turns} turns${props.granularity === "day" ? ". Show hours" : ""}`}
            xstyle={[styles.bar, focusRing.ring, transition.control, !(point[metric] ?? 0) && styles.barEmpty]}
            style={{ height: `${Math.max(1.5, ((point[metric] ?? 0) / max) * 100)}%` }}
            onClick={() => { if (props.granularity === "day") props.onDay(point.at); else setShowTable(true); }} />)}
        </div>
      </div>
      <div className={sx(styles.chartEnds)}><span>{points[0]?.at}</span><span>{metricName} · peak {metric === "costUsd" ? reportedCost(max) : exactNumber(max)}</span><span>{points.at(-1)?.at}</span></div>
    </>}
    {all.length > points.length ? <p className={sx(styles.note)}>Chart shows the most recent 168 hours. Totals and the table cover the whole selected period.</p> : null}
    <Button variant="quiet" size="sm" aria-expanded={showTable} onClick={() => setShowTable((value) => !value)}>{showTable ? "Hide time buckets" : "Show exact time buckets"}</Button>
    {showTable ? <div className={sx(styles.stack)}>
      <Table aria-label="Exact time buckets"><TableHeader><TableRow><TableHead>Time ({props.timeZone})</TableHead><TableHead>Turns</TableHead><TableHead>Tokens</TableHead><TableHead>Reported USD</TableHead></TableRow></TableHeader>
        <TableBody>{all.slice(detailPage * 24, (detailPage + 1) * 24).map((point) => <TableRow key={point.at}>
          <TableCell>{point.at}</TableCell><TableCell>{point.turns}</TableCell><TableCell>{point.measuredTurns > 0 || point.turns === 0 ? exactNumber(point.tokens) : "Not reported"}</TableCell><TableCell>{reportedCost(point.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
      <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={detailPage === 0} onClick={() => setPage(detailPage - 1)}>Previous buckets</Button>
        <span className={sx(styles.note)}>{detailPage + 1} / {Math.max(1, Math.ceil(all.length / 24))}</span>
        <Button variant="quiet" size="sm" disabled={(detailPage + 1) * 24 >= all.length} onClick={() => setPage(detailPage + 1)}>Next buckets</Button></div>
    </div> : null}
  </section>;
}

export function UsageBreakdowns(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[];
  onAccount: (providerId: import("@/lib/providers/provider.types").ProviderId, id: string) => void;
  onModel: (providerId: import("@/lib/providers/provider.types").ProviderId, id: string | null) => void }) {
  return <div className={sx(styles.columns)}>
    <section className={sx(styles.section)} aria-label="Usage by account"><h2 className={sx(styles.heading)}>By account</h2>
      <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Turns</TableHead><TableHead>Tokens</TableHead><TableHead>Reported USD</TableHead></TableRow></TableHeader>
        <TableBody>{props.report.accounts.map((row) => <TableRow key={`${row.providerId}:${row.accountProfileId}`}>
          <TableCell><Button variant="link" size="sm" onClick={() => props.onAccount(row.providerId, row.accountProfileId)}>{usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}</Button></TableCell>
          <TableCell>{row.turns}</TableCell><TableCell className={sx(styles.number)}>{row.measuredTurns ? exactNumber(row.tokens) : "Not reported"}</TableCell><TableCell className={sx(styles.number)}>{reportedCost(row.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
    </section>
    <section className={sx(styles.section)} aria-label="Usage by model"><h2 className={sx(styles.heading)}>By model</h2>
      <p className={sx(styles.note)}>Select a model to inspect its totals, trend and turn history.</p>
      <Table><TableHeader><TableRow><TableHead>Model</TableHead><TableHead>Turns</TableHead><TableHead>Tokens</TableHead><TableHead>Reported USD</TableHead></TableRow></TableHeader>
        <TableBody>{props.report.models.map((row) => <TableRow key={`${row.providerId}:${row.modelId}`}>
          <TableCell className={sx(styles.wrap)}><Button variant="link" size="sm" onClick={() => props.onModel(row.providerId, row.modelId)}>{row.modelId ?? "Model not recorded"}</Button><p className={sx(styles.note)}>{USAGE_PROVIDER_NAMES[row.providerId]}</p></TableCell>
          <TableCell>{row.turns}</TableCell><TableCell className={sx(styles.number)}>{row.measuredTurns ? exactNumber(row.tokens) : "Not reported"}</TableCell><TableCell className={sx(styles.number)}>{reportedCost(row.costUsd)}</TableCell>
        </TableRow>)}</TableBody></Table>
    </section>
  </div>;
}

export function UsageTurnTable(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[]; timeZone: string; offset: number; onPage: (offset: number) => void }) {
  return <section className={sx(styles.section)} aria-label="Turn usage history">
    <h2 className={sx(styles.heading)}>Turn history</h2><p className={sx(styles.note)}>Completed Stave turns, grouped by start time in {props.timeZone}. Running turns appear when they finish.</p>
    <Table><TableHeader><TableRow><TableHead>Started</TableHead><TableHead>Account / model</TableHead><TableHead>Input</TableHead><TableHead>Output</TableHead><TableHead>Cache read / write</TableHead><TableHead>Tokens excluding cache reads</TableHead><TableHead>Reported USD</TableHead></TableRow></TableHeader>
      <TableBody>{props.report.turns.map((row) => <TableRow key={row.id}>
        <TableCell className={sx(styles.number)}><time dateTime={row.createdAt}>{usageTimestamp(row.createdAt, props.timeZone)}</time></TableCell>
        <TableCell className={sx(styles.wrap)}>{usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}<p className={sx(styles.note)}>{row.modelId ?? "Model not recorded"}</p></TableCell>
        <TableCell className={sx(styles.end)}>{row.measuredTurns ? exactNumber(row.inputTokens) : "—"}</TableCell>
        <TableCell className={sx(styles.end)}>{row.measuredTurns ? exactNumber(row.outputTokens) : "—"}</TableCell>
        <TableCell className={sx(styles.end)}>{row.measuredTurns ? `${exactNumber(row.cacheReadTokens)} / ${exactNumber(row.cacheCreationTokens)}` : "—"}</TableCell>
        <TableCell className={sx(styles.end)}>{row.measuredTurns ? exactNumber(row.tokens) : "Not reported"}</TableCell>
        <TableCell className={sx(styles.end)}>{reportedCost(row.costUsd)}</TableCell>
      </TableRow>)}</TableBody></Table>
    <div className={sx(styles.row)}>
      <Button variant="outline" size="sm" disabled={props.offset === 0} onClick={() => props.onPage(Math.max(0, props.offset - 50))}>Previous turns</Button>
      <p className={sx(styles.note)}>{props.report.totals.turns === 0 ? "0 turns" : `${props.offset + 1}–${props.offset + props.report.turns.length} of ${exactNumber(props.report.totals.turns)} turns`}</p>
      <Button variant="outline" size="sm" disabled={props.offset + 50 >= props.report.totals.turns} onClick={() => props.onPage(props.offset + 50)}>Next turns</Button>
    </div>
  </section>;
}
