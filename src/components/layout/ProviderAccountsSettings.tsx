import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useState, type ReactElement } from "react";
import { Button } from "@/components/ads/components/Button";
import { Input, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile, type ProviderAccountProviderId } from "@/lib/providers/provider-accounts";
import { PROVIDER_ACCOUNTS_FIELD_ID, STAVE_ACCOUNTS_GUIDE_URL } from "@/lib/providers/accounts-guide";
import { SettingsCard } from "./settings-dialog.shared";
import { AccountsGuideButton } from "./AccountsGuideButton";
import { ProviderAccountPicker } from "./ProviderAccountPicker";
import { ProviderAccountAddForm } from "./ProviderAccountAddForm";
import { ProviderAccountLoginTerminal } from "./ProviderAccountLoginTerminal";
import { ProviderAccountIdentityLine } from "./ProviderAccountIdentityLine";
import { ProviderAccountSetupSharing } from "./ProviderAccountSetupSharing";
import { useProviderAccountIdentities } from "@/lib/providers/use-provider-account-identity";
import { accountStyles as styles } from "./provider-accounts.styles";

const LOGIN_COMMAND = { "claude-code": "claude auth login", codex: "codex login" } as const;

function WithTooltip({ tip, children }: { tip: string; children: ReactElement }) {
  return <Tooltip><TooltipTrigger render={children} /><TooltipContent>{tip}</TooltipContent></Tooltip>;
}

function AccountRow({ profile, name, run, login, busy, signingIn }: {
  profile: ProviderAccountProfile; name: string; busy: boolean; signingIn: boolean;
  run: (action: () => Promise<unknown>) => void;
  login: (profile: ProviderAccountProfile) => Promise<void>;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [label, setLabel] = useState(profile.label);
  const [checkMessage, setCheckMessage] = useState("");
  return <div className={sx(styles.profile, styles.stack)}>
    <div className={sx(styles.row)}>
      {profile.kind === "system" ? <strong>{profile.label}</strong> : <Input aria-label={t("settingsConnections:providerAccountsSettings.nameFor", { value1: profile.label })} value={label} onChange={e => setLabel(e.target.value)} xstyle={styles.field} />}
      {profile.kind !== "system" && <Button size="sm" variant="quiet" disabled={busy || !label.trim() || label.trim() === profile.label} onClick={() => run(async () => {
        const result = await window.api!.providerAccounts!.rename({ providerId: profile.providerId, id: profile.id, label });
        if (!result.ok) throw new Error(result.message);
      })}>{t("settingsConnections:providerAccountsSettings.saveName")}</Button>}
      {profile.gateway
        ? <WithTooltip tip={t("settingsConnections:providerAccountsSettings.asksTheGatewayForItsModel")}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => {
            const result = await window.api!.providerAccounts!.checkGateway({ providerId: profile.providerId, id: profile.id });
            setCheckMessage(result.message);
          })}>{t("settingsConnections:providerAccountsSettings.checkModelList")}</Button>
        </WithTooltip>
        : <WithTooltip tip={t("settingsConnections:providerAccountsSettings.opensForThisAccountInA", { value1: LOGIN_COMMAND[profile.providerId] })}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => login(profile))}>{t("settingsProviders:mcpSection.provider.signIn")}</Button>
        </WithTooltip>}
      {profile.kind !== "system" && <WithTooltip tip={t("settingsConnections:providerAccountsSettings.forgetsThisAccountInStaveIts")}>
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run(async () => {
          const result = await window.api!.providerAccounts!.remove({ providerId: profile.providerId, id: profile.id });
          if (!result.ok) throw new Error(result.message);
          const state = useAppStore.getState();
          const key = profile.providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
          if (state.settings[key] === profile.id) state.updateSettings({ patch: { [key]: SYSTEM_ACCOUNT_PROFILE_ID } });
        })}>{t("common:actions.remove")}</Button>
      </WithTooltip>}
    </div>
    {profile.kind === "system" && <div className={sx(styles.muted)}>{t("settingsConnections:messages.systemAccountHelp", { provider: name })}</div>}
    {!profile.gateway && <ProviderAccountIdentityLine profile={profile} providerName={name} signingIn={signingIn} />}
    {profile.configDirectory && !profile.gateway && <div className={sx(styles.muted)}>{t("settingsConnections:messages.accountFolder", { path: profile.configDirectory })}</div>}
    {profile.gateway && <div className={sx(styles.muted)}>{t("settingsConnections:messages.gatewayBilling", { endpoint: profile.gateway.baseUrl })}<br />{t("settingsConnections:messages.gatewayModels", { models: profile.gateway.models.join(", ") })}</div>}
    {checkMessage && <p role="status" className={sx(styles.muted)}>{checkMessage}</p>}
    {profile.kind === "managed" && !profile.gateway && <ProviderAccountSetupSharing profile={profile} busy={busy} run={run} />}
  </div>;
}

function AccountsForProvider({ providerId }: { providerId: ProviderAccountProviderId }) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const profiles = useProviderAccounts(s => s.profiles);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginSession, setLoginSession] = useState<{ id: string; profileId: string; label: string } | null>(null);
  const name = providerId === "codex" ? "Codex" : "Claude";
  const run = (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    // Refresh after a failure too: "Add and sign in" can create the account and then fail to open the terminal.
    void action().catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => { setBusy(false); void useProviderAccounts.getState().refresh(); });
  };
  const login = async (profile: ProviderAccountProfile) => {
    const state = useAppStore.getState();
    const workspacePath = state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath;
    if (!workspacePath) throw new Error(i18n.t("settingsConnections:providerAccountsSettings.openAWorkspaceBeforeSigningIn"));
    if (loginSession) await window.api?.terminal?.closeSession?.({ sessionId: loginSession.id });
    const result = await window.api!.providerAccounts!.login({ providerId, profileId: profile.id,
      workspaceId: state.activeWorkspaceId, workspacePath,
      binaryPath: (providerId === "codex" ? state.settings.codexBinaryPath : state.settings.claudeBinaryPath) || undefined,
    });
    if (!result.ok) throw new Error(result.message);
    setLoginSession({ id: result.sessionId, profileId: profile.id, label: profile.label });
  };
  return <SettingsCard
    id={PROVIDER_ACCOUNTS_FIELD_ID[providerId]}
    tabIndex={-1}
    title={t("settingsConnections:providerAccountsSettings.accounts", { value1: name })}
    titleAccessory={<AccountsGuideButton url={STAVE_ACCOUNTS_GUIDE_URL}>{t("settingsConnections:providerAccountsSettings.readTheAccountsGuide")}</AccountsGuideButton>}
    description={t("settingsConnections:providerAccountsSettings.keepMoreThanOneForExample", { value1: t(providerId === "codex" ? "settingsConnections:messages.codexSignin" : "settingsConnections:messages.claudeSignin") })}
  >
    <div className={sx(styles.stack)}>
      <ProviderAccountPicker providerId={providerId} />
      {profiles.filter(p => p.providerId === providerId && !p.apiConnection).map(p => <AccountRow key={p.id} profile={p} name={name} run={run} login={login} busy={busy} signingIn={loginSession?.profileId === p.id} />)}
      <ProviderAccountAddForm providerId={providerId} name={name} busy={busy} run={run} login={login} />
      {error && <p role="alert" className={sx(styles.error)}>{error}</p>}
      {loginSession && <div className={sx(styles.stack)}>
        <div className={sx(styles.row)}><strong>{t("settingsConnections:messages.accountSigningIn", { name: loginSession.label })}</strong><Button size="sm" variant="quiet" onClick={() => run(async () => {
          await window.api?.terminal?.closeSession?.({ sessionId: loginSession.id }); setLoginSession(null);
          await useAppStore.getState().refreshProviderAvailability();
          await useAppStore.getState().refreshRateLimits();
          // The terminal closing is when the answer to "who is signed in" can change.
          await useProviderAccountIdentities.getState().load({ providerId, profileId: loginSession.profileId, refresh: true });
        })}>{t("settingsConnections:providerAccountsSettings.closeSignInTerminal")}</Button></div>
        <ProviderAccountLoginTerminal key={loginSession.id} sessionId={loginSession.id} />
        <p className={sx(styles.muted)}>{t("settingsConnections:providerAccountsSettings.followTheStepsInTheTerminal")}</p>
      </div>}
    </div>
  </SettingsCard>;
}

export function ProviderAccountsSettings() {
  useLoadProviderAccounts();
  const error = useProviderAccounts(s => s.error);
  if (!window.api?.providerAccounts) return null;
  return <>{error && <p role="alert">{error}</p>}<AccountsForProvider providerId="claude-code" /><AccountsForProvider providerId="codex" /></>;
}
