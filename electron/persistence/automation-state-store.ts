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

export class AutomationStateStore {
  constructor(private readonly db: AppStateDatabase) {}

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
      return normalizeAutomationState(JSON.parse(row.value_json));
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
