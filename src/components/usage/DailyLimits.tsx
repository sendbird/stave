import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatNumber } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { Meter } from "@/components/aui/components/Meter";
import { Select } from "@/components/aui/components/Select";
import { TextField } from "@/components/aui/components/TextField";
import { sx } from "@/components/aui/utils/stylex";
import { openDailyLimitSettings } from "@/lib/usage/daily-limit-navigation";
import { USAGE_PROVIDER_NAMES } from "@/lib/providers/usage-statistics";
import type { DailyLimit, DailyUsage, DailyUsageApi, DailyUsageReport } from "@/lib/usage/daily-limit";
import { usageStyles as styles } from "./usage.styles";

export function DailyLimitSettingsLink({ beforeOpen }: { beforeOpen?: () => void } = {}) {
  const { t } = useTranslation(["usage"]);
  return <Button variant="link" size="sm" onClick={() => { beforeOpen?.(); openDailyLimitSettings(); }}>{t("usage:dailyLimit.raise")}</Button>;
}

function DailyLimitEditor({ usage, busy, onSave }: { usage: DailyUsage; busy: boolean; onSave: (limit: DailyLimit | null) => void }) {
  const { t } = useTranslation(["usage"]);
  const [unit, setUnit] = useState<"off" | DailyLimit["unit"]>(usage.limit?.unit ?? "off");
  const [amount, setAmount] = useState(usage.limit ? String(usage.limit.amount) : "");
  const valid = unit === "off" || Number.isFinite(Number(amount)) && Number(amount) > 0;
  const options = [{ value: "off", label: t("usage:dailyLimit.off") }, { value: "tokens", label: t("usage:dailyLimit.tokens") },
    ...(usage.costAvailable || usage.limit?.unit === "usd" ? [{ value: "usd", label: t("usage:dailyLimit.usd") }] : [])];
  return <form className={sx(styles.row)} onSubmit={(event) => { event.preventDefault(); if (valid) onSave(unit === "off" ? null : { unit, amount: Number(amount) }); }}>
    <Select label={t("usage:dailyLimit.unit", { provider: USAGE_PROVIDER_NAMES[usage.providerId] })} size="sm" value={unit} options={options}
      disabled={busy} onValueChange={(value) => { if (value) setUnit(value as typeof unit); }} />
    {unit !== "off" ? <TextField label={t("usage:dailyLimit.amount", { provider: USAGE_PROVIDER_NAMES[usage.providerId] })} type="number" min="0" step="any"
      value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} /> : null}
    <Button type="submit" size="sm" disabled={busy || !valid}>{t("usage:dailyLimit.save")}</Button>
  </form>;
}

/** Global local-day totals, independent of the history view's account, model and period filters. */
export function DailyLimits({ editable = false, refreshKey, api: providedApi, onOpenSettings }: { editable?: boolean; refreshKey?: unknown; api?: DailyUsageApi; onOpenSettings?: () => void }) {
  const { t } = useTranslation(["usage"]);
  const api = providedApi ?? (typeof window === "undefined" ? undefined : window.api?.persistence?.dailyUsage);
  const [report, setReport] = useState<DailyUsageReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const saving = useRef(false);
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
  return <section id={editable ? "daily-limits" : undefined} tabIndex={editable ? -1 : undefined} className={sx(styles.section)} aria-label={t("usage:dailyLimit.title")}>
    <h3 className={sx(styles.heading)}>{t("usage:dailyLimit.title")}</h3>
    <p className={sx(styles.note)}>{t("usage:dailyLimit.description")}</p>
    <details><summary>{t("usage:dailyLimit.accounting")}</summary><p className={sx(styles.note)}>{t("usage:dailyLimit.accountingDetail")}</p></details>
    {failed ? <p role="alert">{t("usage:dailyLimit.failed")} <Button variant="link" size="sm" onClick={() => setAttempt((value) => value + 1)}>{t("usage:dailyLimit.retry")}</Button></p> : null}
    {!report && !failed ? <p role="status">{t("usage:dailyLimit.loading")}</p> : null}
    {report ? <DailyUsageRows report={report} editable={editable} busy={busy} onSave={save} /> : null}
    {editable ? null : <DailyLimitSettingsLink beforeOpen={onOpenSettings} />}
  </section>;
}

export function DailyUsageRows({ report, editable = false, busy = false, onSave }: {
  report: DailyUsageReport; editable?: boolean; busy?: boolean; onSave?: (usage: DailyUsage, limit: DailyLimit | null) => void;
}) {
  const { t } = useTranslation(["usage"]);
  return <>{report.providers.map((usage) => {
      const unit = usage.limit?.unit ?? "tokens";
      const spent = unit === "usd" ? usage.costUsd : usage.tokens;
      const value = spent === null ? t("usage:dailyLimit.unknown") : formatNumber(spent, unit === "usd" ? { style: "currency", currency: "USD", maximumFractionDigits: 12 } : {});
      return <div key={usage.providerId} className={sx(styles.stack)}>
        <p className={sx(styles.note)}>{t(usage.limit ? "usage:dailyLimit.progress" : "usage:dailyLimit.unlimited", {
          provider: USAGE_PROVIDER_NAMES[usage.providerId], used: value, limit: usage.limit ? formatNumber(usage.limit.amount, { maximumFractionDigits: 12 }) : "",
          unit: t(unit === "usd" ? "usage:dailyLimit.usd" : "usage:dailyLimit.tokens"),
        })}</p>
        {usage.limit ? <Meter label={USAGE_PROVIDER_NAMES[usage.providerId]} value={Math.min(100, (spent ?? 0) / usage.limit.amount * 100)} size="sm" tone={usage.reached ? "danger" : "neutral"} /> : null}
        {usage.reached ? <p role="status" className={sx(styles.note)}>{t("usage:dailyLimit.reached")}</p> : null}
        {editable ? <DailyLimitEditor key={`${usage.providerId}:${usage.limit?.unit}:${usage.limit?.amount}`} usage={usage} busy={busy} onSave={(limit) => onSave?.(usage, limit)} /> : null}
      </div>;
    })}</>;
}
