import { formatList } from "@/i18n/format";
import { i18n, I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useCallback, useEffect, useId, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import {
  VERCEL_AI_GATEWAY,
  apiConnectionRuntimes,
  type ApiConnection,
  type ApiConnectionCheckResult,
  type ApiConnectionCreateArgs,
  type ApiConnectionModel,
} from "@/lib/providers/api-connections";
import { API_CONNECTIONS_FIELD_ID, STAVE_API_CONNECTIONS_GUIDE_URL } from "@/lib/providers/accounts-guide";
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
  onRefreshSecrets: () => void;
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
  return <div className={sx(styles.connection)}>
    <div className={sx(styles.heading)}>
      <span className={sx(styles.name)}>{connection.label}</span>
      <span className={sx(styles.meta)}>
        {connection.kind === "vercel-ai-gateway" ? VERCEL_AI_GATEWAY.label : t("settingsConnections:apiConnectionForm.otherGateway")} · {servesLine(connection)} {t("settingsConnections:apiConnectionsSettings.key")}{keyName ?? t("settingsConnections:apiConnectionsSettings.notFoundInSecrets")}
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
    {check && <p role="status" className={sx(check.ok ? styles.checkOk : styles.checkFailed)}>{check.message}</p>}
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
  const refresh = useCallback(async () => {
    const result = await window.api?.apiConnections?.list();
    if (!result) return;
    if (result.ok) setConnections(result.connections);
    else setError(result.message);
  }, []);
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
  const create = async (args: ApiConnectionCreateArgs) => {
    let created = false;
    setBusy(true); setError(null);
    try {
      const result = await window.api!.apiConnections!.create(args);
      if (!result.ok) throw new Error(result.message);
      created = true;
    } catch (failure) { setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { setBusy(false); void refresh(); void useProviderAccounts.getState().refresh(); }
    return created;
  };
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
        : connections.map((connection) => <ConnectionRow key={connection.id} connection={connection} secrets={secrets} busy={busy} run={run} onRefreshSecrets={() => void refreshSecrets()} />)}
      {error && <p role="alert" className={sx(accountStyles.error)}>{error}</p>}
      <ApiConnectionForm busy={busy} secrets={secrets} onRefreshSecrets={() => void refreshSecrets()} onCreate={create} />
    </div>
  </SettingsCard>;
}
