import { z } from "zod";

/**
 * Searching every task Stave holds, across the registered repositories and
 * their workspaces, whether or not a workspace was opened since the app
 * started. The main process reads the app database; the window opens a
 * result repository, then workspace, then task.
 */
export const TASK_SEARCH_IPC = "persistence:search-tasks";

/** Results per search; the palette asks for fewer. */
export const TASK_SEARCH_MAX_LIMIT = 50;

export const SearchTasksArgsSchema = z
  .object({
    /** Matched against titles and workspace, branch and repository names; empty lists the latest. */
    query: z.string().max(200),
    limit: z.number().int().min(1).max(TASK_SEARCH_MAX_LIMIT).optional(),
    /** Archived tasks are left out unless asked for. */
    includeArchived: z.boolean().optional(),
  })
  .strict();
export type SearchTasksArgs = z.infer<typeof SearchTasksArgsSchema>;

/** A task's state as the database can tell it, from its latest turn. */
export type TaskSearchState = "running" | "completed" | "failed" | "cancelled" | "new" | "archived";

export interface TaskSearchResult {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  workspaceBranch: string | null;
  /** The workspace's folder: the repository root for the Default workspace. */
  workspacePath: string;
  isDefaultWorkspace: boolean;
  taskId: string;
  title: string;
  provider: string;
  /** The task's last activity. */
  updatedAt: string;
  state: TaskSearchState;
}

export type SearchTasksResponse =
  | { ok: true; results: TaskSearchResult[] }
  | { ok: false; message: string };
