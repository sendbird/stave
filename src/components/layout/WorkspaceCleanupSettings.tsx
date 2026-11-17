import { useEffect, useState } from "react";
import { Button, Input } from "@/components/ui";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { DEFAULT_WORKSPACE_CLEANUP_POLICY, type WorkspaceCleanupPolicy } from "@/lib/workspace-cleanup-contract";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { cleanupStyles as styles } from "./workspace-cleanup-center.styles";
import { notifyWorkspaceCleanupChanged, openWorkspaceCleanup } from "./workspace-cleanup-events";
import { refreshWorkspaceCleanupRegistry } from "@/store/workspace-cleanup-sync";

export function WorkspaceCleanupSettings() {
  const { t } = useTranslation("workspace");
  const [policy, setPolicy] = useState<WorkspaceCleanupPolicy>(DEFAULT_WORKSPACE_CLEANUP_POLICY);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    const api = window.api?.workspaceCleanup;
    if (!api) { setMessage(t("cleanupCenter.unavailable")); return; }
    void api.list().then((data) => { if (live) { setPolicy(data.policy); setReady(true); } }).catch(() => { if (live) setMessage(t("cleanupCenter.unavailable")); });
    return () => { live = false; };
  }, [t]);
  return <SectionStack><SettingsCard title={t("cleanupCenter.policyTitle")} description={t("cleanupCenter.policyDescription")}>
    {(["merged", "inactive", "archived", "maximum"] as const).map((rule) => <div key={rule} className={sx(styles.rule)}>
      <Checkbox label={t(`cleanupCenter.rules.${rule}`)} checked={policy[rule].enabled} disabled={!ready || busy} onCheckedChange={(enabled) => setPolicy((previous) => ({ ...previous, [rule]: { ...previous[rule], enabled: Boolean(enabled) } }))} />
      <Input type="number" xstyle={styles.number} min={1} max={3650} aria-label={t(`cleanupCenter.rules.${rule}`)} value={policy[rule].value} disabled={!ready || busy} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= 1 && value <= 3650) setPolicy((previous) => ({ ...previous, [rule]: { ...previous[rule], value } })); }} />
    </div>)}
    <div className={sx(styles.actions)}>
      <Button disabled={!ready || busy} onClick={async () => { setBusy(true); try { const api = window.api?.workspaceCleanup; if (!api) throw new Error(); setPolicy(await api.configure(policy)); setMessage(t("cleanupCenter.policySaved")); } catch { setMessage(t("cleanupCenter.unavailable")); } finally { setBusy(false); } }}>{t("cleanupCenter.savePolicy")}</Button>
      <Button variant="secondary" disabled={!ready || busy} onClick={async () => { setBusy(true); try { const api = window.api?.workspaceCleanup; if (!api) throw new Error(); const { results } = await api.runNow(); setMessage(t("cleanupCenter.summary", { done: results.filter((r) => r.ok).length, skipped: results.filter((r) => !r.ok).length })); await refreshWorkspaceCleanupRegistry(); notifyWorkspaceCleanupChanged(); } catch { setMessage(t("cleanupCenter.unavailable")); } finally { setBusy(false); } }}>{t("cleanupCenter.runNow")}</Button>
      <Button variant="ghost" onClick={openWorkspaceCleanup}>{t("cleanupCenter.openCenter")}</Button>
    </div>{message && <p role="status">{message}</p>}
  </SettingsCard></SectionStack>;
}
