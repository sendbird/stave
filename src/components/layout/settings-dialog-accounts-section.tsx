import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useEffect } from "react";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import { STAVE_ACCOUNTS_GUIDE_URL, accountsFocusElementId } from "@/lib/providers/accounts-guide";
import {
  clearSettingsFocus,
  openToolingSettings,
  requestSettingsFocus,
  useSettingsFocusRequest,
} from "@/lib/providers/accounts-navigation";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { PROVIDER_LOGIN_COMMAND } from "@/lib/providers/provider-login-commands";
import { useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import { useAccountsOnboarding } from "@/lib/providers/use-accounts-onboarding";
import { useProviderAccountIdentities } from "@/lib/providers/use-provider-account-identity";
import { useLoadProviderAccounts } from "@/lib/providers/use-provider-accounts";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import { AccountsGettingStartedCard } from "./AccountsGettingStarted";
import { AccountsGuideButton } from "./AccountsGuideButton";
import { ApiConnectionsSettings } from "./ApiConnectionsSettings";
import { ProviderAccountsSettings } from "./ProviderAccountsSettings";
import { SectionStack, SettingsCard } from "./settings-dialog.shared";
import { accountsSectionStyles as styles } from "./settings-dialog-accounts-section.styles";

/** About one second of frames: long enough for the connection list to load. */
const FOCUS_ATTEMPT_FRAMES = 60;

/**
 * Lands a deep link: scrolls the target into view and focuses it, or its first
 * control when the target is a form (`data-focus-first-control`). Targets that
 * load asynchronously (an API connection row) get a few frames to appear; an
 * unknown target leaves the section at its top.
 */
export function focusSettingsElement(element: HTMLElement) {
  element.scrollIntoView({ block: "start", behavior: "auto" });
  const control = element.hasAttribute("data-focus-first-control")
    ? element.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), button:not([disabled])")
    : null;
  (control ?? element).focus({ preventScroll: true });
}

function useAccountsFocusTarget() {
  const focus = useSettingsFocusRequest((state) => state.focus);
  const nonce = useSettingsFocusRequest((state) => state.nonce);
  useEffect(() => {
    if (!focus) return;
    const elementId = accountsFocusElementId(focus);
    if (!elementId) {
      clearSettingsFocus(nonce);
      return;
    }
    let attempts = 0;
    let frame = 0;
    const tryFocus = () => {
      const element = document.getElementById(elementId);
      if (element) {
        focusSettingsElement(element);
        clearSettingsFocus(nonce);
        return;
      }
      if (++attempts >= FOCUS_ATTEMPT_FRAMES) {
        clearSettingsFocus(nonce);
        return;
      }
      frame = window.requestAnimationFrame(tryFocus);
    };
    frame = window.requestAnimationFrame(tryFocus);
    return () => window.cancelAnimationFrame(frame);
  }, [focus, nonce]);
}

/** Area B: the three ways to pay, each one sentence and one button. */
function AccountsBillingChoices() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const checklist = useAccountsOnboarding();
  const subscriptionInUse = useProviderAccountIdentities((state) =>
    Object.values(state.byKey).some((identity) => identity?.state === "signed-in"),
  );
  const cliAuthenticated = useProviderReadinessStore((state) =>
    state.providers["claude-code"]?.tool.authState === "authenticated" || state.providers.codex?.tool.authState === "authenticated",
  );
  const statusOf = (id: "accounts" | "gateway") => checklist.steps.find((step) => step.id === id)?.status;
  const choices = [
    {
      id: "subscription",
      title: t("settingsConnections:accountsSection.billing.subscription.title"),
      body: t("settingsConnections:accountsSection.billing.subscription.body"),
      action: t("settingsConnections:accountsSection.billing.subscription.action"),
      inUse: subscriptionInUse || cliAuthenticated,
      onSelect: () => requestSettingsFocus(checklist.signInProviderId ?? "claude-code"),
    },
    {
      id: "second-account",
      title: t("settingsConnections:accountsSection.billing.secondAccount.title"),
      body: t("settingsConnections:accountsSection.billing.secondAccount.body"),
      action: t("settingsConnections:accountsOnboarding.actions.addAccount"),
      inUse: statusOf("accounts") === "done",
      onSelect: () => requestSettingsFocus(`${checklist.addAccountProviderId}-add`),
    },
    {
      id: "gateway",
      title: t("settingsConnections:accountsSection.billing.gateway.title"),
      body: t("settingsConnections:accountsSection.billing.gateway.body"),
      action: t("settingsConnections:accountsOnboarding.actions.addConnection"),
      inUse: statusOf("gateway") === "done",
      onSelect: () => requestSettingsFocus("api-connection-new"),
    },
  ];
  return <SettingsCard
    title={t("settingsConnections:accountsSection.billing.title")}
    description={t("settingsConnections:accountsSection.billing.description")}
  >
    <ul className={sx(styles.list)}>
      {choices.map((choice) => <li key={choice.id} className={sx(styles.row)} data-billing-choice={choice.id}>
        <span className={sx(styles.rowText)}>
          <span className={sx(styles.rowTitleLine)}>
            <span className={sx(styles.rowTitle)}>{choice.title}</span>
            {choice.inUse ? <Badge tone="success" size="sm">{t("settingsConnections:accountsSection.billing.inUse")}</Badge> : null}
          </span>
          <span className={sx(styles.rowDetail)}>{choice.body}</span>
        </span>
        <span className={sx(styles.rowActions)}>
          <Button size="sm" variant="outline" onClick={choice.onSelect}>{choice.action}</Button>
        </span>
      </li>)}
    </ul>
  </SettingsCard>;
}

const CLI_MANAGED_PROVIDERS = ["cursor", "kiro", "opencode"] as const;
type CliManagedProviderId = (typeof CLI_MANAGED_PROVIDERS)[number];

function cliManagedStatus(tool: ToolingStatusEntry | undefined) {
  if (!tool) return { label: i18n.t("settingsConnections:accountsSection.cliManaged.checking"), tone: "neutral" as const };
  if (!tool.available) return { label: i18n.t("settingsConnections:accountsSection.cliManaged.notInstalled"), tone: "warning" as const };
  switch (tool.authState) {
    case "authenticated": return { label: i18n.t("settingsProviders:toolingSection.auth.authenticated"), tone: "success" as const };
    case "unauthenticated": return { label: i18n.t("settingsProviders:toolingSection.auth.unauthenticated"), tone: "warning" as const };
    case "not-required": return { label: i18n.t("settingsProviders:toolingSection.auth.managedInCli"), tone: "neutral" as const };
    default: return { label: i18n.t("settingsProviders:toolingSection.auth.unknown"), tone: "neutral" as const };
  }
}

function CliManagedProviderRow({ providerId }: { providerId: CliManagedProviderId }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const tool = useProviderReadinessStore((state) => state.providers[providerId]?.tool);
  const status = cliManagedStatus(tool);
  const name = getProviderLabel({ providerId, variant: "full" });
  const command = PROVIDER_LOGIN_COMMAND[providerId];
  const copy = () => void copyTextToClipboard(command)
    .then(() => toast.success(i18n.t("settingsProviders:settingsDialogToolingSection.commandCopied", { value1: name }), { description: command }))
    .catch(() => toast.error(i18n.t("settingsProviders:toolingSection.toasts.copyCommandFailed")));
  return <li className={sx(styles.row)} data-cli-provider={providerId}>
    <span className={sx(styles.rowText)}>
      <span className={sx(styles.rowTitleLine)}>
        <span className={sx(styles.rowTitle)}>{name}</span>
        <Badge tone={status.tone} size="sm">{status.label}</Badge>
      </span>
      <span className={sx(styles.rowDetail)}>
        {tool && !tool.available
          ? t("settingsConnections:accountsSection.cliManaged.installHint", { value1: name })
          : t("settingsConnections:accountsSection.cliManaged.loginHint", { value1: command })}
      </span>
    </span>
    <span className={sx(styles.rowActions)}>
      {tool && !tool.available
        ? <Button size="sm" variant="outline" onClick={openToolingSettings}>{t("settingsConnections:accountsOnboarding.actions.openTooling")}</Button>
        : <Button size="sm" variant="outline" onClick={copy}><Copy aria-hidden />{t("settingsProviders:toolingSection.actions.copyLoginCommand")}</Button>}
    </span>
  </li>;
}

/** Cursor, Kiro and OpenCode sign in through their own CLI; Stave only reports it. */
function CliManagedProviderAccounts() {
  const { t } = useTranslation(I18N_NAMESPACES);
  return <SettingsCard
    title={t("settingsConnections:accountsSection.cliManaged.title")}
    description={t("settingsConnections:accountsSection.cliManaged.description")}
  >
    <ul className={sx(styles.list)}>
      {CLI_MANAGED_PROVIDERS.map((providerId) => <CliManagedProviderRow key={providerId} providerId={providerId} />)}
    </ul>
  </SettingsCard>;
}

/**
 * Settings > Accounts: everything about who pays for a turn. Getting started
 * on top, then the ways to pay, the sign-in accounts per provider, the CLIs
 * that manage their own sign-in, and API connections.
 */
export function AccountsSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  useLoadProviderAccounts();
  useAccountsFocusTarget();
  return <SectionStack>
    <AccountsGettingStartedCard />
    <AccountsBillingChoices />
    <ProviderAccountsSettings />
    <CliManagedProviderAccounts />
    <ApiConnectionsSettings />
    <p className={sx(styles.help)}>
      {t("settingsConnections:accountsSection.help")}
      <AccountsGuideButton url={STAVE_ACCOUNTS_GUIDE_URL}>{t("settingsConnections:providerAccountsSettings.readTheAccountsGuide")}</AccountsGuideButton>
    </p>
  </SectionStack>;
}
