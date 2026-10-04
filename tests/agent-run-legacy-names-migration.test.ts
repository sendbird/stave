import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { WakeUpStore } from "../electron/persistence/wake-up-store";
import { createWakeUp } from "../src/lib/supervision/wake-up-policy";
import { createAgentRun, listExternalEffectStages } from "../src/lib/agent-runs/domain";
import { AGENT_RUN_NOW, starterWorkflow } from "./fixtures/agent-run-fixtures";

/** The mission tables exactly as 0.24.1 created them. */
const LEGACY_SCHEMA = `
  CREATE TABLE missions (
    id TEXT PRIMARY KEY, repository_path TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_task_id TEXT NOT NULL,
    project_id TEXT, playbook_json TEXT NOT NULL, assignment TEXT NOT NULL, consent_json TEXT NOT NULL,
    fingerprint_json TEXT NOT NULL, state TEXT NOT NULL, pause_reason TEXT, stop_reason TEXT, reason_detail TEXT,
    current_stage_index INTEGER NOT NULL, turn_count INTEGER NOT NULL DEFAULT 0, max_turns INTEGER NOT NULL DEFAULT 30,
    expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, origin TEXT
  );
  CREATE UNIQUE INDEX idx_missions_active_lead ON missions (lead_task_id) WHERE state IN ('running', 'paused');
  CREATE INDEX idx_missions_workspace ON missions (workspace_id, created_at DESC);
  CREATE TABLE mission_stages (
    mission_id TEXT NOT NULL, stage_id TEXT NOT NULL, attempt INTEGER NOT NULL, status TEXT NOT NULL,
    nudged INTEGER NOT NULL DEFAULT 0, block_reason TEXT, detail TEXT, feedback TEXT, started_at TEXT, ended_at TEXT,
    start_head_sha TEXT, report_json TEXT, report_revision INTEGER NOT NULL DEFAULT 0, facts_json TEXT,
    PRIMARY KEY (mission_id, stage_id, attempt)
  );
  CREATE TABLE mission_events (
    id TEXT PRIMARY KEY, mission_id TEXT NOT NULL, sequence INTEGER NOT NULL, kind TEXT NOT NULL,
    idempotency_key TEXT UNIQUE, detail_json TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE (mission_id, sequence)
  );
  CREATE TABLE mission_proposals (
    id TEXT PRIMARY KEY, source_key TEXT NOT NULL UNIQUE, state TEXT NOT NULL, body_json TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE mission_trigger_seen (trigger_key TEXT PRIMARY KEY, seen_at TEXT NOT NULL);
  CREATE TABLE notifications (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, project_path TEXT,
    project_name TEXT, workspace_id TEXT, workspace_name TEXT, task_id TEXT, task_title TEXT, turn_id TEXT,
    provider_id TEXT, action_json TEXT, payload_json TEXT NOT NULL, source_dedupe_key TEXT, created_at TEXT NOT NULL,
    read_at TEXT, resolved_at TEXT, expires_at TEXT
  );
`;

function legacyRun() {
  const workflow = starterWorkflow("request-to-pr");
  return createAgentRun({
    id: "mission-old",
    input: {
      workspaceId: "ws-1",
      leadTaskId: "task-1",
      workflow,
      assignment: "Add CSV export.",
      consent: {
        checkIns: "plan-and-publishing",
        permissionMode: "guided",
        authorizedEffectStageIds: listExternalEffectStages(workflow).map((stage) => stage.id),
      },
    },
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "codex", model: "gpt-5" },
    now: AGENT_RUN_NOW,
  });
}

/** A 0.24.1 database holding one running mission, its stage records, its start event and its notifications. */
function legacyDatabase() {
  const db = new Database(":memory:");
  db.exec(LEGACY_SCHEMA);
  const { agentRun: run, upserts } = legacyRun();
  db.prepare(
    `INSERT INTO missions (id, repository_path, workspace_id, lead_task_id, project_id, playbook_json, assignment,
       consent_json, fingerprint_json, state, pause_reason, stop_reason, reason_detail, current_stage_index,
       turn_count, max_turns, expires_at, created_at, updated_at, origin)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL)`,
  ).run(
    run.id, run.repositoryPath, run.workspaceId, run.leadTaskId, JSON.stringify(run.workflow), run.assignment,
    JSON.stringify(run.consent), JSON.stringify(run.fingerprint), run.state, run.currentStageIndex, run.turnCount,
    run.maxTurns, run.expiresAt, run.createdAt, run.updatedAt,
  );
  for (const record of upserts) {
    db.prepare(
      `INSERT INTO mission_stages (mission_id, stage_id, attempt, status, nudged, started_at, report_revision)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
    ).run(run.id, record.stageId, record.attempt, record.status, record.startedAt);
  }
  db.prepare(
    `INSERT INTO mission_events (id, mission_id, sequence, kind, idempotency_key, detail_json, created_at)
     VALUES ('event-1', ?, 1, 'mission-started', NULL, '{"playbookName":"Request to PR"}', ?)`,
  ).run(run.id, run.createdAt);
  db.prepare(
    `INSERT INTO mission_events (id, mission_id, sequence, kind, idempotency_key, detail_json, created_at)
     VALUES ('event-2', ?, 2, 'checks-observed', NULL, '{}', ?)`,
  ).run(run.id, run.createdAt);
  db.prepare("INSERT INTO mission_proposals VALUES ('proposal-1', 'source-1', 'open', '{}', ?)").run(run.createdAt);
  const notify = db.prepare(
    `INSERT INTO notifications (id, kind, title, body, payload_json, source_dedupe_key, created_at)
     VALUES (?, ?, 'Title', 'Body', ?, ?, ?)`,
  );
  notify.run(
    "mission-mission-old-stuck",
    "mission.stuck",
    JSON.stringify({ source: "mission", missionId: run.id, stageId: "understand", attempt: 1 }),
    `mission:${run.id}:stuck:understand:1`,
    run.createdAt,
  );
  notify.run(
    "mission-reminder-1",
    "mission.sign_off_requested",
    JSON.stringify({ source: "mission-reminder", missionIds: [run.id] }),
    "mission-reminder:mission-old:1:1",
    run.createdAt,
  );
  notify.run("task-1-done", "task.turn_completed", JSON.stringify({ source: "turn" }), "turn:1", run.createdAt);
  return { db, run, upserts };
}

const tableNames = (db: Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
    (row) => row.name,
  );
const indexNames = (db: Database) =>
  (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((row) => row.name);

describe("temporary migration: agent-run-tables", () => {
  test("a 0.24.1 database's missions are readable as agent runs after bootstrap", () => {
    const { db, run, upserts } = legacyDatabase();
    const store = new AgentRunStore(db);

    const aggregate = store.getAggregate(run.id);
    expect(aggregate?.agentRun).toEqual(run);
    expect(aggregate?.stages.map((record) => [record.stageId, record.attempt, record.status])).toEqual(
      upserts.map((record) => [record.stageId, record.attempt, record.status]),
    );
    expect(store.getActiveAgentRunForTask("task-1")?.id).toBe(run.id);
    expect(store.listEvents(run.id).map((event) => [event.sequence, event.kind])).toEqual([
      [1, "agent-run-started"],
      [2, "checks-observed"],
    ]);

    const tables = tableNames(db);
    expect(tables).toEqual(expect.arrayContaining(["agent_runs", "agent_run_stages", "agent_run_events"]));
    expect(tables).not.toEqual(expect.arrayContaining(["missions"]));
    expect(tables).not.toContain("mission_stages");
    expect(tables).not.toContain("mission_events");
    // Retired tables stay as they were, rows included.
    expect(tables).toEqual(expect.arrayContaining(["mission_proposals", "mission_trigger_seen"]));
    expect(db.prepare("SELECT COUNT(*) AS count FROM mission_proposals").get()).toEqual({ count: 1 });
    expect(indexNames(db)).toEqual(["idx_agent_runs_active_lead", "idx_agent_runs_workspace"]);
    const columns = (db.prepare("PRAGMA table_info(agent_runs)").all() as { name: string }[]).map((c) => c.name);
    expect(columns).toContain("workflow_json");
    expect(columns).not.toContain("playbook_json");

    // New writes land next to the migrated rows; the old run still holds its task.
    expect(store.recordEvent(run.id, { kind: "nudge", idempotencyKey: null, detail: {} }, AGENT_RUN_NOW)).toBe(true);
    expect(store.listEvents(run.id).at(-1)?.sequence).toBe(3);
    db.close();
  });

  test("running the bootstrap twice is a no-op", () => {
    const { db, run } = legacyDatabase();
    new AgentRunStore(db);
    const before = {
      tables: tableNames(db),
      indexes: indexNames(db),
      events: db.prepare("SELECT * FROM agent_run_events ORDER BY sequence").all(),
      runs: db.prepare("SELECT * FROM agent_runs").all(),
    };
    const again = new AgentRunStore(db);
    expect(again.getAgentRun(run.id)).toEqual(run);
    expect({
      tables: tableNames(db),
      indexes: indexNames(db),
      events: db.prepare("SELECT * FROM agent_run_events ORDER BY sequence").all(),
      runs: db.prepare("SELECT * FROM agent_runs").all(),
    }).toEqual(before);
    db.close();
  });

  test("a new database never creates the retired tables", () => {
    const db = new Database(":memory:");
    new AgentRunStore(db);
    expect(tableNames(db)).toEqual(["agent_run_events", "agent_run_stages", "agent_runs"]);
    db.close();
  });
});

describe("temporary migration: agent-run-notification-kinds", () => {
  test("stored mission notifications become agent run notifications with their keys and payload", () => {
    const { db, run } = legacyDatabase();
    new AgentRunStore(db);
    const rows = db
      .prepare("SELECT id, kind, payload_json, source_dedupe_key FROM notifications ORDER BY id")
      .all() as { id: string; kind: string; payload_json: string; source_dedupe_key: string }[];
    expect(rows.map((row) => ({ ...row, payload_json: JSON.parse(row.payload_json) }))).toEqual([
      {
        id: "mission-mission-old-stuck",
        kind: "agent_run.stuck",
        payload_json: { source: "agent-run", agentRunId: run.id, stageId: "understand", attempt: 1 },
        source_dedupe_key: `agent-run:${run.id}:stuck:understand:1`,
      },
      {
        id: "mission-reminder-1",
        kind: "agent_run.sign_off_requested",
        payload_json: { source: "agent-run-reminder", agentRunIds: [run.id] },
        source_dedupe_key: "agent-run-reminder:mission-old:1:1",
      },
      {
        id: "task-1-done",
        kind: "task.turn_completed",
        payload_json: { source: "turn" },
        source_dedupe_key: "turn:1",
      },
    ]);
    const snapshot = db.prepare("SELECT * FROM notifications ORDER BY id").all();
    new AgentRunStore(db);
    expect(db.prepare("SELECT * FROM notifications ORDER BY id").all()).toEqual(snapshot);
    db.close();
  });
});

describe("temporary migration: agent-run-wake-up-pause-reason", () => {
  test("a wake-up paused for a mission still reads, paused for the agent run", () => {
    const db = new Database(":memory:");
    const store = new WakeUpStore(db);
    const wakeUp = {
      ...createWakeUp({
        id: "wake-1",
        input: {
          workspaceId: "ws-1",
          taskId: "task-1",
          prompt: "Re-check CI.",
          trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
          maxOccurrences: null,
          expiresAt: null,
        },
        repositoryPath: "/tmp/repo",
        fingerprint: { providerId: "claude-code", model: "sonnet" },
        now: new Date("2026-09-26T08:30:00.000Z"),
      }),
      state: "paused" as const,
      pauseReason: "agent-run-active" as const,
    };
    store.upsert(wakeUp);
    // How 0.24.1 stored the same pause.
    db.exec("UPDATE wake_ups SET pause_reason = 'mission-active' WHERE id = 'wake-1'");
    const upgraded = new WakeUpStore(db);
    expect(upgraded.get("wake-1")?.pauseReason).toBe("agent-run-active");
    new WakeUpStore(db);
    expect(db.prepare("SELECT pause_reason FROM wake_ups").all()).toEqual([{ pause_reason: "agent-run-active" }]);
    db.close();
  });
});
