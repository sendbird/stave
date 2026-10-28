import { isDelegatedTask } from "../../src/lib/tasks";
import { resolveCurrentRepositoryDefaultWorkspaceId } from "../../src/store/repository.utils";
import {
  TASK_SEARCH_MAX_LIMIT,
  type SearchTasksArgs,
  type TaskSearchResult,
  type TaskSearchState,
} from "../../src/lib/task-search/task-search-ipc";
import type {
  PersistenceRepositoryRegistryEntry,
  PersistenceTaskRow,
  PersistenceTurnSummary,
} from "./types";

/** What the search reads; `SqliteStore` provides it. */
export interface TaskSearchSource {
  loadRepositoryRegistry(): PersistenceRepositoryRegistryEntry[];
  listWorkspaceTasks(args: { workspaceId: string }): PersistenceTaskRow[];
  listTurns(args: { workspaceId: string; taskId: string; limit?: number }): PersistenceTurnSummary[];
}

const DEFAULT_LIMIT = 20;

function normalize(value: string) {
  return value.toLocaleLowerCase();
}

function resolveState(task: PersistenceTaskRow, latest: PersistenceTurnSummary | undefined): TaskSearchState {
  if (task.archivedAt) return "archived";
  if (!latest) return "new";
  if (!latest.completedAt) return "running";
  const outcome = latest.terminalReceipt?.outcome;
  if (outcome === "failed") return "failed";
  if (outcome === "cancelled") return "cancelled";
  return "completed";
}

/**
 * Every top-level task (delegated children are left out) of every
 * registered repository's workspaces whose title, or
 * whose workspace, branch or repository name, holds each word of the query.
 * Titles that match come first, then the latest activity. Workspaces and
 * repositories that are no longer registered are left out.
 */
export function searchTasks(source: TaskSearchSource, args: SearchTasksArgs): TaskSearchResult[] {
  const limit = Math.max(1, Math.min(TASK_SEARCH_MAX_LIMIT, args.limit ?? DEFAULT_LIMIT));
  const words = normalize(args.query).split(/\s+/).filter(Boolean);
  const matches: Array<{ result: Omit<TaskSearchResult, "state">; task: PersistenceTaskRow; titleMatch: boolean }> = [];
  for (const repository of source.loadRepositoryRegistry()) {
    const defaultWorkspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
      repositoryPath: repository.repositoryPath,
      workspaces: repository.workspaces,
      workspaceDefaultById: repository.workspaceDefaultById ?? {},
      workspacePathById: repository.workspacePathById ?? {},
    });
    for (const workspace of repository.workspaces) {
      const branch = repository.workspaceBranchById?.[workspace.id] ?? null;
      const place = normalize([workspace.name, branch ?? "", repository.repositoryName].join(" "));
      for (const task of source.listWorkspaceTasks({ workspaceId: workspace.id })) {
        if (task.archivedAt && !args.includeArchived) continue;
        // A delegated child is reached through its parent, not as a peer.
        if (isDelegatedTask(task)) continue;
        const title = normalize(task.title);
        if (!words.every((word) => title.includes(word) || place.includes(word))) continue;
        const isDefaultWorkspace = workspace.id === defaultWorkspaceId;
        matches.push({
          task,
          titleMatch: words.length > 0 && words.every((word) => title.includes(word)),
          result: {
            repositoryPath: repository.repositoryPath,
            repositoryName: repository.repositoryName,
            workspaceId: workspace.id,
            workspaceName: workspace.name,
            workspaceBranch: branch,
            workspacePath: isDefaultWorkspace
              ? repository.repositoryPath
              : repository.workspacePathById?.[workspace.id] ?? repository.repositoryPath,
            isDefaultWorkspace,
            taskId: task.id,
            title: task.title,
            provider: task.provider,
            updatedAt: task.updatedAt,
          },
        });
      }
    }
  }
  matches.sort(
    (left, right) =>
      Number(right.titleMatch) - Number(left.titleMatch) ||
      right.result.updatedAt.localeCompare(left.result.updatedAt),
  );
  return matches.slice(0, limit).map(({ result, task }) => ({
    ...result,
    state: resolveState(task, source.listTurns({ workspaceId: result.workspaceId, taskId: task.id, limit: 1 })[0]),
  }));
}
