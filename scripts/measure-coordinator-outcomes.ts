/**
 * Run with `bun scripts/measure-coordinator-outcomes.ts [path/to/stave.sqlite]
 * [--coordinator=coordinator-trial] [--since=2026-11-20] [--until=2026-11-27]`.
 *
 * The coordinator trial (docs/developer/tars-coordinator-trial.md) runs an
 * ordinary task as a saved Agent that delegates work with Local MCP tools.
 * This reads, read only, the work that agent's tasks delegated and prints it
 * with the same outcome definitions as `measure-tars-outcomes.ts`, then both
 * summaries side by side for the same range.
 */
import type { Database } from "bun:sqlite";
import {
  inRange, openReadOnly, outcomeFile, outcomeFlag, outcomeRange, readTarsRows, summarizeTarsOutcomes, tarsOutcome,
  type OutcomeRange, type TarsOutcomeRow,
} from "./measure-tars-outcomes";

const PULL_REQUEST_URL = /https:\/\/github\.com\/[^/\s"\\]+\/[^/\s"\\]+\/pull\/\d+/;

type LedgerRun = { id: string; originId: string; workspaceId: string; taskId: string | null; status: string;
  createdAt: string; updatedAt: string; completedAt: string | null };
type Receipt = { type: string; createdAt: string; detail: Record<string, unknown> };

/** The tasks that ran as the coordinator agent, from its assignments. */
function coordinatorTaskIds(db: Database, coordinator: string): Set<string> {
  const rows = db.query("SELECT task_id AS taskId FROM agent_assignments WHERE agent_config_id = ? AND task_id IS NOT NULL").all(coordinator) as Array<{ taskId: string }>;
  return new Set(rows.map((row) => row.taskId));
}

/** Agents whose tasks delegated work in the range, to name when the given coordinator started none. */
function delegatingAgents(db: Database, range: OutcomeRange): string[] {
  const rows = db.query(`SELECT DISTINCT a.agent_config_id AS agent, r.created_at AS createdAt FROM runs r
    JOIN agent_assignments a ON a.task_id = r.origin_id WHERE r.kind = 'delegated-task'`).all() as Array<{ agent: string; createdAt: string }>;
  return [...new Set(rows.filter((row) => inRange(row.createdAt, range)).map((row) => row.agent))].sort();
}

/** Whether the person took the child task over: it left the coordinator's control. */
function takenOverTasks(db: Database, workspaceIds: readonly string[]): Set<string> {
  const taken = new Set<string>();
  const read = db.query("SELECT snapshot_json AS snapshot FROM workspaces WHERE id = ?");
  for (const id of new Set(workspaceIds)) {
    const row = read.get(id) as { snapshot: string } | null;
    const tasks = row ? (JSON.parse(row.snapshot) as { tasks?: Array<{ id?: unknown; controlMode?: unknown }> }).tasks ?? [] : [];
    for (const task of tasks) if (task.controlMode === "interactive" && typeof task.id === "string") taken.add(task.id);
  }
  return taken;
}

/**
 * One row per unit of work the coordinator delegated: a writing delegation on
 * the run ledger whose origin is a coordinator task. Read-only consults (the
 * reviews it asks for) are not units. The result maps onto Tars's states, and
 * the unit reached a pull request when a pull request link first appears in
 * the child's stage reports or in the answer it returned.
 */
export function readCoordinatorRows(file: string, args: OutcomeRange & { coordinator: string }): TarsOutcomeRow[] {
  const db = openReadOnly(file);
  try {
    const parents = coordinatorTaskIds(db, args.coordinator);
    const runs = (db.query(`SELECT id, origin_id AS originId, workspace_id AS workspaceId, task_id AS taskId, status,
      created_at AS createdAt, updated_at AS updatedAt, completed_at AS completedAt
      FROM runs WHERE kind = 'delegated-task' ORDER BY created_at`).all() as LedgerRun[])
      .filter((run) => parents.has(run.originId) && inRange(run.createdAt, args));
    const receiptsOf = db.query("SELECT receipt_type AS type, created_at AS createdAt, detail_json AS detail FROM run_receipts WHERE run_id = ? ORDER BY sequence");
    const events = db.query("SELECT kind, json_extract(detail_json, '$.operation') AS operation, detail_json AS detail, created_at AS createdAt FROM agent_run_events WHERE agent_run_id = ? ORDER BY sequence");
    const titleOf = db.query("SELECT title FROM tasks WHERE id = ?");
    const taken = takenOverTasks(db, runs.map((run) => run.workspaceId));
    return runs.flatMap((run) => {
      const receipts = (receiptsOf.all(run.id) as Array<{ type: string; createdAt: string; detail: string | null }>)
        .map((receipt): Receipt => ({ ...receipt, detail: receipt.detail ? JSON.parse(receipt.detail) : {} }));
      const accepted = receipts.filter((receipt) => receipt.type === "accepted");
      if (accepted.length && accepted.every((receipt) => receipt.detail.access === "read-only")) return [];
      // A retry is a new attempt, and a new agent run, of the same unit.
      const agentRunIds = [...new Set(accepted.map((receipt) => receipt.detail.agentRunId).filter((id): id is string => typeof id === "string"))];
      const runEvents = agentRunIds.flatMap((id) => events.all(id) as Array<TarsOutcomeRow["runEvents"][number] & { detail: string }>);
      const linked = [
        ...runEvents.filter((event) => event.kind === "report" && PULL_REQUEST_URL.test(event.detail)).map((event) => event.createdAt),
        ...receipts.filter((receipt) => receipt.type === "completed" && PULL_REQUEST_URL.test(JSON.stringify(receipt.detail))).map((receipt) => receipt.createdAt),
      ].sort();
      const title = run.taskId ? (titleOf.get(`${run.workspaceId}:${run.taskId}`) as { title: string } | null)?.title : null;
      const agentId = accepted.map((receipt) => receipt.detail.agentConfigId).find((id): id is string => typeof id === "string") ?? null;
      return [{
        title: title ?? run.taskId ?? run.id, createdAt: run.createdAt, updatedAt: run.completedAt ?? run.updatedAt,
        state: run.taskId && taken.has(run.taskId) ? "takenOver"
          : run.status === "completed" || run.status === "cancelled" ? run.status
          : run.status === "failed" || run.status === "interrupted" ? "failed" : "running",
        detailCode: null, goal: null, agentId, publishedAt: linked[0] ?? null, hasDecisionAnswer: false,
        runEvents: runEvents.map(({ kind, operation, createdAt }) => ({ kind, operation, createdAt })),
      }];
    });
  } finally { db.close(); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const file = outcomeFile(args);
  const range = outcomeRange(args);
  const coordinator = outcomeFlag(args, "coordinator") ?? "coordinator-trial";
  const coordinatorOutcomes = readCoordinatorRows(file, { ...range, coordinator }).map(tarsOutcome);
  if (!coordinatorOutcomes.length) {
    const db = openReadOnly(file);
    try {
      console.log(`No work delegated by agent "${coordinator}" in this range. Agents whose tasks delegated work: ${delegatingAgents(db, range).join(", ") || "none"}.`);
    } finally { db.close(); }
  }
  const tarsOutcomes = readTarsRows(file, range).map(tarsOutcome);
  for (const [name, outcomes] of [["Tars", tarsOutcomes], ["Coordinator", coordinatorOutcomes]] as const) {
    console.log(name);
    if (outcomes.length) console.table(outcomes.map((outcome) => ({ ...outcome, title: outcome.title.slice(0, 40) })));
  }
  const summary = { tars: summarizeTarsOutcomes(tarsOutcomes), coordinator: summarizeTarsOutcomes(coordinatorOutcomes) };
  console.table(summary);
  console.log(JSON.stringify(summary, null, 2));
}
