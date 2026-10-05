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
import { quotaObservations, UNATTRIBUTED_ACCOUNT_ID, USAGE_PROVIDER_NAMES, type UsageStatisticsArgs, type UsageStatisticsReport } from "@/lib/providers/usage-statistics";
import type { ProviderId } from "@/lib/providers/provider.types";
import { useAppStore } from "@/store/app.store";
import { UsageBreakdowns, UsageFigures, UsageTimeline, UsageTurnTable } from "./UsageParts";
import { UsageQuota } from "./UsageQuota";
import { dateInputValue, loadUsageStatistics, USAGE_PERIOD_OPTIONS, usageAccountLabel, usageRange, type UsagePeriod, type UsageStatisticsLoader } from "./usage-view.utils";
import { usageStyles as styles } from "./usage.styles";

const ALL = "all";
const localTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export type QuotaReader = (providerId: ProviderId, accountProfileId: string) => Promise<string | null>;
async function readQuota(providerId: ProviderId, accountProfileId: string): Promise<string | null> {
  const read = window.api?.provider?.getRateLimitsSnapshot;
  if (!read) return "Quota reads are available in the desktop app.";
  const snapshot = await read({ providers: [providerId], force: true, reason: "manual",
    runtimeOptions: { claudeAccountProfileId: providerId === "claude-code" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID,
      codexAccountProfileId: providerId === "codex" ? accountProfileId : SYSTEM_ACCOUNT_PROFILE_ID } });
  const key = providerId === "claude-code" ? "claude" : providerId;
  return quotaObservations(snapshot, providerId, accountProfileId, new Date().toISOString()).length > 0
    ? null : snapshot[key].error ?? "This account did not report quota limits.";
}

type ReadState = { status: "loading" | "unavailable" } | { status: "failed"; message: string } | { status: "ready"; report: UsageStatisticsReport };

/** Browsing usage never modifies execution-account settings. */
export function UsageView(props: { load?: UsageStatisticsLoader; readQuota?: QuotaReader; profiles?: ProviderAccountProfile[];
  initialProvider?: ProviderId; initialAccount?: string; now?: number; onClose?: () => void } = {}) {
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
  const [reading, setReading] = useState(false);
  const quotaGeneration = useRef(0);
  const load = props.load ?? loadUsageStatistics;
  const utc = zone === "UTC";
  const range = usageRange({ period, start, end, utc, now: new Date(now) });
  const args = useMemo<UsageStatisticsArgs | null>(() => range ? ({ ...range, timeZone: zone, granularity,
    ...(provider !== ALL ? { providerId: provider } : {}), ...(provider !== ALL && account !== ALL ? { accountProfileId: account } : {}),
    ...(modelId !== undefined ? { modelId } : {}),
    limit: 50, offset }) : null, [range?.from, range?.to, zone, granularity, provider, account, modelId, offset]);

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
      if (!cancelled) { setPending(false); setState({ status: "failed", message: error instanceof Error ? error.message : "Usage could not be read." }); }
    });
    return () => { cancelled = true; };
  }, [args, attempt, load]);

  useEffect(() => {
    quotaGeneration.current++;
    setQuotaError(null); setReading(false);
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
    return [{ value: ALL, label: "All accounts" }, ...[...accounts].map((id) => ({ value: id,
      label: provider === ALL ? id : usageAccountLabel(provider, id, profiles) }))];
  }, [profiles, knownAccounts, provider, account]);
  const profile = profiles.find((entry) => entry.providerId === provider && entry.id === account);
  const canRefresh = provider !== ALL && account !== ALL && account !== UNATTRIBUTED_ACCOUNT_ID && !profile?.gateway
    && (account === SYSTEM_ACCOUNT_PROFILE_ID || Boolean(profile));
  const refreshQuota = async () => {
    if (!canRefresh) return;
    const generation = ++quotaGeneration.current;
    setReading(true); setQuotaError(null);
    try {
      const error = await (props.readQuota ?? readQuota)(provider, account);
      if (generation !== quotaGeneration.current) return;
      setQuotaError(error); setAttempt((value) => value + 1);
    } catch {
      if (generation === quotaGeneration.current) setQuotaError("Quota could not be read. Try again.");
    } finally { if (generation === quotaGeneration.current) setReading(false); }
  };
  const selectAccount = (providerId: ProviderId, id: string) => { if (provider !== providerId) setModelId(undefined); setProvider(providerId); setAccount(id); setOffset(0); };
  const selectModel = (providerId: ProviderId, id: string | null) => { if (provider !== providerId) setAccount(ALL); setProvider(providerId); setModelId(id); setOffset(0); };
  const report = state.status === "ready" ? state.report : null;
  const content = () => {
    if (!args) return <p role="alert" className={sx(styles.note)}>Choose valid start and end dates, at most 366 days apart.</p>;
    if (state.status === "loading") return <p role="status" className={sx(styles.note)}>Reading usage history…</p>;
    if (state.status === "unavailable") return <EmptyState title="Usage history is available in the desktop app" description="Open Stave desktop to read locally recorded turns and account quota." />;
    if (state.status === "failed") return <EmptyState role="alert" tone="danger" title="Usage could not be read" description={state.message} action={{ children: "Try again", onClick: () => setAttempt((value) => value + 1) }} />;
    if (!report) return null;
    return <>
      <Tabs.Panel value="quota" xstyle={styles.section}>
        <UsageQuota report={report} profiles={profiles} timeZone={zone} canRefresh={canRefresh} reading={reading} error={quotaError} onRefresh={() => void refreshQuota()} now={now} apiBilling={Boolean(profile?.gateway)} onAccount={selectAccount}
          providerId={provider !== ALL ? provider : undefined} accountProfileId={account !== ALL ? account : undefined} />
      </Tabs.Panel>
      <Tabs.Panel value="tokens" xstyle={styles.section}>
      {report.totals.turns === 0 ? <EmptyState title="No completed turns in this selection" description="Choose another account, model or period. New usage appears after a Stave turn finishes; the Quota tab is independent." /> : <>
        <UsageFigures totals={report.totals} />
        <p className={sx(styles.note)}>Token totals exclude cache reads: Claude adds cache writes to new input; Codex subtracts cache reads from inclusive input. Optional counters may be absent. Models use the resolved runtime model when reported, otherwise the requested model.</p>
        <UsageTimeline report={report} granularity={granularity} timeZone={zone} onDay={(day) => { setStart(day); setEnd(day); setPeriod("custom"); setGranularity("hour"); setOffset(0); }} />
        <UsageBreakdowns report={report} profiles={profiles} onAccount={selectAccount} onModel={selectModel} />
      </>}
      </Tabs.Panel>
      <Tabs.Panel value="history" xstyle={styles.section}>
        <UsageTurnTable report={report} profiles={profiles} timeZone={zone} offset={offset} onPage={setOffset} />
      </Tabs.Panel>
      <p className={sx(styles.note)}>Read {new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: "medium", timeStyle: "short" }).format(new Date(report.generatedAt))} · tokens cover completed Stave turns only, including agent and MCP task turns. Terminal CLI and other applications are not included. History without execution-account evidence stays unattributed.</p>
    </>;
  };
  return <div className={sx(styles.scroll)}><main className={sx(styles.page)} aria-label="AI usage statistics"><Tabs.Root value={view} onValueChange={(value) => { if (typeof value === "string") setView(value); }} xstyle={styles.section}>
    <header className={sx(styles.header)}><div className={sx(styles.stack, styles.headerCopy)}><h1 className={sx(styles.title)}>AI usage</h1>
      <p className={sx(styles.note)}>Account limits, token usage and when work happened. Across all workspaces on this device.</p></div>
      <div className={sx(styles.row)}><Button variant="quiet" size="sm" aria-label="Refresh usage history" disabled={pending} onClick={() => setAttempt((value) => value + 1)}><RefreshCw /></Button>
        <Button variant="quiet" size="sm" aria-label="Close usage" onClick={close}><X /></Button></div></header>
    <Tabs.List aria-label="Usage views" xstyle={styles.viewTabs}>
      <Tabs.Tab value="tokens">Tokens & cost</Tabs.Tab><Tabs.Tab value="quota">Quota</Tabs.Tab><Tabs.Tab value="history">History</Tabs.Tab><Tabs.Indicator />
    </Tabs.List>
    <div className={sx(styles.filters)} aria-label="Usage filters">
      <Select label="Provider" size="sm" value={provider} options={[{ value: ALL, label: "All providers" }, ...Object.entries(USAGE_PROVIDER_NAMES).map(([value, label]) => ({ value, label }))]}
        onValueChange={(value) => { if (value) { setProvider(value as ProviderId | typeof ALL); setAccount(ALL); setModelId(undefined); setOffset(0); } }} />
      <Select label="Account" size="sm" value={account} options={options} disabled={provider === ALL} onValueChange={(value) => { if (typeof value === "string") { setAccount(value); setOffset(0); } }} />
      <Select label="Period" size="sm" value={period} options={USAGE_PERIOD_OPTIONS} onValueChange={(value) => { if (value) { setPeriod(value as UsagePeriod); setOffset(0); } }} />
      <Select label="Group by" size="sm" value={granularity} options={[{ value: "day", label: "Day" }, { value: "hour", label: "Hour" }]} onValueChange={(value) => { if (value) setGranularity(value as "day" | "hour"); }} />
      <Select label="Timezone" size="sm" value={zone} options={localTimeZone() === "UTC" ? [{ value: "UTC", label: "UTC" }] : [{ value: localTimeZone(), label: localTimeZone() }, { value: "UTC", label: "UTC" }]} onValueChange={(value) => { if (typeof value === "string") { setZone(value); setOffset(0); } }} />
      {period === "custom" ? <><label className={sx(styles.field)}>From<Input type="date" value={start} onChange={(event) => { setStart(event.target.value); setOffset(0); }} /></label>
        <label className={sx(styles.field)}>Through<Input type="date" value={end} onChange={(event) => { setEnd(event.target.value); setOffset(0); }} /></label></> : null}
    </div>
    {range ? <p className={sx(styles.note)}>{dateInputValue(new Date(range.from), utc)} – {dateInputValue(new Date(Date.parse(range.to) - 1), utc)} · {zone} · filters only change this report</p> : null}
    {modelId !== undefined ? <div className={sx(styles.row)}><span className={sx(styles.note)}>Model · {modelId ?? "Model not recorded"} · quota remains account-wide</span>
      <Button variant="quiet" size="sm" onClick={() => { setModelId(undefined); setOffset(0); }}>Clear model filter</Button></div> : null}
    {accountError && !props.profiles ? <p role="alert" className={sx(styles.note)}>Account labels could not be loaded. <Button variant="link" size="sm" onClick={() => void refreshAccounts()}>Retry accounts</Button></p> : null}
    {content()}
  </Tabs.Root></main></div>;
}
