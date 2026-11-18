import { loadRepositoryRegistryState } from "@/lib/db/workspaces.db";
import type { LocalMcpWorkspaceChange } from "@/lib/local-mcp/workspace-change";
import { isWorkspaceArchiveInProgress } from "@/lib/workspace-cleanup-activity";
import { useAppStore } from "@/store/app.store";
import { refreshFleetWorkspaceShell } from "@/store/fleet-workspace-shells-store";
import { normalizeRecentRepositoryStates, type RecentRepositoryState } from "@/store/repository.utils";

/**
 * Lists a workspace the host created (Tars, a delegation, a tracker kickoff)
 * without the user opening its repository. The event names the workspace; the
 * saved registry decides whether it exists and which repository owns it. Only
 * that one workspace is added: the open repository, the selected workspace and
 * each repository's remembered selection stay as they are. Fleet's stored task
 * list for the workspace is read again, since the host may have added a task.
 */
export async function syncHostWorkspaceChange(
  change: LocalMcpWorkspaceChange,
  store: Pick<typeof useAppStore, "getState" | "setState"> = useAppStore,
) {
  if (isWorkspaceArchiveInProgress(change.workspaceId)) return;
  const registry = await loadRepositoryRegistryState();
  const owner = normalizeRecentRepositoryStates({ repositories: registry.repositories as RecentRepositoryState[] })
    .find((repository) => repository.workspaces.some((workspace) => workspace.id === change.workspaceId));
  const workspace = owner?.workspaces.find((item) => item.id === change.workspaceId);
  if (!owner || !workspace || isWorkspaceArchiveInProgress(workspace.id)) return;
  const branch = owner.workspaceBranchById[workspace.id];
  const path = owner.workspacePathById[workspace.id];
  const withWorkspace = <T extends Pick<RecentRepositoryState, "workspaces" | "workspaceBranchById" | "workspacePathById" | "workspaceDefaultById">>(target: T): T =>
    target.workspaces.some((item) => item.id === workspace.id) ? target : {
      ...target,
      workspaces: [...target.workspaces, workspace],
      workspaceBranchById: { ...target.workspaceBranchById, ...(branch ? { [workspace.id]: branch } : {}) },
      workspacePathById: { ...target.workspacePathById, ...(path ? { [workspace.id]: path } : {}) },
      workspaceDefaultById: { ...target.workspaceDefaultById, [workspace.id]: Boolean(owner.workspaceDefaultById[workspace.id]) },
    };
  store.setState((state) => {
    const remembered = state.recentRepositories.find((repository) => repository.repositoryPath === owner.repositoryPath);
    // A repository this window never listed keeps its default selected, not the workspace the host just made.
    const defaultId = owner.workspaces.find((item) => owner.workspaceDefaultById[item.id])?.id;
    const nextRemembered = remembered ? withWorkspace(remembered)
      : { ...owner, activeWorkspaceId: defaultId ?? owner.activeWorkspaceId };
    const recentRepositories = !remembered ? [...state.recentRepositories, nextRemembered]
      : nextRemembered === remembered ? state.recentRepositories
      : state.recentRepositories.map((repository) => repository === remembered ? nextRemembered : repository);
    const current = state.repositoryPath === owner.repositoryPath ? withWorkspace(state) : state;
    if (recentRepositories === state.recentRepositories && current === state) return state;
    return {
      recentRepositories,
      ...(current === state ? {} : {
        workspaces: current.workspaces,
        workspaceBranchById: current.workspaceBranchById,
        workspacePathById: current.workspacePathById,
        workspaceDefaultById: current.workspaceDefaultById,
      }),
    };
  });
  refreshFleetWorkspaceShell(workspace.id);
}
