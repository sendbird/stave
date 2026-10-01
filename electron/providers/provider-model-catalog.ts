import type {
  ProviderId,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { currentClaudeGateway } from "../provider-accounts/gateway-runtime";
import { getCodexModelCatalog } from "./codex-app-server-runtime";
import { getCursorModelCatalog } from "./cursor/cursor-model-catalog";
import { getKiroModelCatalog } from "./kiro/kiro-model-catalog";
import { isOptionalProvider } from "../../src/lib/providers/provider-readiness";
import { optionalProviderReadKey } from "./optional-provider-tooling";

export async function getProviderModelCatalog(args: {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): Promise<ProviderModelCatalogResponse> {
  const gateway = args.providerId === "claude-code" ? currentClaudeGateway(args.runtimeOptions?.claudeAccountProfileId) : undefined;
  if (gateway) return {
    providerId: args.providerId, ok: true,
    detail: "Configured Gateway models. API billing applies; availability depends on the endpoint.",
    models: gateway.models.map((model, index) => ({ model, displayName: model, description: "Gateway · API billing", hidden: false, isDefault: index === 0, defaultEffort: null, supportedEfforts: [] })),
  };
  if (isOptionalProvider(args.providerId)) {
    const key = optionalProviderReadKey(args.providerId, args.runtimeOptions);
    const unavailable = { providerId: args.providerId, ok: false, detail: "Verify installation and login in Settings > Tooling before loading models.", models: [] };
    if (!key) return unavailable;
    const result = await (args.providerId === "cursor" ? getCursorModelCatalog(args) : getKiroModelCatalog(args));
    return key === optionalProviderReadKey(args.providerId, args.runtimeOptions) ? result : unavailable;
  }

  if (args.providerId === "codex") {
    const catalog = await getCodexModelCatalog(args);
    return {
      providerId: args.providerId,
      ok: catalog.ok,
      detail: catalog.detail,
      models: catalog.models.map((entry) => ({
        model: entry.model,
        displayName: entry.displayName,
        description: entry.description,
        hidden: entry.hidden,
        isDefault: entry.isDefault,
        defaultEffort: entry.defaultReasoningEffort || null,
        supportedEfforts: entry.supportedReasoningEfforts,
      })),
    };
  }

  return {
    providerId: args.providerId,
    ok: true,
    detail: "This provider uses the built-in model catalog.",
    models: [],
  };
}
