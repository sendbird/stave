// temporary-migration: issue-tracker-settings
/**
 * Moves settings saved before the Tasks surface was renamed to Issues onto
 * the new names, in the persisted snapshot and before it is merged with
 * defaults (after the merge, a missing new key already holds the default and
 * the saved value would be lost). Remove per config/temporary-migrations.json.
 */
const LEGACY_COMMAND_IDS: Record<string, string> = {
  "navigation.tasks": "navigation.issues",
  "tracker.refresh-tasks": "tracker.refresh-issues",
};

const LEGACY_STORAGE_KEYS: Record<string, string> = {
  "stave.tracker-tasks.view": "stave.tracker-issues.view",
  "stave.tracker-tasks.last-project": "stave.tracker-issues.last-project",
};

/** Moves the surface's local view preferences to their renamed keys. */
export function migrateLegacyIssueStorageKeys(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined =
    globalThis.localStorage,
) {
  if (!storage) return;
  try {
    for (const [legacy, current] of Object.entries(LEGACY_STORAGE_KEYS)) {
      const value = storage.getItem(legacy);
      if (value === null) continue;
      if (storage.getItem(current) === null) storage.setItem(current, value);
      storage.removeItem(legacy);
    }
  } catch {
    // View preferences are disposable; a storage failure must not block startup.
  }
}

export function migrateLegacyIssueTrackerSettings(persisted: unknown) {
  migrateLegacyIssueStorageKeys();
  if (!persisted || typeof persisted !== "object") return;
  const settings = persisted as Record<string, unknown>;
  if (settings.trackerIssues === undefined && settings.trackerTasks !== undefined) {
    settings.trackerIssues = settings.trackerTasks;
  }
  delete settings.trackerTasks;

  const shortcutKeys = settings.appShortcutKeys;
  if (shortcutKeys && typeof shortcutKeys === "object") {
    const keys = shortcutKeys as Record<string, unknown>;
    for (const [legacy, current] of Object.entries(LEGACY_COMMAND_IDS)) {
      if (legacy in keys) {
        if (!(current in keys)) keys[current] = keys[legacy];
        delete keys[legacy];
      }
    }
  }

  const recent = settings.commandPaletteRecentCommandIds;
  if (Array.isArray(recent)) {
    settings.commandPaletteRecentCommandIds = [
      ...new Set(
        recent.map((id) =>
          typeof id === "string" ? (LEGACY_COMMAND_IDS[id] ?? id) : id,
        ),
      ),
    ];
  }
}
