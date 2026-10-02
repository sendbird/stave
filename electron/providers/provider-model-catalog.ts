import type {
  ProviderId,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { currentClaudeGateway, peekApiConnection, resolveApiConnectionModel } from "../provider-accounts/gateway-runtime";
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
  // An API connection's pinned models are the whole catalog for the runtime it serves.
  const runtime = args.providerId === "claude-code" || args.providerId === "codex" ? args.providerId : undefined;
  // Claude keeps failing closed on a removed account; Codex reports it through its own catalog read.
  const gateway = runtime === "codex" ? peekApiConnection("codex", args.runtimeOptions?.codexAccountProfileId)
    : runtime ? currentClaudeGateway(args.runtimeOptions?.claudeAccountProfileId) : undefined;
  if (runtime && gateway) {
    const defaultModel = resolveApiConnectionModel({ runtime, models: gateway.models });
    return {
      providerId: args.providerId, ok: true,
      detail: "Models pinned on the API connection. API billing applies; availability depends on the gateway.",
      models: gateway.models.map((model) => ({ model, displayName: model, description: "API connection · API billing", hidden: false, isDefault: model === defaultModel, defaultEffort: null, supportedEfforts: [] })),
    };
  }
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
