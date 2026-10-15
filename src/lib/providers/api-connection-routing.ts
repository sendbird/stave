import type { ProviderAccountProfile } from "./provider-accounts";
import { selectedProviderAccount, type ProviderAccountSelection } from "./provider-account-selection";
import type { ProviderId } from "./provider.types";

/** A selected connection's catalog is exclusive, including on Auto and host-started turns. */
export function exclusiveGatewayModels(profiles: readonly ProviderAccountProfile[], accounts?: ProviderAccountSelection): Partial<Record<ProviderId, readonly string[]>> {
  const models: Partial<Record<ProviderId, readonly string[]>> = {};
  for (const providerId of ["claude-code", "codex"] as const) {
    const profile = profiles.find((entry) => entry.providerId === providerId && entry.id === selectedProviderAccount(providerId, accounts));
    if (profile?.gateway) models[providerId] = profile.gateway.models;
  }
  return models;
}
