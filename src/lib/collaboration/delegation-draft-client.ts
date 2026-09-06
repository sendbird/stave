import {
  ClearAcceptedDelegationDraftSchema,
  SaveDelegationDraftSchema,
  delegationDraftScopeKey,
  type DelegationDraft,
  type DelegationDraftScope,
} from "./delegation-draft";

const queues = new Map<string, Promise<unknown>>();
const clearListeners = new Map<string, Set<(delegationKey: string) => void>>();
const localKey = (scope: DelegationDraftScope) =>
  `stave:delegation-draft:v1:${delegationDraftScopeKey(scope)}`;

/** Keep reads and writes ordered across direct inspector remounts. */
function ordered<T>(
  scope: DelegationDraftScope,
  operation: () => Promise<T>,
): Promise<T> {
  const queueKey = delegationDraftScopeKey(scope);
  const pending = (queues.get(queueKey) ?? Promise.resolve())
    .catch(() => {})
    .then(operation);
  queues.set(queueKey, pending);
  void pending
    .finally(() => {
      if (queues.get(queueKey) === pending) queues.delete(queueKey);
    })
    .catch(() => {});
  return pending;
}

function notifyCleared(
  scope: DelegationDraftScope,
  delegationKey: string,
): void {
  for (const listener of clearListeners.get(delegationDraftScopeKey(scope)) ??
    []) {
    listener(delegationKey);
  }
}

/** Keep a remounted form projection aligned with an asynchronous acceptance. */
export function subscribeToAcceptedDelegationClear(
  scope: DelegationDraftScope,
  listener: (delegationKey: string) => void,
): () => void {
  const key = delegationDraftScopeKey(scope);
  const listeners = clearListeners.get(key) ?? new Set();
  listeners.add(listener);
  clearListeners.set(key, listeners);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) clearListeners.delete(key);
  };
}

export function loadDelegationDraft(
  scope: DelegationDraftScope,
): Promise<DelegationDraft | null> {
  return ordered(scope, async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.loadDelegationDraft)
        throw new Error("Delegation draft storage is unavailable.");
      const response = await persistence.loadDelegationDraft({ scope });
      if (!response.ok)
        throw new Error("Delegation draft storage could not be read.");
      return SaveDelegationDraftSchema.parse({
        scope,
        draft: response.draft,
      }).draft;
    }
    const raw = window.localStorage.getItem(localKey(scope));
    return raw
      ? SaveDelegationDraftSchema.parse({
          scope,
          draft: JSON.parse(raw),
        }).draft
      : null;
  });
}

export function saveDelegationDraft(
  scope: DelegationDraftScope,
  draft: DelegationDraft | null,
): Promise<void> {
  const validated = SaveDelegationDraftSchema.parse({ scope, draft });
  return ordered(validated.scope, async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.saveDelegationDraft)
        throw new Error("Delegation draft storage is unavailable.");
      const response = await persistence.saveDelegationDraft(validated);
      if (!response.ok)
        throw new Error("Delegation draft save was not acknowledged.");
      return;
    }
    if (validated.draft === null)
      window.localStorage.removeItem(localKey(validated.scope));
    else
      window.localStorage.setItem(
        localKey(validated.scope),
        JSON.stringify(validated.draft),
      );
  });
}

/** Delete only the request the main process has accepted. */
export function clearAcceptedDelegationDraft(
  scope: DelegationDraftScope,
  delegationKey: string,
): Promise<boolean> {
  const validated = ClearAcceptedDelegationDraftSchema.parse({
    scope,
    delegationKey,
  });
  return ordered(validated.scope, async () => {
    const persistence = window.api?.persistence;
    if (persistence) {
      if (!persistence.clearAcceptedDelegationDraft)
        throw new Error("Delegation draft storage is unavailable.");
      const response =
        await persistence.clearAcceptedDelegationDraft(validated);
      if (!response.ok)
        throw new Error("Delegation draft clear was not acknowledged.");
      if (response.cleared)
        notifyCleared(validated.scope, validated.delegationKey);
      return response.cleared;
    }
    const raw = window.localStorage.getItem(localKey(validated.scope));
    if (!raw) return false;
    const current = SaveDelegationDraftSchema.parse({
      scope: validated.scope,
      draft: JSON.parse(raw),
    }).draft!;
    if (current.pendingRequest?.delegationKey !== validated.delegationKey)
      return false;
    window.localStorage.removeItem(localKey(validated.scope));
    notifyCleared(validated.scope, validated.delegationKey);
    return true;
  });
}
