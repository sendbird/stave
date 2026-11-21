import { useTranslation } from "@/i18n";
import { useEffect, useState } from "react";
import { formatList, formatRelativeTime } from "@/i18n/format";
import { Button } from "@/components/aui/components/Button";
import { Checkbox } from "@/components/aui/components/Checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  describeProviderAccountSetup,
  type ProviderAccountSettingsSharingMode,
  type ProviderAccountSetupState,
} from "@/lib/providers/provider-account-setup";
import type { ProviderAccountProfile } from "@/lib/providers/provider-accounts";
import { ProviderAccountMcpConnections } from "./ProviderAccountMcpConnections";
import { accountStyles as styles } from "./provider-accounts.styles";
import { sx } from "@/components/aui/utils/stylex";

export const USE_SYSTEM_SETUP_LABEL_KEY = "settingsConnections:accountSetup.useSystem" as const;

/**
 * Per-account switch for sharing System default's skills, instructions and
 * settings, plus Claude-only MCP choices: take just System default's MCP
 * servers, and hand work that needs another account's servers to that account.
 * Offered only for accounts Stave created; a folder the user registered is
 * theirs to arrange, and an API connection has no setup of its own.
 */
export function ProviderAccountSetupSharing(props: {
  profile: ProviderAccountProfile;
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const { profile } = props;
  const [setup, setSetup] = useState<ProviderAccountSetupState | null>(null);
  useEffect(() => {
    let cancelled = false;
    void window.api?.providerAccounts
      ?.setupStatus({ providerId: profile.providerId, id: profile.id })
      .then((result) => {
        if (!cancelled && result.ok) setSetup(result.setup);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profile.providerId, profile.id]);
  if (!setup) return null;
  const apply = (enabled: boolean, settingsMode?: ProviderAccountSettingsSharingMode) =>
    props.run(async () => {
      const result = await window.api!.providerAccounts!.shareSetup({
        providerId: profile.providerId,
        id: profile.id,
        enabled,
        ...(settingsMode ? { settingsMode } : {}),
      });
      if (!result.ok) throw new Error(result.message);
      setSetup(result.setup);
    });
  const applyMcp = (options: { useSystemMcp?: boolean; delegateMcpWork?: boolean }) =>
    props.run(async () => {
      const result = await window.api!.providerAccounts!.mcpOptions({ providerId: profile.providerId, id: profile.id, ...options });
      if (!result.ok) throw new Error(result.message);
      setSetup(result.setup);
    });
  const delegable = setup.mcp?.delegable?.filter((account) => account.servers.length > 0);
  const copiesSettings = setup.entries.some((entry) => entry.action === "copy");
  const systemHasMcp = setup.entries.some((entry) => entry.name === "mcpServers" && entry.state !== "missing");
  return (
    <div className={sx(styles.stackTight)}>
      <Checkbox
        label={t(USE_SYSTEM_SETUP_LABEL_KEY)}
        description={describeProviderAccountSetup(profile.providerId, setup)}
        checked={setup.enabled}
        disabled={props.busy}
        onCheckedChange={(checked) => apply(checked === true)}
      />
      {/* Setup sharing already brings System default's MCP servers, so the choice shows only without it. */}
      {setup.mcp && !setup.enabled && (
        <Checkbox
          label={t("settingsConnections:providerAccountSetupSharing.useSystemMcp")}
          description={t(
            systemHasMcp
              ? "settingsConnections:providerAccountSetupSharing.useSystemMcpDescription"
              : "settingsConnections:providerAccountSetupSharing.useSystemMcpNothingToShare",
          )}
          checked={setup.mcp.useSystemMcp}
          disabled={props.busy}
          onCheckedChange={(checked) => applyMcp({ useSystemMcp: checked === true })}
        />
      )}
      {setup.mcp && (
        <Checkbox
          label={t("settingsConnections:providerAccountSetupSharing.delegateMcpWork")}
          description={
            <>
              {t("settingsConnections:providerAccountSetupSharing.delegateMcpWorkDescription")}
              {/* What the option hands over, in the description so it lines up with it. */}
              {delegable && (
                <span data-mcp-delegable>
                  {delegable.length === 0 ? (
                    <><br />{t("settingsConnections:providerAccountSetupSharing.delegableNone")}</>
                  ) : (
                    delegable.map((account) => (
                      <span key={account.id}>
                        <br />
                        {t("settingsConnections:providerAccountSetupSharing.delegableServers", {
                          account: account.label,
                          servers: formatList(account.servers),
                        })}{" "}
                        {account.observedAt == null
                          ? t("settingsConnections:providerAccountSetupSharing.fromConfig")
                          : t("settingsConnections:providerAccountSetupSharing.lastChecked", { time: formatRelativeTime(account.observedAt) })}
                      </span>
                    ))
                  )}
                </span>
              )}
            </>
          }
          checked={setup.mcp.delegateMcpWork}
          disabled={props.busy}
          onCheckedChange={(checked) => applyMcp({ delegateMcpWork: checked === true })}
        />
      )}
      {setup.mcp?.delegable?.map((account) => (
        <div key={account.id} className={sx(styles.stackTight)}>
          <ProviderAccountMcpConnections account={account} disabled={props.busy} onChecked={async () => {
            const result = await window.api!.providerAccounts!.setupStatus({ providerId: profile.providerId, id: profile.id });
            if (result.ok) setSetup(result.setup);
          }} />
          {account.servers.length === 0 && <div className={sx(styles.muted)}>
            {account.observedAt == null
              ? t("settingsConnections:providerAccountSetupSharing.fromConfig")
              : t("settingsConnections:providerAccountSetupSharing.lastChecked", { time: formatRelativeTime(account.observedAt) })}
          </div>}
        </div>
      ))}
      {setup.enabled && setup.settingsMode && (
        <Checkbox
          label={t("settingsConnections:providerAccountSetupSharing.linkSettings")}
          description={t("settingsConnections:providerAccountSetupSharing.linkSettingsDescription")}
          checked={setup.settingsMode === "link"}
          disabled={props.busy}
          onCheckedChange={(checked) => apply(true, checked === true ? "link" : "copy")}
        />
      )}
      {setup.enabled && copiesSettings && (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button size="sm" variant="quiet" flushInline disabled={props.busy} onClick={() => apply(true)}>
                {t("settingsConnections:providerAccountSetupSharing.updateCopiedSettings")}</Button>
            }
          />
          <TooltipContent>
            {t("settingsConnections:providerAccountSetupSharing.copiesYourSystemDefaultSettingsAgain")}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
