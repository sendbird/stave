import { useEffect, useSyncExternalStore } from "react";
import type { TurnSnapshotSkipReason } from "@/lib/turn-snapshots";
import type { TurnSnapshotCatalogView } from "./turn-file-action-availability";

/** Dispatched after a restore or undo so every view of the task reloads its snapshots. */
export const TURN_FILE_RESTORE_EVENT = "stave-file-restore";

export interface TurnSnapshotCatalog extends TurnSnapshotCatalogView {
  canUndo: boolean;
}

const EMPTY: TurnSnapshotCatalog = { snapshotTurnIds: new Set(), skipped: new Map(), canUndo: false };
const catalogs = new Map<string, TurnSnapshotCatalog>();
const listeners = new Map<string, Set<() => void>>();
const pending = new Map<string, Promise<void>>();
const keyOf = (workspaceId: string, taskId: string) => `${workspaceId}\u0000${taskId}`;

function emit(key: string) {
  for (const listener of listeners.get(key) ?? []) listener();
}

/** One host read per task, shared by every turn row of that task. */
export function refreshTurnSnapshotCatalog(workspaceId: string, taskId: string): Promise<void> {
  const key = keyOf(workspaceId, taskId);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const api = typeof window === "undefined" ? undefined : window.api?.turnSnapshots;
  if (!api) return Promise.resolve();
  const request = api.list({ workspaceId, taskId })
    .then((result) => {
      catalogs.set(key, {
        snapshotTurnIds: new Set(result.snapshots.map((snapshot) => snapshot.turnId)),
        skipped: new Map(result.skipped.map((skip) => [skip.turnId, skip.reason] as [string, TurnSnapshotSkipReason])),
        canUndo: result.canUndo,
      });
      emit(key);
    })
    .catch(() => {})
    .finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}

function subscribe(key: string, listener: () => void) {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (!set.size) listeners.delete(key);
  };
}

function useCatalogValue<T>(workspaceId: string | undefined, taskId: string, select: (catalog: TurnSnapshotCatalog) => T): T {
  const key = workspaceId ? keyOf(workspaceId, taskId) : "";
  const value = useSyncExternalStore(
    (listener) => key ? subscribe(key, listener) : () => {},
    () => select((key ? catalogs.get(key) : undefined) ?? EMPTY),
    () => select(EMPTY),
  );
  // Rows only read the shared catalog; they load it once if nothing has yet.
  useEffect(() => {
    if (workspaceId && !catalogs.has(keyOf(workspaceId, taskId))) void refreshTurnSnapshotCatalog(workspaceId, taskId);
  }, [workspaceId, taskId]);
  return value;
}

const identity = (catalog: TurnSnapshotCatalog) => catalog;

/** Read-only view for a turn row. */
export function useTurnSnapshotCatalogView(workspaceId: string | undefined, taskId: string): TurnSnapshotCatalog {
  return useCatalogValue(workspaceId, taskId, identity);
}

/** Whether a turn has a retained snapshot, as a stable boolean for hot message rows. */
export function useTurnHasSnapshot(workspaceId: string | undefined, taskId: string, turnId: string | undefined): boolean {
  return useCatalogValue(workspaceId, taskId, (catalog) => Boolean(turnId && catalog.snapshotTurnIds.has(turnId)));
}

/**
 * Task-level owner of the catalog. It reloads on mount, when a turn finishes
 * (`refreshKey`), after a restore, and when the window regains focus.
 */
export function useTurnSnapshotCatalog(workspaceId: string | undefined, taskId: string, refreshKey?: unknown): TurnSnapshotCatalog {
  const catalog = useCatalogValue(workspaceId, taskId, identity);
  useEffect(() => {
    if (!workspaceId) return;
    const refresh = () => { void refreshTurnSnapshotCatalog(workspaceId, taskId); };
    refresh();
    window.addEventListener(TURN_FILE_RESTORE_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(TURN_FILE_RESTORE_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [workspaceId, taskId, refreshKey]);
  return catalog;
}
