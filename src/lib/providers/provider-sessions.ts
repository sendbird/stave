import type {
  ProviderSessionCursor,
  TaskProviderSessionEntry,
  TaskProviderSessionState,
} from "@/lib/db/workspaces.db";
import {
  getProviderSessionLabel as getProviderSessionLabelFromCatalog,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";

export const providerSessionOrder: ProviderId[] = listProviderIds();

export function normalizeProviderSessionEntry(
  entry?: TaskProviderSessionEntry | null,
): ProviderSessionCursor | null {
  if (typeof entry === "string") {
    const nativeSessionId = entry.trim();
    return nativeSessionId ? { nativeSessionId } : null;
  }
  const nativeSessionId = entry?.nativeSessionId.trim();
  if (!nativeSessionId) {
    return null;
  }
  const syncedThroughMessageId = entry?.syncedThroughMessageId?.trim();
  return {
    nativeSessionId,
    ...(syncedThroughMessageId ? { syncedThroughMessageId } : {}),
  };
}

export function getProviderSessionId(args: {
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
}): string | null {
  return normalizeProviderSessionEntry(
    args.sessions?.[args.providerId],
  )?.nativeSessionId ?? null;
}

export function getProviderSessionCursor(args: {
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
}): ProviderSessionCursor | null {
  return normalizeProviderSessionEntry(args.sessions?.[args.providerId]);
}

export function rememberProviderSession(args: {
  current?: TaskProviderSessionEntry;
  nativeSessionId: string;
}): ProviderSessionCursor {
  const current = normalizeProviderSessionEntry(args.current);
  const nativeSessionId = args.nativeSessionId.trim();
  return current?.nativeSessionId === nativeSessionId
    ? current
    : { nativeSessionId };
}

export function advanceProviderSessionCursor(args: {
  current?: TaskProviderSessionEntry;
  syncedThroughMessageId: string;
}): ProviderSessionCursor | null {
  const current = normalizeProviderSessionEntry(args.current);
  const syncedThroughMessageId = args.syncedThroughMessageId.trim();
  if (!current || !syncedThroughMessageId) {
    return current;
  }
  if (current.syncedThroughMessageId === syncedThroughMessageId) {
    return current;
  }
  return {
    ...current,
    syncedThroughMessageId,
  };
}

export function listProviderSessions(args: {
  sessions?: TaskProviderSessionState;
}) {
  return providerSessionOrder.flatMap((providerId) => {
    const nativeSessionId = getProviderSessionId({
      sessions: args.sessions,
      providerId,
    });

    return nativeSessionId
      ? [{ providerId, nativeSessionId }]
      : [];
  });
}

export function getProviderSessionLabel(args: { providerId: ProviderId }) {
  return getProviderSessionLabelFromCatalog(args);
}
