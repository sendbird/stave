/**
 * Heuristics that compare a persisted workspace shell against the in-memory
 * runtime cache to decide which snapshot is the richer source of truth.
 *
 * Extracted verbatim from `@/store/app.store` to keep the store file within the
 * max-lines ratchet; no behavior changed.
 */
import type {
  WorkspaceShell,
  loadWorkspaceShell,
  loadWorkspaceShellSummary,
} from "@/lib/db/workspaces.db";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";

export function summarizeWorkspaceShell(
  snapshot:
    | Awaited<ReturnType<typeof loadWorkspaceShell>>
    | Awaited<ReturnType<typeof loadWorkspaceShellSummary>>,
) {
  if (!snapshot) {
    return 0;
  }
  return (
    snapshot.tasks.length +
    ("terminalTabCount" in snapshot
      ? snapshot.terminalTabCount
      : (snapshot.terminalTabs?.length ?? 0)) +
    ("cliSessionTabCount" in snapshot
      ? snapshot.cliSessionTabCount
      : (snapshot.cliSessionTabs?.length ?? 0)) +
    Object.values(snapshot.messageCountByTask).reduce(
      (sum, count) => sum + count,
      0,
    )
  );
}

export function summarizeWorkspaceSession(
  session?: WorkspaceSessionState | null,
) {
  if (!session) {
    return 0;
  }
  return (
    session.tasks.length +
    (session.terminalTabs?.length ?? 0) +
    (session.cliSessionTabs?.length ?? 0) +
    Object.values(session.messageCountByTask).reduce(
      (sum, count) => sum + count,
      0,
    )
  );
}

export function shouldReloadWorkspaceShellFromPersistence(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
}) {
  return summarizeWorkspaceSession(args.cachedWorkspaceState) === 0;
}

export function shouldPreferLoadedWorkspaceState(args: {
  cachedWorkspaceState?: WorkspaceSessionState;
  loadedWorkspaceShellState?: {
    shell: WorkspaceShell | null;
    workspaceState: WorkspaceSessionState;
  } | null;
}) {
  if (!args.loadedWorkspaceShellState) {
    return false;
  }
  return (
    summarizeWorkspaceShell(args.loadedWorkspaceShellState.shell) >
    summarizeWorkspaceSession(args.cachedWorkspaceState)
  );
}
