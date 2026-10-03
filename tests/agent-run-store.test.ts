import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { cancelAgentRun } from "../src/lib/agent-runs/commands";
import {
  AGENT_RUN_LIMITS,
  buildAgentRunActionKey,
  createAgentRun,
  listExternalEffectStages,
} from "../src/lib/agent-runs/domain";
import { applyAgentRunDecision } from "../src/lib/agent-runs/policy";
import { SECOND_AGENT_RUN_REFUSAL } from "../src/lib/supervision/automatic-turn-owner";
import { AGENT_RUN_NOW, agentRunFixture, starterWorkflow } from "./fixtures/agent-run-fixtures";

let database: Database;
let store: AgentRunStore;

function startChange(id = "agent-run-1", leadTaskId = "task-1") {
  const workflow = starterWorkflow("request-to-pr");
  return createAgentRun({
    id,
    input: {
      workspaceId: "ws-1",
      leadTaskId,
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

beforeEach(() => {
  database = new Database(":memory:");
  store = new AgentRunStore(database);
});

afterEach(() => {
  database.close();
});

describe("run store", () => {
  test("round-trips a run, its stage records and its start event", () => {
    const change = startChange();
    expect(store.create(change, AGENT_RUN_NOW)).toEqual({ ok: true });

    const aggregate = store.getAggregate("agent-run-1");
    expect(aggregate?.agentRun).toEqual(change.agentRun);
    expect(aggregate?.stages).toEqual(change.upserts);
    expect(store.listEvents("agent-run-1").map((event) => [event.sequence, event.kind])).toEqual([
      [1, "agent-run-started"],
    ]);
    expect(store.getActiveAgentRunForTask("task-1")?.id).toBe("agent-run-1");
    expect(store.listActiveAgentRuns().map((agentRun) => agentRun.id)).toEqual(["agent-run-1"]);
    expect(store.listAgentRunsForWorkspace("ws-1").map((agentRun) => agentRun.id)).toEqual(["agent-run-1"]);
  });

  test("refuses a second active run on the same lead task until the first ends", () => {
    store.create(startChange("agent-run-1"), AGENT_RUN_NOW);
    expect(store.create(startChange("agent-run-2"), AGENT_RUN_NOW)).toEqual({
      ok: false,
      reason: "active-agent-run-exists",
      message: SECOND_AGENT_RUN_REFUSAL,
    });
    expect(store.getAgentRun("agent-run-2")).toBeNull();
    expect(store.create(startChange("agent-run-3", "task-2"), AGENT_RUN_NOW)).toEqual({ ok: true });

    const first = store.getAggregate("agent-run-1")!;
    store.apply(cancelAgentRun({ aggregate: first, now: AGENT_RUN_NOW }), AGENT_RUN_NOW);
    expect(store.create(startChange("agent-run-2"), AGENT_RUN_NOW)).toEqual({ ok: true });
  });

  test("applies a transition atomically", () => {
    store.create(startChange(), AGENT_RUN_NOW);
    const aggregate = store.getAggregate("agent-run-1")!;
    const change = applyAgentRunDecision({
      aggregate,
      decision: { action: "start-stage-turn", stageIndex: 0, attempt: 1, reason: "stage-start" },
      now: AGENT_RUN_NOW,
    });
    store.apply(change, AGENT_RUN_NOW);
    expect(store.getAggregate("agent-run-1")?.agentRun.turnCount).toBe(1);
    expect(store.getAggregate("agent-run-1")?.stages[0]?.status).toBe("running");

    const foreign = { ...change, agentRun: { ...change.agentRun, turnCount: 5 }, upserts: [{ ...change.upserts[0]!, agentRunId: "other" }] };
    expect(() => store.apply(foreign, AGENT_RUN_NOW)).toThrow("belongs to run other");
    expect(store.getAggregate("agent-run-1")?.agentRun.turnCount).toBe(1);
  });

  test("records a keyed event once, so a restart never repeats a Stave action", () => {
    store.create(startChange(), AGENT_RUN_NOW);
    const key = buildAgentRunActionKey({ agentRunId: "agent-run-1", stageId: "open-draft-pr", attempt: 1 });
    const draft = { kind: "action-started" as const, idempotencyKey: key, detail: { type: "open-draft-pr" } };
    expect(store.hasEvent(key)).toBe(false);
    expect(store.recordEvent("agent-run-1", draft, AGENT_RUN_NOW)).toBe(true);
    expect(store.recordEvent("agent-run-1", draft, AGENT_RUN_NOW)).toBe(false);
    expect(store.hasEvent(key)).toBe(true);
    expect(store.listEvents("agent-run-1").map((event) => event.sequence)).toEqual([1, 2]);
    expect(store.listEvents("agent-run-1", { afterSequence: 1 }).map((event) => event.kind)).toEqual(["action-started"]);
  });

  test("keeps events within the retention bound without dropping keyed ones", () => {
    store.create(startChange(), AGENT_RUN_NOW);
    store.recordEvent(
      "agent-run-1",
      { kind: "action-started", idempotencyKey: "agent-run-1:open-draft-pr:1:action", detail: {} },
      AGENT_RUN_NOW,
    );
    for (let index = 0; index < AGENT_RUN_LIMITS.maxRetainedEvents + 5; index += 1) {
      store.recordEvent("agent-run-1", { kind: "checks-observed", idempotencyKey: null, detail: { index } }, AGENT_RUN_NOW);
    }
    const events = store.listEvents("agent-run-1", { limit: AGENT_RUN_LIMITS.maxRetainedEvents });
    expect(events).toHaveLength(AGENT_RUN_LIMITS.maxRetainedEvents);
    expect(store.hasEvent("agent-run-1:open-draft-pr:1:action")).toBe(true);
    expect(events.some((event) => event.kind === "agent-run-started")).toBe(false);
  });

  test("an unreadable run row is skipped in listings instead of hiding the rest", () => {
    store.create(startChange("agent-run-1"), AGENT_RUN_NOW);
    store.create(startChange("agent-run-2", "task-2"), AGENT_RUN_NOW);
    database.exec("UPDATE agent_runs SET consent_json = '{}' WHERE id = 'agent-run-1'");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(store.listActiveAgentRuns().map((agentRun) => agentRun.id)).toEqual(["agent-run-2"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("an agent run keeps its origin, and a database from before agent runs gains the column", () => {
    const legacy = new Database(":memory:");
    legacy.exec(`CREATE TABLE agent_runs (
      id TEXT PRIMARY KEY, repository_path TEXT NOT NULL, workspace_id TEXT NOT NULL, lead_task_id TEXT NOT NULL,
      project_id TEXT, workflow_json TEXT NOT NULL, assignment TEXT NOT NULL, consent_json TEXT NOT NULL,
      fingerprint_json TEXT NOT NULL, state TEXT NOT NULL, pause_reason TEXT, stop_reason TEXT, reason_detail TEXT,
      current_stage_index INTEGER NOT NULL, turn_count INTEGER NOT NULL DEFAULT 0, max_turns INTEGER NOT NULL DEFAULT 30,
      expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    const upgraded = new AgentRunStore(legacy);
    const legacyRun = startChange("agent-run-old", "task-old");
    expect(upgraded.create(legacyRun, AGENT_RUN_NOW)).toEqual({ ok: true });
    expect(upgraded.getAggregate("agent-run-old")?.agentRun.origin).toBeUndefined();
    const run = startChange("agent-run-run", "task-run");
    const agentOriginRun = { ...run, agentRun: { ...run.agentRun, origin: "agent" as const } };
    expect(upgraded.create(agentOriginRun, AGENT_RUN_NOW)).toEqual({ ok: true });
    expect(new AgentRunStore(legacy).getAggregate("agent-run-run")?.agentRun.origin).toBe("agent");
    legacy.close();
  });

  test("bootstrap is idempotent", () => {
    store.create(startChange(), AGENT_RUN_NOW);
    const again = new AgentRunStore(database);
    expect(again.getAgentRun("agent-run-1")?.id).toBe("agent-run-1");
  });

  test("the fixture helper and the store agree on the run shape", () => {
    const fixture = agentRunFixture({ id: "agent-run-9", leadTaskId: "task-9" });
    expect(store.create({ agentRun: fixture.agentRun, upserts: fixture.stages, events: [] }, AGENT_RUN_NOW)).toEqual({ ok: true });
    expect(store.getAggregate("agent-run-9")).toEqual(fixture);
  });
});
