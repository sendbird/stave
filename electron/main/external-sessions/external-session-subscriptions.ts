import type { ExternalSessionsMode } from "../../../src/lib/external-sessions/external-sessions";

/** Each renderer's request (its preload folds its own listeners into one mode). */
export interface ExternalSessionSubscriptionRegistry {
  modeByContentsId: Map<number, ExternalSessionsMode>;
}

export function createExternalSessionSubscriptionRegistry(): ExternalSessionSubscriptionRegistry {
  return { modeByContentsId: new Map() };
}

export function setExternalSessionSubscriber(registry: ExternalSessionSubscriptionRegistry, contentsId: number, mode: ExternalSessionsMode) {
  registry.modeByContentsId.set(contentsId, mode);
}

export function removeExternalSessionSubscriber(registry: ExternalSessionSubscriptionRegistry, contentsId: number) {
  registry.modeByContentsId.delete(contentsId);
}

/** No subscriber: nothing runs. Any open Activity page: live. Otherwise the badge scan. */
export function resolveExternalSessionsWatcherMode(registry: ExternalSessionSubscriptionRegistry): ExternalSessionsMode | null {
  let mode: ExternalSessionsMode | null = null;
  for (const requested of registry.modeByContentsId.values()) {
    if (requested === "live") return "live";
    mode = "count";
  }
  return mode;
}
