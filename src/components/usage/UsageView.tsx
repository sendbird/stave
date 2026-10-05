import { formatDateTime } from "@/i18n/format";
import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Select } from "@/components/ads/components/Select";
import { Tabs } from "@/components/ads/components/Tabs";
import { EmptyState } from "@/components/ads/components/EmptyState";
import { Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { UNATTRIBUTED_ACCOUNT_ID, USAGE_PROVIDER_NAMES, type UsageStatisticsArgs, type UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import type { QuotaReadFeedback } from "@/lib/providers/quota-read-feedback";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { UsageBreakdowns, UsageFigures, UsageTimeline, UsageTurnHistory } from "./UsageParts";
import { UsageQuota } from "./UsageQuota";
import { dateInputValue, loadUsageStatistics, USAGE_PERIOD_OPTIONS, USAGE_TURN_PAGE_SIZE, usageAccountLabel, usageRange, type UsagePeriod, type UsageStatisticsLoader } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";
import { readQuota, type QuotaReader } from "./quota-read-feedback";
export type { QuotaReader } from "./quota-read-feedback";

const ALL = "all";
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
type ReadState = { status: "loading" | "unavailable" } | { status: "failed"; message: string } | { status: "ready"; report: UsageStatisticsReport };

/** Browsing usage never modifies execution-account settings. */
export function UsageView(props: { load?: UsageStatisticsLoader; readQuota?: QuotaReader; profiles?: ProviderAccountProfile[];
  initialProvider?: ProviderId; initialAccount?: string; now?: number; onClose?: () => void } = {}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const storeClose = useAppStore((state) => state.closeUsage);
  const close = props.onClose ?? storeClose;
  useLoadProviderAccounts();
  const registered = useProviderAccounts((state) => state.profiles);
  const accountError = useProviderAccounts((state) => state.error);
  const refreshAccounts = useProviderAccounts((state) => state.refresh);
  const profiles = props.profiles ?? registered;
  const [provider, setProvider] = useState<ProviderId | typeof ALL>(props.initialProvider ?? ALL);
  const [account, setAccount] = useState(props.initialAccount ?? ALL);
  const [modelId, setModelId] = useState<string | null | undefined>();
  const [view, setView] = useState(props.initialProvider ? "quota" : "tokens");
  const [period, setPeriod] = useState<UsagePeriod>("30");
  const [zone, setZone] = useState(localTimeZone);
  const [granularity, setGranularity] = useState<"day" | "hour">("day");
  const now = props.now ?? Date.now();
  const [start, setStart] = useState(() => dateInputValue(new Date(now)));
  const [end, setEnd] = useState(start);
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadState>({ status: "loading" });
  const [pending, setPending] = useState(true);
  const loadedArgs = useRef<UsageStatisticsArgs | null>(null);
  const [knownAccounts, setKnownAccounts] = useState<UsageStatisticsReport["knownAccounts"]>([]);
  const [quotaError, setQuotaError] = useState<string | null>(null);
  const [quotaFeedback, setQuotaFeedback] = useState<QuotaReadFeedback | null>(null);
  const [reading, setReading] = useState(false);
  const quotaGeneration = useRef(0);
  const load = props.load ?? loadUsageStatistics;
  const utc = zone === "UTC";
  const range = usageRange({ period, start, end, utc, now: new Date(now) });
  const args = useMemo<UsageStatisticsArgs | null>(() => range ? ({ ...range, timeZone: zone, granularity,
    ...(provider !== ALL ? { providerId: provider } : {}), ...(provider !== ALL && account !== ALL ? { accountProfileId: account } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    limit: USAGE_TURN_PAGE_SIZE, offset }) : null, [range?.from, range?.to, zone, granularity, provider, account, modelId, offset]);

  useEffect(() => {
    if (!args) return;
    let cancelled = false;
    setPending(true);
    // Keep the same report mounted during refresh so focus events and periodic
    // reads preserve expanded details. Changed filters must not show old totals.
    setState((previous) => previous.status === "ready" && loadedArgs.current === args
      ? previous : { status: "loading" });
    load(args).then((report) => {
      if (cancelled) return;
      setPending(false);
      if (report) { loadedArgs.current = args; setState({ status: "ready", report }); setKnownAccounts(report.knownAccounts); }
      else setState({ status: "unavailable" });
    }, (error: unknown) => {
      if (!cancelled) { setPending(false); setState({ status: "failed", message: error instanceof Error ? error.message : i18n.t("usage:usageView.usageCouldNotBeRead") }); }
    });
    return () => { cancelled = true; };
  }, [args, attempt, load]);

  useEffect(() => {
    quotaGeneration.current++;
    setQuotaError(null); setQuotaFeedback(null); setReading(false);
    return () => { quotaGeneration.current++; };
  }, [provider, account]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!event.defaultPrevented && event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey) close();
    };
    const refresh = () => { if (document.visibilityState !== "hidden") setAttempt((value) => value + 1); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", refresh);
    const timer = props.load ? null : setInterval(refresh, 60_000);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("focus", refresh); if (timer) clearInterval(timer); };
  }, [close, props.load]);

  const options = useMemo(() => {
    const accounts = new Set(profiles.filter((profile) => profile.providerId === provider).map((profile) => profile.id));
    for (const item of knownAccounts) if (item.providerId === provider) accounts.add(item.accountProfileId);
    if (provider !== ALL) accounts.add(SYSTEM_ACCOUNT_PROFILE_ID);
    if (account !== ALL) accounts.add(account);
    return [{ value: ALL, label: i18n.t("usage:usageView.allAccounts") }, ...[...accounts].map((id) => ({ value: id,
      label: provider === ALL ? id : usageAccountLabel(provider, id, profiles) }))];
  }, [profiles, knownAccounts, provider, account]);
  const profile = profiles.find((entry) => entry.providerId === provider && entry.id === account);
  const canRefresh = provider !== ALL && account !== ALL && account !== UNATTRIBUTED_ACCOUNT_ID && !profile?.gateway
    && (account === SYSTEM_ACCOUNT_PROFILE_ID || Boolean(profile));
  const refreshQuota = async () => {
    if (!canRefresh) return;
    const generation = ++quotaGeneration.current;
    setReading(true); setQuotaError(null); setQuotaFeedback(null);
    try {
      const result = await (props.readQuota ?? readQuota)(provider, account);
      if (generation !== quotaGeneration.current) return;
      setQuotaError(result.error); setQuotaFeedback(result.feedback); setAttempt((value) => value + 1);
    } catch {
      if (generation === quotaGeneration.current) setQuotaError(i18n.t("usage:usageView.quotaCouldNotBeReadTry"));
    } finally { if (generation === quotaGeneration.current) setReading(false); }
  };
  const selectAccount = (providerId: ProviderId, id: string) => { if (provider !== providerId) setModelId(undefined); setProvider(providerId); setAccount(id); setOffset(0); };
  const selectModel = (providerId: ProviderId, id: string | null) => { if (provider !== providerId) setAccount(ALL); setProvider(providerId); setModelId(id); setOffset(0); };
  const report = state.status === "ready" ? state.report : null;
  const content = () => {
    if (!args) return <p role="alert" className={sx(styles.note)}>{i18n.t("usage:usageView.chooseValidStartAndEndDates")}</p>;
    if (state.status === "loading") return <p role="status" className={sx(styles.note)}>{i18n.t("usage:usageView.readingUsageHistory")}</p>;
    if (state.status === "unavailable") return <EmptyState title={i18n.t("usage:usageView.usageHistoryIsAvailableInThe")} description={i18n.t("usage:usageView.openStaveDesktopToReadLocally")} />;
    if (state.status === "failed") return <EmptyState role="alert" tone="danger" title={i18n.t("usage:usageView.usageCouldNotBeReadVariant3af6e948")} description={state.message} action={{ children: i18n.t("compare:resultsView.tryAgain"), onClick: () => setAttempt((value) => value + 1) }} />;
    if (!report) return null;
    return <>
      <Tabs.Panel value="quota" xstyle={styles.section}>
        <UsageQuota report={report} profiles={profiles} timeZone={zone} canRefresh={canRefresh} reading={reading} error={quotaError} feedback={quotaFeedback} onRefresh={() => void refreshQuota()} now={now} apiBilling={Boolean(profile?.gateway)} onAccount={selectAccount}
          providerId={provider !== ALL ? provider : undefined} accountProfileId={account !== ALL ? account : undefined} />
      </Tabs.Panel>
      <Tabs.Panel value="tokens" xstyle={styles.section}>
      {report.totals.turns === 0 ? <EmptyState title={i18n.t("usage:usageView.noCompletedTurnsInThisSelection")} description={i18n.t("usage:usageView.chooseAnotherAccountModelOrPeriod")} /> : <>
        <UsageFigures totals={report.totals} />
        <p className={sx(styles.note)}>{i18n.t("usage:usageView.tokenTotalsExcludeCacheReadsClaude")}</p>
        <UsageTimeline report={report} granularity={granularity} timeZone={zone} onDay={(day) => { setStart(day); setEnd(day); setPeriod("custom"); setGranularity("hour"); setOffset(0); }} />
        <UsageBreakdowns report={report} profiles={profiles} onAccount={selectAccount} onModel={selectModel} />
      </>}
      </Tabs.Panel>
      <Tabs.Panel value="history" xstyle={styles.section}>
        <UsageTurnHistory report={report} profiles={profiles} timeZone={zone} offset={offset} onPage={setOffset} />
      </Tabs.Panel>
      <p className={sx(styles.note)}>{t("usage:messages.reportScope", { readAt: formatDateTime(report.generatedAt, { timeZone: zone, dateStyle: "medium", timeStyle: "short" }) })}</p>
    </>;
  };
  return <div className={sx(styles.scroll)}><main className={sx(styles.page)} aria-label={t("usage:usageView.aiUsageStatistics")}><Tabs.Root value={view} onValueChange={(value) => { if (typeof value === "string") setView(value); }} xstyle={styles.section}>
    <header className={sx(styles.header)}><div className={sx(styles.stack, styles.headerCopy)}><h1 className={sx(styles.title)}>{t("usage:usageView.aiUsage")}</h1>
      <p className={sx(styles.note)}>{t("usage:usageView.accountLimitsTokenUsageAndWhen")}</p></div>
      <div className={sx(styles.row)}><Button variant="quiet" size="sm" aria-label={t("usage:usageView.refreshUsageHistory")} disabled={pending} onClick={() => setAttempt((value) => value + 1)}><RefreshCw /></Button>
        <Button variant="quiet" size="sm" aria-label={t("usage:usageView.closeUsage")} onClick={close}><X /></Button></div></header>
    <Tabs.List aria-label={t("usage:usageView.usageViews")} xstyle={styles.viewTabs}>
      <Tabs.Tab value="tokens">{t("usage:usageView.tokensCost")}</Tabs.Tab><Tabs.Tab value="quota">{t("usage:usageView.quota")}</Tabs.Tab><Tabs.Tab value="history">{t("usage:usageView.history")}</Tabs.Tab><Tabs.Indicator />
    </Tabs.List>
    <div className={sx(styles.filters)} aria-label={t("usage:usageView.usageFilters")}>
      <Select label={t("settingsProviders:mcpConfigEditor.editor.provider")} size="sm" value={provider} options={[{ value: ALL, label: t("usage:usageView.allProviders") }, ...Object.entries(USAGE_PROVIDER_NAMES).map(([value, label]) => ({ value, label }))]}
        onValueChange={(value) => { if (value) { setProvider(value as ProviderId | typeof ALL); setAccount(ALL); setModelId(undefined); setOffset(0); } }} />
      <Select label={t("settingsProviders:codexOverviewTab.runtime.account")} size="sm" value={account} options={options} disabled={provider === ALL} onValueChange={(value) => { if (typeof value === "string") { setAccount(value); setOffset(0); } }} />
      <Select label={t("compare:resultsView.period")} size="sm" value={period} options={USAGE_PERIOD_OPTIONS} onValueChange={(value) => { if (value) { setPeriod(value as UsagePeriod); setOffset(0); } }} />
      <Select label={t("usage:usageView.groupBy")} size="sm" value={granularity} options={[{ value: "day", label: t("usage:usageView.day") }, { value: "hour", label: t("usage:usageView.hour") }]} onValueChange={(value) => { if (value) setGranularity(value as "day" | "hour"); }} />
      <Select label={t("usage:usageView.timezone")} size="sm" value={zone} options={localTimeZone() === "UTC" ? [{ value: "UTC", label: "UTC" }] : [{ value: localTimeZone(), label: localTimeZone() }, { value: "UTC", label: "UTC" }]} onValueChange={(value) => { if (typeof value === "string") { setZone(value); setOffset(0); } }} />
      {period === "custom" ? <><label className={sx(styles.field)}>{t("usage:usageView.from")}<Input type="date" value={start} onChange={(event) => { setStart(event.target.value); setOffset(0); }} /></label>
        <label className={sx(styles.field)}>{t("usage:usageView.through")}<Input type="date" value={end} onChange={(event) => { setEnd(event.target.value); setOffset(0); }} /></label></> : null}
    </div>
    {range ? <p className={sx(styles.note)}>{t("usage:messages.reportPeriod", { from: dateInputValue(new Date(range.from), utc), to: dateInputValue(new Date(Date.parse(range.to) - 1), utc), zone: zone })}</p> : null}
    {modelId !== undefined ? <div className={sx(styles.row)}><span className={sx(styles.note)}>{t("usage:messages.selectedModel", { model: modelId ?? t("usage:usageParts.modelNotRecorded") })}</span>
      <Button variant="quiet" size="sm" onClick={() => { setModelId(undefined); setOffset(0); }}>{t("usage:usageView.clearModelFilter")}</Button></div> : null}
    {accountError && !props.profiles ? <p role="alert" className={sx(styles.note)}>{t("usage:usageView.accountLabelsCouldNotBeLoaded")}<Button variant="link" size="sm" onClick={() => void refreshAccounts()}>{t("usage:usageView.retryAccounts")}</Button></p> : null}
    {content()}
  </Tabs.Root></main></div>;
}
