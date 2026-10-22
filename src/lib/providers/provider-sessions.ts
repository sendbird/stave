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
  const handoffRevision = entry?.handoffRevision;
  return {
    nativeSessionId,
    ...(syncedThroughMessageId ? { syncedThroughMessageId } : {}),
    ...(isHandoffRevision(handoffRevision) ? { handoffRevision } : {}),
  };
}

function isHandoffRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
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

/**
 * The conversation a turn resumes: the one its own account started for the
 * task, or none. A turn on another account never resumes it; the turn's
 * account is the one it selected, else `fallbackAccountId` (the account scope
 * a host-started turn runs in).
 */
export function getTurnProviderSessionCursor(args: {
  sessions?: TaskProviderSessionState;
  providerId: ProviderId;
  runtimeOptions?: { claudeAccountProfileId?: string; codexAccountProfileId?: string };
  fallbackAccountId?: string;
}): ProviderSessionCursor | null {
  const selected = args.providerId === "codex" ? args.runtimeOptions?.codexAccountProfileId
    : args.providerId === "claude-code" ? args.runtimeOptions?.claudeAccountProfileId : undefined;
  return getProviderSessionCursor({ sessions: args.sessions, providerId: args.providerId, accountProfileId: selected ?? args.fallbackAccountId });
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

/**
 * After a completed turn: the session has the conversation through
 * `syncedThroughMessageId`, and the handoff record at `handoffRevision` when
 * the turn carried one (a new revision is sent to a resumed session once).
 */
export function advanceProviderSessionCursor(args: {
  current?: TaskProviderSessionEntry;
  syncedThroughMessageId: string;
  handoffRevision?: number;
}): ProviderSessionCursor | null {
  const current = normalizeProviderSessionEntry(args.current);
  const syncedThroughMessageId = args.syncedThroughMessageId.trim();
  if (!current || !syncedThroughMessageId) {
    return current;
  }
  const handoffRevision = isHandoffRevision(args.handoffRevision)
    ? args.handoffRevision
    : current.handoffRevision;
  if (
    current.syncedThroughMessageId === syncedThroughMessageId
    && current.handoffRevision === handoffRevision
  ) {
    return current;
  }
  return {
    ...current,
    syncedThroughMessageId,
    ...(handoffRevision !== undefined ? { handoffRevision } : {}),
  };
}

export function listProviderSessions(args: {
  sessions?: TaskProviderSessionState;
}) {
  const profiles = [SYSTEM_ACCOUNT_PROFILE_ID, ...Object.keys(args.sessions?.accounts ?? {})];
  return profiles.flatMap((accountProfileId) => providerSessionOrder.flatMap((providerId) => {
    if (accountProfileId !== SYSTEM_ACCOUNT_PROFILE_ID && providerId !== "claude-code" && providerId !== "codex") return [];
    const nativeSessionId = getProviderSessionId({ sessions: args.sessions, providerId, accountProfileId });
    return nativeSessionId ? [{ providerId, nativeSessionId, accountProfileId }] : [];
  }));
}

export function getProviderSessionLabel(args: { providerId: ProviderId }) {
  return getProviderSessionLabelFromCatalog(args);
}

export function removeProviderSessionEntry(args: { sessions?: TaskProviderSessionState; providerId: ProviderId; accountProfileId?: string }): TaskProviderSessionState {
  const next = { ...args.sessions };
  if (args.accountProfileId && args.accountProfileId !== SYSTEM_ACCOUNT_PROFILE_ID && (args.providerId === "codex" || args.providerId === "claude-code")) {
    const account = { ...next.accounts?.[args.accountProfileId] };
    delete account[args.providerId];
    next.accounts = { ...next.accounts, [args.accountProfileId]: account };
  } else delete next[args.providerId];
  return next;
}
