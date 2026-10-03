/**
 * Retrieved context that describes one turn Stave started, not the task.
 *
 * A mission stage and a scheduled wake-up each attach a part that says "Stave started this turn; the user did not type
 * this message". Their owners attach a fresh part to every turn they start.
 * A task's durable `sourceContexts` (a ticket, a PR log) are re-sent with
 * every later composer turn, so a turn-scoped part saved there kept telling
 * the model it was inside a mission the user had already ended.
 *
 * Owners: `src/lib/missions/briefing.ts` (`MISSION_CONTEXT_SOURCE_ID`),
 * `electron/host-service/wake-up-runtime.ts`, and the per-turn repository
 * memory block (`STAVE_REPOSITORY_MEMORY_SOURCE_ID`, `stave:project-memory`).
 *
 * `stave:project-coordinator` was attached by the retired project coordinator.
 * It stays listed so a part an older build saved on a task is still filtered.
 */
export const TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS: ReadonlySet<string> = new Set([
  "stave:mission",
  "stave:wake-up",
  "stave:project-coordinator",
  "stave:project-memory",
]);

export function isTurnScopedRetrievedContext(part: { sourceId: string }): boolean {
  return TURN_SCOPED_RETRIEVED_CONTEXT_SOURCE_IDS.has(part.sourceId);
}

/** The parts a task may keep as durable source context. */
export function withoutTurnScopedContexts<T extends { sourceId: string }>(parts: readonly T[]): T[] {
  return parts.filter((part) => !isTurnScopedRetrievedContext(part));
}

/**
 * A task's saved source contexts merged with new ones by source id. A
 * turn-scoped part an earlier build saved is dropped here, so the task heals
 * on its next supervised turn.
 */
export function mergeDurableSourceContexts<T extends { sourceId: string }>(
  current: readonly T[] | undefined,
  requested: readonly T[],
): T[] {
  const byId = new Map(withoutTurnScopedContexts(current ?? []).map((part) => [part.sourceId, part]));
  for (const part of withoutTurnScopedContexts(requested)) byId.set(part.sourceId, part);
  return [...byId.values()];
}
