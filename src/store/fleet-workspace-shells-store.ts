/**
 * Task lists of workspaces Fleet shows but nobody has opened, read once per
 * Fleet visit and shared by every surface that needs them: a workspace card
 * and the task table read the same entry instead of each loading its own copy.
 *
 * Workspaces that are open (or cached in the runtime) never come through here;
 * their live session is the source. The cache is dropped when Fleet closes, so
 * the next visit reads fresh task lists, as a card used to on every mount.
 */
import { useEffect } from "react";
import { create } from "zustand";
import {
  loadWorkspaceShellSummary,
  type WorkspaceShellSummary,
} from "@/lib/db/workspaces.db";

export type FleetWorkspaceShellEntry =
  | { status: "loading" }
  | { status: "loaded"; shell: WorkspaceShellSummary | null }
  | { status: "failed" };

interface FleetWorkspaceShellsState {
  byWorkspaceId: Record<string, FleetWorkspaceShellEntry>;
}

export const useFleetWorkspaceShellsStore = create<FleetWorkspaceShellsState>(
  () => ({ byWorkspaceId: {} }),
);

// Bumped on reset, so a read still in flight when Fleet closes cannot land
// in the next visit's cache.
let generation = 0;

/** Test seam and Fleet's exit: forget every read. */
export function resetFleetWorkspaceShells() {
  generation += 1;
  useFleetWorkspaceShellsStore.setState({ byWorkspaceId: {} });
}

function setEntry(workspaceId: string, entry: FleetWorkspaceShellEntry) {
  useFleetWorkspaceShellsStore.setState((state) => ({
    byWorkspaceId: { ...state.byWorkspaceId, [workspaceId]: entry },
  }));
}

/**
 * Starts the read for a workspace unless one exists (loading, loaded or
 * failed). A failed read stays failed for this visit, as a card's did.
 */
export function requestFleetWorkspaceShell(
  workspaceId: string,
  load: typeof loadWorkspaceShellSummary = loadWorkspaceShellSummary,
) {
  if (useFleetWorkspaceShellsStore.getState().byWorkspaceId[workspaceId]) {
    return;
  }
  const requestedIn = generation;
  const settle = (entry: FleetWorkspaceShellEntry) => {
    if (requestedIn === generation) setEntry(workspaceId, entry);
  };
  setEntry(workspaceId, { status: "loading" });
  void load({ workspaceId }).then(
    (shell) => settle({ status: "loaded", shell }),
    () => settle({ status: "failed" }),
  );
}

/** Reads again the workspaces whose read failed (the table's Retry). */
export function retryFleetWorkspaceShells(
  workspaceIds: readonly string[],
  load: typeof loadWorkspaceShellSummary = loadWorkspaceShellSummary,
) {
  for (const workspaceId of workspaceIds) {
    if (useFleetWorkspaceShellsStore.getState().byWorkspaceId[workspaceId]?.status !== "failed") {
      continue;
    }
    useFleetWorkspaceShellsStore.setState((state) => {
      const { [workspaceId]: _failed, ...rest } = state.byWorkspaceId;
      return { byWorkspaceId: rest };
    });
    requestFleetWorkspaceShell(workspaceId, load);
  }
}

/** One workspace's entry, read only when `enabled` (it has no live session). */
export function useFleetWorkspaceShell(workspaceId: string, enabled: boolean) {
  const entry = useFleetWorkspaceShellsStore(
    (state) => state.byWorkspaceId[workspaceId],
  );
  useEffect(() => {
    if (enabled) {
      requestFleetWorkspaceShell(workspaceId);
    }
  }, [enabled, workspaceId]);
  return enabled ? entry : undefined;
}

/** Every entry, for surfaces that read many workspaces at once. */
export function useFleetWorkspaceShells(workspaceIds: readonly string[]) {
  const byWorkspaceId = useFleetWorkspaceShellsStore((state) => state.byWorkspaceId);
  const key = workspaceIds.join("\u0000");
  useEffect(() => {
    for (const workspaceId of key ? key.split("\u0000") : []) {
      requestFleetWorkspaceShell(workspaceId);
    }
  }, [key]);
  return byWorkspaceId;
}
