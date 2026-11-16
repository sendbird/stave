import { normalizeComparablePath } from "../../src/lib/source-control-worktrees";
import type { PersistenceRepositoryRegistryEntry } from "./types";

const comparablePath = (value: string | undefined) => normalizeComparablePath(value?.trim());

/**
 * The repository registry is one saved value with two writers: the renderer
 * saves its whole in-memory copy, and the host service adds the workspaces it
 * creates (Tars, Local MCP). A renderer copy taken before such an addition
 * would erase it, and the host then cannot find the workspace or its tasks.
 *
 * A saved workspace the renderer's copy omits is kept while its workspace row
 * still exists and the renderer has neither archived its path nor kept
 * another workspace at that path: every renderer removal closes the row first
 * or records the archive, and hydration drops same-path duplicates without
 * closing them. A repository the renderer removed stays removed.
 */
export function keepUnseenWorkspaces(args: {
  incoming: PersistenceRepositoryRegistryEntry[];
  persisted: readonly PersistenceRepositoryRegistryEntry[];
  workspaceExists: (workspaceId: string) => boolean;
}): PersistenceRepositoryRegistryEntry[] {
  return args.incoming.map((repository) => {
    const persisted = args.persisted.find((item) => item?.repositoryPath === repository.repositoryPath);
    if (!persisted || !Array.isArray(persisted.workspaces)) return repository;
    const known = new Set(repository.workspaces.map((workspace) => workspace.id));
    const taken = new Set([...(repository.archivedWorkspacePaths ?? []), ...Object.values(repository.workspacePathById ?? {})]
      .map(comparablePath));
    const persistedPaths = persisted.workspacePathById ?? {};
    const unseen = persisted.workspaces.filter((workspace) => Boolean(workspace?.id) && !known.has(workspace.id) &&
      Boolean(persistedPaths[workspace.id]) && !taken.has(comparablePath(persistedPaths[workspace.id])) &&
      args.workspaceExists(workspace.id));
    const retainedIds = new Set([...known, ...unseen.map(workspace => workspace.id)]);
    const activity = { ...(repository.workspaceLastActiveAtById ?? {}) };
    for (const [id, timestamp] of Object.entries(persisted.workspaceLastActiveAtById ?? {})) {
      if (!retainedIds.has(id) || !Number.isFinite(Date.parse(timestamp))) continue;
      const incoming = Date.parse(activity[id] ?? "");
      if (!Number.isFinite(incoming) || Date.parse(timestamp) > incoming) activity[id] = timestamp;
    }
    const retainedPaths = new Set([...Object.values(repository.workspacePathById), ...unseen.map(workspace => persistedPaths[workspace.id])].map(comparablePath));
    const linkedPaths = [...new Set([...(repository.linkedWorkspacePaths ?? []), ...(persisted.linkedWorkspacePaths ?? [])])]
      .filter(path => retainedPaths.has(comparablePath(path)));
    if (unseen.length === 0) return { ...repository,
      ...(Object.keys(activity).length ? { workspaceLastActiveAtById: activity } : {}),
      ...(linkedPaths.length ? { linkedWorkspacePaths: linkedPaths } : {}),
    };
    const next = {
      ...repository,
      workspaces: [...repository.workspaces, ...unseen],
      workspaceBranchById: { ...repository.workspaceBranchById },
      workspacePathById: { ...repository.workspacePathById },
      workspaceDefaultById: { ...repository.workspaceDefaultById },
      ...(Object.keys(activity).length ? { workspaceLastActiveAtById: activity } : {}),
      ...(linkedPaths.length ? { linkedWorkspacePaths: linkedPaths } : {}),
    };
    for (const { id } of unseen) {
      next.workspacePathById[id] = persistedPaths[id]!;
      const branch = persisted.workspaceBranchById?.[id];
      if (branch) next.workspaceBranchById[id] = branch;
      next.workspaceDefaultById[id] = false;
    }
    return next;
  });
}
