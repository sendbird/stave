import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  AUTOMATION_PROVIDER_TIMEOUT_KEY,
  AUTOMATION_STATE_KEY,
  AutomationStateStore,
  renameLegacyAutomationStateFields,
} from "../electron/persistence/automation-state-store";
import { createDefaultAutomationRuntime } from "../src/lib/automations";

// Covers the temporary migration "automation-app-state-keys"; delete this file
// together with it (see config/temporary-migrations.json).

const LEGACY_STATE_KEY = "routine_state_v1";
const LEGACY_TIMEOUT_KEY = "routine_provider_timeout_ms_v1";

// A spec as saved before the renames: `routines`/`routineId` containers and
// `projectPath` on the environment and each run.
const legacySpec = {
  id: "automation-1",
  name: "Nightly review",
  prompt: "Review the open pull requests.",
  enabled: true,
  schedule: { every: 1, unit: "days" },
  environment: {
    kind: "repository",
    workspaceId: "ws-1",
    path: "/tmp/repo",
    projectPath: "/tmp/repo",
    label: "repo",
  },
  runtime: createDefaultAutomationRuntime("codex"),
  trustPolicy: "review-required",
  maxConcurrentRuns: 1,
  informationReferences: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  lastRunAt: null,
  nextRunAt: null,
};
const legacyRun = {
  id: "run-1",
  routineId: "automation-1",
  workspaceId: "ws-1",
  projectPath: "/tmp/repo",
  taskId: "task-1",
  turnId: "turn-1",
  status: "completed",
  trigger: "scheduled",
  scheduledFor: "2026-09-02T09:00:00.000Z",
  startedAt: "2026-09-02T09:00:01.000Z",
  completedAt: "2026-09-02T09:05:00.000Z",
  resultPreview: "Reviewed 2 pull requests.",
  error: null,
  configHash: null,
  trustPolicy: "review-required",
};

/** The same spec and run in the current shape. */
const { projectPath: _specPath, ...legacyEnvironmentRest } = legacySpec.environment;
const currentSpec = { ...legacySpec, environment: { ...legacyEnvironmentRest, repositoryPath: "/tmp/repo" } };
const { routineId: _routineId, projectPath: _runPath, ...legacyRunRest } = legacyRun;
const currentRun = { ...legacyRunRest, automationId: "automation-1", repositoryPath: "/tmp/repo" };

let database: Database;

function readValue(key: string) {
  const row = database
    .prepare("SELECT value_json FROM app_state WHERE key = ?")
    .get(key) as { value_json: string } | null;
  return row ? JSON.parse(row.value_json) : undefined;
}

function writeValue(key: string, value: unknown) {
  database
    .prepare(
      "INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?)",
    )
    .run(key, JSON.stringify(value), "2026-09-01T00:00:00.000Z");
}

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(
    "CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)",
  );
});

afterEach(() => {
  database.close();
});

describe("automation app_state key migration", () => {
  test("renames the legacy state fields", () => {
    expect(
      renameLegacyAutomationStateFields({
        version: 1,
        routines: [legacySpec],
        runs: [legacyRun],
      }),
    ).toEqual({
      version: 1,
      automations: [currentSpec],
      runs: [currentRun],
    });
  });

  test("renaming is idempotent and also reads a current-key value saved with projectPath", () => {
    const current = renameLegacyAutomationStateFields({ version: 1, automations: [currentSpec], runs: [currentRun] });
    expect(renameLegacyAutomationStateFields(current)).toEqual(current);
    writeValue(AUTOMATION_STATE_KEY, { version: 1, automations: [legacySpec], runs: [{ ...legacyRun, automationId: "automation-1" }] });
    const loaded = new AutomationStateStore(database).loadState();
    expect(loaded.automations.map((automation) => automation.environment.repositoryPath)).toEqual(["/tmp/repo"]);
    expect(loaded.runs.map((run) => run.repositoryPath)).toEqual(["/tmp/repo"]);
  });

  test("moves legacy values to the automation keys and deletes the legacy rows", () => {
    writeValue(LEGACY_STATE_KEY, {
      version: 1,
      routines: [legacySpec],
      runs: [legacyRun],
    });
    writeValue(LEGACY_TIMEOUT_KEY, 120_000);

    const store = new AutomationStateStore(database as never);

    expect(readValue(LEGACY_STATE_KEY)).toBeUndefined();
    expect(readValue(LEGACY_TIMEOUT_KEY)).toBeUndefined();
    expect(readValue(AUTOMATION_PROVIDER_TIMEOUT_KEY)).toBe(120_000);
    expect(store.loadProviderTimeoutMs()).toBe(120_000);
    const state = store.loadState();
    expect(state.automations.map((automation) => automation.id)).toEqual([
      "automation-1",
    ]);
    expect(state.runs.map((run) => run.automationId)).toEqual(["automation-1"]);
  });

  test("keeps a value already saved under the new key", () => {
    writeValue(AUTOMATION_STATE_KEY, { version: 1, automations: [], runs: [] });
    writeValue(LEGACY_STATE_KEY, {
      version: 1,
      routines: [legacySpec],
      runs: [legacyRun],
    });

    const store = new AutomationStateStore(database as never);

    expect(readValue(LEGACY_STATE_KEY)).toBeUndefined();
    expect(store.loadState().automations).toEqual([]);
  });

  test("is a no-op on a database without legacy rows and when run twice", () => {
    new AutomationStateStore(database as never);
    const store = new AutomationStateStore(database as never);
    expect(store.loadState()).toEqual({ version: 1, automations: [], runs: [] });
    expect(store.loadProviderTimeoutMs()).toBeNull();
  });

  test("moves unreadable legacy JSON as-is, which loads as an empty state", () => {
    database
      .prepare(
        "INSERT INTO app_state (key, value_json, updated_at) VALUES (?, ?, ?)",
      )
      .run(LEGACY_STATE_KEY, "{not json", "2026-09-01T00:00:00.000Z");

    const store = new AutomationStateStore(database as never);

    expect(readValue(LEGACY_STATE_KEY)).toBeUndefined();
    expect(store.loadState()).toEqual({ version: 1, automations: [], runs: [] });
  });
});
