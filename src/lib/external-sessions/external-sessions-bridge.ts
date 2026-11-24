import {
  EXTERNAL_SESSIONS_IPC,
  type ExternalSessionsMode,
  type ExternalSessionsSnapshot,
} from "./external-sessions";

/** The renderer's view of Activity outside Stave (`window.api.externalSessions`). */
export interface ExternalSessionsApi {
  snapshot: () => Promise<ExternalSessionsSnapshot>;
  /**
   * Starts (or widens) reading in main and delivers each changed snapshot.
   * The returned function ends this subscription; main stops reading once a
   * window has none left.
   */
  subscribe: (
    mode: ExternalSessionsMode,
    listener: (snapshot: ExternalSessionsSnapshot) => void,
  ) => () => void;
}

/**
 * Folds a window's listeners into one request: `live` while any listener
 * asks for it, else `count`, and an unsubscribe when none is left. Pure over
 * the three IPC primitives so tests can drive it.
 */
export function createExternalSessionsBridge(ipc: {
  invoke: (channel: string) => Promise<unknown>;
  send: (channel: string, args?: unknown) => void;
  on: (channel: string, listener: (payload: unknown) => void) => void;
}): ExternalSessionsApi {
  const listeners = new Map<symbol, { mode: ExternalSessionsMode; listener: (snapshot: ExternalSessionsSnapshot) => void }>();
  let requested: ExternalSessionsMode | null = null;
  let syncQueued = false;
  ipc.on(EXTERNAL_SESSIONS_IPC.CHANGED, (payload) => {
    for (const entry of listeners.values()) entry.listener(payload as ExternalSessionsSnapshot);
  });
  // Deferred to a microtask: a component that swaps its subscription (the
  // badge scan for the live watcher) unsubscribes and subscribes in one
  // turn, and main should see one change, not a stop and a restart.
  const sync = () => {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(flush);
  };
  const flush = () => {
    syncQueued = false;
    let next: ExternalSessionsMode | null = null;
    for (const entry of listeners.values()) {
      if (entry.mode === "live") {
        next = "live";
        break;
      }
      next = "count";
    }
    if (next === requested) return;
    requested = next;
    if (next === null) ipc.send(EXTERNAL_SESSIONS_IPC.UNSUBSCRIBE);
    else ipc.send(EXTERNAL_SESSIONS_IPC.SUBSCRIBE, { mode: next });
  };
  return {
    snapshot: () => ipc.invoke(EXTERNAL_SESSIONS_IPC.SNAPSHOT) as Promise<ExternalSessionsSnapshot>,
    subscribe: (mode, listener) => {
      const key = Symbol("external-sessions");
      listeners.set(key, { mode, listener });
      sync();
      return () => {
        if (!listeners.delete(key)) return;
        sync();
      };
    },
  };
}
