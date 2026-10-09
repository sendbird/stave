import type { ProviderModelCatalogResponse, RateLimitsSnapshotResponse } from "../../src/lib/providers/provider.types";
import type { QuotaObservationMetadata } from "./rate-limits/quota-observations";

const quotas = new Map<string, { snapshot: RateLimitsSnapshotResponse; metadata: QuotaObservationMetadata }>();
const catalogs = new Map<string, { catalog: ProviderModelCatalogResponse; observedAt: string }>();
const MAX_AGE_MS = 5 * 60_000;
const key = (provider: string, account: string) => JSON.stringify([provider, account]);

/** Only facts already read by existing provider owners; no probing or new calls. */
export function rememberAdaptiveQuota(snapshot: RateLimitsSnapshotResponse, metadata: QuotaObservationMetadata) {
  // A single-provider push must not erase another provider's last observation.
  if ((metadata.providerId === "claude-code" || metadata.providerId === "codex") && metadata.accountProfileId)
    quotas.set(key(metadata.providerId, metadata.accountProfileId), { snapshot, metadata });
  while (quotas.size > 32) quotas.delete(quotas.keys().next().value!);
}
export function rememberAdaptiveCatalog(accountId: string, catalog: ProviderModelCatalogResponse, now = Date.now()) {
  catalogs.set(key(catalog.providerId, accountId), { catalog, observedAt: new Date(now).toISOString() });
  while (catalogs.size > 32) catalogs.delete(catalogs.keys().next().value!);
}
export function readAdaptiveObservations(providerId: "claude-code" | "codex", accountId: string, now = Date.now()) {
  const quota = quotas.get(key(providerId, accountId)), catalog = catalogs.get(key(providerId, accountId));
  const fresh = (time: string) => now - Date.parse(time) >= 0 && now - Date.parse(time) <= MAX_AGE_MS;
  return { quota: quota && fresh(quota.metadata.observedAt) ? quota : null,
    catalog: catalog && fresh(catalog.observedAt) ? catalog : null };
}
