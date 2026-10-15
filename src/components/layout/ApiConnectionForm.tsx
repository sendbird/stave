import { I18N_NAMESPACES, useTranslation } from "@/i18n";
import { useId, useRef, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_CONNECTION_NEW_FIELD_ID } from "@/lib/providers/accounts-guide";
import {
  ApiConnectionCreateArgsSchema,
  VERCEL_AI_GATEWAY,
  type ApiConnectionCreateArgs,
  type ApiConnectionKind,
  type ApiConnectionModel,
} from "@/lib/providers/api-connections";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { ApiConnectionModelPicker } from "./ApiConnectionModelPicker";
import { accountStyles as styles } from "./provider-accounts.styles";
import { apiConnectionStyles } from "./api-connections.styles";

export type SecretOption = { id: string; name: string };

/** "Vercel AI Gateway", or "Vercel AI Gateway 2" when that name is taken: Secrets names are unique. */
export function nextSecretName(base: string, secrets: readonly SecretOption[]) {
  const taken = new Set(secrets.map((secret) => secret.name.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * Saves a pasted key to Settings > Secrets through the same bridge the Secrets
 * section uses, then hands back only its id. The value field is uncontrolled:
 * the value is read from the input once, at save, sent to Electron main, and
 * cleared from the field. It is never held in React state, a store, a log or
 * an event.
 */
function ApiConnectionNewKeyForm(props: {
  secrets: SecretOption[];
  onCreated: (id: string) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const nameId = useId();
  const valueId = useId();
  const valueRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => nextSecretName(VERCEL_AI_GATEWAY.label, props.secrets));
  const [hasValue, setHasValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const field = valueRef.current;
    const upsert = window.api?.secrets?.upsert;
    if (!field || !upsert) {
      setError(t("settingsConnections:apiConnectionForm.newKey.unavailable"));
      return;
    }
    const value = field.value.trim();
    if (!value || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const result = await upsert({ name: name.trim(), description: t("settingsConnections:apiConnectionForm.newKey.secretDescription"), envVarName: "", value });
      if (!result.ok || !result.secret) throw new Error(result.message || t("settingsConnections:apiConnectionForm.newKey.failed"));
      field.value = "";
      setHasValue(false);
      await props.onCreated(result.secret.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("settingsConnections:apiConnectionForm.newKey.failed"));
    } finally {
      setSaving(false);
    }
  };
  return <div className={sx(styles.stackTight, apiConnectionStyles.newKey)}>
    <label htmlFor={nameId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.newKey.name")}</label>
    <Input id={nameId} value={name} onChange={(event) => setName(event.target.value)} />
    <label htmlFor={valueId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.newKey.value")}</label>
    <Input id={valueId} ref={valueRef} type="password" autoComplete="off" spellCheck={false}
      placeholder={t("settingsConnections:apiConnectionForm.newKey.valuePlaceholder")}
      onChange={(event) => setHasValue(event.target.value.trim().length > 0)} />
    <p className={sx(styles.muted)}>{t("settingsConnections:apiConnectionForm.newKey.help")}</p>
    <div className={sx(styles.row)}>
      <Button size="sm" disabled={saving || !hasValue || !name.trim()} onClick={() => void save()}>{t("settingsConnections:apiConnectionForm.newKey.save")}</Button>
      <Button size="sm" variant="quiet" disabled={saving} onClick={props.onCancel}>{t("common:actions.cancel")}</Button>
    </div>
    {error && <p role="alert" className={sx(styles.error)}>{error}</p>}
  </div>;
}

/** The saved key a connection uses, picked from Secrets or pasted here; only its reference is stored. */
export function ApiConnectionKeySelect(props: {
  value: string;
  onChange: (id: string) => void;
  secrets: SecretOption[];
  onRefresh: () => Promise<void> | void;
}) {
  const { t } = useTranslation(["common", "settings", "settingsProviders", "settingsConnections", "providers", "usage", "compare"]);
  const id = useId();
  const [pasting, setPasting] = useState(false);
  return <div className={sx(styles.stackTight)}>
    <label htmlFor={id} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.apiKey")}</label>
    <div className={sx(styles.row)}>
      <Select value={props.value} onValueChange={(value) => { if (typeof value === "string") props.onChange(value); }}>
        <SelectTrigger id={id} aria-label={t("settingsConnections:apiConnectionForm.apiKeyFromSecrets")} className={sx(styles.pickerSelect)}>
          <SelectValue placeholder={t("settingsConnections:apiConnectionForm.chooseTheKeyFromSecrets")}>{props.secrets.find((secret) => secret.id === props.value)?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>{props.secrets.map((secret) => <SelectItem key={secret.id} value={secret.id}>{secret.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="outline" aria-expanded={pasting} onClick={() => setPasting((open) => !open)}>{t("settingsConnections:apiConnectionForm.newKey.open")}</Button>
      <Button size="sm" variant="quiet" onClick={() => window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "secrets" } }))}>{t("settingsConnections:apiConnectionForm.openSecrets")}</Button>
      <Button size="sm" variant="quiet" onClick={() => void props.onRefresh()}>{t("settingsConnections:apiConnectionForm.refreshKeys")}</Button>
    </div>
    {pasting && <ApiConnectionNewKeyForm secrets={props.secrets} onCancel={() => setPasting(false)} onCreated={async (secretId) => {
      await props.onRefresh();
      props.onChange(secretId);
      setPasting(false);
    }} />}
  </div>;
}

type FormStepId = "key" | "name" | "models" | "check";

/** 1 key, 2 name, 3 models, 4 check: what is left before "Add connection", and what follows it. */
function ApiConnectionFormSteps(props: { done: Record<Exclude<FormStepId, "check">, boolean> }) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const steps: Array<{ id: FormStepId; label: string; done: boolean }> = [
    { id: "key", label: t("settingsConnections:apiConnectionForm.steps.key"), done: props.done.key },
    { id: "name", label: t("settingsConnections:apiConnectionForm.steps.name"), done: props.done.name },
    { id: "models", label: t("settingsConnections:apiConnectionForm.steps.models"), done: props.done.models },
    { id: "check", label: t("settingsConnections:apiConnectionForm.steps.check"), done: false },
  ];
  return <ol className={sx(apiConnectionStyles.steps)} aria-label={t("settingsConnections:apiConnectionForm.steps.label")}>
    {steps.map((step, index) => <li key={step.id} className={sx(apiConnectionStyles.step, step.done && apiConnectionStyles.stepDone)} data-step={step.id} data-done={step.done ? "true" : undefined}>
      {step.done ? <CheckCircle2 aria-hidden className={sx(apiConnectionStyles.stepIcon, apiConnectionStyles.stepIconDone)} /> : <Circle aria-hidden className={sx(apiConnectionStyles.stepIcon)} />}
      <span>{t("settingsConnections:apiConnectionForm.steps.item", { value1: index + 1, value2: step.label })}</span>
      <span className={sx(apiConnectionStyles.visuallyHidden)}>{step.done ? t("settingsConnections:accountsOnboarding.status.done") : t("settingsConnections:accountsOnboarding.status.todo")}</span>
    </li>)}
  </ol>;
}

/** Add a connection: a gateway, a saved or pasted key, a name, and the models to pin. */
export function ApiConnectionForm(props: {
  busy: boolean;
  secrets: SecretOption[];
  /** Models pinned on other connections, offered first when the catalog lists them. */
  suggestedModelIds?: readonly string[];
  onRefreshSecrets: () => Promise<void> | void;
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
  const stepsDone = { key: Boolean(secretId), name: Boolean(label.trim()), models: models.length > 0 };
  // The step line covers key, name and models; only what it cannot show stays as text.
  const endpointMissing = custom && !claudeEndpoint.trim() && !codexEndpoint.trim();
  const add = async () => {
    if (!parsed.success) return;
    if (await props.onCreate(parsed.data)) {
      setLabel(""); setModels([]); setClaudeEndpoint(""); setCodexEndpoint("");
    }
  };
  return <div id={API_CONNECTION_NEW_FIELD_ID} tabIndex={-1} data-focus-first-control="" className={sx(styles.stack, styles.section)}>
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
    <ApiConnectionKeySelect value={secretId} onChange={setSecretId} secrets={props.secrets} onRefresh={props.onRefreshSecrets} />
    <div className={sx(styles.stackTight)}>
      <label htmlFor={nameId} className={sx(styles.label)}>{t("common:labels.name")}</label>
      <Input id={nameId} placeholder={t("settingsConnections:apiConnectionForm.forExampleCompanyGateway")} value={label} onChange={(event) => setLabel(event.target.value)} />
    </div>
    {custom ? <div className={sx(styles.stackTight)}>
      <label htmlFor={claudeId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.claudeCodeEndpoint")}</label>
      <Input id={claudeId} placeholder="https://gateway.example.com/anthropic" value={claudeEndpoint} onChange={(event) => setClaudeEndpoint(event.target.value)} />
      <label htmlFor={codexId} className={sx(styles.label)}>{t("settingsConnections:apiConnectionForm.codexEndpoint")}</label>
      <Input id={codexId} placeholder="https://gateway.example.com/v1" value={codexEndpoint} onChange={(event) => setCodexEndpoint(event.target.value)} />
      <p className={sx(styles.muted)}>
        {t("settingsConnections:apiConnectionForm.fillInOneOrBothClaude")}</p>
    </div> : <p className={sx(styles.muted)}>
      {t("settingsConnections:apiConnectionForm.servesClaudeCodeThroughAiGateway")}</p>}
    <ApiConnectionModelPicker kind={kind} servesClaude={!custom || Boolean(claudeEndpoint.trim())} value={models} onChange={setModels} suggestedIds={props.suggestedModelIds} />
    <ApiConnectionFormSteps done={stepsDone} />
    <div className={sx(styles.row)}>
      <Button size="sm" disabled={props.busy || !parsed.success} onClick={() => void add()}>{t("settingsConnections:apiConnectionForm.addConnection")}</Button>
      {!parsed.success && stepsDone.key && stepsDone.name && stepsDone.models && <span className={sx(styles.muted)}>
        {endpointMissing ? t("settingsConnections:apiConnectionForm.stillNeeded", { value1: t("settingsConnections:apiConnectionForm.anHTTPSEndpoint") }) : t("settingsConnections:apiConnectionForm.useHTTPSEndpointsWithoutAUser")}
      </span>}
    </div>
  </div>;
}
