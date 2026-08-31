import type {
  ProviderId,
  ProviderModelCatalogResponse,
  ProviderRuntimeOptions,
} from "../../src/lib/providers/provider.types";
import { getCodexModelCatalog } from "./codex-app-server-runtime";
import { getCursorModelCatalog } from "./cursor/cursor-model-catalog";
import { getKiroModelCatalog } from "./kiro/kiro-model-catalog";

export async function getProviderModelCatalog(args: {
  providerId: ProviderId;
  cwd?: string;
  runtimeOptions?: ProviderRuntimeOptions;
}): Promise<ProviderModelCatalogResponse> {
  if (args.providerId === "cursor") {
    return getCursorModelCatalog(args);
  }

  if (args.providerId === "kiro") {
    return getKiroModelCatalog(args);
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
