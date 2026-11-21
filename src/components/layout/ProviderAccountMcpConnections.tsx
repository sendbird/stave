import { useState } from "react";
import { useAppStore } from "@/store/app.store";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/aui/components/Button";
import type { CheckMcpConnectionsResult } from "@/lib/providers/provider-account-setup";
import { sx } from "@/components/aui/utils/stylex";
import { accountStyles as styles } from "./provider-accounts.styles";

const statusKey = {
  connected: "providerAccountSetupSharing.connected",
  "needs-auth": "providerAccountSetupSharing.needsAuth",
  failed: "providerAccountSetupSharing.failed",
} as const;

export function ProviderAccountMcpConnections({ account, disabled, onChecked }: {
  account: { id: string; label: string };
  disabled: boolean;
  onChecked: () => Promise<void>;
}) {
  const { t } = useTranslation("settingsConnections");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckMcpConnectionsResult | null>(null);
  async function check() {
    const api = window.api?.providerAccounts;
    if (!api) return;
    setChecking(true);
    setResult(null);
    try {
      const claudeBinaryPath = useAppStore.getState().settings.claudeBinaryPath || undefined;
      const response = await api.checkMcpConnections({ profileId: account.id, claudeBinaryPath });
      setResult(response);
      if (response.ok) await onChecked().catch(() => undefined);
    } catch {
      setResult({ ok: false });
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className={sx(styles.stackTight)}>
      <Button size="sm" variant="quiet" flushInline disabled={disabled || checking} onClick={() => void check()}>
        {t(checking
          ? "providerAccountSetupSharing.checkingConnections"
          : "providerAccountSetupSharing.checkConnections", { account: account.label })}
      </Button>
      {result && (
        <div role="status" className={sx(styles.muted)}>
          {!result.ok ? t("providerAccountSetupSharing.checkFailed")
            : result.servers.length === 0 ? t("providerAccountSetupSharing.checkEmpty")
            : result.servers.map((server) => (
              <div key={server.name}>{server.name} · {t(statusKey[server.status], { account: account.label })}</div>
            ))}
        </div>
      )}
    </div>
  );
}
