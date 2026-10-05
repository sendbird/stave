import { i18n, useTranslation, Trans } from "@/i18n";
import { useEffect, useState } from "react";

import { ModelIcon } from "@/components/ai-elements/model-icon";
import { Badge, Textarea } from "@/components/ui";
import type { ManagedExecutionProviderId } from "@/lib/providers/provider.types";
import { PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS } from "@/lib/provider-browser";
import { sx } from "@/components/ads/utils/stylex";
import { SettingsCard, SwitchField } from "./settings-dialog.shared";
import { providerBrowserAccessSettingsCardStyles as styles } from "./ProviderBrowserAccessSettingsCard.styles";

const PROVIDER_BROWSER_SETUP = {
  "claude-code": {
    label: "Claude Code",
    get setup() { return i18n.t("settings:providerBrowserAccessSettingsCard.connectClaudeCodeSNativeChrome"); },
  },
  codex: {
    label: "Codex",
    get setup() { return i18n.t("settings:messages.codexBrowserSetup"); },
  },
} as const satisfies Record<
  ManagedExecutionProviderId,
  { label: string; setup: string }
>;

function ProviderBrowserSetupCard(args: {
  providerId: ManagedExecutionProviderId;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const provider = PROVIDER_BROWSER_SETUP[args.providerId];

  return (
    <article
      aria-label={t("settings:providerBrowserAccessSettingsCard.browserAccessSetup", { value1: provider.label })}
      className={sx(styles.statusCard)}
    >
      <div className={sx(styles.statusHead)}>
        <span className={sx(styles.statusMark)}>
          <ModelIcon
            providerId={args.providerId}
            className={sx(styles.statusIcon)}
          />
        </span>
        <div className={sx(styles.statusBody)}>
          <p className={sx(styles.statusName)}>{provider.label}</p>
        </div>
      </div>
      <p className={sx(styles.statusSetup)}>
        <span className={sx(styles.emphasis)}>{t("settings:providerBrowserAccessSettingsCard.setup")}</span> {provider.setup}
      </p>
    </article>
  );
}

function AutoFallbackDomainsField(args: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const [draft, setDraft] = useState(args.value);
  useEffect(() => setDraft(args.value), [args.value]);
  return (
    <div className={sx(styles.domainsField)}>
      <label
        htmlFor="settings-field-browser-auto-fallback-domains"
        className={sx(styles.domainsLabel)}
      >
        {t("settings:providerBrowserAccessSettingsCard.additionalAutoArmHosts")}</label>
      <Textarea
        id="settings-field-browser-auto-fallback-domains"
        value={draft}
        rows={2}
        placeholder="wiki.corp.example, docs.corp.example"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (draft !== args.value) {
            args.onCommit(draft);
          }
        }}
      />
      <p className={sx(styles.domainsHint)}>{t("settings:messages.autoArmDomains", { domains: PROVIDER_BROWSER_AUTO_ARM_DEFAULT_DOMAINS.join(", ") })}</p>
    </div>
  );
}

export function ProviderBrowserAccessSettingsCard(args: {
  autoFallback: boolean;
  onAutoFallbackChange: (enabled: boolean) => void;
  autoFallbackDomains: string;
  onAutoFallbackDomainsChange: (value: string) => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  return (
    <SettingsCard
      id="settings-field-browser-access"
      tabIndex={-1}
      title={t("settings:providerBrowserAccessSettingsCard.browserAccess")}
      description={t("settings:providerBrowserAccessSettingsCard.useTheActiveProviderSNative")}
      titleAccessory={<Badge variant="outline">{t("settings:providerBrowserAccessSettingsCard.perPrompt")}</Badge>}
    >
      <div className={sx(styles.grid)}>
        <ProviderBrowserSetupCard providerId="claude-code" />
        <ProviderBrowserSetupCard providerId="codex" />
      </div>
      <SwitchField
        title={t("settings:providerBrowserAccessSettingsCard.automaticBrowserFallback")}
        description={t("settings:providerBrowserAccessSettingsCard.withoutAnExplicitWebArmThe")}
        checked={args.autoFallback}
        onCheckedChange={args.onAutoFallbackChange}
      />
      {args.autoFallback ? (
        <AutoFallbackDomainsField
          value={args.autoFallbackDomains}
          onCommit={args.onAutoFallbackDomainsChange}
        />
      ) : null}
      <div className={sx(styles.noteCard)}>
        <p>
          <Trans t={t} i18nKey="settings:messages.interactiveBrowser" components={{ code: <code /> }} /></p>
        <p className={sx(styles.noteSpacer)}>
          <Trans t={t} i18nKey="settings:messages.browserRestrictions" components={{ code: <code /> }} /></p>
      </div>
    </SettingsCard>
  );
}
