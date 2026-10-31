import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { formatList } from "@/i18n/format";
import { useState } from "react";
import { Copy } from "lucide-react";
import { Badge } from "@/components/ads/components/Badge";
import { Button } from "@/components/ads/components/Button";
import { toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import { STAVE_ACCOUNTS_GUIDE_URL, accountsFocusElementId, apiConnectionIdFromFocus, cliProviderFieldId, cliProviderFocus, providerSignInFocus } from "@/lib/providers/accounts-guide";
import { useSettingsFocusTarget } from "./settings-focus";
import {
  openToolingSettings,
  requestSettingsFocus,
  useSettingsFocusRequest,
} from "@/lib/providers/accounts-navigation";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { PROVIDER_LOGIN_COMMAND } from "@/lib/providers/provider-login-commands";
import { useProviderReadinessStore } from "@/lib/providers/provider-readiness-store";
import { useAccountsOnboarding, useRegisteredSubscriptionSignedIn } from "@/lib/providers/use-accounts-onboarding";
import { useLoadProviderAccounts } from "@/lib/providers/use-provider-accounts";
import type { ToolingStatusEntry } from "@/lib/tooling-status";
import { AccountsGettingStartedCard } from "./AccountsGettingStarted";
import { AccountsGuideButton } from "./AccountsGuideButton";
import { ApiConnectionsSettings } from "./ApiConnectionsSettings";
import { ProviderAccountsSettings } from "./ProviderAccountsSettings";
import { DraftInput, LabeledField, SectionStack, SettingsCard } from "./settings-dialog.shared";
import { SettingsAdvancedDisclosure } from "./settings-dialog-advanced-disclosure";
import { accountsSectionStyles as styles } from "./settings-dialog-accounts-section.styles";
import { optionalProviderSetup, useOptionalProviderPaths, useSettingsVisibleProviderIds } from "./settings-provider-visibility";
import { useAppStore } from "@/store/app.store";

/**
 * Lands a deep link inside the section. An API connection's row is not
 * handled here: it exists only once the connection list answered, so
 * `ApiConnectionsSettings` owns that request.
 */
function useAccountsFocusTarget() {
  useSettingsFocusTarget((focus) =>
    apiConnectionIdFromFocus(focus) ? undefined : accountsFocusElementId(focus),
  );
}

/** Area B: the three ways to pay, each one sentence and one button. */
function AccountsBillingChoices() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const checklist = useAccountsOnboarding();
  const subscriptionInUse = useRegisteredSubscriptionSignedIn();
  const statusOf = (id: "accounts" | "gateway") => checklist.steps.find((step) => step.id === id)?.status;
  const choices = [
    {
      id: "subscription",
      title: t("settingsConnections:accountsSection.billing.subscription.title"),
      body: t("settingsConnections:accountsSection.billing.subscription.body"),
      action: t("settingsConnections:accountsSection.billing.subscription.action"),
      inUse: subscriptionInUse,
      // The same target as Getting started's sign-in, shown rather than started.
      onSelect: () => requestSettingsFocus(providerSignInFocus(checklist.signInProviderId ?? "claude-code", "show")),
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

/** The setting that points Stave at each CLI, and the executable it looks for by default. */
const CLI_PATH_SETTING = {
  cursor: { key: "cursorBinaryPath", executable: "agent" },
  kiro: { key: "kiroBinaryPath", executable: "kiro-cli" },
  opencode: { key: "opencodeBinaryPath", executable: "opencode" },
} as const satisfies Record<CliManagedProviderId, { key: string; executable: string }>;

/**
 * Why a signed-in CLI still has no provider tab: its account has no usable
 * allowance, or that could not be verified. Settings hides such a provider
 * everywhere else, so its row is where the reason shows. Null otherwise.
 */
function cliAccessIssue(tool: ToolingStatusEntry): string | null {
  if (tool.authState !== "authenticated" || tool.state === "ready") return null;
  return tool.summary.trim() || null;
}

function cliManagedStatus(tool: ToolingStatusEntry) {
  if (cliAccessIssue(tool)) return { label: i18n.t("settingsProviders:toolingSection.state.warning"), tone: "warning" as const };
  switch (tool.authState) {
    case "authenticated": return { label: i18n.t("settingsProviders:toolingSection.auth.authenticated"), tone: "success" as const };
    case "unauthenticated": return { label: i18n.t("settingsProviders:toolingSection.auth.unauthenticated"), tone: "warning" as const };
    case "not-required": return { label: i18n.t("settingsProviders:toolingSection.auth.managedInCli"), tone: "neutral" as const };
    default: return { label: i18n.t("settingsProviders:toolingSection.auth.unknown"), tone: "neutral" as const };
  }
}

/**
 * An installed CLI: its sign-in state and the command that signs in. While its
 * provider tab is hidden (not signed in yet, or signed in without a usable
 * allowance), the row also carries the CLI path, which otherwise lives in
 * that tab, and a signed-in CLI says why its tab is hidden.
 */
function CliManagedProviderRow({ providerId, tool, path }: {
  providerId: CliManagedProviderId;
  tool: ToolingStatusEntry;
  path?: { open: boolean; onOpenChange: (open: boolean) => void };
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const status = cliManagedStatus(tool);
  const accessIssue = cliAccessIssue(tool);
  const name = getProviderLabel({ providerId, variant: "full" });
  const command = PROVIDER_LOGIN_COMMAND[providerId];
  const copy = () => void copyTextToClipboard(command)
    .then(() => toast.success(i18n.t("settingsProviders:settingsDialogToolingSection.commandCopied", { value1: name }), { description: command }))
    .catch(() => toast.error(i18n.t("settingsProviders:toolingSection.toasts.copyCommandFailed")));
  return <li id={cliProviderFieldId(providerId)} tabIndex={-1} data-focus-first-control="" className={sx(styles.row)} data-cli-provider={providerId}>
    <span className={sx(styles.rowText)}>
      <span className={sx(styles.rowTitleLine)}>
        <span className={sx(styles.rowTitle)}>{name}</span>
        <Badge tone={status.tone} size="sm">{status.label}</Badge>
      </span>
      {accessIssue ? <span className={sx(styles.rowDetail, styles.rowDetailWarning)} data-cli-access-issue="">{accessIssue}</span> : null}
      <span className={sx(styles.rowDetail)}>
        {t("settingsConnections:accountsSection.cliManaged.loginHint", { value1: command })}
      </span>
    </span>
    <span className={sx(styles.rowActions)}>
      <Button size="sm" variant="outline" onClick={copy}><Copy aria-hidden />{t("settingsProviders:toolingSection.actions.copyLoginCommand")}</Button>
    </span>
    {path ? <div className={sx(styles.rowPath)} data-cli-path={providerId}>
      <SettingsAdvancedDisclosure
        compact
        open={path.open}
        onOpenChange={path.onOpenChange}
        title={t("settingsConnections:accountsSection.cliManaged.pathDisclosure")}
      >
        <CliPathField providerId={providerId} installed />
      </SettingsAdvancedDisclosure>
    </div> : null}
  </li>;
}

/** One quiet row while the first check of these CLIs is still running. */
function CliCheckingRow({ providerIds }: { providerIds: readonly CliManagedProviderId[] }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  return <li className={sx(styles.row)} data-cli-checking="">
    <span className={sx(styles.rowText)}>
      <span className={sx(styles.rowTitleLine)}>
        <span className={sx(styles.rowTitle, styles.rowTitleSettled)}>
          {formatList(providerIds.map((providerId) => getProviderLabel({ providerId, variant: "full" })))}
        </span>
        <Badge tone="neutral" size="sm">{t("settingsConnections:accountsSection.cliManaged.checking")}</Badge>
      </span>
    </span>
  </li>;
}

/**
 * Where Stave looks for a CLI, for an install outside the usual places. A CLI
 * that was not found makes the field the deep-link target; an installed CLI's
 * row already is one, so the field inside it carries no id.
 */
function CliPathField({ providerId, installed = false }: { providerId: CliManagedProviderId; installed?: boolean }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const setting = CLI_PATH_SETTING[providerId];
  const value = useAppStore((state) => state.settings[setting.key]);
  const updateSettings = useAppStore((state) => state.updateSettings);
  const name = getProviderLabel({ providerId, variant: "full" });
  const target = installed ? {} : { id: cliProviderFieldId(providerId), tabIndex: -1, "data-focus-first-control": "", "data-cli-provider": providerId };
  return <div {...target}>
    <LabeledField
      title={name}
      description={installed
        ? t("settingsConnections:accountsSection.cliManaged.pathHint", { value1: name })
        : t("settingsConnections:accountsSection.cliManaged.installHint", { value1: name })}
    >
      <DraftInput
        xstyle={styles.pathInput}
        value={value}
        aria-label={t("settingsConnections:accountsSection.cliManaged.pathAriaLabel", { value1: name })}
        placeholder={setting.executable}
        onCommit={(next) => updateSettings({ patch: { [setting.key]: next.trim() } })}
      />
    </LabeledField>
  </div>;
}

/**
 * CLIs that were not found fold into one row. Opening it shows how to install
 * each one and where to point Stave at a CLI installed somewhere else.
 */
function CliNotInstalledGroup(args: {
  providerIds: readonly CliManagedProviderId[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const names = formatList(args.providerIds.map((providerId) => getProviderLabel({ providerId, variant: "full" })));
  return <li data-cli-missing="">
    <SettingsAdvancedDisclosure
      compact
      open={args.open}
      onOpenChange={args.onOpenChange}
      title={t("settingsConnections:accountsSection.cliManaged.notInstalledGroup", { names })}
      description={t("settingsConnections:accountsSection.cliManaged.notInstalledDescription")}
    >
      {args.providerIds.map((providerId) => <CliPathField key={providerId} providerId={providerId} />)}
      <span className={sx(styles.rowActions)}>
        <Button size="sm" variant="outline" onClick={openToolingSettings}>{t("settingsConnections:accountsOnboarding.actions.openTooling")}</Button>
      </span>
    </SettingsAdvancedDisclosure>
  </li>;
}

/**
 * Cursor, Kiro and OpenCode sign in through their own CLI; Stave only reports
 * it. An installed CLI gets a full row, signed in or not, because that row is
 * where its sign-in starts. CLIs that are not installed share one folded row.
 */
function CliManagedProviderAccounts() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const readiness = useProviderReadinessStore((state) => state.providers);
  const runtimeOptions = useOptionalProviderPaths();
  const visible = useSettingsVisibleProviderIds();
  const focus = useSettingsFocusRequest((state) => state.focus);
  // Owned here so the group and the path fields keep their state while a CLI
  // is checked again (its row turns into the checking row meanwhile).
  const [missingOpen, setMissingOpen] = useState(false);
  const [pathOpen, setPathOpen] = useState<Partial<Record<CliManagedProviderId, boolean>>>({});
  const installed: { providerId: CliManagedProviderId; tool: ToolingStatusEntry }[] = [];
  const checking: CliManagedProviderId[] = [];
  const missing: CliManagedProviderId[] = [];
  for (const providerId of CLI_MANAGED_PROVIDERS) {
    const setup = optionalProviderSetup({ readiness, providerId, runtimeOptions });
    const tool = readiness[providerId]?.tool;
    if (setup === "installed" && tool) installed.push({ providerId, tool });
    else if (setup === "not-installed") missing.push(providerId);
    else checking.push(providerId);
  }
  // A deep link to a CLI that is not installed opens the group to its field,
  // in the same render, so the focus attempt finds the field visible.
  const focusedMissing = missing.some((providerId) => focus === cliProviderFocus(providerId));
  if (focusedMissing && !missingOpen) setMissingOpen(true);
  return <SettingsCard
    title={t("settingsConnections:accountsSection.cliManaged.title")}
    description={t("settingsConnections:accountsSection.cliManaged.description")}
  >
    <ul className={sx(styles.list)}>
      {installed.map(({ providerId, tool }) => <CliManagedProviderRow
        key={providerId}
        providerId={providerId}
        tool={tool}
        path={visible.includes(providerId) ? undefined : {
          open: pathOpen[providerId] ?? false,
          onOpenChange: (open) => setPathOpen((current) => ({ ...current, [providerId]: open })),
        }}
      />)}
      {checking.length > 0 ? <CliCheckingRow providerIds={checking} /> : null}
      {missing.length > 0 ? <CliNotInstalledGroup providerIds={missing} open={missingOpen} onOpenChange={setMissingOpen} /> : null}
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
