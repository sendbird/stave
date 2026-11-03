import type {
  RepositoryMemory,
  RepositoryMemorySourceTask,
} from "../../src/lib/repository-memory";
import type {
  PersistenceRepositoryRegistryEntry,
  PersistenceTaskRow,
} from "./types";

/** What the lookup reads; `SqliteStore` provides it. */
export interface RepositoryMemorySourceTaskSource {
  loadRepositoryRegistry(): PersistenceRepositoryRegistryEntry[];
  listWorkspaceTasks(args: { workspaceId: string }): PersistenceTaskRow[];
}

/**
 * The tasks the listed memories came from, so each row can link to its own.
 *
 * A memory records only a task id, and the task may sit in any workspace of
 * the repository, so the lookup walks that repository's registered workspaces
 * (never another repository's: a tool caller supplies the id). Archived tasks
 * and tasks that no longer exist are left out, because the app cannot open
 * them; their rows show no link rather than a dead one. Nothing is read when no
 * memory names a task.
 */
export function resolveRepositoryMemorySourceTasks(
  source: RepositoryMemorySourceTaskSource,
  args: {
    repositoryPath: string;
    memories: readonly Pick<RepositoryMemory, "sourceTaskId">[];
  },
): RepositoryMemorySourceTask[] {
  const wanted = new Set(
    args.memories.flatMap((memory) => (memory.sourceTaskId ? [memory.sourceTaskId] : [])),
  );
  if (wanted.size === 0) return [];
  const repository = source
    .loadRepositoryRegistry()
    .find((entry) => entry.repositoryPath === args.repositoryPath);
  if (!repository) return [];
  const found: RepositoryMemorySourceTask[] = [];
  for (const workspace of repository.workspaces) {
    for (const task of source.listWorkspaceTasks({ workspaceId: workspace.id })) {
      if (!wanted.has(task.id) || task.archivedAt) continue;
      wanted.delete(task.id);
      found.push({ taskId: task.id, workspaceId: workspace.id, title: task.title });
    }
    if (wanted.size === 0) break;
  }
  return found;
}
