import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { Accordion } from "@/components/aui/components/Accordion";
import { Button } from "@/components/aui/components/Button";
import { Meter } from "@/components/aui/components/Meter";
import { Select } from "@/components/aui/components/Select";
import { TextField } from "@/components/aui/components/TextField";
import { sx } from "@/components/aui/utils/stylex";
import { SettingsCard } from "@/components/layout/settings-dialog.shared";
import { openDailyLimitSettings } from "@/lib/usage/daily-limit-navigation";
import { USAGE_PROVIDER_NAMES } from "@/lib/providers/usage-statistics";
import type { DailyLimit, DailyUsage, DailyUsageApi, DailyUsageReport } from "@/lib/usage/daily-limit";
import { UsageInfo } from "./UsageInfo";
import { usageStyles as styles } from "./usage.styles";

export function DailyLimitSettingsLink({ beforeOpen }: { beforeOpen?: () => void } = {}) {
  const { t } = useTranslation(["usage"]);
  return <Button variant="link" size="sm" flushInline onClick={() => { beforeOpen?.(); openDailyLimitSettings(); }}>{t("usage:dailyLimit.raise")}</Button>;
}

function DailyLimitEditor({ usage, busy, onSave }: { usage: DailyUsage; busy: boolean; onSave: (limit: DailyLimit | null) => void }) {
  const { t } = useTranslation(["usage"]);
  const [unit, setUnit] = useState<"off" | DailyLimit["unit"]>(usage.limit?.unit ?? "off");
  const [amount, setAmount] = useState(usage.limit ? String(usage.limit.amount) : "");
  const number = Number(amount);
  const valid = unit === "off" || Number.isFinite(number) && number > 0;
  const changed = unit !== (usage.limit?.unit ?? "off") || (unit !== "off" && number !== usage.limit?.amount);
  const canSave = !busy && valid && changed;
  const options = [{ value: "off", label: t("usage:dailyLimit.off") }, { value: "tokens", label: t("usage:dailyLimit.tokens") },
    ...(usage.costAvailable || usage.limit?.unit === "usd" ? [{ value: "usd", label: t("usage:dailyLimit.usd") }] : [])];
  const provider = USAGE_PROVIDER_NAMES[usage.providerId];
  return <form className={sx(styles.dailyEditor)} onSubmit={(event) => {
    event.preventDefault();
    if (canSave) onSave(unit === "off" ? null : { unit, amount: number });
  }}>
    <div className={sx(styles.dailyEditorField)}>
      <Select aria-label={t("usage:dailyLimit.unit", { provider })} size="sm" value={unit} options={options}
        disabled={busy} onValueChange={(value) => { if (value === "off" || value === "tokens" || value === "usd") setUnit(value); }} />
    </div>
    {unit !== "off" ? <div className={sx(styles.dailyEditorField)}>
      <TextField controlOnly aria-label={t("usage:dailyLimit.amount", { provider })} placeholder={t("usage:dailyLimit.amountPlaceholder")}
        size="sm" type="number" min="0" step="any" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} />
    </div> : null}
    <Button type="submit" size="sm" variant="secondary" disabled={!canSave}>{t("usage:dailyLimit.save")}</Button>
  </form>;
}

/** Global local-day totals, independent of the history view's account, model and period filters. */
export function DailyLimits({ editable = false, collapsed = false, refreshKey, api: providedApi, onOpenSettings }: {
  editable?: boolean; collapsed?: boolean; refreshKey?: unknown; api?: DailyUsageApi; onOpenSettings?: () => void;
}) {
  const { t } = useTranslation(["usage"]);
  const api = providedApi ?? (typeof window === "undefined" ? undefined : window.api?.persistence?.dailyUsage);
  const [report, setReport] = useState<DailyUsageReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const saving = useRef(false);
  const hasReport = report !== null;
  useLayoutEffect(() => {
    if (!editable || !hasReport) return;
    // A deep link can focus the card while its rows are still loading.
    const card = document.getElementById("daily-limits");
    if (card && document.activeElement === card) card.scrollIntoView({ block: "start", behavior: "auto" });
  }, [editable, hasReport]);
  useEffect(() => {
    if (!api) return;
    let current = true;
    const read = () => {
      if (saving.current) return;
      const request = ++generation.current;
      void api.read().then((value) => { if (current && request === generation.current) { setReport(value); setFailed(false); } },
        () => { if (current && request === generation.current) setFailed(true); });
    };
    read();
    window.addEventListener("focus", read);
    window.addEventListener("stave:daily-limit-changed", read);
    const timer = window.setInterval(read, 60_000);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener("focus", read); window.removeEventListener("stave:daily-limit-changed", read); };
  }, [api, refreshKey, attempt]);
  if (!api) return null;
  const save = async (usage: DailyUsage, limit: DailyLimit | null) => {
    setBusy(true);
    saving.current = true;
    ++generation.current;
    try { setReport(await api.update({ providerId: usage.providerId, limit })); setFailed(false); }
    catch { setFailed(true); }
    finally { saving.current = false; setBusy(false); window.dispatchEvent(new Event("stave:daily-limit-changed")); }
  };
  const title = t("usage:dailyLimit.title");
  const description = t("usage:dailyLimit.description");
  const accounting = <UsageInfo title={t("usage:dailyLimit.accounting")}>
    <p className={sx(styles.infoBody)}>{t("usage:dailyLimit.accountingDetail")}</p>
  </UsageInfo>;
  const rows = <>
    {failed ? <p role="alert" className={sx(styles.note)}>{t("usage:dailyLimit.failed")} <Button variant="link" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t("usage:dailyLimit.retry")}</Button></p> : null}
    {!report && !failed ? <p role="status" className={sx(styles.note)}>{t("usage:dailyLimit.loading")}</p> : null}
    {report ? <DailyUsageRows report={report} editable={editable} busy={busy} onSave={save} /> : null}
  </>;
  if (editable) {
    return <SettingsCard id="daily-limits" tabIndex={-1} title={title} description={description} titleAccessory={accounting}>
      {rows}
    </SettingsCard>;
  }
  const content = <div className={sx(styles.section)}>
    <div className={sx(styles.titleRow)}><p className={sx(styles.note)}>{description}</p>{accounting}</div>
    {rows}
    <DailyLimitSettingsLink beforeOpen={onOpenSettings} />
  </div>;
  if (collapsed) {
    return <Accordion xstyle={styles.dailyDisclosure} defaultValue={[]} items={[{ value: "daily-limits", title, content }]} />;
  }
  return <section className={sx(styles.section)} aria-label={title}>
    <h3 className={sx(styles.heading)}>{title}</h3>
    {content}
  </section>;
}

export function DailyUsageRows({ report, editable = false, busy = false, onSave }: {
  report: DailyUsageReport; editable?: boolean; busy?: boolean; onSave?: (usage: DailyUsage, limit: DailyLimit | null) => void;
}) {
  const { t } = useTranslation(["usage"]);
  return <div className={sx(editable ? styles.dailyEditors : styles.stack)}>{report.providers.map((usage) => {
      const unit = usage.limit?.unit ?? "tokens";
      const spent = unit === "usd" ? usage.costUsd : usage.tokens;
      const value = spent === null ? t("usage:dailyLimit.unknown") : formatNumber(spent, unit === "usd" ? { style: "currency", currency: "USD", maximumFractionDigits: 12 } : {});
      return <div key={usage.providerId} className={sx(editable ? styles.dailyEditorRow : styles.stack)}>
        <div className={sx(styles.stack, editable && styles.dailyEditorSummary)}>
          <p className={sx(styles.note)}>{t(usage.limit ? "usage:dailyLimit.progress" : "usage:dailyLimit.unlimited", {
            provider: USAGE_PROVIDER_NAMES[usage.providerId], used: value, limit: usage.limit ? formatNumber(usage.limit.amount, { maximumFractionDigits: 12 }) : "",
            unit: t(unit === "usd" ? "usage:dailyLimit.usd" : "usage:dailyLimit.tokens"),
          })}</p>
          {usage.limit ? <Meter label={USAGE_PROVIDER_NAMES[usage.providerId]} value={Math.min(100, (spent ?? 0) / usage.limit.amount * 100)} size="sm" tone={usage.reached ? "danger" : "neutral"} /> : null}
          {usage.reached ? <p role="status" className={sx(styles.note)}>{t("usage:dailyLimit.reached")}</p> : null}
        </div>
        {editable ? <DailyLimitEditor key={`${usage.providerId}:${usage.limit?.unit}:${usage.limit?.amount}`} usage={usage} busy={busy} onSave={(limit) => onSave?.(usage, limit)} /> : null}
      </div>;
    })}</div>;
}
