/**
 * Durable storage for automation definitions, their bounded run history and
 * the automation provider timeout, all kept in `app_state`.
 *
 * Used by: `electron/persistence/sqlite-store.ts` (delegation) and, through it,
 * `electron/host-service/automation-runtime.ts`.
 */
import {
  createEmptyAutomationState,
  normalizeAutomationState,
  type AutomationState,
} from "../../src/lib/automations";

export const AUTOMATION_STATE_KEY = "automation_state_v1";
export const AUTOMATION_PROVIDER_TIMEOUT_KEY =
  "automation_provider_timeout_ms_v1";

interface AppStateStatement {
  get: (...params: unknown[]) => unknown;
  run: (...params: unknown[]) => unknown;
}

interface AppStateDatabase {
  prepare: (sql: string) => AppStateStatement;
  transaction: <T>(fn: () => T) => () => T;
}

interface JsonValueRow {
  value_json: string;
}

const UPSERT_APP_STATE = `
  INSERT INTO app_state (key, value_json, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(key) DO UPDATE SET
    value_json = excluded.value_json,
    updated_at = excluded.updated_at
`;

// temporary-migration: automation-app-state-keys
/** Keys written before automations were renamed from routines. */
const LEGACY_ROUTINE_STATE_KEY = "routine_state_v1";
const LEGACY_ROUTINE_PROVIDER_TIMEOUT_KEY = "routine_provider_timeout_ms_v1";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** `projectPath` → `repositoryPath`, from before registered projects became repositories. */
function renameProjectPath(value: unknown): unknown {
  if (!isRecord(value) || !("projectPath" in value)) return value;
  const { projectPath, ...rest } = value;
  return rest.repositoryPath === undefined ? { ...rest, repositoryPath: projectPath } : rest;
}

/**
 * Renames the legacy fields of a saved state: `routines` and `routineId`, and
 * each environment's and run's `projectPath`. Idempotent, so it also runs on
 * every load. Anything that is not the expected shape is returned untouched
 * and later normalized to an empty state, exactly as an unreadable
 * current-key value would be.
 */
export function renameLegacyAutomationStateFields(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const { routines, runs, ...rest } = value;
  const automations = routines !== undefined && rest.automations === undefined ? routines : rest.automations;
  return {
    ...rest,
    ...(automations !== undefined
      ? {
          automations: Array.isArray(automations)
            ? automations.map((automation) =>
                isRecord(automation) && "environment" in automation
                  ? { ...automation, environment: renameProjectPath(automation.environment) }
                  : automation,
              )
            : automations,
        }
      : {}),
    ...(runs !== undefined
      ? {
          runs: Array.isArray(runs)
            ? runs.map((run) => {
                if (!isRecord(run)) {
                  return run;
                }
                const { routineId, ...runRest } = run;
                return renameProjectPath(
                  routineId !== undefined && runRest.automationId === undefined
                    ? { ...runRest, automationId: routineId }
                    : runRest,
                );
              })
            : runs,
        }
      : {}),
  };
}

/**
 * Moves values saved under the legacy keys to the automation keys, once. A
 * value already present under the new key wins; the legacy row is deleted in
 * the same transaction either way, so this never runs twice for the same data.
 */
export function migrateLegacyAutomationAppState(db: AppStateDatabase) {
  const read = (key: string) =>
    db.prepare("SELECT value_json FROM app_state WHERE key = ?").get(key) as
      | JsonValueRow
      | undefined;
  const remove = (key: string) =>
    db.prepare("DELETE FROM app_state WHERE key = ?").run(key);
  const move = (
    legacyKey: string,
    currentKey: string,
    transform: (value: unknown) => unknown,
  ) => {
    const legacy = read(legacyKey);
    if (!legacy) return;
    if (!read(currentKey)) {
      let valueJson = legacy.value_json;
      try {
        valueJson = JSON.stringify(transform(JSON.parse(legacy.value_json)));
      } catch {
        // Unreadable legacy JSON moves as-is and normalizes to empty on load.
      }
      db.prepare(UPSERT_APP_STATE).run(
        currentKey,
        valueJson,
        new Date().toISOString(),
      );
    }
    remove(legacyKey);
  };
  db.transaction(() => {
    move(
      LEGACY_ROUTINE_STATE_KEY,
      AUTOMATION_STATE_KEY,
      renameLegacyAutomationStateFields,
    );
    move(LEGACY_ROUTINE_PROVIDER_TIMEOUT_KEY, AUTOMATION_PROVIDER_TIMEOUT_KEY, (value) => value);
  })();
}
// end temporary-migration: automation-app-state-keys

export class AutomationStateStore {
  constructor(private readonly db: AppStateDatabase) {
    // temporary-migration: automation-app-state-keys
    migrateLegacyAutomationAppState(db);
  }

  private read(key: string) {
    return this.db
      .prepare("SELECT value_json FROM app_state WHERE key = ?")
      .get(key) as JsonValueRow | undefined;
  }

  private write(key: string, valueJson: string) {
    this.db
      .prepare(UPSERT_APP_STATE)
      .run(key, valueJson, new Date().toISOString());
  }

  loadState(): AutomationState {
    const row = this.read(AUTOMATION_STATE_KEY);
    if (!row) {
      return createEmptyAutomationState();
    }
    try {
      // temporary-migration: automation-app-state-keys
      return normalizeAutomationState(renameLegacyAutomationStateFields(JSON.parse(row.value_json)));
    } catch {
      return createEmptyAutomationState();
    }
  }

  saveState(state: AutomationState) {
    this.write(
      AUTOMATION_STATE_KEY,
      JSON.stringify(normalizeAutomationState(state)),
    );
  }

  loadProviderTimeoutMs() {
    const row = this.read(AUTOMATION_PROVIDER_TIMEOUT_KEY);
    if (!row) {
      return null;
    }
    try {
      const value = JSON.parse(row.value_json);
      return typeof value === "number" && Number.isInteger(value)
        ? value
        : null;
    } catch {
      return null;
    }
  }

  saveProviderTimeoutMs(providerTimeoutMs: number) {
    this.write(AUTOMATION_PROVIDER_TIMEOUT_KEY, JSON.stringify(providerTimeoutMs));
  }
}
