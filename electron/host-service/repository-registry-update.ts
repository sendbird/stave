import {
  mergeArchivedWorkspacePaths,
  normalizeRecentRepositoryStates,
  upsertRecentRepositoryState,
  type RecentRepositoryState,
} from "../../src/store/repository.utils";
import { defaultWorkspaceName } from "../../src/store/workspace-session-state";
import type { SqliteStore } from "../persistence/sqlite-store";

/**
 * The repository registry is one saved value with several writers: the
 * renderer, Local MCP, and Tars preparations that register workspaces at the
 * same time. A host writer that reads the value, awaits, and then saves its
 * copy erases whatever another writer saved in between, and the host then
 * cannot find that workspace or its tasks.
 *
 * Host writers therefore change one repository entry here: `change` receives
 * the saved repositories inside the store's registry transaction and returns
 * the entry to upsert, so it always edits the current value. `change` must
 * stay synchronous.
 */
export function upsertRegisteredRepository<T>(
  store: Pick<SqliteStore, "updateRepositoryRegistry">,
  change: (repositories: RecentRepositoryState[]) => { repository: RecentRepositoryState; result: T },
): T {
  return store.updateRepositoryRegistry((persisted) => {
    const repositories = normalizeRecentRepositoryStates({ repositories: persisted as RecentRepositoryState[] });
    const { repository, result } = change(repositories);
    const next = normalizeRecentRepositoryStates({ repositories: upsertRecentRepositoryState({ repositories, repository }) });
    return { repositories: next as never[], result };
  });
}

/** The repository entry with its default workspace registered, creating the entry when it is new. */
export function withDefaultWorkspace(args: {
  existing: RecentRepositoryState | null;
  repositoryPath: string;
  repositoryName: string;
  defaultBranch: string;
  defaultWorkspaceId: string;
  now: string;
}): RecentRepositoryState {
  const { existing, repositoryPath, repositoryName, defaultBranch, defaultWorkspaceId: id, now } = args;
  const defaultWorkspace = { id, name: defaultWorkspaceName, updatedAt: now };
  if (!existing) {
    return {
      repositoryPath, repositoryName, lastOpenedAt: now, defaultBranch,
      workspaces: [defaultWorkspace],
      activeWorkspaceId: id,
      workspaceBranchById: { [id]: defaultBranch },
      workspacePathById: { [id]: repositoryPath },
      workspaceDefaultById: { [id]: true },
      repositoryBasePrompt: "",
      newWorkspaceInitCommand: "",
      newWorkspaceUseRootNodeModulesSymlink: false,
    };
  }
  return {
    ...existing,
    repositoryName, defaultBranch, lastOpenedAt: now,
    activeWorkspaceId: existing.activeWorkspaceId || id,
    workspaceBranchById: { ...existing.workspaceBranchById, [id]: existing.workspaceBranchById[id] || defaultBranch },
    workspacePathById: { ...existing.workspacePathById, [id]: existing.workspacePathById[id] || repositoryPath },
    workspaceDefaultById: { ...existing.workspaceDefaultById, [id]: true },
    workspaces: existing.workspaces.some((workspace) => workspace.id === id)
      ? existing.workspaces
      : [defaultWorkspace, ...existing.workspaces],
  };
}

/** The repository entry with a newly created worktree workspace added and made active. */
export function withCreatedWorkspace(repository: RecentRepositoryState, workspace: {
  id: string;
  name: string;
  branch: string;
  path: string;
  now: string;
}): RecentRepositoryState {
  const { id, name, branch, path, now } = workspace;
  return {
    ...repository,
    lastOpenedAt: now,
    activeWorkspaceId: id,
    workspaces: [...repository.workspaces.filter((item) => item.id !== id), { id, name, updatedAt: now }],
    workspaceBranchById: { ...repository.workspaceBranchById, [id]: branch },
    workspacePathById: { ...repository.workspacePathById, [id]: path },
    workspaceDefaultById: { ...repository.workspaceDefaultById, [id]: false },
    archivedWorkspacePaths: mergeArchivedWorkspacePaths({ current: repository.archivedWorkspacePaths, remove: [path] }),
  };
}
