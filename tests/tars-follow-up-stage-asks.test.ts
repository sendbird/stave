import { afterEach, describe, expect, test } from "bun:test";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { StageStatus } from "@/lib/agent-runs/domain";
import { classifyTarsTransition, isTarsEventCurrent, isTarsStageAskingUser, tarsNextWaitCheck } from "@/lib/tars/events";
import { tarsObservation } from "../electron/host-service/tars-execution";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";

// A run that stops its own stage to ask the user (blocked, stuck or awaiting
// sign-off) is followed up at once, once per episode. Every other wait keeps
// the quiet-wait rule: one follow-up only after an hour without change.

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture(options: Parameters<typeof followUpFixture>[0] = {}) {
  const f = followUpFixture(options);
  cleanup.push(f.close);
  return f;
}
const asks = (detail = "Which database should the export use?") => ({ state: "waiting" as const, detail, stageAsksUser: true });
const eventsOf = (f: ReturnType<typeof fixture>, id: string) => f.responsibilities.events.listRecent(100).filter((event) => event.responsibilityId === id);

describe("the boundary between a stage that asks and a plain wait", () => {
  const base = agentRunFixture();
  const stageId = base.agentRun.workflow.stages[base.agentRun.currentStageIndex]!.id;
  const run = (overrides: Partial<AgentRunDetail["agentRun"]>, status: StageStatus = "running") => {
    const stages = base.stages.map((stage) => stage.stageId === stageId
      ? { ...stage, status, detail: status === "running" ? null : "Which database should the export use?", blockReason: status === "blocked" ? "agent-blocked" as const : null }
      : stage);
    return { ...base, agentRun: { ...base.agentRun, ...overrides }, stages, events: [], report: null } as AgentRunDetail;
  };

  test("a running run whose own stage blocked, got stuck or awaits sign-off asks the user", () => {
    for (const status of ["blocked", "stuck", "awaiting-sign-off"] as const)
      expect(tarsObservation(run({ state: "running", turnCount: 4 }, status))).toEqual({ ...asks(), runTurns: 4, runStage: `${stageId}#1` });
    expect(tarsObservation(run({ state: "running" }, "running"))).toEqual({ state: "running", detail: null });
  });

  test("any run pause is a plain wait, even over a waiting stage", () => {
    for (const pauseReason of ["paused-by-user", "usage-limit", "wait-expired", "limit-reached"] as const) {
      const observed = tarsObservation(run({ state: "paused", pauseReason, reasonDetail: null }, "blocked"));
      expect(observed).toMatchObject({ state: "waiting" });
      expect("stageAsksUser" in observed).toBe(false);
    }
    expect("stageAsksUser" in tarsObservation(run({ state: "paused", pauseReason: "usage-limit", reasonDetail: null }))).toBe(false);
  });

  test("classification: entering an asking stage is one judgment event; new words, plain waits and leaving it are not", () => {
    const asking = { state: "waiting" as const, detailCode: null, stageAsksUser: true };
    const plain = { state: "waiting" as const, detailCode: "waitingForUser" as const };
    const running = { state: "running" as const, detailCode: null };
    expect(classifyTarsTransition(running, asking)).toBe("stageAsksUser");
    expect(classifyTarsTransition(plain, asking)).toBe("stageAsksUser");
    expect(classifyTarsTransition(null, asking)).toBe("stageAsksUser");
    expect(classifyTarsTransition(asking, asking)).toBeNull();
    expect(classifyTarsTransition(running, plain)).toBeNull();
    expect(classifyTarsTransition(asking, plain)).toBeNull();
    expect(classifyTarsTransition(asking, running)).toBeNull();
    // A stale mark on work that is not waiting means nothing.
    expect(isTarsStageAskingUser({ state: "running", stageAsksUser: true })).toBe(false);
    expect(classifyTarsTransition(running, { state: "running", detailCode: null, stageAsksUser: true })).toBeNull();
  });

  test("an asking stage stays current through new words; its quiet wait is left to the inbox's fallback", () => {
    const event = { kind: "stageAsksUser" as const, observedState: "waiting" as const, observedRevision: 3 };
    expect(isTarsEventCurrent(event, { state: "waiting", detailCode: null, revision: 5, stageAsksUser: true })).toBe(true);
    expect(isTarsEventCurrent(event, { state: "waiting", detailCode: "waitingForUser", revision: 5 })).toBe(false);
    expect(isTarsEventCurrent(event, { state: "running", detailCode: null, revision: 5, stageAsksUser: true })).toBe(false);
    expect(isTarsEventCurrent(event, { state: "paused", detailCode: null, revision: 5 })).toBe(false);
    const updatedAt = "2026-11-05T00:00:00.000Z";
    expect(tarsNextWaitCheck({ state: "waiting", updatedAt })).toBe("2026-11-05T01:00:00.000Z");
    expect(tarsNextWaitCheck({ state: "running", updatedAt })).toBeNull();
  });
});

describe("an immediate follow-up for a stage that asks the user", () => {
  test("starts at once, exactly once for the episode, with no hourly follow-up and no busy loop", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    f.observations.set(row.id, asks());
    await f.settle();
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "waiting", stageAsksUser: true });
    expect(f.planner).toHaveLength(1);
    expect(f.automatic().map((message) => message.origin)).toEqual([expect.objectContaining({ kind: "followUp", reason: "stageAsksUser", responsibilityId: row.id })]);
    expect(f.planner[0]!.input.prompt).toContain('"automaticFollowUp":{"reason":"stageAsksUser"');
    // The tray shows no later check for it: this episode had its follow-up.
    expect(f.responsibilities.snapshot().followUps.filter((state) => state.responsibilityId === row.id && state.status === "nextCheck")).toEqual([]);
    // Unchanged observations, new words from the same stage and hours of waiting start nothing more.
    f.observations.set(row.id, asks("Still waiting: which database should the export use?"));
    for (let tick = 0; tick < 24; tick++) { await f.settle(); f.advance(minutes(15)); }
    expect(f.planner).toHaveLength(1);
    expect(f.automatic()).toHaveLength(1);
    // The quiet wait is recorded but settled: this ask already reached Tars.
    expect(eventsOf(f, row.id).map((event) => [event.kind, event.status])).toEqual([["stageAsksUser", "followedUp"], ["waitExpired", "settled"]]);
    expect(f.errors).toEqual([]);
  });

  test("a new episode after the run continues and asks again gets its own follow-up", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    f.observations.set(row.id, asks()); await f.settle();
    f.observations.set(row.id, { state: "running", detail: null }); await f.settle();
    expect(f.responsibilities.get(row.id)?.stageAsksUser).toBeUndefined();
    f.observations.set(row.id, asks("Which region should the export use?")); await f.settle(); await f.settle();
    expect(f.planner).toHaveLength(2);
    expect(eventsOf(f, row.id).map((event) => [event.kind, event.status])).toEqual([["stageAsksUser", "followedUp"], ["stageAsksUser", "followedUp"]]);
  });

  test("user-paused runs, usage-limit waits and approvals answered in the task keep the quiet-wait rule", async () => {
    const f = fixture(); f.service.start();
    const userPaused = f.responsibility("running");
    const usageLimit = f.responsibility("running");
    const approval = f.responsibility("running");
    f.observations.set(userPaused.id, { state: "waiting", detail: "Paused from Fleet." });
    f.observations.set(usageLimit.id, { state: "waiting", detail: "usage-limit", detailCode: "runPaused", detailParams: { reason: "usage-limit" } });
    f.observations.set(approval.id, { state: "waiting", detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser", detailParams: null });
    await f.settle();
    f.advance(minutes(59)); await f.settle();
    expect(f.planner).toHaveLength(0);
    for (const row of [userPaused, usageLimit, approval]) expect(eventsOf(f, row.id)).toEqual([]);
    // The existing rule still applies after the quiet hour.
    f.advance(minutes(1)); await f.settle();
    expect(f.automatic().map((message) => message.origin?.kind === "followUp" ? message.origin.reason : null)).toEqual(["waitExpired", "waitExpired", "waitExpired"]);
  });

  test("a stage that resumed before Tars looked costs no model call", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, asks());
    f.runtime.requestTick(); await f.runtime.drain();
    expect(eventsOf(f, row.id)).toEqual([expect.objectContaining({ kind: "stageAsksUser", status: "pending" })]);
    f.observations.set(row.id, { state: "running", detail: null });
    f.runtime.requestTick(); await f.runtime.drain();
    f.service.start(); await f.settle();
    expect(f.planner).toHaveLength(0);
    expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["superseded"]);
  });

  test("the shared turn limit applies: a used-up limit records the episode as exhausted", async () => {
    const f = fixture({ maxTurns: 1 }); f.service.start();
    const first = f.responsibility("running");
    const second = f.responsibility("running");
    f.observations.set(first.id, asks()); await f.settle();
    f.observations.set(second.id, asks()); await f.settle();
    expect(f.planner).toHaveLength(1);
    expect(eventsOf(f, second.id).map((event) => [event.kind, event.status])).toEqual([["stageAsksUser", "exhausted"]]);
  });
});
