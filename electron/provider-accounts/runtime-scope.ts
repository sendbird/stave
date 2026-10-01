import { AsyncLocalStorage } from "node:async_hooks";
import {
  SYSTEM_ACCOUNT_PROFILE_ID,
  type ProviderAccountProviderId,
} from "../../src/lib/providers/provider-accounts";
import type { ProviderAccountSelection } from "../../src/lib/providers/provider-account-selection";

const scope = new AsyncLocalStorage<Readonly<ProviderAccountSelection>>();

/** Request-local identity survives awaits and callbacks without mutating process.env. */
export function withProviderAccountScope<T>(
  options: ProviderAccountSelection | undefined,
  run: () => T,
): T {
  const inherited = scope.getStore();
  return scope.run(
    Object.freeze({
      claudeAccountProfileId:
        options?.claudeAccountProfileId ?? inherited?.claudeAccountProfileId,
      codexAccountProfileId:
        options?.codexAccountProfileId ?? inherited?.codexAccountProfileId,
    }),
    run,
  );
}

export function currentProviderAccountId(providerId: ProviderAccountProviderId) {
  const key = providerId === "codex" ? "codexAccountProfileId" : "claudeAccountProfileId";
  return scope.getStore()?.[key] ?? SYSTEM_ACCOUNT_PROFILE_ID;
}

export function providerAccountKey(
  providerId: ProviderAccountProviderId,
  key: string,
  profileId = currentProviderAccountId(providerId),
) {
  return profileId === SYSTEM_ACCOUNT_PROFILE_ID ? key : JSON.stringify([profileId, key]);
}

export function withRequestAccountScope<T>(params: unknown, run: () => T): T {
  const record = params && typeof params === "object"
    ? params as Record<string, unknown> : {};
  const options = record.runtimeOptions && typeof record.runtimeOptions === "object"
    ? record.runtimeOptions : record;
  const { claudeAccountProfileId, codexAccountProfileId } = options as ProviderAccountSelection;
  return withProviderAccountScope({
    claudeAccountProfileId: claudeAccountProfileId ?? SYSTEM_ACCOUNT_PROFILE_ID,
    codexAccountProfileId: codexAccountProfileId ?? SYSTEM_ACCOUNT_PROFILE_ID,
  }, run);
}

export function providerAccountKeyMatchesTask(key: string, taskId: string): boolean {
  if (key === taskId) return true;
  try {
    const value: unknown = JSON.parse(key);
    return Array.isArray(value) && value.length === 2 && value[1] === taskId;
  } catch {
    return false;
  }
}
