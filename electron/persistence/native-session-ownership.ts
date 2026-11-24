interface OwnershipDatabase {
  prepare(sql: string): { all(...args: unknown[]): unknown[] };
}

/** How far back turn records are searched for a session Stave ran. */
const RECENT_TURN_WINDOW_MS = 24 * 60 * 60_000;

/**
 * Which provider-native session ids belong to Stave: the ids its turns
 * reported (`provider_session` events, kept through compaction, so a running
 * turn counts too) and the ids its workspaces store (task provider sessions
 * and CLI session tabs). Read-only; asked only about the few ids the Activity
 * watcher found, so neither query loads every stored id.
 */
export class NativeSessionOwnershipReader {
  constructor(private readonly db: OwnershipDatabase) {}

  ownedIds(ids: readonly string[], now = Date.now()): Set<string> {
    const unique = [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 200))];
    if (unique.length === 0) return new Set();
    const json = JSON.stringify(unique);
    const owned = new Set<string>();
    const since = new Date(now - RECENT_TURN_WINDOW_MS).toISOString();
    for (const row of this.db
      .prepare(
        `SELECT DISTINCT json_extract(event.payload_json, '$.nativeSessionId') AS id
         FROM turns AS turn
         JOIN turn_events AS event ON event.turn_id = turn.id
         WHERE turn.created_at >= ?
           AND event.event_type = 'provider_session'
           AND json_valid(event.payload_json)
           AND json_extract(event.payload_json, '$.nativeSessionId') IN (SELECT value FROM json_each(?))`,
      )
      .all(since, json) as Array<{ id: unknown }>) {
      if (typeof row.id === "string") owned.add(row.id);
    }
    const remaining = unique.filter((id) => !owned.has(id));
    if (remaining.length === 0) return owned;
    // A session id is a UUID: finding it anywhere in a workspace's stored
    // shell means that workspace recorded it (a task's provider session or a
    // CLI tab), and `instr` avoids parsing every snapshot as JSON.
    for (const row of this.db
      .prepare(
        `SELECT candidate.value AS id
         FROM json_each(?) AS candidate
         WHERE EXISTS (SELECT 1 FROM workspaces WHERE instr(snapshot_json, candidate.value) > 0)`,
      )
      .all(JSON.stringify(remaining)) as Array<{ id: unknown }>) {
      if (typeof row.id === "string") owned.add(row.id);
    }
    return owned;
  }
}
