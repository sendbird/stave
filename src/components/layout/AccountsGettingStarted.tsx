import { formatList } from "@/i18n/format";
import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, CircleDashed, CircleMinus, Copy } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { Loader, toast } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { copyTextToClipboard } from "@/lib/clipboard";
import { ACCOUNTS_GETTING_STARTED_FIELD_ID, providerSignInFocus } from "@/lib/providers/accounts-guide";
import {
  openAccountsSettings,
  openComposerModelSelector,
  openToolingSettings,
  requestSettingsFocus,
} from "@/lib/providers/accounts-navigation";
import {
  PROVIDER_CLI_INSTALL_COMMAND,
  isAccountsOnboardingCollapsed,
  isCliManagedProvider,
  type AccountsOnboardingAccountProviderId,
  toggleAccountsOnboardingSkip,
  type AccountsOnboardingChecklist,
  type AccountsOnboardingProviderId,
  type AccountsOnboardingStep,
  type AccountsOnboardingStepStatus,
} from "@/lib/providers/accounts-onboarding";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { useAccountsOnboarding } from "@/lib/providers/use-accounts-onboarding";
import { useProviderAccountIdentities } from "@/lib/providers/use-provider-account-identity";
import { useLoadProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { SettingsCard } from "./settings-dialog.shared";
import { accountsSectionStyles as styles } from "./settings-dialog-accounts-section.styles";

/** The two providers Stave installs commands for and signs in through its own terminal. */
const PROVIDERS: readonly AccountsOnboardingAccountProviderId[] = ["claude-code", "codex"];

const providerName = (providerId: AccountsOnboardingProviderId) => getProviderLabel({ providerId, variant: "full" });

function StepIcon({ status, small }: { status: AccountsOnboardingStepStatus; small?: boolean }) {
  const size = small ? styles.welcomeIcon : styles.rowIcon;
  if (status === "checking") return <Loader aria-hidden size="xs" variant="persist" />;
  if (status === "done") return <CheckCircle2 aria-hidden className={sx(size, styles.iconDone)} />;
  if (status === "skipped") return <CircleMinus aria-hidden className={sx(size, styles.iconQuiet)} />;
  if (status === "blocked") return <CircleDashed aria-hidden className={sx(size, styles.iconQuiet)} />;
  return <Circle aria-hidden className={sx(size, styles.iconTodo)} />;
}

/** "Done", "To do", … for screen readers; the icon carries it visually. */
function statusLabel(status: AccountsOnboardingStepStatus) {
  switch (status) {
    case "done": return i18n.t("settingsConnections:accountsOnboarding.status.done");
    case "todo": return i18n.t("settingsConnections:accountsOnboarding.status.todo");
    case "skipped": return i18n.t("settingsConnections:accountsOnboarding.status.skipped");
    case "blocked": return i18n.t("settingsConnections:accountsOnboarding.status.blocked");
    case "checking": return i18n.t("settingsConnections:accountsOnboarding.status.checking");
  }
}

function stepTitle(step: AccountsOnboardingStep) {
  switch (step.id) {
    case "install": return i18n.t("settingsConnections:accountsOnboarding.steps.install.title");
    case "signIn": return i18n.t("settingsConnections:accountsOnboarding.steps.signIn.title");
    case "accounts": return i18n.t("settingsConnections:accountsOnboarding.steps.accounts.title");
    case "gateway": return i18n.t("settingsConnections:accountsOnboarding.steps.gateway.title");
    case "model": return i18n.t("settingsConnections:accountsOnboarding.steps.model.title");
  }
}

const names = (ids: readonly AccountsOnboardingProviderId[]) => formatList(ids.map(providerName));

function copyInstallCommand(providerId: AccountsOnboardingAccountProviderId) {
  const command = PROVIDER_CLI_INSTALL_COMMAND[providerId];
  void copyTextToClipboard(command)
    .then(() => toast.success(i18n.t("settingsConnections:accountsOnboarding.toasts.commandCopied", { value1: providerName(providerId) }), { description: command }))
    .catch(() => toast.error(i18n.t("settingsConnections:accountsOnboarding.toasts.copyFailed")));
}

function checkAgain() {
  const state = useAppStore.getState();
  void state.refreshProviderAvailability();
  for (const providerId of PROVIDERS) {
    void useProviderAccountIdentities.getState().load({ providerId, profileId: SYSTEM_ACCOUNT_PROFILE_ID, refresh: true });
  }
}

/** One sentence under a step: what it needs now, or what it found. */
function stepDetail(step: AccountsOnboardingStep, checklist: AccountsOnboardingChecklist) {
  const { status } = step;
  if (status === "checking") return i18n.t("settingsConnections:accountsOnboarding.detail.checking");
  switch (step.id) {
    case "install":
      return status === "done"
        ? i18n.t("settingsConnections:accountsOnboarding.detail.installDone", { value1: names(checklist.installedProviderIds) })
        : i18n.t("settingsConnections:accountsOnboarding.detail.installTodo");
    case "signIn":
      if (status === "done") return i18n.t("settingsConnections:accountsOnboarding.detail.signInDone", { value1: names(checklist.signedInProviderIds) });
      if (status === "blocked") return i18n.t("settingsConnections:accountsOnboarding.detail.signInBlocked");
      if (checklist.signInNeedsWorkspace) return i18n.t("settingsConnections:accountsOnboarding.detail.signInNeedsWorkspace");
      if (checklist.signInProviderId && isCliManagedProvider(checklist.signInProviderId)) {
        return i18n.t("settingsConnections:accountsOnboarding.detail.signInTodoCli", { value1: providerName(checklist.signInProviderId) });
      }
      return i18n.t("settingsConnections:accountsOnboarding.detail.signInTodo", { value1: providerName(checklist.signInProviderId ?? "claude-code") });
    case "accounts":
      return status === "done"
        ? i18n.t("settingsConnections:accountsOnboarding.detail.accountsDone")
        : status === "skipped"
          ? i18n.t("settingsConnections:accountsOnboarding.detail.skipped")
          : i18n.t("settingsConnections:accountsOnboarding.detail.accountsTodo");
    case "gateway":
      return status === "done"
        ? i18n.t("settingsConnections:accountsOnboarding.detail.gatewayDone")
        : status === "skipped"
          ? i18n.t("settingsConnections:accountsOnboarding.detail.skipped")
          : i18n.t("settingsConnections:accountsOnboarding.detail.gatewayTodo");
    case "model":
      if (status !== "done") return i18n.t("settingsConnections:accountsOnboarding.detail.modelBlocked");
      if (checklist.modelNeeds === "repository") return i18n.t("settingsConnections:accountsOnboarding.detail.modelNeedsRepository");
      if (checklist.modelNeeds === "task") return i18n.t("settingsConnections:accountsOnboarding.detail.modelNeedsTask");
      return i18n.t("settingsConnections:accountsOnboarding.detail.modelDone");
  }
}

function StepDetail({ step, checklist }: { step: AccountsOnboardingStep; checklist: AccountsOnboardingChecklist }) {
  useTranslation(I18N_NAMESPACES);
  return <span className={sx(styles.rowDetail)}>
    {stepDetail(step, checklist)}
    {step.id === "install" && step.status === "todo"
      ? PROVIDERS.map((providerId) => <code key={providerId} className={sx(styles.mono)}>{` ${PROVIDER_CLI_INSTALL_COMMAND[providerId]}`}</code>)
      : null}
  </span>;
}

/**
 * Claude Code and Codex open System default's sign-in terminal here; Cursor,
 * Kiro and OpenCode go to their row, which copies the CLI's own login command.
 */
function SignInButton({ providerId, primary }: { providerId: AccountsOnboardingProviderId; primary: boolean }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const cli = isCliManagedProvider(providerId);
  return <Button size="sm" variant={primary ? "primary" : "outline"} onClick={() => requestSettingsFocus(providerSignInFocus(providerId, "start"))}>
    {cli
      ? t("settingsConnections:accountsOnboarding.actions.signInCli", { value1: providerName(providerId) })
      : t("settingsConnections:accountsOnboarding.actions.signIn", { value1: providerName(providerId) })}
  </Button>;
}

function StepActions({ step, checklist, onSkip }: {
  step: AccountsOnboardingStep;
  checklist: AccountsOnboardingChecklist;
  onSkip: (step: "accounts" | "gateway", skip: boolean) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  switch (step.id) {
    case "install":
      return step.status === "todo" ? <>
        {PROVIDERS.map((providerId) => <Button key={providerId} size="sm" variant="outline" onClick={() => copyInstallCommand(providerId)}>
          <Copy aria-hidden />{t("settingsConnections:accountsOnboarding.actions.copyInstall", { value1: providerName(providerId) })}
        </Button>)}
        <Button size="sm" variant="quiet" onClick={openToolingSettings}>{t("settingsConnections:accountsOnboarding.actions.openTooling")}</Button>
      </> : null;
    case "signIn":
      if (step.status !== "todo" && !(step.status === "done" && checklist.signInProviderId)) return null;
      if (checklist.signInNeedsWorkspace) {
        return <Button size="sm" variant="outline" onClick={() => void useAppStore.getState().createRepository({})}>{t("settingsConnections:accountsOnboarding.actions.openRepository")}</Button>;
      }
      return <>
        {checklist.signInProviderId ? <SignInButton providerId={checklist.signInProviderId} primary={step.status === "todo"} /> : null}
        <Button size="sm" variant="quiet" onClick={checkAgain}>{t("settingsConnections:providerAccountIdentityLine.checkAgain")}</Button>
      </>;
    case "accounts":
    case "gateway": {
      if (step.status === "done") return null;
      const skipped = step.status === "skipped";
      return <>
        {!skipped ? <Button size="sm" variant="outline" onClick={() => requestSettingsFocus(step.id === "accounts" ? `${checklist.addAccountProviderId}-add` : "api-connection-new")}>
          {t(`settingsConnections:accountsOnboarding.actions.${step.id === "accounts" ? "addAccount" : "addConnection"}`)}
        </Button> : null}
        <Button size="sm" variant="quiet" onClick={() => onSkip(step.id as "accounts" | "gateway", !skipped)}>
          {skipped ? t("settingsConnections:accountsOnboarding.actions.undoSkip") : t("settingsConnections:accountsOnboarding.actions.skip")}
        </Button>
      </>;
    }
    case "model":
      // The selector lives in a task's composer; with none mounted the button would only close Settings.
      return <Button size="sm" variant="outline" disabled={!checklist.ready || checklist.modelNeeds !== null} onClick={() => openComposerModelSelector()}>
        {t("settingsConnections:accountsOnboarding.actions.openModelSelector")}
      </Button>;
  }
}

/**
 * Settings > Accounts, area A: what is left before the first turn, in order,
 * with one way forward per step. Open while work remains; folds to one line
 * once every step is done or skipped. The fold and the skips are app settings.
 */
export function AccountsGettingStartedCard() {
  const checklist = useAccountsOnboarding();
  const onboarding = useAppStore((state) => state.settings.accountsOnboarding);
  const updateSettings = useAppStore((state) => state.updateSettings);
  return <AccountsGettingStartedCardView
    checklist={checklist}
    collapsed={isAccountsOnboardingCollapsed(checklist, onboarding.collapsed)}
    onCollapsedChange={(next) => updateSettings({ patch: { accountsOnboarding: { ...onboarding, collapsed: next } } })}
    onSkip={(step, skip) => updateSettings({ patch: { accountsOnboarding: toggleAccountsOnboardingSkip(onboarding, step, skip) } })}
  />;
}

/** The checklist card for a given state; the connected form is `AccountsGettingStartedCard`. */
export function AccountsGettingStartedCardView({ checklist, collapsed, onCollapsedChange: setCollapsed, onSkip }: {
  checklist: AccountsOnboardingChecklist;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onSkip: (step: "accounts" | "gateway", skip: boolean) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const readyNames = names(checklist.signedInProviderIds);
  return <SettingsCard
    id={ACCOUNTS_GETTING_STARTED_FIELD_ID}
    tabIndex={-1}
    title={t("settingsConnections:accountsOnboarding.title")}
    description={collapsed ? undefined : t("settingsConnections:accountsOnboarding.description")}
    titleAccessory={<Button size="sm" variant="quiet" aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
      {collapsed ? t("settingsConnections:accountsOnboarding.actions.show") : t("settingsConnections:accountsOnboarding.actions.hide")}
    </Button>}
  >
    {collapsed
      ? <p role="status" className={sx(styles.summary)}>
        <StepIcon status={checklist.complete ? "done" : "todo"} />
        {checklist.complete
          ? t("settingsConnections:accountsOnboarding.summary.complete", { value1: readyNames })
          : t("settingsConnections:accountsOnboarding.summary.remaining", { count: checklist.remainingCount })}
      </p>
      : <ol className={sx(styles.list)} aria-label={t("settingsConnections:accountsOnboarding.title")}>
        {checklist.steps.map((step, index) => {
          const settled = step.status === "done" || step.status === "skipped";
          return <li key={step.id} className={sx(styles.row)} data-step={step.id} data-status={step.status}>
            <span className={sx(styles.rowMark)}><StepIcon status={step.status} /></span>
            <span className={sx(styles.rowText)}>
              <span className={sx(styles.rowTitleLine)}>
                <span className={sx(styles.rowTitle, settled && styles.rowTitleSettled)}>
                  {t("settingsConnections:accountsOnboarding.stepNumber", { value1: index + 1, value2: stepTitle(step) })}
                </span>
                <span className={sx(styles.rowDetail)}>
                  {step.optional
                    ? t("settingsConnections:accountsOnboarding.optionalStatus", { value1: statusLabel(step.status) })
                    : statusLabel(step.status)}
                </span>
              </span>
              <StepDetail step={step} checklist={checklist} />
            </span>
            <span className={sx(styles.rowActions)}><StepActions step={step} checklist={checklist} onSkip={onSkip} /></span>
          </li>;
        })}
      </ol>}
  </SettingsCard>;
}

/**
 * The welcome screen's Getting started summary, shown instead of the accounts
 * sentence (`fallback`) while no provider can take a turn. The sentence stays
 * until a CLI check answered, so a slow check never flashes the card at
 * someone who is already set up.
 */
export function AccountsGettingStartedWelcome(props: { fallback: ReactNode }) {
  useLoadProviderAccounts();
  const checklist = useAccountsOnboarding();
  return <AccountsGettingStartedWelcomeView checklist={checklist} fallback={props.fallback} />;
}

/** The welcome card for a given checklist; the connected form is `AccountsGettingStartedWelcome`. */
export function AccountsGettingStartedWelcomeView({ checklist, fallback }: { checklist: AccountsOnboardingChecklist; fallback: ReactNode }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  if (!checklist.known || checklist.ready) return <>{fallback}</>;
  // The welcome lists only the required steps, so it shows them without the
  // checklist's numbers (which would skip from 2 to 5).
  const required = checklist.steps.filter((step) => !step.optional);
  return <section className={sx(styles.welcome)} aria-labelledby="welcome-getting-started" data-testid="welcome-getting-started">
    <div className={sx(styles.welcomeHeader)}>
      <h2 id="welcome-getting-started" className={sx(styles.welcomeTitle)}>{t("settingsConnections:accountsOnboarding.welcome.title")}</h2>
      <Button size="sm" variant="outline" onClick={() => openAccountsSettings("getting-started")}>{t("settingsConnections:accountsOnboarding.actions.openAccounts")}</Button>
    </div>
    <p className={sx(styles.rowDetail)}>{t("settingsConnections:accountsOnboarding.welcome.description")}</p>
    <ol className={sx(styles.welcomeSteps)}>
      {required.map((step) => <li key={step.id} className={sx(styles.welcomeStep, step.status === "todo" && styles.welcomeStepTodo)}>
        <StepIcon status={step.status} small />
        {/* One text run, so the title and its status read "Sign in · To do" like the other meta lines. */}
        <span>{t("settingsConnections:accountsOnboarding.welcome.stepStatus", { value1: stepTitle(step), value2: statusLabel(step.status) })}</span>
      </li>)}
    </ol>
  </section>;
}
