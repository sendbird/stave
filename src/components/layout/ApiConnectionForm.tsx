import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useId, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ApiConnectionCreateArgsSchema,
  type ApiConnectionCreateArgs,
  type ApiConnectionKind,
  type ApiConnectionModel,
} from "@/lib/providers/api-connections";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { ApiConnectionModelPicker } from "./ApiConnectionModelPicker";
import { accountStyles as styles } from "./provider-accounts.styles";

export type SecretOption = { id: string; name: string };

/** The saved key a connection uses, picked from Secrets; only its reference is stored. */
export function ApiConnectionKeySelect(props: {
  value: string;
  onChange: (id: string) => void;
  secrets: SecretOption[];
  onRefresh: () => void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const id = useId();
  return <div className={sx(styles.stackTight)}>
    <label htmlFor={id} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.apiKey")}</label>
    <div className={sx(styles.row)}>
      <Select value={props.value} onValueChange={(value) => { if (typeof value === "string") props.onChange(value); }}>
        <SelectTrigger id={id} aria-label={t("settingsConnections:apiConnectionForm.apiKeyFromSecrets")} className={sx(styles.pickerSelect)}>
          <SelectValue placeholder={t("settingsConnections:apiConnectionForm.chooseTheKeyFromSecrets")}>{props.secrets.find((secret) => secret.id === props.value)?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>{props.secrets.map((secret) => <SelectItem key={secret.id} value={secret.id}>{secret.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="quiet" onClick={() => window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "secrets" } }))}>{t("settingsConnections:apiConnectionForm.openSecrets")}</Button>
      <Button size="sm" variant="quiet" onClick={props.onRefresh}>{t("settingsConnections:apiConnectionForm.refreshKeys")}</Button>
    </div>
  </div>;
}

/** Add a connection: a gateway, a name, a saved key, and the models to pin. */
export function ApiConnectionForm(props: {
  busy: boolean;
  secrets: SecretOption[];
  onRefreshSecrets: () => void;
  onCreate: (args: ApiConnectionCreateArgs) => Promise<boolean>;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const nameId = useId();
  const claudeId = useId();
  const codexId = useId();
  const [kind, setKind] = useState<ApiConnectionKind>("vercel-ai-gateway");
  const [label, setLabel] = useState("");
  const [secretId, setSecretId] = useState("");
  const [claudeEndpoint, setClaudeEndpoint] = useState("");
  const [codexEndpoint, setCodexEndpoint] = useState("");
  const [models, setModels] = useState<ApiConnectionModel[]>([]);
  const custom = kind === "custom";
  const args = {
    label, kind, secretId, models,
    ...(custom ? { endpoints: { ...(claudeEndpoint.trim() ? { "claude-code": claudeEndpoint.trim() } : {}), ...(codexEndpoint.trim() ? { codex: codexEndpoint.trim() } : {}) } } : {}),
  };
  const parsed = ApiConnectionCreateArgsSchema.safeParse(args);
  const missing = [
    !label.trim() && t("settingsConnections:apiConnectionForm.aName"),
    !secretId && t("settingsConnections:apiConnectionForm.aKeyFromSecrets"),
    custom && !claudeEndpoint.trim() && !codexEndpoint.trim() && t("settingsConnections:apiConnectionForm.anHTTPSEndpoint"),
    models.length === 0 && t("settingsConnections:apiConnectionForm.atLeastOneModel"),
  ].filter(Boolean);
  const add = async () => {
    if (!parsed.success) return;
    if (await props.onCreate(parsed.data)) {
      setLabel(""); setModels([]); setClaudeEndpoint(""); setCodexEndpoint("");
    }
  };
  return <div className={sx(styles.stack, styles.section)}>
    <span className={sx(styles.subheading)}>{t("settingsConnections:apiConnectionForm.addAConnection")}</span>
    <div className={sx(styles.row)}>
      <Select value={kind} onValueChange={(value) => { if (value === "custom" || value === "vercel-ai-gateway") { setKind(value); setModels([]); } }}>
        <SelectTrigger aria-label={t("settingsConnections:apiConnectionForm.gateway")} className={sx(styles.pickerSelect)}>
          <SelectValue>{custom ? t("settingsConnections:apiConnectionForm.otherGateway") : /* i18n-ignore: external service name */ "Vercel AI Gateway"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="vercel-ai-gateway">{/* i18n-ignore: external service name */ "Vercel AI Gateway"}</SelectItem>
          <SelectItem value="custom">{t("settingsConnections:apiConnectionForm.otherGateway")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className={sx(styles.stackTight)}>
      <label htmlFor={nameId} className={sx(styles.label)}>{t("common:labels.name")}</label>
      <Input id={nameId} placeholder={t("settingsConnections:apiConnectionForm.forExampleCompanyGateway")} value={label} onChange={(event) => setLabel(event.target.value)} />
    </div>
    <ApiConnectionKeySelect value={secretId} onChange={setSecretId} secrets={props.secrets} onRefresh={props.onRefreshSecrets} />
    {custom ? <div className={sx(styles.stackTight)}>
      <label htmlFor={claudeId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.claudeCodeEndpoint")}</label>
      <Input id={claudeId} placeholder="https://gateway.example.com/anthropic" value={claudeEndpoint} onChange={(event) => setClaudeEndpoint(event.target.value)} />
      <label htmlFor={codexId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.codexEndpoint")}</label>
      <Input id={codexId} placeholder="https://gateway.example.com/v1" value={codexEndpoint} onChange={(event) => setCodexEndpoint(event.target.value)} />
      <p className={sx(styles.muted)}>
        {t("settingsConnections:apiConnectionForm.fillInOneOrBothClaude")}</p>
    </div> : <p className={sx(styles.muted)}>
      {t("settingsConnections:apiConnectionForm.servesClaudeCodeThroughAiGateway")}</p>}
    <ApiConnectionModelPicker kind={kind} servesClaude={!custom || Boolean(claudeEndpoint.trim())} value={models} onChange={setModels} />
    <div className={sx(styles.row)}>
      <Button size="sm" disabled={props.busy || !parsed.success} onClick={() => void add()}>{t("settingsConnections:apiConnectionForm.addConnection")}</Button>
      {!parsed.success && <span className={sx(styles.muted)}>
        {missing.length > 0 ? t("settingsConnections:apiConnectionForm.stillNeeded", { value1: missing.join(", ") }) : t("settingsConnections:apiConnectionForm.useHTTPSEndpointsWithoutAUser")}
      </span>}
    </div>
  </div>;
}
