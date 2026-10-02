import { useMemo, useState } from "react";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import {
  buildModelEnrichmentFromCatalogs,
  buildModelSelectorOptions,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import { sx } from "@/components/ads/utils/stylex";
import { ApiConnectionsSettings } from "@/components/layout/ApiConnectionsSettings";
import { Toaster } from "@/components/ui";
import { buildApiConnectionCatalogEntries } from "@/lib/providers/api-connection-models";
import { VERCEL_AI_GATEWAY, type ApiConnection, type ApiConnectionCatalogModel } from "@/lib/providers/api-connections";
import { getSdkModelOptions } from "@/lib/providers/model-catalog";
import * as stylex from "@stylexjs/stylex";
import { previewStyles as styles } from "@/dev/model-auto-tab-preview/preview.styles";

const local = stylex.create({ card: { maxWidth: 760 } });

const secretId = "11111111-1111-4111-8111-111111111111";
const connection: ApiConnection = {
  id: "33333333-3333-4333-8333-333333333333",
  label: "Company gateway",
  kind: "vercel-ai-gateway",
  secretId,
  endpoints: { ...VERCEL_AI_GATEWAY.endpoints },
  models: [
    { id: "anthropic/claude-sonnet-5", name: "Claude Sonnet 5", contextWindow: 1_000_000, inputPrice: "0.000002", outputPrice: "0.00001" },
    { id: "moonshotai/kimi-k3", name: "Kimi K3", contextWindow: 1_000_000, inputPrice: "0.000003", outputPrice: "0.000015" },
    { id: "zai/glm-5.3", name: "GLM 5.3", contextWindow: 1_000_000, inputPrice: "0.0000014", outputPrice: "0.0000044" },
  ],
};
// Rows shaped like GET https://ai-gateway.vercel.sh/v1/models (public, 2026-10-02).
const catalog: ApiConnectionCatalogModel[] = [
  { id: "deepseek/deepseek-v4-flash", name: "DeepSeek V4 Flash", contextWindow: 1_000_000, inputPrice: "0.00000013", outputPrice: "0.00000026", tags: ["tool-use"] },
  { id: "openai/gpt-oss-120b", name: "GPT OSS 120B", contextWindow: 131_072, inputPrice: "0.0000001", outputPrice: "0.0000005", tags: ["tool-use"] },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra", contextWindow: 1_050_000, inputPrice: "0.00001", outputPrice: "0.00005", tags: ["tool-use"] },
  { id: "alibaba/qwen3-coder-next", name: "Qwen3 Coder Next", contextWindow: 256_000, inputPrice: "0.0000005", outputPrice: "0.0000012", tags: ["tool-use"] },
];

window.api = {
  ...window.api,
  apiConnections: {
    list: async () => ({ ok: true, connections: [connection] }),
    create: async () => ({ ok: false, message: "Preview: saving is disabled." }),
    update: async () => ({ ok: false, message: "Preview: saving is disabled." }),
    remove: async () => ({ ok: false, message: "Preview: removing is disabled." }),
    check: async () => ({ ok: false, status: "budget-exhausted", missingModels: [],
      message: "This key's budget on the gateway is used up (HTTP 402). Ask whoever manages the gateway to raise it, or wait until it resets." }),
    discoverModels: async () => ({ ok: true, models: catalog }),
  },
  secrets: {
    ...window.api?.secrets,
    list: async () => ({ ok: true, secrets: [{ id: secretId, name: "Vercel AI Gateway", description: "", valuePreview: "…f3a1", createdAt: 0, updatedAt: 0 }] as never }),
  },
} as typeof window.api;

/** The settings card and the composer picker for one connection selected under Claude Code. */
export function ApiConnectionsPreview() {
  const claudeEntries = useMemo(() => buildApiConnectionCatalogEntries({
    runtime: "claude-code",
    profile: { label: connection.label, apiConnection: { label: connection.label, kind: connection.kind, models: connection.models } },
  }), []);
  const options = useMemo<ModelSelectorOption[]>(() => buildModelSelectorOptions({
    providerIds: ["claude-code", "codex"],
    modelsByProvider: { "claude-code": claudeEntries.map((entry) => entry.model), codex: getSdkModelOptions({ providerId: "codex" }) },
    enrichmentByModel: buildModelEnrichmentFromCatalogs({ "claude-code": { entries: claudeEntries } }),
  }), [claudeEntries]);
  const [value, setValue] = useState<ModelSelectorOption>(() => options[0]!);
  return <div className={sx(styles.page)}>
    <h1 className={sx(styles.heading)}>API connections</h1>
    <div data-preview="settings-card" className={sx(local.card)}><ApiConnectionsSettings /></div>
    <div data-preview="model-picker" className={sx(styles.stage)}>
      <ModelEffortSelector value={value} options={options} onSelect={({ selection }) => setValue(selection)} />
    </div>
    <Toaster />
  </div>;
}
