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
import { ClaudeGatewaySettings } from "./ClaudeGatewaySettings";
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
  const [label, setLabel] = useState(profile.label);
  const [checkMessage, setCheckMessage] = useState("");
  return <div className={sx(styles.profile, styles.stack)}>
    <div className={sx(styles.row)}>
      {profile.kind === "system" ? <strong>{profile.label}</strong> : <Input aria-label={`Name for ${profile.label}`} value={label} onChange={e => setLabel(e.target.value)} xstyle={styles.field} />}
      {profile.kind !== "system" && <Button size="sm" variant="quiet" disabled={busy || !label.trim() || label.trim() === profile.label} onClick={() => run(async () => {
        const result = await window.api!.providerAccounts!.rename({ providerId: profile.providerId, id: profile.id, label });
        if (!result.ok) throw new Error(result.message);
      })}>Save name</Button>}
      {profile.gateway
        ? <WithTooltip tip="Asks the gateway for its model list and confirms this connection's models are on it. No prompt is sent and nothing is billed.">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => {
            const result = await window.api!.providerAccounts!.checkGateway({ providerId: profile.providerId, id: profile.id });
            setCheckMessage(result.message);
          })}>Check model list</Button>
        </WithTooltip>
        : <WithTooltip tip={`Opens ${LOGIN_COMMAND[profile.providerId]} for this account in a terminal below. Stave can't see the result until you close that terminal; it then refreshes sign-in status and usage.`}>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => login(profile))}>Sign in</Button>
        </WithTooltip>}
      {profile.kind !== "system" && <WithTooltip tip="Forgets this account in Stave. Its folder and sign-in stay on disk, so you can add the folder again later.">
        <Button size="sm" variant="quiet" disabled={busy} onClick={() => run(async () => {
          const result = await window.api!.providerAccounts!.remove({ providerId: profile.providerId, id: profile.id });
          if (!result.ok) throw new Error(result.message);
          const state = useAppStore.getState();
          const key = profile.providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
          if (state.settings[key] === profile.id) state.updateSettings({ patch: { [key]: SYSTEM_ACCOUNT_PROFILE_ID } });
        })}>Remove</Button>
      </WithTooltip>}
    </div>
    {profile.kind === "system" && <div className={sx(styles.muted)}>The {name} sign-in this computer already uses.</div>}
    {!profile.gateway && <ProviderAccountIdentityLine profile={profile} providerName={name} signingIn={signingIn} />}
    {profile.configDirectory && !profile.gateway && <div className={sx(styles.muted)}>Folder: {profile.configDirectory}</div>}
    {profile.gateway && <div className={sx(styles.muted)}>Billed per token by the gateway · {profile.gateway.baseUrl}<br />Models: {profile.gateway.models.join(", ")}</div>}
    {checkMessage && <p role="status" className={sx(styles.muted)}>{checkMessage}</p>}
    {profile.kind === "managed" && !profile.gateway && <ProviderAccountSetupSharing profile={profile} busy={busy} run={run} />}
  </div>;
}

function AccountsForProvider({ providerId }: { providerId: ProviderAccountProviderId }) {
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
    if (!workspacePath) throw new Error("Open a workspace before signing in.");
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
    title={`${name} accounts`}
    titleAccessory={<AccountsGuideButton url={STAVE_ACCOUNTS_GUIDE_URL}>Read the accounts guide</AccountsGuideButton>}
    description={`Keep more than one ${providerId === "codex" ? "Codex sign-in (a ChatGPT account)" : "Claude sign-in"}, for example work and personal; each account has its own history and usage limits. Switching accounts changes new turns only: running turns, queued messages and open CLI tabs keep the account they started with.`}
  >
    <div className={sx(styles.stack)}>
      <ProviderAccountPicker providerId={providerId} />
      {profiles.filter(p => p.providerId === providerId).map(p => <AccountRow key={p.id} profile={p} name={name} run={run} login={login} busy={busy} signingIn={loginSession?.profileId === p.id} />)}
      <ProviderAccountAddForm providerId={providerId} name={name} busy={busy} run={run} login={login} />
      {error && <p role="alert" className={sx(styles.error)}>{error}</p>}
      {loginSession && <div className={sx(styles.stack)}>
        <div className={sx(styles.row)}><strong>Signing in: {loginSession.label}</strong><Button size="sm" variant="quiet" onClick={() => run(async () => {
          await window.api?.terminal?.closeSession?.({ sessionId: loginSession.id }); setLoginSession(null);
          await useAppStore.getState().refreshProviderAvailability();
          await useAppStore.getState().refreshRateLimits();
          // The terminal closing is when the answer to "who is signed in" can change.
          await useProviderAccountIdentities.getState().load({ providerId, profileId: loginSession.profileId, refresh: true });
        })}>Close sign-in terminal</Button></div>
        <ProviderAccountLoginTerminal key={loginSession.id} sessionId={loginSession.id} />
        <p className={sx(styles.muted)}>Follow the steps in the terminal; it may open your browser. When it says you are signed in, close the terminal. Stave then checks who is signed in and refreshes usage for the account new turns use.</p>
      </div>}
      {providerId === "claude-code" && <ClaudeGatewaySettings />}
    </div>
  </SettingsCard>;
}

export function ProviderAccountsSettings() {
  useLoadProviderAccounts();
  const error = useProviderAccounts(s => s.error);
  if (!window.api?.providerAccounts) return null;
  return <>{error && <p role="alert">{error}</p>}<AccountsForProvider providerId="claude-code" /><AccountsForProvider providerId="codex" /></>;
}
