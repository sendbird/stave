interface RetiredTarsScheduleDatabase {
  prepare: (sql: string) => { get: (...params: unknown[]) => unknown; run: (...params: unknown[]) => unknown };
  transaction: <T>(operation: () => T) => { immediate: () => T };
}

const ACTIONS = "json_each(tars_messages.body_json, '$.decision.actions')";

// temporary-migration: drop-retired-tars-schedule-actions
/**
 * Removes the `schedule` actions of the removed Tars schedules from saved
 * replies, with their receipts. The action is no longer in the conversation
 * contract, so one left in place would stop the whole conversation from being
 * read. A reply keeps its words and its other actions, and their receipts
 * keep their positions. It reads first and writes only when it finds one, so
 * it runs on every open until the migration expires.
 */
export function dropRetiredTarsScheduleActions(db: RetiredTarsScheduleDatabase) {
  const found = db.prepare(`SELECT
    EXISTS (SELECT 1 FROM tars_action_receipts WHERE json_extract(body_json, '$.action.kind') = 'schedule')
    OR EXISTS (SELECT 1 FROM tars_messages, ${ACTIONS} WHERE json_extract(value, '$.kind') = 'schedule') AS found`).get() as { found: number };
  if (!found.found) return;
  db.transaction(() => {
    db.prepare("DELETE FROM tars_action_receipts WHERE json_extract(body_json, '$.action.kind') = 'schedule'").run();
    db.prepare(`UPDATE tars_messages SET body_json = json_set(body_json, '$.decision.actions', (
      SELECT json_group_array(json(value)) FROM (SELECT value FROM ${ACTIONS} WHERE json_extract(value, '$.kind') IS NOT 'schedule' ORDER BY key)
    )) WHERE EXISTS (SELECT 1 FROM ${ACTIONS} WHERE json_extract(value, '$.kind') = 'schedule')`).run();
  }).immediate();
}
// end temporary-migration: drop-retired-tars-schedule-actions
