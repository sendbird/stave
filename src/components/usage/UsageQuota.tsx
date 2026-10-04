import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import type { QuotaObservation, UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";

const identity = (row: QuotaObservation) => `${row.providerId}:${row.accountProfileId}:${row.windowId}`;
const percent = (value: number) => `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;

export function UsageQuota(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[]; timeZone: string;
  canRefresh: boolean; reading: boolean; error: string | null; onRefresh: () => void; now: number; apiBilling: boolean }) {
  const [showHistory, setShowHistory] = useState(false);
  const [windowId, setWindowId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const windows = new Map<string, QuotaObservation>();
  for (const row of props.report.quota) windows.set(identity(row), row);
  const selected = windowId && windows.has(windowId) ? windowId : windows.keys().next().value;
  const history = props.report.quota.filter((row) => identity(row) === selected);
  const samples = [...history].reverse();
  const currentPage = Math.min(page, Math.max(0, Math.ceil(samples.length / 20) - 1));
  const first = Date.parse(history[0]?.observedAt ?? "");
  const last = Date.parse(history.at(-1)?.observedAt ?? "");
  const max = Math.max(100, ...history.map((row) => row.usedPercent));
  return <section className={sx(styles.section)} aria-label="Account quota">
    <div className={sx(styles.header)}>
      <div className={sx(styles.stack, styles.headerCopy)}><h2 className={sx(styles.heading)}>Account quota</h2>
        <p className={sx(styles.note)}>Latest observed account limits · includes usage outside Stave · independent of the token period above</p></div>
      <Button xstyle={styles.control} variant="outline" size="sm" disabled={!props.canRefresh || props.reading} onClick={props.onRefresh}>{props.reading ? "Reading quota…" : "Refresh quota"}</Button>
    </div>
    {props.error ? <p role="alert" className={sx(styles.note)}>{props.error} Saved observations below may be older.</p> : null}
    {props.apiBilling ? <p className={sx(styles.note)}>This API connection is billed by its gateway. Subscription quota is unavailable; Stave turn tokens and reported cost are shown below.</p> : null}
    {props.report.latestQuota.length === 0 ? <p className={sx(styles.note)}>No quota observations saved for this selection. Choose a provider and an account, then refresh. Unsupported or unavailable limits are never shown as 0%.</p> : <div className={sx(styles.quotas)}>
      {props.report.latestQuota.map((row) => {
        const stale = props.now - Date.parse(row.observedAt) > 15 * 60_000;
        const expired = row.resetsAt !== null && row.resetsAt * 1000 <= props.now;
        return <div className={sx(styles.quota)} key={identity(row)}>
          <p className={sx(styles.note)}>{usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)}</p>
          <div className={sx(styles.header)}><span>{row.label}</span><strong className={sx(styles.number)}>{percent(row.usedPercent)} used</strong></div>
          <div role="meter" aria-label={`${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, row.usedPercent)} aria-valuetext={`${percent(row.usedPercent)} used${expired ? ", reset time has passed" : stale ? ", older observation" : ""}`}
            className={sx(styles.track)}><div className={sx(styles.fill, row.usedPercent >= 97 ? styles.danger : row.usedPercent >= 80 && styles.warning)} style={{ width: `${Math.min(100, row.usedPercent)}%` }} /></div>
          <p className={sx(styles.note)}>{row.resetsAt === null ? "Reset time not reported" : `${expired ? "Reset time passed" : "Resets"} · ${usageTimestamp(new Date(row.resetsAt * 1000).toISOString(), props.timeZone)}`}</p>
          <p className={sx(styles.note)}>{stale || expired ? "Older observation · " : "Observed · "}{usageTimestamp(row.observedAt, props.timeZone)}</p>
        </div>;
      })}
    </div>}
    {!props.canRefresh ? <p className={sx(styles.note)}>Choose a provider and one registered account to refresh its quota. Browsing these filters keeps the account for new turns unchanged.</p> : null}
    <Button variant="quiet" size="sm" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>{showHistory ? "Hide quota history" : "Show quota history"}</Button>
    {showHistory ? <div className={sx(styles.section)}>
      <p className={sx(styles.note)}>Observations within the selected period. Dots are sampled readings, without estimating consumption between them. The latest reading per window per minute is kept; resets start a new allowance.</p>
      {props.report.quotaHistoryTruncated ? <p className={sx(styles.note)}>Showing the latest 2,000 observations in this period. Choose a shorter period for earlier detail.</p> : null}
      {history.length === 0 ? <p className={sx(styles.note)}>No observations in this period. History starts when Stave reads quota; older usage cannot be reconstructed.</p> : <>
        <Select size="sm" aria-label="Quota history window" value={selected} options={[...windows].map(([value, row]) => ({ value, label: `${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}` }))}
          onValueChange={(value) => { setWindowId(typeof value === "string" ? value : null); setPage(0); }} />
        <svg viewBox="0 0 760 160" role="img" aria-label={`Observed quota, ${history.length} samples. Exact readings are in the table.`}>
          <text x="0" y="14" className={sx(styles.svgLabel)}>{percent(max)}</text>
          <text x="0" y="149" className={sx(styles.svgLabel)}>0%</text>
          <line x1="46" y1="140" x2="750" y2="140" className={sx(styles.svgAxis)} />
          {history.map((row) => <circle key={row.observedAt} cx={46 + (last > first ? (Date.parse(row.observedAt) - first) / (last - first) : 0.5) * 700}
            cy={140 - row.usedPercent / max * 125} r={3} className={sx(styles.svgPoint)}><title>{usageTimestamp(row.observedAt, props.timeZone)} · {percent(row.usedPercent)}</title></circle>)}
        </svg>
        <div className={sx(styles.chartEnds)}><span>{usageTimestamp(history[0]!.observedAt, props.timeZone)}</span><span>{usageTimestamp(history.at(-1)!.observedAt, props.timeZone)}</span></div>
        <Table aria-label="Quota observation history"><TableHeader><TableRow><TableHead>Observed ({props.timeZone})</TableHead><TableHead>Used</TableHead><TableHead>Resets</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
          <TableBody>{samples.slice(currentPage * 20, (currentPage + 1) * 20).map((row) => <TableRow key={row.observedAt}>
            <TableCell className={sx(styles.number)}>{usageTimestamp(row.observedAt, props.timeZone)}</TableCell><TableCell>{percent(row.usedPercent)}</TableCell>
            <TableCell className={sx(styles.number)}>{row.resetsAt ? usageTimestamp(new Date(row.resetsAt * 1000).toISOString(), props.timeZone) : "Not reported"}</TableCell><TableCell>{row.source}</TableCell>
          </TableRow>)}</TableBody></Table>
        <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous observations</Button>
          <span className={sx(styles.note)}>{currentPage + 1} / {Math.max(1, Math.ceil(samples.length / 20))}</span>
          <Button variant="quiet" size="sm" disabled={(currentPage + 1) * 20 >= samples.length} onClick={() => setPage(currentPage + 1)}>Next observations</Button></div>
      </>}
    </div> : null}
  </section>;
}
