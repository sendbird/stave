import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LENS_SESSION_ID } from "@/lib/lens/lens.types";

/**
 * Tiny module-level store mirroring per-session lens browser state
 * (title / favicon / loading / url) for tab chips and other chrome.
 *
 * A single global `lens.subscribeStateChangedEvents` subscription feeds a
 * per-session map; `useLensTabState` subscribes a component to exactly one
 * session. Snapshots are referentially stable until that session's state
 * actually changes, so the hook is safe to call from hot tab-strip renders.
 */
export interface LensTabState {
  title?: string;
  faviconUrl?: string;
  loading?: boolean;
  url?: string;
}

const EMPTY_LENS_TAB_STATE: LensTabState = {};

const stateBySessionId = new Map<string, LensTabState>();
const listenersBySessionId = new Map<string, Set<() => void>>();

let globalSubscriptionStarted = false;

function areStatesEqual(left: LensTabState, right: LensTabState): boolean {
  return (
    left.title === right.title &&
    left.faviconUrl === right.faviconUrl &&
    left.loading === right.loading &&
    left.url === right.url
  );
}

/**
 * Lazily attach the single renderer-wide subscription. Kept for the lifetime
 * of the window: lens sessions outlive any individual pane, and the map is
 * bounded by the number of live sessions (entries are cleared on tab close
 * via `clearLensTabState`).
 */
function ensureGlobalSubscription() {
  if (globalSubscriptionStarted || typeof window === "undefined") {
    return;
  }
  const subscribe = window.api?.lens?.subscribeStateChangedEvents;
  if (!subscribe) {
    // Browser-only mode (no preload). Retry on the next hook subscription.
    return;
  }
  globalSubscriptionStarted = true;
  subscribe((payload) => {
    const sessionId = payload.lensSessionId ?? DEFAULT_LENS_SESSION_ID;
    const next: LensTabState = {
      title: payload.title || undefined,
      faviconUrl: payload.faviconUrl,
      loading: payload.loading,
      url: payload.url || undefined,
    };
    const previous = stateBySessionId.get(sessionId);
    if (previous && areStatesEqual(previous, next)) {
      return;
    }
    stateBySessionId.set(sessionId, next);
    const listeners = listenersBySessionId.get(sessionId);
    if (!listeners) {
      return;
    }
    for (const listener of [...listeners]) {
      listener();
    }
  });
}

function subscribeToSession(lensSessionId: string, onChange: () => void) {
  ensureGlobalSubscription();
  let listeners = listenersBySessionId.get(lensSessionId);
  if (!listeners) {
    listeners = new Set();
    listenersBySessionId.set(lensSessionId, listeners);
  }
  listeners.add(onChange);
  return () => {
    const current = listenersBySessionId.get(lensSessionId);
    current?.delete(onChange);
    if (current && current.size === 0) {
      listenersBySessionId.delete(lensSessionId);
    }
  };
}

export function getLensTabState(lensSessionId: string): LensTabState {
  return stateBySessionId.get(lensSessionId) ?? EMPTY_LENS_TAB_STATE;
}

/** Drop cached state for a closed session (called from tab-close actions). */
export function clearLensTabState(lensSessionId: string) {
  if (!stateBySessionId.delete(lensSessionId)) {
    return;
  }
  const listeners = listenersBySessionId.get(lensSessionId);
  if (!listeners) {
    return;
  }
  for (const listener of [...listeners]) {
    listener();
  }
}

/** Live browser state (title/favicon/loading/url) for one lens session. */
export function useLensTabState(lensSessionId: string | null): LensTabState {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!lensSessionId) {
        return () => {};
      }
      return subscribeToSession(lensSessionId, onStoreChange);
    },
    [lensSessionId],
  );
  const getSnapshot = useCallback(
    () =>
      lensSessionId
        ? getLensTabState(lensSessionId)
        : EMPTY_LENS_TAB_STATE,
    [lensSessionId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
