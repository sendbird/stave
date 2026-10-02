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
  const id = useId();
  return <div className={sx(styles.stackTight)}>
    <label htmlFor={id} className={sx(styles.label)}>API key</label>
    <div className={sx(styles.row)}>
      <Select value={props.value} onValueChange={(value) => { if (typeof value === "string") props.onChange(value); }}>
        <SelectTrigger id={id} aria-label="API key from Secrets" className={sx(styles.pickerSelect)}>
          <SelectValue placeholder="Choose the key from Secrets">{props.secrets.find((secret) => secret.id === props.value)?.name}</SelectValue>
        </SelectTrigger>
        <SelectContent>{props.secrets.map((secret) => <SelectItem key={secret.id} value={secret.id}>{secret.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="quiet" onClick={() => window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "secrets" } }))}>Open Secrets</Button>
      <Button size="sm" variant="quiet" onClick={props.onRefresh}>Refresh keys</Button>
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
    !label.trim() && "a name",
    !secretId && "a key from Secrets",
    custom && !claudeEndpoint.trim() && !codexEndpoint.trim() && "an HTTPS endpoint",
    models.length === 0 && "at least one model",
  ].filter(Boolean);
  const add = async () => {
    if (!parsed.success) return;
    if (await props.onCreate(parsed.data)) {
      setLabel(""); setModels([]); setClaudeEndpoint(""); setCodexEndpoint("");
    }
  };
  return <div className={sx(styles.stack, styles.section)}>
    <span className={sx(styles.subheading)}>Add a connection</span>
    <div className={sx(styles.row)}>
      <Select value={kind} onValueChange={(value) => { if (value === "custom" || value === "vercel-ai-gateway") { setKind(value); setModels([]); } }}>
        <SelectTrigger aria-label="Gateway" className={sx(styles.pickerSelect)}>
          <SelectValue>{custom ? "Other gateway" : "Vercel AI Gateway"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="vercel-ai-gateway">Vercel AI Gateway</SelectItem>
          <SelectItem value="custom">Other gateway</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className={sx(styles.stackTight)}>
      <label htmlFor={nameId} className={sx(styles.label)}>Name</label>
      <Input id={nameId} placeholder="For example, Company gateway" value={label} onChange={(event) => setLabel(event.target.value)} />
    </div>
    <ApiConnectionKeySelect value={secretId} onChange={setSecretId} secrets={props.secrets} onRefresh={props.onRefreshSecrets} />
    {custom ? <div className={sx(styles.stackTight)}>
      <label htmlFor={claudeId} className={sx(styles.label)}>Claude Code endpoint</label>
      <Input id={claudeId} placeholder="https://gateway.example.com/anthropic" value={claudeEndpoint} onChange={(event) => setClaudeEndpoint(event.target.value)} />
      <label htmlFor={codexId} className={sx(styles.label)}>Codex endpoint</label>
      <Input id={codexId} placeholder="https://gateway.example.com/v1" value={codexEndpoint} onChange={(event) => setCodexEndpoint(event.target.value)} />
      <p className={sx(styles.muted)}>
        Fill in one or both. Claude Code sends to the endpoint plus /v1/messages; Codex sends to the endpoint plus /responses. The endpoints can't change later; add another connection to use a different gateway.
      </p>
    </div> : <p className={sx(styles.muted)}>
      Serves Claude Code through ai-gateway.vercel.sh/claude-code and Codex through ai-gateway.vercel.sh/codex/v1, with the same key.
    </p>}
    <ApiConnectionModelPicker kind={kind} servesClaude={!custom || Boolean(claudeEndpoint.trim())} value={models} onChange={setModels} />
    <div className={sx(styles.row)}>
      <Button size="sm" disabled={props.busy || !parsed.success} onClick={() => void add()}>Add connection</Button>
      {!parsed.success && <span className={sx(styles.muted)}>
        {missing.length > 0 ? `Still needed: ${missing.join(", ")}.` : "Use HTTPS endpoints without a user name, password or query."}
      </span>}
    </div>
  </div>;
}
