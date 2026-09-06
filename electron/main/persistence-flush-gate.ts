/**
 * Quit-time durability gate for renderer-owned workspace state.
 *
 * The renderer owns task titles, drafts, editor/terminal tabs, layout and
 * workspace information. Those live in the Zustand store and reach SQLite
 * through a debounced snapshot flush, so a quit that races that debounce loses
 * whatever had not been written yet.
 *
 * This used to be handled by `persistence:upsert-workspace-sync`, a blocking
 * `ipcRenderer.sendSync` that ran a full `upsertWorkspace` on the main thread
 * while the renderer stalled. Instead, main now asks the renderer to flush and
 * waits for an acknowledgement, with a bounded timeout so a wedged or already
 * torn-down renderer can never keep the app from quitting.
 */

import { getMainWindow } from "./window";

export const PERSISTENCE_FLUSH_REQUEST_CHANNEL =
  "persistence:flush-requested";

/**
 * How long main waits for the renderer to confirm its flush. Long enough for a
 * large workspace snapshot write, short enough that quitting still feels
 * immediate if the renderer cannot answer.
 */
export const PERSISTENCE_FLUSH_TIMEOUT_MS = 4_000;

export type PersistenceFlushOutcome =
  /** Renderer acknowledged; its pending writes are durable. */
  | "flushed"
  /** Renderer finished the request but one or more writes failed. */
  | "failed"
  /** No renderer to ask (already destroyed, or still loading). */
  | "unavailable"
  /** Renderer never answered inside the timeout. */
  | "timeout";

interface PendingFlush {
  requestId: number;
  resolve: (outcome: PersistenceFlushOutcome) => void;
  timer: NodeJS.Timeout;
}

let nextRequestId = 1;
let pending: PendingFlush | null = null;

function settle(outcome: PersistenceFlushOutcome) {
  if (!pending) {
    return;
  }
  const current = pending;
  pending = null;
  clearTimeout(current.timer);
  current.resolve(outcome);
}

/**
 * Ask the renderer to flush its pending workspace snapshot and wait for the
 * acknowledgement. Never rejects: quit must proceed regardless of the outcome.
 */
export function requestRendererPersistenceFlush(args?: {
  timeoutMs?: number;
}): Promise<PersistenceFlushOutcome> {
  // A second request while one is in flight joins the first rather than
  // stacking timers (rapid Cmd+Q can re-enter the quit path).
  if (pending) {
    return new Promise<PersistenceFlushOutcome>((resolve) => {
      const current = pending;
      if (!current) {
        resolve("unavailable");
        return;
      }
      const previousResolve = current.resolve;
      current.resolve = (outcome) => {
        previousResolve(outcome);
        resolve(outcome);
      };
    });
  }

  const window = getMainWindow();
  if (
    !window ||
    window.isDestroyed() ||
    window.webContents.isDestroyed() ||
    window.webContents.isLoadingMainFrame()
  ) {
    return Promise.resolve<PersistenceFlushOutcome>("unavailable");
  }

  const requestId = nextRequestId;
  nextRequestId += 1;

  return new Promise<PersistenceFlushOutcome>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(
        `[persistence] renderer flush did not acknowledge within ${
          args?.timeoutMs ?? PERSISTENCE_FLUSH_TIMEOUT_MS
        }ms; save remains unconfirmed`,
      );
      settle("timeout");
    }, args?.timeoutMs ?? PERSISTENCE_FLUSH_TIMEOUT_MS);
    timer.unref?.();

    pending = { requestId, resolve, timer };

    try {
      window.webContents.send(PERSISTENCE_FLUSH_REQUEST_CHANNEL, {
        requestId,
      });
    } catch {
      settle("unavailable");
    }
  });
}

/** Called from the renderer's `persistence:flush-complete` IPC handler. */
export function resolveRendererPersistenceFlush(args: {
  requestId: number;
  success: boolean;
}) {
  if (!pending) {
    return { ok: false as const };
  }
  // Ignore an acknowledgement for a request we already gave up on.
  if (
    args.requestId !== pending.requestId
  ) {
    return { ok: false as const };
  }
  settle(args.success ? "flushed" : "failed");
  return { ok: true as const };
}

/** Test seam: drop any in-flight request. */
export function resetRendererPersistenceFlushState() {
  settle("unavailable");
  nextRequestId = 1;
}
