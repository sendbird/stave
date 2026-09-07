import type {
  ClearFleetAttentionSnoozesArgs,
  FleetAttentionSnooze,
  ListFleetAttentionSnoozesArgs,
  SnoozeFleetAttentionArgs,
} from "../../src/lib/fleet/attention-snooze";

interface SnoozeDatabase {
  exec(sql: string): unknown;
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    get(...params: unknown[]): unknown;
    run(...params: unknown[]): { changes?: number } | unknown;
  };
}

const COLUMNS = `attention_id AS attentionId, workspace_id AS workspaceId,
  snoozed_until AS snoozedUntil, created_at AS createdAt`;

/**
 * Durable per-item snoozes for the Fleet attention rail.
 *
 * Expired rows are pruned on read rather than by a background sweep: a snooze
 * only matters while it is still hiding something, so the read that would have
 * observed it is the cheapest place to retire it and it keeps the table from
 * growing without an extra maintenance hook.
 */
export class FleetAttentionSnoozeStore {
  constructor(private readonly db: SnoozeDatabase) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS fleet_attention_snoozes (
        attention_id TEXT NOT NULL PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        snoozed_until TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fleet_attention_snoozes_until
        ON fleet_attention_snoozes(snoozed_until);
      CREATE INDEX IF NOT EXISTS idx_fleet_attention_snoozes_workspace
        ON fleet_attention_snoozes(workspace_id);
    `);
  }

  list(args: ListFleetAttentionSnoozesArgs = {}): FleetAttentionSnooze[] {
    const now = args.now ?? new Date().toISOString();
    this.db
      .prepare("DELETE FROM fleet_attention_snoozes WHERE snoozed_until <= ?")
      .run(now);
    return this.db
      .prepare(
        `SELECT ${COLUMNS} FROM fleet_attention_snoozes
         ORDER BY snoozed_until ASC, attention_id ASC`,
      )
      .all() as FleetAttentionSnooze[];
  }

  /**
   * Re-snoozing an item replaces its deadline instead of extending it, so a
   * shorter follow-up choice is honoured rather than silently ignored.
   */
  snooze(args: SnoozeFleetAttentionArgs): FleetAttentionSnooze {
    const createdAt = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO fleet_attention_snoozes
           (attention_id, workspace_id, snoozed_until, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(attention_id) DO UPDATE SET
           workspace_id = excluded.workspace_id,
           snoozed_until = excluded.snoozed_until`,
      )
      .run(args.attentionId, args.workspaceId, args.snoozedUntil, createdAt);
    const row = this.db
      .prepare(
        `SELECT ${COLUMNS} FROM fleet_attention_snoozes WHERE attention_id = ?`,
      )
      .get(args.attentionId) as FleetAttentionSnooze | undefined;
    return row ?? { ...args, createdAt };
  }

  clear(args: ClearFleetAttentionSnoozesArgs = {}): number {
    const predicates: string[] = [];
    const values: unknown[] = [];
    if (args.attentionIds) {
      if (args.attentionIds.length === 0) {
        return 0;
      }
      predicates.push(
        `attention_id IN (${args.attentionIds.map(() => "?").join(",")})`,
      );
      values.push(...args.attentionIds);
    }
    if (args.workspaceIds) {
      if (args.workspaceIds.length === 0) {
        return 0;
      }
      predicates.push(
        `workspace_id IN (${args.workspaceIds.map(() => "?").join(",")})`,
      );
      values.push(...args.workspaceIds);
    }
    const where = predicates.length ? `WHERE ${predicates.join(" AND ")}` : "";
    const result = this.db
      .prepare(`DELETE FROM fleet_attention_snoozes ${where}`)
      .run(...values) as { changes?: number };
    return result?.changes ?? 0;
  }
}
