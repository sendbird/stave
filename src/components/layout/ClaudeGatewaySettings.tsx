import { useEffect, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sx } from "@/components/ads/utils/stylex";
import { focusRing } from "@/components/ads/recipes/focus-ring";
import { CLAUDE_GATEWAY_PRESET_MODEL, CLAUDE_GATEWAY_PRESET_URL, ClaudeGatewaySchema } from "@/lib/providers/claude-gateway";
import { CLAUDE_GATEWAY_FIELD_ID, STAVE_GATEWAY_GUIDE_URL } from "@/lib/providers/accounts-guide";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import { STAVE_OPEN_SETTINGS_EVENT } from "@/store/app.store";
import { AccountsGuideButton } from "./AccountsGuideButton";
import { accountStyles as styles } from "./provider-accounts.styles";

export function ClaudeGatewaySettings() {
  const [preset, setPreset] = useState("custom");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [secretId, setSecretId] = useState("");
  const [secrets, setSecrets] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refreshSecrets = async () => {
    try {
      const result = await window.api?.secrets?.list?.();
      if (!result?.ok) throw new Error(result?.message || "Secret storage is unavailable.");
      setSecrets(result.secrets.map(({ id, name }) => ({ id, name })));
    } catch (error) { setMessage(String(error)); }
  };
  useEffect(() => { void refreshSecrets(); }, []);
  const gateway = ClaudeGatewaySchema.safeParse({ baseUrl, secretId, models: models.split(",").map(model => model.trim()).filter(Boolean) });
  const add = async () => {
    if (!gateway.success) return;
    setBusy(true); setMessage("");
    try {
      const result = await window.api!.providerAccounts!.create({ providerId: "claude-code", label, gateway: gateway.data });
      if (!result.ok) throw new Error(result.message);
      await useProviderAccounts.getState().refresh();
      setLabel("");
      setMessage("Connection added. Pick it as the account for new turns, then choose one of its models in the composer.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <div id={CLAUDE_GATEWAY_FIELD_ID} tabIndex={-1} className={sx(styles.stack, styles.section, focusRing.ring)}>
    <div className={sx(styles.row)}>
      <span className={sx(styles.subheading)}>Connect Claude to an API gateway</span>
      <AccountsGuideButton url={STAVE_GATEWAY_GUIDE_URL}>Read the gateway guide</AccountsGuideButton>
    </div>
    <p className={sx(styles.muted)}>
      Sends Claude turns through a gateway such as your company's Vercel AI Gateway. The gateway bills every turn per token; your Claude subscription is not used, and your other accounts keep working as before. Claude models only for now: Codex and non-Claude models can't use a gateway yet.
    </p>
    <Select value={preset} onValueChange={value => {
      setPreset(value); setBaseUrl(value === "vercel" ? CLAUDE_GATEWAY_PRESET_URL : "");
      setModels(value === "vercel" ? CLAUDE_GATEWAY_PRESET_MODEL : "");
    }}>
      <SelectTrigger aria-label="Gateway type"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="custom">Anthropic-compatible endpoint</SelectItem><SelectItem value="vercel">Vercel AI Gateway</SelectItem></SelectContent>
    </Select>
    <div className={sx(styles.row)}>
      <Input aria-label="Gateway connection name" placeholder="Connection name, for example Company gateway" value={label} onChange={e => setLabel(e.target.value)} xstyle={styles.field} />
      <Input aria-label="Gateway base URL" placeholder="HTTPS base URL, without /v1/messages" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} xstyle={styles.field} />
    </div>
    <Input aria-label="Gateway model IDs" placeholder="Claude model IDs, separated by commas" value={models} onChange={e => setModels(e.target.value)} />
    <p className={sx(styles.muted)}>The first model also runs background requests and subagents on this connection.</p>
    <div className={sx(styles.row)}>
      <Select value={secretId} onValueChange={setSecretId}>
        <SelectTrigger aria-label="Gateway API key"><SelectValue placeholder="Choose the API key from Secrets" /></SelectTrigger>
        <SelectContent>{secrets.map(secret => <SelectItem key={secret.id} value={secret.id}>{secret.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="quiet" onClick={() => window.dispatchEvent(new CustomEvent(STAVE_OPEN_SETTINGS_EVENT, { detail: { section: "secrets" } }))}>Open Secrets</Button>
      <Button size="sm" variant="quiet" onClick={() => void refreshSecrets()}>Refresh secrets</Button>
      <Button size="sm" disabled={busy || !label.trim() || !gateway.success} onClick={() => void add()}>Add connection</Button>
    </div>
    <p className={sx(styles.muted)}>
      Save the gateway's API key in Secrets first; the connection stores only a reference to it. A connection can't be edited later: to change its URL or models, add a new one. You can replace the key's value in Secrets at any time.
    </p>
    {baseUrl && !gateway.success && <p className={sx(styles.muted)}>To add the connection, use an HTTPS URL without a user name, password or query, Claude model IDs such as anthropic/claude-sonnet-5, and a key from Secrets.</p>}
    {message && <p role="status" className={sx(styles.muted)}>{message}</p>}
  </div>;
}
