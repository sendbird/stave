import { useMemo, useState } from "react";
import { ModelEffortSelector } from "@/components/ai-elements/model-effort-selector";
import {
  buildModelEnrichmentFromCatalogs,
  buildModelSelectorOptions,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector.utils";
import { sx } from "@/components/ads/utils/stylex";
import { ApiConnectionsSettings } from "@/components/layout/ApiConnectionsSettings";
import { RoutingDecisionField } from "@/components/layout/RoutingDecisionField";
import { SettingsCard } from "@/components/layout/settings-dialog.shared";
import { useProviderAccounts } from "@/lib/providers/use-provider-accounts";
import type { RoutingDecisionConfig } from "@/lib/providers/routing-decision";
import { useTranslation } from "@/i18n";
import { useAppStore } from "@/store/app.store";
import { SettingsAutoRoutingSection } from "@/components/layout/settings-dialog-auto-routing-section";
import { formatRoutingDecision } from "@/lib/providers/routing-decision-label";
import { Toaster } from "@/components/ui";
import { buildApiConnectionCatalogEntries } from "@/lib/providers/api-connection-models";
import { VERCEL_AI_GATEWAY, type ApiConnection, type ApiConnectionCatalogModel } from "@/lib/providers/api-connections";
import { getSdkModelOptions } from "@/lib/providers/model-catalog";
import * as stylex from "@stylexjs/stylex";
import { previewStyles as styles } from "@/dev/model-auto-tab-preview/preview.styles";
import { StatusBarUsageSegment } from "@/components/layout/StatusBarUsageSegment";
import { resolveStatusBarAccountView } from "@/components/layout/status-bar-usage.utils";
import { buildUsageStripSegment } from "@/components/layout/status-bar-usage-strip.utils";
import { usageStripStyles } from "@/components/layout/status-bar-usage-strip.styles";
import { layoutShellStyles } from "@/components/layout/layout-shell.styles";
import type { ApiConnectionCreditsView } from "@/lib/providers/use-api-connection-credits";

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
    // Shaped like GET https://ai-gateway.vercel.sh/v1/credits (vercel.com/docs, 2026-10-16).
    credits: async () => ({ ok: true, balanceUsd: "95.50", totalUsedUsd: "4.50" }),
    discoverModels: async (args) => ({ ok: true, models: args?.purpose === "decision" ? [{ id: "typesafe-ai/jev", name: "Jev", tags: [] }, { id: "liquid/d1", name: "Liquid d1", tags: [] }] : catalog }),
  },
  secrets: {
    ...window.api?.secrets,
    list: async () => ({ ok: true, secrets: [{ id: secretId, name: "Vercel AI Gateway", description: "", valuePreview: "…f3a1", createdAt: 0, updatedAt: 0 }] as never }),
  },
} as typeof window.api;
useProviderAccounts.setState({ profiles: ["claude-code", "codex"].map((providerId) => ({ id: connection.id,
  providerId: providerId as "claude-code" | "codex", kind: "managed" as const, label: connection.label,
  gateway: { baseUrl: connection.endpoints[providerId as "claude-code" | "codex"]!, secretId, models: connection.models.map((model) => model.id) },
  apiConnection: { label: connection.label, kind: connection.kind, models: connection.models },
})), loaded: true });
useAppStore.setState((state) => ({ settings: { ...state.settings, autoRoutingEnabled: true, codexAccountProfileId: connection.id, claudeAccountProfileId: connection.id },
  providerAvailability: { "claude-code": true, codex: true, cursor: false, kiro: false, opencode: false } }));

/** The status bar meter for a Vercel connection (read and unreadable) and a custom one. */
function StatusBarCreditsPreview() {
  const meters: Array<{ key: string; kind: ApiConnection["kind"]; credits: ApiConnectionCreditsView | null }> = [
    { key: "vercel", kind: "vercel-ai-gateway", credits: { status: "ok", balanceUsd: "95.50", totalUsedUsd: "4.50" } },
    { key: "unavailable", kind: "vercel-ai-gateway", credits: { status: "unavailable" } },
    { key: "custom", kind: "custom", credits: null },
  ];
  return <>{meters.map(({ key, kind, credits }) => {
    const profiles = useProviderAccounts.getState().profiles.map((profile) => ({ ...profile, apiConnection: { ...profile.apiConnection!, kind } }));
    const account = resolveStatusBarAccountView({ providerId: "claude-code", profiles, selectedId: connection.id });
    const segment = buildUsageStripSegment({ provider: "claude", providerName: "Claude", windows: [], account, spend: undefined, credits, stale: false, pending: false });
    return <div key={key} data-preview={`status-bar-${key}`} {...stylex.props(layoutShellStyles.statusBar)}>
      <div {...stylex.props(usageStripStyles.container)}>
        <StatusBarUsageSegment segment={segment} account={account} breakpoint={24} tokensBreakpoint={24} now={Date.now()} />
      </div>
    </div>;
  })}</>;
}

/** The settings card and the composer picker for one connection selected under Claude Code. */
export function ApiConnectionsPreview() {
  const { t } = useTranslation("settingsProviders");
  const [decision, setDecision] = useState<RoutingDecisionConfig>({ mode: "automatic" });
  const [agentDecision, setAgentDecision] = useState<RoutingDecisionConfig>();
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
    <div data-preview="decision-settings" className={sx(local.card)}>
      <SettingsCard title={t("routingDecision.title")} description={t("routingDecision.description")}>
        <RoutingDecisionField value={decision} onChange={(value) => { if (value) setDecision(value); }} />
      </SettingsCard>
    </div>
    <div data-preview="agent-decision" className={sx(local.card)}>
      <RoutingDecisionField allowInherit value={agentDecision} onChange={setAgentDecision} />
    </div>
    <div data-preview="auto-settings" className={sx(local.card)}><SettingsAutoRoutingSection /></div>
    <p data-preview="decision-diagnostic">{formatRoutingDecision({ providerId: "codex", model: "gpt-6-luna", preferred: { mode: "gateway", connectionId: connection.id, model: "typesafe-ai/jev" }, fallback: true, elapsedMs: 1800, failure: "budget", reportedCostUsd: null })}</p>
    <div data-preview="settings-card" className={sx(local.card)}><ApiConnectionsSettings /></div>
    <StatusBarCreditsPreview />
    <div data-preview="model-picker" className={sx(styles.stage)}>
      <ModelEffortSelector value={value} options={options} onSelect={({ selection }) => setValue(selection)} />
    </div>
    <Toaster />
  </div>;
}
