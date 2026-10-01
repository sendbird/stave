import { useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Input } from "@/components/ui";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useLoadProviderAccounts, useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { SYSTEM_ACCOUNT_PROFILE_ID, type ProviderAccountProfile, type ProviderAccountProviderId } from "@/lib/providers/provider-accounts";
import { SettingsCard } from "./settings-dialog.shared";
import { ProviderAccountPicker } from "./ProviderAccountPicker";
import { ProviderAccountLoginTerminal } from "./ProviderAccountLoginTerminal";
import { ClaudeGatewaySettings } from "./ClaudeGatewaySettings";
import { accountStyles as styles } from "./provider-accounts.styles";

function AccountRow({ profile, run, login, busy }: {
  profile: ProviderAccountProfile; busy: boolean;
  run: (action: () => Promise<unknown>) => void;
  login: (profile: ProviderAccountProfile) => Promise<void>;
}) {
  const [label, setLabel] = useState(profile.label);
  const [checkMessage, setCheckMessage] = useState("");
  return <div className={sx(styles.profile, styles.stack)}>
    <div className={sx(styles.row)}>
      {profile.kind === "system" ? <strong>{profile.label}</strong> : <Input aria-label={`Name for ${profile.label}`} value={label} onChange={e => setLabel(e.target.value)} className={sx(styles.field)} />}
      {profile.kind !== "system" && <Button size="sm" variant="quiet" disabled={busy || !label.trim() || label.trim() === profile.label} onClick={() => run(async () => {
        const result = await window.api!.providerAccounts!.rename({ providerId: profile.providerId, id: profile.id, label });
        if (!result.ok) throw new Error(result.message);
      })}>Save name</Button>}
      {profile.gateway ? <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => {
        const result = await window.api!.providerAccounts!.checkGateway({ providerId: profile.providerId, id: profile.id });
        setCheckMessage(result.message);
      })}>Check model list</Button> : <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => login(profile))}>Sign in</Button>}
      {profile.kind !== "system" && <Button size="sm" variant="quiet" disabled={busy} onClick={() => run(async () => {
        const result = await window.api!.providerAccounts!.remove({ providerId: profile.providerId, id: profile.id });
        if (!result.ok) throw new Error(result.message);
        const state = useAppStore.getState();
        const key = profile.providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
        if (state.settings[key] === profile.id) state.updateSettings({ patch: { [key]: SYSTEM_ACCOUNT_PROFILE_ID } });
      })}>Remove</Button>}
    </div>
    {profile.configDirectory && <div className={sx(styles.muted)}>{profile.configDirectory}</div>}
    {profile.gateway && <div className={sx(styles.muted)}>API billing · {profile.gateway.baseUrl}<br />Models: {profile.gateway.models.join(", ")}</div>}
    {checkMessage && <p role="status" className={sx(styles.muted)}>{checkMessage}</p>}
  </div>;
}

function AccountsForProvider({ providerId }: { providerId: ProviderAccountProviderId }) {
  const profiles = useProviderAccounts(s => s.profiles);
  const [label, setLabel] = useState("");
  const [directory, setDirectory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginSession, setLoginSession] = useState<{ id: string; label: string } | null>(null);
  const name = providerId === "codex" ? "Codex" : "Claude";
  const run = (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    void action().then(() => useProviderAccounts.getState().refresh()).catch(e => setError(String(e))).finally(() => setBusy(false));
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
    setLoginSession({ id: result.sessionId, label: profile.label });
  };
  return <SettingsCard title={`${name} accounts`} description="Choose the default for new turns across tasks. Running turns, queued messages, and open CLI sessions keep their account.">
    <div className={sx(styles.stack)}>
      <ProviderAccountPicker providerId={providerId} />
      {profiles.filter(p => p.providerId === providerId).map(p => <AccountRow key={p.id} profile={p} run={run} login={login} busy={busy} />)}
      <div className={sx(styles.row)}>
        <Input aria-label={`New ${name} account name`} placeholder="Account name" value={label} onChange={e => setLabel(e.target.value)} className={sx(styles.field)} />
        <Input aria-label={`${name} existing configuration directory`} placeholder="Existing configuration directory (optional)" value={directory} onChange={e => setDirectory(e.target.value)} className={sx(styles.field)} />
        <Button size="sm" disabled={busy || !label.trim()} onClick={() => run(async () => {
          const result = await window.api!.providerAccounts!.create({ providerId, label, ...(directory.trim() ? { configDirectory: directory.trim() } : {}) });
          if (!result.ok) throw new Error(result.message);
          setLabel(""); setDirectory("");
        })}>Add account</Button>
      </div>
      <p className={sx(styles.muted)}>Leave the directory blank to create a separate native profile. Removing an account keeps its local files.</p>
      {providerId === "claude-code" && <ClaudeGatewaySettings />}
      {error && <p role="alert" className={sx(styles.error)}>{error}</p>}
      {loginSession && <div className={sx(styles.stack)}>
        <div className={sx(styles.row)}><strong>Sign in: {loginSession.label}</strong><Button size="sm" variant="quiet" onClick={() => run(async () => {
          await window.api?.terminal?.closeSession?.({ sessionId: loginSession.id }); setLoginSession(null);
          await useAppStore.getState().refreshProviderAvailability();
          await useAppStore.getState().refreshRateLimits();
        })}>Close login terminal</Button></div>
        <ProviderAccountLoginTerminal key={loginSession.id} sessionId={loginSession.id} />
        <p className={sx(styles.muted)}>Complete the native sign-in flow, then close this terminal to refresh status. Starting the terminal does not confirm sign-in.</p>
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
