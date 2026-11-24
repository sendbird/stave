import {
  WORKSPACE_SCRATCH_CHANGED_CHANNEL,
  type WorkspaceScratchChangedEvent,
} from "./workspace-scratch";

/**
 * Live scratch-folder notices for the renderer (`window.api.fs.scratchLive`).
 * A window holds at most one main-process subscription per folder however
 * many listeners it has (the panel, the rail), and drops it when the last
 * listener leaves.
 */
export interface WorkspaceScratchLiveApi {
  /**
   * Listens for changes to a workspace's scratch folder. The listener first
   * gets `{ watching }` once main answers, then a notice per change; a
   * notice with `watching: false` means the folder is no longer watched and
   * the caller should list it on a timer. Returns the unsubscribe.
   */
  subscribe: (rootPath: string, listener: (event: WorkspaceScratchChangedEvent) => void) => () => void;
}

type WatchResult = { ok: true; watching: boolean } | { ok: false; stderr?: string };

function rootKey(rootPath: string) {
  return rootPath.replace(/[\\/]+$/, "") || rootPath;
}

/** Pure over the three IPC primitives so tests can drive it. */
export function createWorkspaceScratchBridge(ipc: {
  invoke: (channel: string, args: unknown) => Promise<unknown>;
  on: (channel: string, listener: (payload: unknown) => void) => void;
}): WorkspaceScratchLiveApi {
  const listenersByRoot = new Map<string, Set<(event: WorkspaceScratchChangedEvent) => void>>();
  /** Roots main is watching for this window, with the last known status. */
  const subscribed = new Map<string, { rootPath: string; watching: boolean | null }>();
  const pending = new Set<string>();

  const deliver = (key: string, event: WorkspaceScratchChangedEvent) => {
    for (const listener of [...(listenersByRoot.get(key) ?? [])]) listener(event);
  };

  ipc.on(WORKSPACE_SCRATCH_CHANGED_CHANNEL, (payload) => {
    const event = payload as WorkspaceScratchChangedEvent;
    if (!event || typeof event.rootPath !== "string") return;
    const key = rootKey(event.rootPath);
    const state = subscribed.get(key);
    if (!state) return;
    state.watching = event.watching === true;
    deliver(key, { rootPath: state.rootPath, watching: state.watching });
  });

  // Deferred to a microtask: a component that re-subscribes (new props)
  // unsubscribes and subscribes in one turn, which should not restart the
  // watcher in main.
  const sync = (key: string, rootPath: string) => {
    if (pending.has(key)) return;
    pending.add(key);
    queueMicrotask(() => {
      pending.delete(key);
      const wanted = (listenersByRoot.get(key)?.size ?? 0) > 0;
      const state = subscribed.get(key);
      if (wanted && !state) {
        const next = { rootPath, watching: null as boolean | null };
        subscribed.set(key, next);
        void ipc
          .invoke("fs:watch-scratch", { rootPath })
          .then((result) => (result as WatchResult)?.ok === true && (result as { watching: boolean }).watching === true)
          .catch(() => false)
          .then((watching) => {
            if (subscribed.get(key) !== next) return;
            next.watching = watching;
            deliver(key, { rootPath, watching });
          });
      } else if (!wanted && state) {
        subscribed.delete(key);
        void ipc.invoke("fs:unwatch-scratch", { rootPath: state.rootPath }).catch(() => undefined);
      }
    });
  };

  return {
    subscribe: (rootPath, listener) => {
      const key = rootKey(rootPath);
      const listeners = listenersByRoot.get(key) ?? new Set();
      listenersByRoot.set(key, listeners);
      // A distinct wrapper per call, so one listener subscribed twice unsubscribes once.
      const entry = (event: WorkspaceScratchChangedEvent) => listener(event);
      listeners.add(entry);
      const known = subscribed.get(key)?.watching;
      if (known !== null && known !== undefined) {
        queueMicrotask(() => {
          if (listeners.has(entry)) entry({ rootPath, watching: known });
        });
      }
      sync(key, rootPath);
      return () => {
        if (!listeners.delete(entry)) return;
        if (listeners.size === 0) listenersByRoot.delete(key);
        sync(key, rootPath);
      };
    },
  };
}
