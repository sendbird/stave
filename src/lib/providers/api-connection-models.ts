import {
  apiConnectionDefaultModel,
  apiConnectionGroupLabel,
  describeApiConnectionModel,
  isExperimentalApiConnectionModel,
  type ApiConnectionModel,
  type ApiConnectionRuntime,
} from "./api-connections";
import type { ProviderAccountProfile } from "./provider-accounts";
import type { ProviderModelCatalogEntry } from "./provider.types";

/**
 * The picker rows a connection contributes to one runtime: its pinned models,
 * grouped under "<connection> · API billing", with the runtime's default marked
 * and non-Claude models tagged experimental in Claude Code.
 */
export function buildApiConnectionCatalogEntries(args: {
  runtime: ApiConnectionRuntime;
  profile: Pick<ProviderAccountProfile, "label" | "gateway" | "apiConnection">;
}): ProviderModelCatalogEntry[] {
  const pinned: ApiConnectionModel[] = args.profile.apiConnection?.models
    ?? (args.profile.gateway?.models ?? []).map((id) => ({ id }));
  const defaultModel = apiConnectionDefaultModel(args.runtime, pinned);
  const group = apiConnectionGroupLabel(args.profile.apiConnection?.label ?? args.profile.label);
  return pinned.map((model) => ({
    model: model.id,
    displayName: model.name ?? model.id,
    description: describeApiConnectionModel(args.runtime, model) || model.id,
    hidden: false,
    isDefault: model.id === defaultModel,
    defaultEffort: null,
    supportedEfforts: [],
    group,
    ...(isExperimentalApiConnectionModel(args.runtime, model.id) ? { badge: "experimental" } : {}),
  }));
}
