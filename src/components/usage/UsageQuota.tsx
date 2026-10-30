import { formatDateTime, formatDuration, formatNumber, formatPercent, formatTimeAgo } from "@/i18n/format";
import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { sx } from "@/components/ads/utils/stylex";
import { thresholdTone, type Tone, type ToneThreshold } from "@/components/ads/utils/tone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import type { QuotaObservation, UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import { usageScopeLabel, usageTimestamp } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";
import { groupQuotaAccounts, quotaResetCountdown, quotaWindowState, splitQuotaRows, tightestQuotaWindow, type QuotaWindowState } from "./usage-quota.utils";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { QuotaReadFeedback } from "@/lib/providers/quota-read-feedback";
import { quotaReadFeedbackText } from "./quota-read-feedback";
import { NotReported, UsageInfo } from "./UsageInfo";

const identity = (row: QuotaObservation) => `${row.providerId}:${row.accountProfileId}:${row.windowId}`;
const percent = (value: number) => `${formatNumber(value, { maximumFractionDigits: 1 })}%`;
/** A saved window is worth watching from 80% used and about to bind from 97%. */
const QUOTA_FILL_THRESHOLDS = [
  { from: 80, tone: "warning" },
  { from: 97, tone: "danger" },
] as const satisfies readonly ToneThreshold<Extract<Tone, "warning" | "danger">>[];
const QUOTA_FILL = { neutral: null, warning: styles.warning, danger: styles.danger } as const;

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
  const listed = accounts.flatMap((account) => account.windows);
  const windowCount = listed.length;
  const tightest = tightestQuotaWindow(listed, props.now);
  const isGateway = (account: { providerId: ProviderId; accountProfileId: string }) =>
    Boolean(props.profiles.find((profile) => profile.providerId === account.providerId && profile.id === account.accountProfileId)?.gateway);
  const quotaRows = splitQuotaRows(accounts, isGateway);
  // A gateway account has no subscription quota to be missing, so it gets no "no saved quota" note.
  const renderAccount = (account: (typeof accounts)[number]) => <div className={sx(styles.quota)} key={`${account.providerId}:${account.accountProfileId}`}>
    <Button variant="link" size="sm" flushInline onClick={() => props.onAccount(account.providerId, account.accountProfileId)}>{usageScopeLabel(account.providerId, account.accountProfileId, props.profiles)}</Button>
    {account.windows.length === 0 ? (isGateway(account) ? null : <p className={sx(styles.note)}>{i18n.t("usage:usageQuota.noSavedQuotaSelectThisAccount")}</p>)
      : account.windows.map((row) => <QuotaWindow key={identity(row)} row={row} profiles={props.profiles} timeZone={props.timeZone} now={props.now} />)}
  </div>;
  return <section className={sx(styles.section)} aria-label={t("usage:usageQuota.accountQuota")}>
    <div className={sx(styles.header)}>
      <div className={sx(styles.titleRow, styles.headerCopy)}><h2 className={sx(styles.heading)}>{t("usage:usageQuota.accountQuota")}</h2>
        <UsageInfo title={t("usage:usageQuota.aboutTitle")}>
          <p className={sx(styles.infoBody)}>{t("usage:usageQuota.latestObservedAccountLimitsIncludesUsage")}</p>
          <p className={sx(styles.infoBody)}>{t("usage:usageQuota.accountsAreListedSeparatelyWithThe")}</p>
        </UsageInfo></div>
      <Button xstyle={styles.control} variant="outline" size="sm" disabled={!props.canRefresh || props.reading} onClick={props.onRefresh}>{props.reading ? t("usage:usageQuota.readingQuota") : t("usage:usageQuota.refreshQuota")}</Button>
    </div>
    {feedbackText ? <p role="status" className={sx(styles.note)}>{feedbackText}</p> : null}
    {props.error ? <p role="alert" className={sx(styles.note)}>{props.error} {t("usage:usageQuota.savedObservationsBelowMayBeOlder")}</p> : null}
    {props.apiBilling ? <p className={sx(styles.note)}>{t("usage:usageQuota.thisAPIConnectionIsBilledBy")}</p> : null}
    {tightest && windowCount > 1 ? <QuotaHeadline row={tightest.row} state={tightest.state} profiles={props.profiles} timeZone={props.timeZone} now={props.now} /> : null}
    {accounts.length === 0 ? <p className={sx(styles.note)}>{t("usage:usageQuota.noAccountsInThisSelectionUnsupported")}</p> : <div className={sx(styles.quotas)}>
      {quotaRows.providers.map((row) => <div className={sx(styles.quotaRow)} key={row.providerId}>{row.accounts.map(renderAccount)}</div>)}
      {quotaRows.gateways.length > 0 ? <div className={sx(styles.quotaApi)}>
        <p className={sx(styles.note)}>{t("usage:usageQuota.apiConnections")}</p>
        <div className={sx(styles.quotaRow)}>{quotaRows.gateways.map(renderAccount)}</div>
      </div> : null}
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
            <TableCell className={sx(styles.number)}>{row.resetsAt ? usageTimestamp(new Date(row.resetsAt * 1000).toISOString(), props.timeZone) : <NotReported />}</TableCell><TableCell>{row.source}</TableCell>
          </TableRow>)}</TableBody></Table>
        <div className={sx(styles.row)}><Button variant="quiet" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>{t("usage:usageQuota.previousObservations")}</Button>
          <span className={sx(styles.note)}>{currentPage + 1} / {Math.max(1, Math.ceil(samples.length / 20))}</span>
          <Button variant="quiet" size="sm" disabled={(currentPage + 1) * 20 >= samples.length} onClick={() => setPage(currentPage + 1)}>{t("usage:usageQuota.nextObservations")}</Button></div>
      </>}
    </div> : null}
  </section>;
}

const fillTone = (usedPercent: number) => QUOTA_FILL[thresholdTone(usedPercent, QUOTA_FILL_THRESHOLDS, "neutral")];
const TEXT_TONE = { neutral: null, warning: styles.warningText, danger: styles.dangerText } as const;
const resetTime = (resetsAt: number, timeZone: string) => formatDateTime(resetsAt * 1000,
  { timeZone, month: "short", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Countdown first, then the clock time it lands on, then how much of the window has passed. */
function resetLine(row: QuotaObservation, state: QuotaWindowState, timeZone: string, now: number) {
  const parts = [quotaResetCountdown(row.resetsAt, now)];
  if (row.resetsAt !== null && !state.expired) parts.push(resetTime(row.resetsAt, timeZone));
  if (state.elapsedRatio !== null) parts.push(i18n.t("usage:usageQuota.windowElapsed", { percent: formatPercent(state.elapsedRatio) }));
  return parts.join(" · ");
}

/** Pace in words; a projected run-out reads as a warning, a lasting pace as a note. */
function paceText(state: QuotaWindowState, row: QuotaObservation, timeZone: string) {
  const pace = state.pace;
  if (!pace) return null;
  if (pace.kind === "exhausted") return { tone: "danger" as const, text: i18n.t("usage:usageQuota.paceExhausted") };
  if (pace.kind === "runsOut") return { tone: "warning" as const, text: i18n.t("usage:usageQuota.paceRunsOut", {
    time: pace.at - Date.parse(row.observedAt) < 12 * 3_600_000 ? formatDateTime(pace.at, { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : resetTime(pace.at / 1000, timeZone),
    lead: formatDuration(row.resetsAt! * 1000 - pace.at, { units: 1 }) }) };
  return { tone: "neutral" as const, text: i18n.t("usage:usageQuota.paceLasts", { percent: percent(Math.round(pace.projectedPercent)) }) };
}

function QuotaMeter(props: { row: QuotaObservation; state: QuotaWindowState; label: string }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { row, state } = props;
  const key = state.expired ? "usage:messages.quotaUsedExpired" : state.stale ? "usage:messages.quotaUsedStale" : "usage:messages.quotaUsed";
  return <div role="meter" aria-label={props.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, row.usedPercent)}
    aria-valuetext={t(key, { percent: percent(row.usedPercent) })} className={sx(styles.track)}>
    <div className={sx(styles.fill, fillTone(row.usedPercent))} style={{ width: `${Math.min(100, row.usedPercent)}%` }} />
    {state.elapsedRatio !== null ? <div aria-hidden="true" className={sx(styles.elapsedMarker)} style={{ insetInlineStart: `${state.elapsedRatio * 100}%` }} /> : null}
  </div>;
}

function QuotaWindow(props: { row: QuotaObservation; profiles: readonly ProviderAccountProfile[]; timeZone: string; now: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { row } = props;
  const state = quotaWindowState(row, props.now);
  const tone = state.stale || state.expired ? "neutral" : thresholdTone(row.usedPercent, QUOTA_FILL_THRESHOLDS, "neutral");
  const pace = paceText(state, row, props.timeZone);
  return <div className={sx(styles.quotaWindow)}>
    <div className={sx(styles.quotaWindowHead)}><span>{row.label}</span>
      <strong className={sx(styles.number, TEXT_TONE[tone])}>{t("usage:messages.quotaRemaining", { percent: percent(state.remainingPercent) })}</strong></div>
    <QuotaMeter row={row} state={state} label={`${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}`} />
    <p className={sx(styles.note)}>{resetLine(row, state, props.timeZone, props.now)}</p>
    {pace ? <p className={sx(styles.note, TEXT_TONE[pace.tone])} title={t("usage:usageQuota.paceAssumption")}>{pace.text}</p> : null}
    <p className={sx(styles.note)} title={usageTimestamp(row.observedAt, props.timeZone)}>
      {t(state.stale || state.expired ? "usage:usageQuota.observedOlder" : "usage:usageQuota.observedAgo", { ago: formatTimeAgo(row.observedAt, props.now) })}</p>
  </div>;
}

/** The one limit that stops work first, so the answer to "can I keep going?" needs no scanning. */
function QuotaHeadline(props: { row: QuotaObservation; state: QuotaWindowState; profiles: readonly ProviderAccountProfile[]; timeZone: string; now: number }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { row, state } = props;
  const tone = thresholdTone(row.usedPercent, QUOTA_FILL_THRESHOLDS, "neutral");
  const pace = paceText(state, row, props.timeZone);
  const scope = `${usageScopeLabel(row.providerId, row.accountProfileId, props.profiles)} · ${row.label}`;
  return <section className={sx(styles.quotaHeadline)} aria-label={t("usage:usageQuota.tightestLimit")}>
    <p className={sx(styles.note)}>{t("usage:usageQuota.tightestLimit")}</p>
    <div className={sx(styles.quotaWindowHead)}><span className={sx(styles.quotaHeadlineScope)}>{scope}</span>
      <strong className={sx(styles.value, styles.number, TEXT_TONE[tone])}>{t("usage:messages.quotaRemaining", { percent: percent(state.remainingPercent) })}</strong></div>
    <QuotaMeter row={row} state={state} label={scope} />
    <p className={sx(styles.note)}>{resetLine(row, state, props.timeZone, props.now)}</p>
    {pace ? <p className={sx(styles.headlinePace, TEXT_TONE[pace.tone])}>{pace.text}</p> : null}
    {state.pace && state.pace.kind !== "exhausted" ? <p className={sx(styles.note)}>{t("usage:usageQuota.paceAssumption")}</p> : null}
  </section>;
}
