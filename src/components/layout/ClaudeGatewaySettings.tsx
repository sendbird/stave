import { useEffect, useState } from "react";
import { Button } from "@/components/ads/components/Button";
import { Input } from "@/components/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sx } from "@/components/ads/utils/stylex";
import { CLAUDE_GATEWAY_PRESET_URL, ClaudeGatewaySchema } from "@/lib/providers/claude-gateway";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
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
      setMessage("Connection added. Select it for new turns and choose one of its configured models.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <div className={sx(styles.stack)}>
    <strong>Add a Gateway connection</strong>
    <p className={sx(styles.muted)}>Uses the Claude runtime with API billing. Store the key in Settings &gt; Secrets, then select its name here. Connection details stay fixed so existing sessions keep their destination.</p>
    <Select value={preset} onValueChange={value => {
      setPreset(value); setBaseUrl(value === "vercel" ? CLAUDE_GATEWAY_PRESET_URL : "");
      setModels(value === "vercel" ? "anthropic/claude-sonnet-5" : "");
    }}>
      <SelectTrigger aria-label="Gateway preset"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="custom">Anthropic-compatible endpoint</SelectItem><SelectItem value="vercel">Vercel AI Gateway</SelectItem></SelectContent>
    </Select>
    <div className={sx(styles.row)}>
      <Input aria-label="Gateway connection name" placeholder="Connection name" value={label} onChange={e => setLabel(e.target.value)} className={sx(styles.field)} />
      <Input aria-label="Gateway base URL" placeholder="HTTPS base URL (before /v1/messages)" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} className={sx(styles.field)} />
    </div>
    <Input aria-label="Gateway model IDs" placeholder="Exact Claude model IDs, separated by commas" value={models} onChange={e => setModels(e.target.value)} />
    <div className={sx(styles.row)}>
      <Select value={secretId} onValueChange={setSecretId}>
        <SelectTrigger aria-label="Gateway API key"><SelectValue placeholder="Select a saved secret" /></SelectTrigger>
        <SelectContent>{secrets.map(secret => <SelectItem key={secret.id} value={secret.id}>{secret.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="quiet" onClick={() => void refreshSecrets()}>Refresh secrets</Button>
      <Button size="sm" disabled={busy || !label.trim() || !gateway.success} onClick={() => void add()}>Add Gateway</Button>
    </div>
    {baseUrl && !gateway.success && <p className={sx(styles.muted)}>Enter an HTTPS URL without credentials or query parameters, exact Claude model IDs, and a saved API key.</p>}
    {message && <p role="status" className={sx(styles.muted)}>{message}</p>}
  </div>;
}
