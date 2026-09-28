/**
 * Durable storage for agent assignments: which request was handed to which
 * agent version, and the workspace and task intake made for it.
 *
 * Used by: the assign runtime (host service), through `sqlite-store.ts`.
 *
 * `request_id` is unique, so a repeated click or a retried IPC call finds the
 * row it already created instead of starting the work twice. The row is
 * written before any side effect and updated as each intake step finishes.
 */
import type { AgentAssignment, AssignmentState } from "../../src/lib/agents/assign";

interface AssignmentStatement {
  get: (...params: unknown[]) => unknown;
  all: (...params: unknown[]) => unknown[];
  run: (...params: unknown[]) => { changes?: number | bigint };
}

interface AssignmentDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => AssignmentStatement;
}

interface Row {
  body_json: string;
}

function parse(row: unknown): AgentAssignment | null {
  if (!row) return null;
  try {
    return JSON.parse((row as Row).body_json) as AgentAssignment;
  } catch (error) {
    console.warn("[agents] skipped an unreadable assignment row", error);
    return null;
  }
}

export class AgentAssignmentStore {
  private readonly db: AssignmentDatabase;

  constructor(database: unknown) {
    this.db = database as AssignmentDatabase;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_assignments (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL UNIQUE,
        agent_config_id TEXT NOT NULL,
        state TEXT NOT NULL,
        task_id TEXT,
        body_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_agent_assignments_agent
        ON agent_assignments (agent_config_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_assignments_task
        ON agent_assignments (task_id);
    `);
  }

  /** Inserts a new assignment; returns false when its request id is already recorded. */
  create(assignment: AgentAssignment): boolean {
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO agent_assignments
           (id, request_id, agent_config_id, state, task_id, body_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        assignment.id,
        assignment.requestId,
        assignment.agentConfigId,
        assignment.state,
        assignment.taskId,
        JSON.stringify(assignment),
        assignment.createdAt,
        assignment.updatedAt,
      );
    return Number(result.changes ?? 0) > 0;
  }

  update(assignment: AgentAssignment) {
    this.db
      .prepare(`UPDATE agent_assignments SET state = ?, task_id = ?, body_json = ?, updated_at = ? WHERE id = ?`)
      .run(assignment.state, assignment.taskId, JSON.stringify(assignment), assignment.updatedAt, assignment.id);
  }

  get(id: string): AgentAssignment | null {
    return parse(this.db.prepare(`SELECT body_json FROM agent_assignments WHERE id = ?`).get(id));
  }

  getByRequestId(requestId: string): AgentAssignment | null {
    return parse(this.db.prepare(`SELECT body_json FROM agent_assignments WHERE request_id = ?`).get(requestId));
  }

  /** The assignment that created a task, for "which agent is this task". */
  getByTaskId(taskId: string): AgentAssignment | null {
    return parse(
      this.db.prepare(`SELECT body_json FROM agent_assignments WHERE task_id = ? ORDER BY created_at DESC LIMIT 1`).get(taskId),
    );
  }

  list(args: { agentConfigId?: string; limit?: number } = {}): AgentAssignment[] {
    const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
    const rows = args.agentConfigId
      ? this.db
          .prepare(`SELECT body_json FROM agent_assignments WHERE agent_config_id = ? ORDER BY created_at DESC LIMIT ?`)
          .all(args.agentConfigId, limit)
      : this.db.prepare(`SELECT body_json FROM agent_assignments ORDER BY created_at DESC LIMIT ?`).all(limit);
    return rows.flatMap((row) => {
      const parsed = parse(row);
      return parsed ? [parsed] : [];
    });
  }

  listInState(state: AssignmentState): AgentAssignment[] {
    return this.db
      .prepare(`SELECT body_json FROM agent_assignments WHERE state = ? ORDER BY created_at`)
      .all(state)
      .flatMap((row) => {
        const parsed = parse(row);
        return parsed ? [parsed] : [];
      });
  }
}
