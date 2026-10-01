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
import { SYSTEM_ACCOUNT_PROFILE_ID } from "./provider-accounts";

export function getProviderSessionEntry(args: { sessions?: TaskProviderSessionState; providerId: ProviderId; accountProfileId?: string }) {
  if (args.accountProfileId && args.accountProfileId !== SYSTEM_ACCOUNT_PROFILE_ID && (args.providerId === "codex" || args.providerId === "claude-code")) {
    return args.sessions?.accounts?.[args.accountProfileId]?.[args.providerId];
  }
  return args.sessions?.[args.providerId];
}

export function setProviderSessionEntry(args: { sessions?: TaskProviderSessionState; providerId: ProviderId; accountProfileId?: string; entry: TaskProviderSessionEntry }): TaskProviderSessionState {
  if (args.accountProfileId && args.accountProfileId !== SYSTEM_ACCOUNT_PROFILE_ID && (args.providerId === "codex" || args.providerId === "claude-code")) {
    return { ...args.sessions, accounts: { ...args.sessions?.accounts, [args.accountProfileId]: { ...args.sessions?.accounts?.[args.accountProfileId], [args.providerId]: args.entry } } };
  }
  return { ...args.sessions, [args.providerId]: args.entry };
}

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
  accountProfileId?: string;
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
}): string | null {
  return normalizeProviderSessionEntry(
    getProviderSessionEntry(args),
  )?.nativeSessionId ?? null;
}

export function getProviderSessionCursor(args: {
  accountProfileId?: string;
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
}): ProviderSessionCursor | null {
  return normalizeProviderSessionEntry(getProviderSessionEntry(args));
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
