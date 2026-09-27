// temporary-migration: repository-persisted-state
/**
 * Maps state written before registered projects were renamed to repositories
 * onto the new names. Two places hold it:
 *
 * - the zustand snapshot, whose keys `recentProjects`, `projectPath` and
 *   `projectName` are mapped on the *persisted* snapshot before it is merged
 *   into the store (after the merge the new keys already hold their initial
 *   values, so a legacy value could no longer be told apart);
 * - each registered-repository entry, in that snapshot and in SQLite's
 *   `project_registry`, whose `projectPath`, `projectName` and
 *   `projectBasePrompt` fields are renamed.
 *
 * Without this, an upgrade drops the user's repository list and selection.
 * Remove per config/temporary-migrations.json.
 */
const KEY_MAP: Record<string, string> = {
  recentProjects: "recentRepositories",
  projectPath: "repositoryPath",
  projectName: "repositoryName",
};

const ENTRY_KEY_MAP: Record<string, string> = {
  projectPath: "repositoryPath",
  projectName: "repositoryName",
  projectBasePrompt: "repositoryBasePrompt",
};

/** One registered-repository entry with its legacy field names renamed; other values pass through. */
export function migrateLegacyRepositoryEntry<T>(entry: T): T {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const record = entry as Record<string, unknown>;
  if (!Object.keys(ENTRY_KEY_MAP).some((legacy) => legacy in record)) return entry;
  const next: Record<string, unknown> = { ...record };
  for (const [legacy, current] of Object.entries(ENTRY_KEY_MAP)) {
    if (!(legacy in next)) continue;
    if (next[current] === undefined) next[current] = next[legacy];
    delete next[legacy];
  }
  return next as T;
}

export function migrateLegacyRepositoryEntries(entries: unknown): unknown {
  return Array.isArray(entries) ? entries.map((entry) => migrateLegacyRepositoryEntry(entry)) : entries;
}

/** Renames the legacy keys of a persisted snapshot in place, before it is merged into the store. */
export function migrateLegacyRepositoryState(state: Record<string, unknown>) {
  for (const [legacy, current] of Object.entries(KEY_MAP)) {
    if (legacy in state) {
      if (state[current] === undefined) state[current] = state[legacy];
      delete state[legacy];
    }
  }
  if ("recentRepositories" in state) {
    state.recentRepositories = migrateLegacyRepositoryEntries(state.recentRepositories);
  }
}
