import { formatNumber } from "@/i18n/format";
import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import type { QuotaObservation, UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";
import { groupQuotaAccounts, quotaResetCountdown } from "./usage-quota.utils";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { QuotaReadFeedback } from "@/lib/providers/quota-read-feedback";
import { quotaReadFeedbackText } from "./quota-read-feedback";

const identity = (row: QuotaObservation) => `${row.providerId}:${row.accountProfileId}:${row.windowId}`;
const percent = (value: number) => `${formatNumber(value, { maximumFractionDigits: 1 })}%`;

export function UsageQuota(props: { report: UsageStatisticsReport; profiles: readonly ProviderAccountProfile[]; timeZone: string;
  canRefresh: boolean; reading: boolean; error: string | null; onRefresh: () => void; now: number; apiBilling: boolean;
  feedback?: QuotaReadFeedback | null;
  providerId?: ProviderId; accountProfileId?: string; onAccount: (providerId: ProviderId, accountProfileId: string) => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
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
  const accounts = groupQuotaAccounts({ observations: props.report.latestQuota,
    accounts: [...props.report.knownAccounts, ...props.profiles.map((profile) => ({ providerId: profile.providerId, accountProfileId: profile.id }))],
    providerId: props.providerId, accountProfileId: props.accountProfileId, now: props.now });
  const feedbackText = quotaReadFeedbackText(props.feedback, props.timeZone, props.now);
  return <section className={sx(styles.section)} aria-label={t("usage:usageQuota.accountQuota")}>
    <div className={sx(styles.header)}>
      <div className={sx(styles.stack, styles.headerCopy)}><h2 className={sx(styles.heading)}>{t("usage:usageQuota.accountQuota")}</h2>
        <p className={sx(styles.note)}>{t("usage:usageQuota.latestObservedAccountLimitsIncludesUsage")}</p></div>
      <Button xstyle={styles.control} variant="outline" size="sm" disabled={!props.canRefresh || props.reading} onClick={props.onRefresh}>{props.reading ? t("usage:usageQuota.readingQuota") : t("usage:usageQuota.refreshQuota")}</Button>
    </div>
    {feedbackText ? <p role="status" className={sx(styles.note)}>{feedbackText}</p> : null}
    {props.error ? <p role="alert" className={sx(styles.note)}>{props.error} {t("usage:usageQuota.savedObservationsBelowMayBeOlder")}</p> : null}
    {props.apiBilling ? <p className={sx(styles.note)}>{t("usage:usageQuota.thisAPIConnectionIsBilledBy")}</p> : null}
    <p className={sx(styles.note)}>{t("usage:usageQuota.accountsAreListedSeparatelyWithThe")}</p>
    {accounts.length === 0 ? <p className={sx(styles.note)}>{t("usage:usageQuota.noAccountsInThisSelectionUnsupported")}</p> : <div className={sx(styles.quotas)}>
      {accounts.map((account) => <div className={sx(styles.quota)} key={`${account.providerId}:${account.accountProfileId}`}>
        <Button variant="link" size="sm" onClick={() => props.onAccount(account.providerId, account.accountProfileId)}>{usageScopeLabel(account.providerId, account.accountProfileId, props.profiles)}</Button>
        {account.windows.length === 0 ? <p className={sx(styles.note)}>{i18n.t("usage:usageQuota.noSavedQuotaSelectThisAccount")}</p> : account.windows.map((row) => {
        const stale = props.now - Date.parse(row.observedAt) > 15 * 60_000;
        const expired = row.resetsAt !== null && row.resetsAt * 1000 <= props.now;
        return <div className={sx(styles.quotaWindow)} key={identity(row)}>
          <div className={sx(styles.header)}><span>{row.label}</span><strong className={sx(styles.number)}>{t("usage:messages.quotaRemaining", { percent: percent(Math.max(0, 100 - row.usedPercent)) })}</strong></div>
          <p className={sx(styles.note)}>{t(stale || expired ? "usage:messages.quotaUsedOlder" : "usage:messages.quotaUsed", { percent: percent(row.usedPercent) })}</p>
          <div role="meter" aria-label={`${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}`}
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, row.usedPercent)} aria-valuetext={t(expired ? "usage:messages.quotaUsedExpired" : stale ? "usage:messages.quotaUsedStale" : "usage:messages.quotaUsed", { percent: percent(row.usedPercent) })}
            className={sx(styles.track)}><div className={sx(styles.fill, row.usedPercent >= 97 ? styles.danger : row.usedPercent >= 80 && styles.warning)} style={{ width: `${Math.min(100, row.usedPercent)}%` }} /></div>
          <p className={sx(styles.note)}>{quotaResetCountdown(row.resetsAt, props.now)}{row.resetsAt !== null ? ` · ${usageTimestamp(new Date(row.resetsAt * 1000).toISOString(), props.timeZone)}` : ""}</p>
          <p className={sx(styles.note)}>{stale || expired ? i18n.t("usage:usageQuota.olderObservationVariant27f01b69") : i18n.t("usage:usageQuota.observed")}{usageTimestamp(row.observedAt, props.timeZone)}</p>
        </div>;
      })}</div>)}
    </div>}
    {!props.canRefresh ? <p className={sx(styles.note)}>{t("usage:usageQuota.chooseAProviderAndOneRegistered")}</p> : null}
    <Button variant="quiet" size="sm" aria-expanded={showHistory} onClick={() => setShowHistory((value) => !value)}>{showHistory ? t("usage:usageQuota.hideQuotaHistory") : t("usage:usageQuota.showQuotaHistory")}</Button>
    {showHistory ? <div className={sx(styles.section)}>
      <p className={sx(styles.note)}>{t("usage:usageQuota.observationsWithinTheSelectedPeriodDots")}</p>
      {props.report.quotaHistoryTruncated ? <p className={sx(styles.note)}>{t("usage:usageQuota.showingTheLatestObservationsInThis")}</p> : null}
      {history.length === 0 ? <p className={sx(styles.note)}>{t("usage:usageQuota.noObservationsInThisPeriodHistory")}</p> : <>
        <Select size="sm" aria-label={t("usage:usageQuota.quotaHistoryWindow")} value={selected} options={[...windows].map(([value, row]) => ({ value, label: `${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}` }))}
          onValueChange={(value) => { setWindowId(typeof value === "string" ? value : null); setPage(0); }} />
        <svg viewBox="0 0 760 160" role="img" aria-label={t("usage:usageQuota.observedQuotaSamplesExactReadingsAre", { value1: history.length })}>
          <text x="0" y="14" className={sx(styles.svgLabel)}>{percent(max)}</text>
          <text x="0" y="149" className={sx(styles.svgLabel)}>0%</text>
          <line x1="46" y1="140" x2="750" y2="140" className={sx(styles.svgAxis)} />
          {history.map((row) => <circle key={row.observedAt} cx={46 + (last > first ? (Date.parse(row.observedAt) - first) / (last - first) : 0.5) * 700}
            cy={140 - row.usedPercent / max * 125} r={3} className={sx(styles.svgPoint)}><title>{usageTimestamp(row.observedAt, props.timeZone)} · {percent(row.usedPercent)}</title></circle>)}
        </svg>
        <div className={sx(styles.chartEnds)}><span>{usageTimestamp(history[0]!.observedAt, props.timeZone)}</span><span>{usageTimestamp(history.at(-1)!.observedAt, props.timeZone)}</span></div>
        <Table aria-label={t("usage:usageQuota.quotaObservationHistory")}><TableHeader><TableRow><TableHead>{t("usage:messages.observedZoneHeading", { zone: props.timeZone })}</TableHead><TableHead>{t("usage:usageQuota.usedVariant285fdd")}</TableHead><TableHead>{t("usage:usageQuota.resets")}</TableHead><TableHead>{t("settings:general.notificationSound.sourceTitle")}</TableHead></TableRow></TableHeader>
          <TableBody>{samples.slice(currentPage * 20, (currentPage + 1) * 20).map((row) => <TableRow key={row.observedAt}>
            <TableCell className={sx(styles.number)}>{usageTimestamp(row.observedAt, props.timeZone)}</TableCell><TableCell>{percent(row.usedPercent)}</TableCell>
            <TableCell className={sx(styles.number)}>{row.resetsAt ? usageTimestamp(new Date(row.resetsAt * 1000).toISOString(), props.timeZone) : i18n.t("usage:usageParts.notReported")}</TableCell><TableCell>{row.source}</TableCell>
          </TableRow>)}</TableBody></Table>
        <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("usage:usageQuota.previousObservations")}</Button>
          <span className={sx(styles.note)}>{currentPage + 1} / {Math.max(1, Math.ceil(samples.length / 20))}</span>
          <Button variant="quiet" size="sm" disabled={(currentPage + 1) * 20 >= samples.length} onClick={() => setPage(currentPage + 1)}>{t("usage:usageQuota.nextObservations")}</Button></div>
      </>}
    </div> : null}
  </section>;
}
