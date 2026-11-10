import { parsePersistedTurnUsage } from "./turn-usage";
import type { PersistenceTurnUsage } from "./types";

interface TurnReadDatabase {
  prepare(sql: string): { all(...params: any[]): unknown[] };
}

interface TurnRow {
  created_at: string;
  completed_at: string;
  provider_id: string;
  model_id: string | null;
  usage_json: string | null;
}

/** One completed turn of a named task; `key` is the caller's own name for that task. */
export interface TaskTurnUsage {
  key: string;
  providerId: string;
  /** Null when the turn's model was not recorded. */
  modelId: string | null;
  createdAt: string;
  completedAt: string;
  /** Null when the provider reported nothing for the turn. */
  usage: PersistenceTurnUsage | null;
}

/**
 * The completed turns of each named task that started in the period, newest
 * first. One indexed read per task (`idx_turns_workspace_task_created`) with
 * the remaining row budget as its limit, so a read never scans the turns
 * table and never returns more than `limit` rows; `truncated` says the budget
 * ran out. The model and the account-attributed provider come from the
 * prompt-free usage row of the same turn when it exists.
 */
export function readTaskTurnUsage(db: TurnReadDatabase, args: {
  tasks: ReadonlyArray<{ key: string; workspaceId: string; taskId: string }>;
  from: string;
  until: string;
  limit: number;
}): { turns: TaskTurnUsage[]; truncated: boolean } {
  const read = db.prepare(`SELECT t.created_at, t.completed_at, COALESCE(u.provider_id, t.provider_id) AS provider_id,
      u.model_id, COALESCE(u.usage_json, t.usage_json) AS usage_json
    FROM turns t LEFT JOIN usage_turns u ON u.id = t.id
    WHERE t.workspace_id = ? AND t.task_id = ? AND t.created_at >= ? AND t.created_at < ? AND t.completed_at IS NOT NULL
    ORDER BY t.created_at DESC LIMIT ?`);
  const turns: TaskTurnUsage[] = [];
  let truncated = false;
  for (const task of args.tasks) {
    const remaining = args.limit - turns.length;
    if (remaining <= 0) { truncated = true; break; }
    // One more than the budget shows whether this task had more.
    const rows = read.all(task.workspaceId, task.taskId, args.from, args.until, remaining + 1) as TurnRow[];
    if (rows.length > remaining) truncated = true;
    for (const row of rows.slice(0, remaining)) {
      turns.push({ key: task.key, providerId: row.provider_id, modelId: row.model_id,
        createdAt: row.created_at, completedAt: row.completed_at, usage: parsePersistedTurnUsage(row.usage_json) });
    }
  }
  return { turns, truncated };
}
