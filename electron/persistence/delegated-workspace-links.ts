import {
  DELEGATED_TASK_DETACHED_REASON,
  DELEGATED_TASK_RUN_KIND,
} from "../../src/lib/runs/delegated-task";
import {
  DelegatedWorkspaceLinkListSchema,
  type DelegatedWorkspaceLink,
} from "../../src/lib/workspace-delegation-tree";

interface Database {
  prepare: (sql: string) => { all: (...params: unknown[]) => unknown[] };
}

/**
 * Workspaces created for delegated children, derived from durable rows that
 * already exist: a `delegated-task` run owns its child workspace and task
 * (`runs.workspace_id`, `runs.task_id`) and names the parent task as its
 * origin; the parent task's row (`tasks.id` is `<workspaceId>:<taskId>`) names
 * the parent workspace. Only live workspaces count, so an archived or deleted
 * parent leaves its child top-level. A detached delegation is cancelled with
 * `DELEGATED_TASK_DETACHED_REASON` and released, so it is left out; a
 * same-workspace delegation has the parent's own workspace and is left out.
 *
 * The parent workspace is looked up by primary key per live workspace rather
 * than by scanning every task row for a suffix.
 */
export function listDelegatedWorkspaceLinks(database: unknown): DelegatedWorkspaceLink[] {
  const rows = (database as Database).prepare(`
    SELECT run.workspace_id AS childWorkspaceId, parentWorkspace.id AS parentWorkspaceId,
      run.origin_id AS parentTaskId, run.task_id AS childTaskId, step.status AS phase,
      run.id AS runId, run.created_at AS createdAt
    FROM runs AS run
    JOIN run_steps AS step ON step.run_id = run.id
    JOIN workspace_meta AS childWorkspace ON childWorkspace.id = run.workspace_id
    JOIN workspace_meta AS parentWorkspace ON parentWorkspace.id != run.workspace_id
    JOIN tasks AS parentTask ON parentTask.id = parentWorkspace.id || ':' || run.origin_id
    WHERE run.kind = ? AND run.origin_kind = 'task' AND run.task_id IS NOT NULL
      AND NOT (step.status = 'cancelled' AND COALESCE(step.error, '') = ?)
      AND run.workspace_id NOT IN (SELECT workspace_id FROM workspace_archives)
      AND parentWorkspace.id NOT IN (SELECT workspace_id FROM workspace_archives)
    ORDER BY run.created_at ASC, run.id ASC
    LIMIT 5000
  `).all(DELEGATED_TASK_RUN_KIND, DELEGATED_TASK_DETACHED_REASON);
  const parsed = DelegatedWorkspaceLinkListSchema.safeParse(rows);
  return parsed.success ? parsed.data : [];
}
