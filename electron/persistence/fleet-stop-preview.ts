import type Database from "better-sqlite3";
import type { FleetStopPreviewArgs, FleetStopPreviewResult } from "../../src/lib/fleet/host-control";

/** Bounded persisted preview; no provider calls or workspace activation. */
export function readFleetStopPreview(db: Database.Database, args: FleetStopPreviewArgs): FleetStopPreviewResult {
  const allTurns = new Set<string>();
  const allChildren = new Set<string>();
  const allRuns = new Set<string>();
  const items = args.targets.map((target) => {
    const children = db.prepare(`WITH RECURSIVE descendants(task_id) AS (
      SELECT ? UNION SELECT r.task_id FROM runs r JOIN descendants d ON r.origin_kind = 'task' AND r.origin_id = d.task_id
      WHERE r.task_id IS NOT NULL LIMIT 5000
    ) SELECT task_id FROM descendants WHERE task_id != ? AND EXISTS (SELECT 1 FROM runs WHERE runs.task_id = descendants.task_id AND runs.status NOT IN ('completed','failed','cancelled','interrupted'))`).all(target.taskId, target.taskId) as { task_id: string }[];
    const turns = db.prepare("SELECT id FROM turns WHERE workspace_id = ? AND task_id = ? AND completed_at IS NULL LIMIT 500").all(target.workspaceId, target.taskId) as { id: string }[];
    const runs = db.prepare("SELECT id FROM agent_runs WHERE workspace_id = ? AND lead_task_id = ? AND state IN ('running','paused') LIMIT 500").all(target.workspaceId, target.taskId) as { id: string }[];
    for (const turn of turns) allTurns.add(turn.id);
    for (const child of children) allChildren.add(child.task_id);
    for (const run of runs) allRuns.add(run.id);
    return { ...target, turns: turns.length, children: children.length, runs: runs.length, owned: 0 };
  });
  return { ok: true, turns: allTurns.size, children: allChildren.size, runs: allRuns.size, owned: 0, items };
}
