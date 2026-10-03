/**
 * Temporary migrations for the rename of missions to agent runs (after
 * 0.24.1). Each runs from `AgentRunStore`'s bootstrap before the first read,
 * is idempotent, and is removed with its registry entry in
 * `config/temporary-migrations.json`.
 */

interface LegacyNamesDatabase {
  exec: (sql: string) => unknown;
  prepare: (sql: string) => {
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
    run: (...params: unknown[]) => unknown;
  };
}

function hasTable(db: LegacyNamesDatabase, name: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function hasColumn(db: LegacyNamesDatabase, table: string, column: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return columns.some((entry) => entry.name === column);
}

// temporary-migration: agent-run-tables
/**
 * Renames the mission tables, their `mission_id` and `playbook_json` columns
 * and the event kinds that named a mission, in one transaction. The old
 * indexes are dropped; the store's bootstrap creates them under the new names.
 * A table that already has its new name is left alone, so running it twice is
 * a no-op. The retired `mission_proposals` and `mission_trigger_seen` tables
 * are never touched.
 */
export function migrateLegacyAgentRunTables(db: LegacyNamesDatabase): void {
  const renames: Array<[from: string, to: string]> = [
    ["missions", "agent_runs"],
    ["mission_stages", "agent_run_stages"],
    ["mission_events", "agent_run_events"],
  ];
  const pending = renames.filter(([from, to]) => hasTable(db, from) && !hasTable(db, to));
  if (pending.length === 0) return;
  db.exec("SAVEPOINT agent_run_tables_migration");
  try {
    for (const [from, to] of pending) db.exec(`ALTER TABLE ${from} RENAME TO ${to}`);
    if (hasTable(db, "agent_runs") && hasColumn(db, "agent_runs", "playbook_json")) {
      db.exec("ALTER TABLE agent_runs RENAME COLUMN playbook_json TO workflow_json");
    }
    for (const table of ["agent_run_stages", "agent_run_events"]) {
      if (hasTable(db, table) && hasColumn(db, table, "mission_id")) {
        db.exec(`ALTER TABLE ${table} RENAME COLUMN mission_id TO agent_run_id`);
      }
    }
    db.exec("DROP INDEX IF EXISTS idx_missions_active_lead");
    db.exec("DROP INDEX IF EXISTS idx_missions_workspace");
    if (hasTable(db, "agent_run_events")) {
      db.exec(`UPDATE agent_run_events SET kind = 'agent-run-started' WHERE kind = 'mission-started'`);
      db.exec(`UPDATE agent_run_events SET kind = 'agent-run-ended' WHERE kind = 'mission-ended'`);
    }
    db.exec("RELEASE agent_run_tables_migration");
  } catch (error) {
    db.exec("ROLLBACK TO agent_run_tables_migration");
    db.exec("RELEASE agent_run_tables_migration");
    throw error;
  }
}
// end temporary-migration: agent-run-tables

// temporary-migration: agent-run-notification-kinds
/**
 * Moves stored notifications from the `mission.*` kinds to `agent_run.*`,
 * with their dedupe keys (`mission:` and `mission-reminder:` prefixes) and
 * payload (`source`, `missionId`, `missionIds`), so a notification raised
 * before the rename is still read and never raised a second time. It matches
 * nothing once converted, so it runs on every start and also converts rows an
 * older build wrote after a downgrade.
 */
export function migrateLegacyAgentRunNotifications(db: LegacyNamesDatabase): void {
  if (!hasTable(db, "notifications")) return;
  const legacy = "kind LIKE 'mission.%'";
  db.exec("SAVEPOINT agent_run_notifications_migration");
  try {
    db.exec(`UPDATE notifications
      SET payload_json = json_remove(json_set(payload_json, '$.agentRunId', json_extract(payload_json, '$.missionId')), '$.missionId')
      WHERE ${legacy} AND json_valid(payload_json) AND json_type(payload_json, '$.missionId') IS NOT NULL`);
    db.exec(`UPDATE notifications
      SET payload_json = json_remove(json_set(payload_json, '$.agentRunIds', json(json_extract(payload_json, '$.missionIds'))), '$.missionIds')
      WHERE ${legacy} AND json_valid(payload_json) AND json_type(payload_json, '$.missionIds') = 'array'`);
    db.exec(`UPDATE notifications
      SET payload_json = json_set(payload_json, '$.source', 'agent-run' || substr(json_extract(payload_json, '$.source'), length('mission') + 1))
      WHERE ${legacy} AND json_valid(payload_json) AND json_extract(payload_json, '$.source') IN ('mission', 'mission-reminder')`);
    db.exec(`UPDATE notifications SET
        kind = 'agent_run.' || substr(kind, length('mission.') + 1),
        source_dedupe_key = CASE
          WHEN source_dedupe_key LIKE 'mission-reminder:%'
            THEN 'agent-run-reminder:' || substr(source_dedupe_key, length('mission-reminder:') + 1)
          WHEN source_dedupe_key LIKE 'mission:%'
            THEN 'agent-run:' || substr(source_dedupe_key, length('mission:') + 1)
          ELSE source_dedupe_key
        END
      WHERE ${legacy}`);
    db.exec("RELEASE agent_run_notifications_migration");
  } catch (error) {
    db.exec("ROLLBACK TO agent_run_notifications_migration");
    db.exec("RELEASE agent_run_notifications_migration");
    throw error;
  }
}
// end temporary-migration: agent-run-notification-kinds
