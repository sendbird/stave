import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { sx } from "@/components/aui/utils/stylex";
import { type CodexMcpDelegationSettings, type CodexMcpDelegationPreview } from "@/lib/providers/codex-mcp-delegation-settings";
import { selectedProviderAccount } from "@/lib/providers/provider-account-selection";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { SettingsCard } from "./settings-dialog.shared";
import { SearchablePicker } from "./settings-searchable-picker";
import { accountStyles as styles } from "./provider-accounts.styles";

export function CodexMcpDelegationSettingsCard() {
  const { t } = useTranslation("settingsConnections");
  const accountLabel = useId();
  const profiles = useProviderAccounts((state) => state.profiles);
  const codexAccountProfileId = useAppStore((state) => selectedProviderAccount("codex", state.settings));
  const codexBinaryPath = useAppStore((state) => state.settings.codexBinaryPath);
  const cwd = useAppStore((state) => state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath);
  const [preview, setPreview] = useState<CodexMcpDelegationPreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const api = window.api?.providerAccounts;
    if (!api?.codexMcpDelegation) return;
    let stale = false;
    void api.codexMcpDelegation({ codexAccountProfileId, cwd: cwd || undefined, codexBinaryPath: codexBinaryPath || undefined })
      .then((next) => { if (!stale) setPreview(next); })
      .catch(() => { if (!stale) setPreview({ ok: false }); });
    return () => { stale = true; };
  }, [codexAccountProfileId, codexBinaryPath, cwd, profiles, revision]);

  const settings = preview?.ok ? preview.settings : null;
  const options = profiles.filter((profile) => profile.providerId === "claude-code" && !profile.gateway)
    .map((profile) => ({ value: profile.id, label: profile.label }));
  const hasTarget = options.some((option) => option.value === settings?.claudeAccountProfileId);

  async function save(next: CodexMcpDelegationSettings) {
    setSaving(true);
    setSaveFailed(false);
    try {
      if (await window.api?.providerAccounts?.setCodexMcpDelegation(next)) {
        setPreview({ ok: true, settings: next, servers: null });
        setRevision((value) => value + 1);
      } else setSaveFailed(true);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!window.api?.providerAccounts?.codexMcpDelegation) return null;
  return (
    <SettingsCard title={t("codexMcpDelegation.title")}>
      <div className={sx(styles.stackTight)}>
        {settings && (
          <>
            <Checkbox
              label={t("codexMcpDelegation.allow")}
              description={t("codexMcpDelegation.description")}
              checked={settings.enabled}
              disabled={saving || (!hasTarget && !settings.enabled)}
              onCheckedChange={(checked) => void save({ ...settings, enabled: checked === true })}
            />
            <span id={accountLabel}>{t("codexMcpDelegation.account")}</span>
            <SearchablePicker
              labelledBy={accountLabel}
              value={settings.claudeAccountProfileId}
              options={options}
              disabled={saving}
              size="sm"
              placeholder={t("codexMcpDelegation.account")}
              fallbackLabel={t("codexMcpDelegation.accountUnavailable")}
              searchPlaceholder={t("codexMcpDelegation.searchAccounts")}
              emptyText={t("codexMcpDelegation.noAccounts")}
              onSelect={(id) => void save({ ...settings, claudeAccountProfileId: id })}
            />
            <div role="status" className={sx(styles.muted)}>
              {preview?.ok && preview.servers
                ? preview.servers.length > 0
                  ? t("codexMcpDelegation.candidates", { servers: formatList(preview.servers) })
                  : t("codexMcpDelegation.noCandidates")
                : t("codexMcpDelegation.candidatesUnavailable")}
            </div>
          </>
        )}
        {preview?.ok === false && <div role="alert">{t("codexMcpDelegation.loadFailed")}</div>}
        {saveFailed && <div role="alert">{t("codexMcpDelegation.saveFailed")}</div>}
      </div>
    </SettingsCard>
  );
}
