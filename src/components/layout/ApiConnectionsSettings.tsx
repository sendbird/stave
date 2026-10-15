import { formatList } from "@/i18n/format";
import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  VERCEL_AI_GATEWAY,
  apiConnectionGroupLabel,
  apiConnectionRuntimes,
  type ApiConnection,
  type ApiConnectionCheckResult,
  type ApiConnectionCreateArgs,
  type ApiConnectionModel,
} from "@/lib/providers/api-connections";
import { API_CONNECTIONS_FIELD_ID, STAVE_API_CONNECTIONS_GUIDE_URL, apiConnectionFieldId, apiConnectionIdFromFocus } from "@/lib/providers/accounts-guide";
import { clearSettingsFocus, openComposerModelSelector, useComposerModelSelectorAvailable, useSettingsFocusRequest } from "@/lib/providers/accounts-navigation";
import { focusSettingsElement } from "./settings-focus";
import { describeApiConnectionCheck } from "@/lib/providers/api-connection-failure";
import { SYSTEM_ACCOUNT_PROFILE_ID } from "@/lib/providers/provider-accounts";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { useAppStore } from "@/store/app.store";
import { SettingsCard } from "./settings-dialog.shared";
import { AccountsGuideButton } from "./AccountsGuideButton";
import { ApiConnectionForm, ApiConnectionKeySelect, type SecretOption } from "./ApiConnectionForm";
import { ApiConnectionModelPicker } from "./ApiConnectionModelPicker";
import { accountStyles } from "./provider-accounts.styles";
import { apiConnectionStyles as styles } from "./api-connections.styles";

const RUNTIME_NAME = { "claude-code": "Claude Code", codex: "Codex" } as const;

function servesLine(connection: ApiConnection) {
  return i18n.t("settingsConnections:apiConnectionsSettings.serves", { value1: formatList(apiConnectionRuntimes(connection).map((runtime) => RUNTIME_NAME[runtime])) });
}

function ConnectionRow(props: {
  connection: ApiConnection;
  secrets: SecretOption[];
  busy: boolean;
  run: (action: () => Promise<unknown>) => void;
  onRefreshSecrets: () => Promise<void> | void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { connection } = props;
  const nameId = useId();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(connection.label);
  const [secretId, setSecretId] = useState(connection.secretId);
  const [models, setModels] = useState<ApiConnectionModel[]>(connection.models);
  const [check, setCheck] = useState<ApiConnectionCheckResult | null>(null);
  const keyName = props.secrets.find((secret) => secret.id === connection.secretId)?.name;
  const servesClaude = Boolean(connection.endpoints["claude-code"]);
  const startEditing = () => { setLabel(connection.label); setSecretId(connection.secretId); setModels(connection.models); setEditing(true); };
  // "Edit models" in the composer's model selector opens this row's edit form,
  // whenever the row mounts: the list can answer after Settings opened.
  const rowRef = useRef<HTMLDivElement>(null);
  const editRequest = useSettingsFocusRequest((state) => (apiConnectionIdFromFocus(state.focus) === connection.id ? state.nonce : null));
  useEffect(() => {
    if (editRequest === null) return;
    startEditing();
    const frame = window.requestAnimationFrame(() => {
      if (rowRef.current) focusSettingsElement(rowRef.current);
      clearSettingsFocus(editRequest);
    });
    return () => window.cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editRequest]);
  return <div ref={rowRef} id={apiConnectionFieldId(connection.id)} tabIndex={-1} data-focus-first-control="" className={sx(styles.connection)}>
    <div className={sx(styles.heading)}>
      <span className={sx(styles.name)}>{connection.label}</span>
      <span className={sx(styles.meta)}>
        {connection.kind === "vercel-ai-gateway" ? VERCEL_AI_GATEWAY.label : t("settingsConnections:apiConnectionForm.otherGateway")} · {servesLine(connection)} {t("settingsConnections:apiConnectionsSettings.keyLine", { value1: keyName ?? t("settingsConnections:apiConnectionsSettings.notFoundInSecrets") })}
      </span>
    </div>
    {!editing && <ul className={sx(styles.modelList)} aria-label={t("settingsConnections:apiConnectionsSettings.modelsPinnedOn", { value1: connection.label })}>
      {connection.models.map((model) => <li key={model.id} className={sx(styles.meta)}>{model.name ?? model.id}{model.name && model.name !== model.id ? ` (${model.id})` : ""}</li>)}
    </ul>}
    {editing && <div className={sx(accountStyles.stack)}>
      <div className={sx(accountStyles.stackTight)}>
        <label htmlFor={nameId} className={sx(accountStyles.label)}>{t("common:labels.name")}</label>
        <Input id={nameId} value={label} onChange={(event) => setLabel(event.target.value)} />
      </div>
      <ApiConnectionKeySelect value={secretId} onChange={setSecretId} secrets={props.secrets} onRefresh={props.onRefreshSecrets} />
      <ApiConnectionModelPicker kind={connection.kind} servesClaude={servesClaude} value={models} onChange={setModels} />
    </div>}
    <div className={sx(accountStyles.row)}>
      {editing ? <>
        <Button size="sm" disabled={props.busy || !label.trim() || models.length === 0} onClick={() => props.run(async () => {
          const result = await window.api!.apiConnections!.update({ id: connection.id, label, secretId, models });
          if (!result.ok) throw new Error(result.message);
          setEditing(false);
        })}>{t("settingsConnections:apiConnectionsSettings.saveChanges")}</Button>
        <Button size="sm" variant="quiet" onClick={() => setEditing(false)}>{t("common:actions.cancel")}</Button>
      </> : <>
        <Tooltip>
          <TooltipTrigger render={<Button size="sm" variant="outline" disabled={props.busy} onClick={() => props.run(async () => {
            setCheck(null);
            setCheck(await window.api!.apiConnections!.check({ id: connection.id }));
          })} />}>{t("settingsConnections:apiConnectionsSettings.checkConnection")}</TooltipTrigger>
          <TooltipContent>{t("settingsConnections:apiConnectionsSettings.checksThatTheGatewayAcceptsThe")}</TooltipContent>
        </Tooltip>
        <Button size="sm" variant="quiet" disabled={props.busy} onClick={startEditing}>{t("common:actions.edit")}</Button>
        <Tooltip>
          <TooltipTrigger render={<Button size="sm" variant="quiet" disabled={props.busy} onClick={() => props.run(async () => {
            const result = await window.api!.apiConnections!.remove({ id: connection.id });
            if (!result.ok) throw new Error(result.message);
            const state = useAppStore.getState();
            const patch = {
              ...(state.settings.claudeAccountProfileId === connection.id ? { claudeAccountProfileId: SYSTEM_ACCOUNT_PROFILE_ID } : {}),
              ...(state.settings.codexAccountProfileId === connection.id ? { codexAccountProfileId: SYSTEM_ACCOUNT_PROFILE_ID } : {}),
            };
            if (Object.keys(patch).length > 0) state.updateSettings({ patch });
          })} />}>{t("common:actions.remove")}</TooltipTrigger>
          <TooltipContent>{t("settingsConnections:apiConnectionsSettings.forgetsThisConnectionInStaveThe")}</TooltipContent>
        </Tooltip>
      </>}
    </div>
    {check && <p role="status" className={sx(check.ok ? styles.checkOk : styles.checkFailed)}>{describeApiConnectionCheck(check)}</p>}
  </div>;
}

/**
 * Right after "Add connection": check it, then use it. "Use in Codex" makes
 * the connection Codex's account for new turns and opens the composer's model
 * selector on the Codex tab at the connection's group; the selector waits for
 * Codex's availability check that the account switch starts. Without a
 * workspace the button is off and says so, as Getting started's model step
 * does. With a workspace but no task's composer open, it switches the account
 * only, keeps Settings open, and says what to do next.
 */
export function ApiConnectionNextStep(props: { connection: ApiConnection; busy: boolean; onDismiss: () => void }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const { connection } = props;
  const [check, setCheck] = useState<ApiConnectionCheckResult | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const workspaceOpen = useAppStore((state) => Boolean(state.workspacePathById[state.activeWorkspaceId] ?? state.repositoryPath));
  const composerOpen = useComposerModelSelectorAvailable();
  const [switchedOnly, setSwitchedOnly] = useState(false);
  const runtime = connection.endpoints.codex ? "codex" : "claude-code";
  const use = () => {
    useAppStore.getState().updateSettings({ patch: runtime === "codex" ? { codexAccountProfileId: connection.id } : { claudeAccountProfileId: connection.id } });
    // Only a mounted composer can open its selector; otherwise Settings stays and says so.
    if (composerOpen) {
      openComposerModelSelector(runtime, apiConnectionGroupLabel(connection.label));
    } else {
      setSwitchedOnly(true);
    }
  };
  const runCheck = () => {
    setChecking(true); setCheck(null); setCheckFailed(false);
    // A rejected bridge call gets a fixed sentence; its own text is not shown.
    void Promise.resolve()
      .then(() => window.api!.apiConnections!.check({ id: connection.id }))
      .then(setCheck, () => setCheckFailed(true))
      .finally(() => setChecking(false));
  };
  return <div role="status" className={sx(styles.nextStep)} data-testid="api-connection-next-step">
    <span className={sx(accountStyles.subheading)}>{t("settingsConnections:apiConnectionsSettings.nextStep.title", { value1: connection.label })}</span>
    <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionsSettings.nextStep.body", { value1: RUNTIME_NAME[runtime] })}</p>
    <div className={sx(accountStyles.row)}>
      <Button size="sm" variant="outline" disabled={props.busy || checking} onClick={runCheck}>{t("settingsConnections:apiConnectionsSettings.checkConnection")}</Button>
      <Button size="sm" disabled={!workspaceOpen} onClick={use}>{t("settingsConnections:apiConnectionsSettings.nextStep.use", { value1: RUNTIME_NAME[runtime] })}</Button>
      <Button size="sm" variant="quiet" onClick={props.onDismiss}>{t("settingsConnections:apiConnectionsSettings.nextStep.done")}</Button>
    </div>
    {!workspaceOpen && <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionsSettings.nextStep.needsWorkspace", { value1: RUNTIME_NAME[runtime] })}</p>}
    {switchedOnly && <p className={sx(styles.checkOk)} data-testid="api-connection-switched">{t("settingsConnections:apiConnectionsSettings.nextStep.switchedOnly", { value1: RUNTIME_NAME[runtime], value2: connection.label })}</p>}
    {check && <p className={sx(check.ok ? styles.checkOk : styles.checkFailed)}>{describeApiConnectionCheck(check)}</p>}
    {checkFailed && <p role="alert" className={sx(styles.checkFailed)}>{t("settingsConnections:apiConnectionsSettings.nextStep.checkFailed")}</p>}
  </div>;
}

/**
 * App-level API connections: one gateway key that Claude Code and Codex can
 * both use. A connection appears as an account under each runtime it serves,
 * so it is chosen the same way as a sign-in account.
 */
export function ApiConnectionsSettings() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [connections, setConnections] = useState<ApiConnection[]>([]);
  const [secrets, setSecrets] = useState<SecretOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The list answered once, so a connection deep link can tell "absent" from "not loaded yet". */
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const result = await window.api?.apiConnections?.list();
      if (!result) return;
      if (result.ok) setConnections(result.connections);
      else setError(result.message);
    } finally {
      setLoaded(true);
    }
  }, []);
  // A connection deep link waits for the list; once it answered without that
  // connection, the request is dropped and the section stays where it is.
  const focusRequest = useSettingsFocusRequest((state) => (apiConnectionIdFromFocus(state.focus) ? state : null));
  const focusConnectionId = apiConnectionIdFromFocus(focusRequest?.focus);
  useEffect(() => {
    if (!loaded || !focusRequest || !focusConnectionId) return;
    if (!connections.some((connection) => connection.id === focusConnectionId)) clearSettingsFocus(focusRequest.nonce);
  }, [connections, focusConnectionId, focusRequest, loaded]);
  const refreshSecrets = useCallback(async () => {
    try {
      const result = await window.api?.secrets?.list?.();
      if (!result?.ok) throw new Error(result?.message || i18n.t("settingsConnections:apiConnectionsSettings.secretStorageIsUnavailable"));
      setSecrets(result.secrets.map(({ id, name }) => ({ id, name })));
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
  }, []);
  useEffect(() => { void refresh(); void refreshSecrets(); }, [refresh, refreshSecrets]);
  const run = (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    void action().catch((failure) => setError(failure instanceof Error ? failure.message : String(failure)))
      .finally(() => { setBusy(false); void refresh(); void useProviderAccounts.getState().refresh(); });
  };
  const [added, setAdded] = useState<ApiConnection | null>(null);
  const create = async (args: ApiConnectionCreateArgs) => {
    let created = false;
    setBusy(true); setError(null);
    try {
      const result = await window.api!.apiConnections!.create(args);
      if (!result.ok) throw new Error(result.message);
      created = true;
      setAdded(result.connection);
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); void refresh(); void useProviderAccounts.getState().refresh(); }
    return created;
  };
  const suggestedModelIds = useMemo(() => [...new Set(connections.flatMap((connection) => connection.models.map((model) => model.id)))], [connections]);
  if (!window.api?.apiConnections) return null;
  return <SettingsCard
    id={API_CONNECTIONS_FIELD_ID}
    tabIndex={-1}
    title={t("settings:sections.fields.apiConnections.title")}
    titleAccessory={<AccountsGuideButton url={STAVE_API_CONNECTIONS_GUIDE_URL}>{t("settingsConnections:apiConnectionsSettings.readTheAPIConnectionsGuide")}</AccountsGuideButton>}
    description={t("settingsConnections:apiConnectionsSettings.sendTurnsThroughAGatewayThat")}
  >
    <div className={sx(accountStyles.stack)}>
      {connections.length === 0
        ? <p className={sx(accountStyles.muted)}>{t("settingsConnections:apiConnectionsSettings.noAPIConnectionsYetSaveThe")}</p>
        : connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} secrets={secrets} busy={busy} run={run} onRefreshSecrets={refreshSecrets} />)}
      {error && <p role="alert" className={sx(accountStyles.error)}>{error}</p>}
      {added && <ApiConnectionNextStep key={added.id} connection={added} busy={busy} onDismiss={() => setAdded(null)} />}
      <ApiConnectionForm busy={busy} secrets={secrets} suggestedModelIds={suggestedModelIds} onRefreshSecrets={refreshSecrets} onCreate={create} />
    </div>
  </SettingsCard>;
}
