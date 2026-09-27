import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { MissionStore } from "../electron/persistence/mission-store";
import { cancelMission } from "../src/lib/missions/commands";
import {
  MISSION_LIMITS,
  buildMissionActionKey,
  createMission,
  listExternalEffectStages,
} from "../src/lib/missions/domain";
import { applyMissionDecision } from "../src/lib/missions/policy";
import { SECOND_MISSION_REFUSAL } from "../src/lib/supervision/automatic-turn-owner";
import { MISSION_NOW, missionFixture, starterPlaybook } from "./fixtures/mission-fixtures";

let database: Database;
let store: MissionStore;

function startChange(id = "mission-1", leadTaskId = "task-1") {
  const playbook = starterPlaybook("request-to-pr");
  return createMission({
    id,
    input: {
      workspaceId: "ws-1",
      leadTaskId,
      playbook,
      assignment: "Add CSV export.",
      consent: {
        checkIns: "plan-and-publishing",
        permissionMode: "guided",
        authorizedEffectStageIds: listExternalEffectStages(playbook).map((stage) => stage.id),
      },
    },
    repositoryPath: "/tmp/repo",
    fingerprint: { providerId: "codex", model: "gpt-5" },
    now: MISSION_NOW,
  });
}

beforeEach(() => {
  database = new Database(":memory:");
  store = new MissionStore(database);
});

afterEach(() => {
  database.close();
});

describe("mission store", () => {
  test("round-trips a mission, its stage records and its start event", () => {
    const change = startChange();
    expect(store.create(change, MISSION_NOW)).toEqual({ ok: true });

    const aggregate = store.getAggregate("mission-1");
    expect(aggregate?.mission).toEqual(change.mission);
    expect(aggregate?.stages).toEqual(change.upserts);
    expect(store.listEvents("mission-1").map((event) => [event.sequence, event.kind])).toEqual([
      [1, "mission-started"],
    ]);
    expect(store.getActiveMissionForTask("task-1")?.id).toBe("mission-1");
    expect(store.listActiveMissions().map((mission) => mission.id)).toEqual(["mission-1"]);
    expect(store.listMissionsForWorkspace("ws-1").map((mission) => mission.id)).toEqual(["mission-1"]);
  });

  test("refuses a second active mission on the same lead task until the first ends", () => {
    store.create(startChange("mission-1"), MISSION_NOW);
    expect(store.create(startChange("mission-2"), MISSION_NOW)).toEqual({
      ok: false,
      reason: "active-mission-exists",
      message: SECOND_MISSION_REFUSAL,
    });
    expect(store.getMission("mission-2")).toBeNull();
    expect(store.create(startChange("mission-3", "task-2"), MISSION_NOW)).toEqual({ ok: true });

    const first = store.getAggregate("mission-1")!;
    store.apply(cancelMission({ aggregate: first, now: MISSION_NOW }), MISSION_NOW);
    expect(store.create(startChange("mission-2"), MISSION_NOW)).toEqual({ ok: true });
  });

  test("applies a transition atomically", () => {
    store.create(startChange(), MISSION_NOW);
    const aggregate = store.getAggregate("mission-1")!;
    const change = applyMissionDecision({
      aggregate,
      decision: { action: "start-stage-turn", stageIndex: 0, attempt: 1, reason: "stage-start" },
      now: MISSION_NOW,
    });
    store.apply(change, MISSION_NOW);
    expect(store.getAggregate("mission-1")?.mission.turnCount).toBe(1);
    expect(store.getAggregate("mission-1")?.stages[0]?.status).toBe("running");

    const foreign = { ...change, mission: { ...change.mission, turnCount: 5 }, upserts: [{ ...change.upserts[0]!, missionId: "other" }] };
    expect(() => store.apply(foreign, MISSION_NOW)).toThrow("belongs to mission other");
    expect(store.getAggregate("mission-1")?.mission.turnCount).toBe(1);
  });

  test("records a keyed event once, so a restart never repeats a Stave action", () => {
    store.create(startChange(), MISSION_NOW);
    const key = buildMissionActionKey({ missionId: "mission-1", stageId: "open-draft-pr", attempt: 1 });
    const draft = { kind: "action-started" as const, idempotencyKey: key, detail: { type: "open-draft-pr" } };
    expect(store.hasEvent(key)).toBe(false);
    expect(store.recordEvent("mission-1", draft, MISSION_NOW)).toBe(true);
    expect(store.recordEvent("mission-1", draft, MISSION_NOW)).toBe(false);
    expect(store.hasEvent(key)).toBe(true);
    expect(store.listEvents("mission-1").map((event) => event.sequence)).toEqual([1, 2]);
    expect(store.listEvents("mission-1", { afterSequence: 1 }).map((event) => event.kind)).toEqual(["action-started"]);
  });

  test("keeps events within the retention bound without dropping keyed ones", () => {
    store.create(startChange(), MISSION_NOW);
    store.recordEvent(
      "mission-1",
      { kind: "action-started", idempotencyKey: "mission-1:open-draft-pr:1:action", detail: {} },
      MISSION_NOW,
    );
    for (let index = 0; index < MISSION_LIMITS.maxRetainedEvents + 5; index += 1) {
      store.recordEvent("mission-1", { kind: "checks-observed", idempotencyKey: null, detail: { index } }, MISSION_NOW);
    }
    const events = store.listEvents("mission-1", { limit: MISSION_LIMITS.maxRetainedEvents });
    expect(events).toHaveLength(MISSION_LIMITS.maxRetainedEvents);
    expect(store.hasEvent("mission-1:open-draft-pr:1:action")).toBe(true);
    expect(events.some((event) => event.kind === "mission-started")).toBe(false);
  });

  test("an unreadable mission row is skipped in listings instead of hiding the rest", () => {
    store.create(startChange("mission-1"), MISSION_NOW);
    store.create(startChange("mission-2", "task-2"), MISSION_NOW);
    database.exec("UPDATE missions SET consent_json = '{}' WHERE id = 'mission-1'");
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    expect(store.listActiveMissions().map((mission) => mission.id)).toEqual(["mission-2"]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  test("bootstrap is idempotent", () => {
    store.create(startChange(), MISSION_NOW);
    const again = new MissionStore(database);
    expect(again.getMission("mission-1")?.id).toBe("mission-1");
  });

  test("the fixture helper and the store agree on the mission shape", () => {
    const fixture = missionFixture({ id: "mission-9", leadTaskId: "task-9" });
    expect(store.create({ mission: fixture.mission, upserts: fixture.stages, events: [] }, MISSION_NOW)).toEqual({ ok: true });
    expect(store.getAggregate("mission-9")).toEqual(fixture);
  });
});
