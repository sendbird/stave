import { currentProviderAccountId } from "../../provider-accounts/runtime-scope";
import type { RateLimitsSnapshotResponse } from "../../../src/lib/providers/provider.types";

export interface QuotaObservationMetadata {
  observedAt: string;
  providerId?: "claude-code" | "codex" | "cursor" | "kiro";
  accountProfileId?: string;
  claudeAccountProfileId: string;
  codexAccountProfileId: string;
  source?: "sdk" | "notification";
}

type QuotaObservationListener = (
  snapshot: RateLimitsSnapshotResponse,
  metadata: QuotaObservationMetadata,
) => void;

const listeners = new Set<QuotaObservationListener>();

/** Host-only observations never cross the renderer/provider event contract. */
export function subscribeQuotaObservations(listener: QuotaObservationListener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function publishQuotaObservation(
  snapshot: RateLimitsSnapshotResponse,
  now = Date.now(),
  source?: QuotaObservationMetadata["source"],
  providerId?: QuotaObservationMetadata["providerId"],
): QuotaObservationMetadata {
  const metadata: QuotaObservationMetadata = {
    observedAt: new Date(now).toISOString(),
    ...(providerId ? { providerId, ...(providerId === "codex" || providerId === "claude-code" ? { accountProfileId: currentProviderAccountId(providerId) } : {}) } : {}),
    claudeAccountProfileId: currentProviderAccountId("claude-code"),
    codexAccountProfileId: currentProviderAccountId("codex"),
    ...(source ? { source } : {}),
  };
  for (const listener of listeners) listener(snapshot, metadata);
  return metadata;
}
