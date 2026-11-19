import { expect, test } from "bun:test";
import type { AgentRunAggregate, AgentRunEvent } from "../src/lib/agent-runs/domain";
import { createWorkPowerSaveController, hasActivePowerWork, readPowerRun, type PowerRun, type WorkPowerSnapshot } from "../electron/main/work-power-save";

const snapshot = (patch: Partial<WorkPowerSnapshot> = {}): WorkPowerSnapshot => ({ turns: [], runs: [], responsibilities: [], reasoning: false, ...patch });
const run = (patch: Partial<PowerRun> = {}): PowerRun => ({ state: "running", pauseReason: null, stageStatus: "running", waitingOnUser: false, ...patch });
const usageWait = (resumeAt: string | null) => run({ state: "paused", pauseReason: "usage-limit", usageLimit: { resumeAt } });

test("work that runs now or that Stave resumes by itself keeps the Mac awake", () => {
  // A plain task turn in flight, with no Agent and no Run.
  expect(hasActivePowerWork(snapshot({ turns: [{}] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ runs: [run()] }))).toBe(true);
  // A usage-limit pause under a reservation: Stave continues the run at its resume time,
  // or reads usage again five minutes after the pause when the reset is unknown.
  expect(hasActivePowerWork(snapshot({ runs: [usageWait("2026-11-20T04:31:00.000Z")] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ runs: [usageWait(null)] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ responsibilities: [{ state: "preparing" }] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ responsibilities: [{ state: "running" }] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ reasoning: true }))).toBe(true);
});

test("work that only waits for a person lets the Mac sleep", () => {
  expect(hasActivePowerWork(snapshot())).toBe(false);
  // A turn held open by an approval or a blocking question.
  expect(hasActivePowerWork(snapshot({ turns: [{ awaitingUser: true }] }))).toBe(false);
  // A running Run whose lead task holds an approval, question or sign-off open.
  expect(hasActivePowerWork(snapshot({ runs: [run({ waitingOnUser: true })] }))).toBe(false);
  for (const stageStatus of ["awaiting-sign-off", "blocked", "stuck"] as const) {
    expect(hasActivePowerWork(snapshot({ runs: [run({ stageStatus })] }))).toBe(false);
  }
  // The supervisor does not resume a usage wait while the lead task holds a card open.
  expect(hasActivePowerWork(snapshot({ runs: [{ ...usageWait("2026-11-20T04:31:00.000Z"), waitingOnUser: true }] }))).toBe(false);
  // A local daily budget stop drops the reservation and waits for Resume.
  expect(hasActivePowerWork(snapshot({ runs: [run({ state: "paused", pauseReason: "usage-limit" })] }))).toBe(false);
  for (const pauseReason of ["paused-by-user", "taken-over", "task-identity-changed", "runtime-changed", "wait-expired", "limit-reached"] as const) {
    expect(hasActivePowerWork(snapshot({ runs: [run({ state: "paused", pauseReason })] }))).toBe(false);
  }
  expect(hasActivePowerWork(snapshot({ responsibilities: [{ state: "waiting" }, { state: "paused" }, { state: "resultReady" }] }))).toBe(false);
  // One unattended item among waiting ones still holds.
  expect(hasActivePowerWork(snapshot({ turns: [{ awaitingUser: true }, {}], runs: [run({ waitingOnUser: true })] }))).toBe(true);
});

test("reads the current stage, the usage reservation and the latest user-wait marker from the run store", () => {
  const agentRun = { id: "run-1", state: "paused", pauseReason: "usage-limit", currentStageIndex: 1,
    usageLimit: { turnId: "t", resetsAt: null, resumeAt: "2026-11-20T04:31:00.000Z", accountProfileId: "a", fingerprint: {} },
    workflow: { stages: [{ id: "plan" }, { id: "work" }] } };
  const stages = [{ stageId: "plan", attempt: 1, status: "completed" }, { stageId: "work", attempt: 1, status: "blocked" }, { stageId: "work", attempt: 2, status: "running" }];
  let events: Array<Pick<AgentRunEvent, "kind">> = [{ kind: "user-wait-started" }, { kind: "user-wait-ended" }];
  const store = {
    getAggregate: (id: string) => (id === "run-1" ? { agentRun, stages } as unknown as AgentRunAggregate : null),
    listEventsByKind: () => events as AgentRunEvent[],
  };
  expect(readPowerRun(store, "run-1")).toEqual({ state: "paused", pauseReason: "usage-limit", usageLimit: { resumeAt: "2026-11-20T04:31:00.000Z" }, stageStatus: "running", waitingOnUser: false });
  events = [...events, { kind: "user-wait-started" }];
  expect(readPowerRun(store, "run-1")?.waitingOnUser).toBe(true);
  expect(readPowerRun(store, "gone")).toBeNull();
});

test("holds one app-suspension blocker across overlapping agent and Tars work, releases on idle and shutdown", () => {
  const starts: string[] = [], stops: number[] = [];
  const controller = createWorkPowerSaveController({ start: (type) => { starts.push(type); return starts.length; }, stop: (id) => { stops.push(id); } });
  controller.update(snapshot());
  expect(starts).toEqual([]);
  controller.update(snapshot({ runs: [run(), run()] }));
  controller.update(snapshot({ runs: [run()], responsibilities: [{ state: "preparing" }] }));
  controller.update(snapshot({ responsibilities: [{ state: "running" }] }));
  expect(starts).toEqual(["prevent-app-suspension"]);
  expect(stops).toEqual([]);
  controller.update(snapshot({ runs: [run({ state: "paused", pauseReason: "paused-by-user" })], responsibilities: [{ state: "waiting" }, { state: "paused" }, { state: "resultReady" }] }));
  expect(stops).toEqual([1]);
  controller.update(snapshot({ reasoning: true }));
  expect(starts).toHaveLength(2);
  controller.dispose();
  controller.dispose();
  expect(stops).toEqual([1, 2]);
});

test("reconciles startup and reconnect from durable state, drops stale activity after disconnect and unsubscribes on shutdown", async () => {
  const { trackWorkPowerSave } = await import("../electron/main/work-power-save");
  let current = snapshot({ runs: [run()] });
  const calls: string[] = [];
  let events!: Parameters<Parameters<typeof trackWorkPowerSave>[0]["subscribe"]>[0];
  const stop = trackWorkPowerSave({
    blocker: { start: (type) => { calls.push(type); return 42; }, stop: (id) => { calls.push(`stop:${id}`); } },
    read: () => current,
    subscribe: (handlers) => { events = handlers; return [() => { calls.push("unsubscribe"); }]; },
  });
  expect(calls).toEqual(["prevent-app-suspension"]);
  events.disconnected();
  events.changed(); // The database still says running after the host died.
  expect(calls).toEqual(["prevent-app-suspension", "stop:42"]);
  current = snapshot();
  events.ready();
  expect(calls).toHaveLength(2);
  current = snapshot({ responsibilities: [{ state: "preparing" }] });
  events.changed();
  stop();
  events.changed();
  expect(calls).toEqual(["prevent-app-suspension", "stop:42", "prevent-app-suspension", "unsubscribe", "stop:42"]);
});
