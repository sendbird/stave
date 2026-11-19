interface RetiredTarsScheduleDatabase {
  prepare: (sql: string) => { get: (...params: unknown[]) => unknown; all: (...params: unknown[]) => unknown[]; run: (...params: unknown[]) => unknown };
  transaction: <T>(operation: () => T) => { immediate: () => T };
}

// temporary-migration: drop-retired-tars-schedule-actions
/**
 * Retires the `schedule` actions of the removed Tars schedules in saved
 * replies. The action is no longer in the conversation contract, so one left
 * in place would stop the whole conversation from being read.
 *
 * Each one becomes a `retired` position and its receipt is deleted. Its place
 * in the reply stays taken: the reply's other actions are named by their
 * position in their receipts and request ids, so an interrupted reply resumes
 * on the receipts and work it already has.
 *
 * It reads first and writes only when it finds one, so it runs on every open
 * until the migration expires.
 */
export function dropRetiredTarsScheduleActions(db: RetiredTarsScheduleDatabase) {
  const found = db.prepare(`SELECT
    EXISTS (SELECT 1 FROM tars_action_receipts WHERE json_extract(body_json, '$.action.kind') = 'schedule')
    OR EXISTS (SELECT 1 FROM tars_messages, json_each(tars_messages.body_json, '$.decision.actions') WHERE json_extract(value, '$.kind') = 'schedule') AS found`).get() as { found: number };
  if (!found.found) return;
  db.transaction(() => {
    db.prepare("DELETE FROM tars_action_receipts WHERE json_extract(body_json, '$.action.kind') = 'schedule'").run();
    const retire = db.prepare(`UPDATE tars_messages SET body_json = json_replace(body_json, ?, json('{"kind":"retired"}')) WHERE id = ?`);
    // `fullkey` is the action's own path in the reply (`$.decision.actions[1]`), so only that element changes.
    const saved = db.prepare(`SELECT tars_messages.id AS id, action.fullkey AS path
      FROM tars_messages, json_each(tars_messages.body_json, '$.decision.actions') AS action
      WHERE json_extract(action.value, '$.kind') = 'schedule'`).all() as Array<{ id: string; path: string }>;
    for (const { id, path } of saved) retire.run(path, id);
  }).immediate();
}
// end temporary-migration: drop-retired-tars-schedule-actions
