import { expect, test } from "bun:test";
import type { AgentRun } from "../src/lib/agent-runs/domain";
import {
  createWorkPowerSaveController, hasActivePowerWork, readPowerRun, trackWorkPowerSave, WORK_POWER_RESYNC_MS,
  type PowerRun, type PowerTurn, type WorkPowerSignals, type WorkPowerSnapshot,
} from "../electron/main/work-power-save";

const snapshot = (patch: Partial<WorkPowerSnapshot> = {}): WorkPowerSnapshot => ({ turns: [], secretWaitTurnIds: new Set(), runs: [], responsibilities: [], reasoning: false, ...patch });
const run = (patch: Partial<PowerRun> = {}): PowerRun => ({ state: "running", pauseReason: null, stage: { status: "running", blockReason: null }, waitingOnUser: false, ...patch });
const usageWait = (resumeAt: string | null) => run({ state: "paused", pauseReason: "usage-limit", usageLimit: { resumeAt } });
const turn = (turnId: string, awaitingUser?: true): PowerTurn => ({ turnId, ...(awaitingUser ? { awaitingUser } : {}) });

test("work that runs now or that Stave resumes by itself keeps the Mac awake", () => {
  // A plain task turn in flight, with no Agent and no Run.
  expect(hasActivePowerWork(snapshot({ turns: [turn("t1")] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ runs: [run()] }))).toBe(true);
  // A usage-limit pause under a reservation: Stave continues the run at its resume time,
  // or reads usage again five minutes after the pause when the reset is unknown.
  expect(hasActivePowerWork(snapshot({ runs: [usageWait("2026-11-20T04:31:00.000Z")] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ runs: [usageWait(null)] }))).toBe(true);
  // Local MCP reporting dropped: the supervisor restarts the stage once it is back.
  expect(hasActivePowerWork(snapshot({ runs: [run({ stage: { status: "blocked", blockReason: "reporting-unavailable" } })] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ responsibilities: [{ state: "preparing" }] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ responsibilities: [{ state: "running" }] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ reasoning: true }))).toBe(true);
});

test("work that only waits for a person lets the Mac sleep", () => {
  expect(hasActivePowerWork(snapshot())).toBe(false);
  // A turn held open by an approval or a blocking question.
  expect(hasActivePowerWork(snapshot({ turns: [turn("t1", true)] }))).toBe(false);
  // A turn whose only wait is a stave_request_secret card.
  expect(hasActivePowerWork(snapshot({ turns: [turn("t1")], secretWaitTurnIds: new Set(["t1"]) }))).toBe(false);
  // A running Run whose lead task holds an approval, question or sign-off open.
  expect(hasActivePowerWork(snapshot({ runs: [run({ waitingOnUser: true })] }))).toBe(false);
  expect(hasActivePowerWork(snapshot({ runs: [run({ stage: { status: "awaiting-sign-off", blockReason: null } })] }))).toBe(false);
  expect(hasActivePowerWork(snapshot({ runs: [run({ stage: { status: "stuck", blockReason: null } })] }))).toBe(false);
  for (const blockReason of ["agent-blocked", "action-failed", "acceptance-unmet"] as const) {
    expect(hasActivePowerWork(snapshot({ runs: [run({ stage: { status: "blocked", blockReason } })] }))).toBe(false);
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
  expect(hasActivePowerWork(snapshot({ turns: [turn("t1", true), turn("t2")], runs: [run({ waitingOnUser: true })] }))).toBe(true);
  expect(hasActivePowerWork(snapshot({ turns: [turn("t1"), turn("t2")], secretWaitTurnIds: new Set(["t1"]) }))).toBe(true);
});

test("reads only the current stage's latest attempt and the latest user-wait marker", () => {
  const agentRun = { id: "run-1", state: "paused", pauseReason: "usage-limit", currentStageIndex: 1,
    usageLimit: { turnId: "t", resetsAt: null, resumeAt: "2026-11-20T04:31:00.000Z", accountProfileId: "a", fingerprint: {} },
    workflow: { stages: [{ id: "plan" }, { id: "work" }] } } as unknown as AgentRun;
  const reads: string[] = [];
  let latestKind: "user-wait-started" | "user-wait-ended" | null = "user-wait-ended";
  const store = {
    getLatestStageRecord: (id: string, stageId: string) => { reads.push(`${id}/${stageId}`); return { status: "blocked" as const, blockReason: "reporting-unavailable" as const }; },
    latestEventKind: () => latestKind,
  };
  expect(readPowerRun(store, agentRun)).toEqual({ state: "paused", pauseReason: "usage-limit", usageLimit: { resumeAt: "2026-11-20T04:31:00.000Z" }, stage: { status: "blocked", blockReason: "reporting-unavailable" }, waitingOnUser: false });
  expect(reads).toEqual(["run-1/work"]);
  latestKind = "user-wait-started";
  expect(readPowerRun(store, agentRun).waitingOnUser).toBe(true);
  latestKind = null;
  expect(readPowerRun({ ...store, getLatestStageRecord: () => null }, agentRun)).toMatchObject({ stage: null, waitingOnUser: false });
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

/** A tracker over fake sources: the host answers each live-turn read with `host.turns`. */
function harness(initial: { runs?: PowerRun[] } = {}) {
  const host: { turns: PowerTurn[] | "unreachable"; pulls: number } = { turns: [], pulls: 0 };
  const state = { runs: initial.runs ?? [], runReads: 0, secretWaits: new Set<string>(), held: false, starts: 0, unsubscribed: 0 };
  let signals!: WorkPowerSignals;
  let tick!: () => void;
  const stop = trackWorkPowerSave({
    blocker: { start: () => { state.held = true; state.starts += 1; return state.starts; }, stop: () => { state.held = false; } },
    readRuns: () => { state.runReads += 1; return state.runs; },
    readTars: () => ({ responsibilities: [], reasoning: false }),
    readSecretWaitTurnIds: () => state.secretWaits,
    pullTurns: async () => {
      host.pulls += 1;
      if (host.turns === "unreachable") throw new Error("timed out");
      return host.turns;
    },
    subscribe: (handlers) => { signals = handlers; return [() => { state.unsubscribed += 1; }]; },
    every: (callback, ms) => { expect(ms).toBe(WORK_POWER_RESYNC_MS); tick = callback; return () => { tick = () => {}; }; },
  });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { host, state, signals: () => signals, tick: () => tick(), stop, settle };
}

test("a dropped live-turn hint heals on the next resync in both directions", async () => {
  const h = harness();
  h.signals().ready();
  await h.settle();
  expect(h.state.held).toBe(false);
  // A turn starts but its hint is lost under host backlog.
  h.host.turns = [turn("t1")];
  await h.settle();
  expect(h.state.held).toBe(false);
  h.tick();
  await h.settle();
  expect(h.state.held).toBe(true);
  // The turn ends and that hint is lost too.
  h.host.turns = [];
  await h.settle();
  expect(h.state.held).toBe(true);
  h.tick();
  await h.settle();
  expect(h.state.held).toBe(false);
  h.stop();
});

test("a hint is only a reason to read again, and a turn change never re-reads runs", async () => {
  const h = harness();
  h.signals().ready();
  await h.settle();
  const runReads = h.state.runReads;
  h.host.turns = [turn("t1")];
  // Several hints while one read is in flight collapse into one more read.
  h.signals().turnsChanged();
  h.signals().turnsChanged();
  h.signals().turnsChanged();
  await h.settle();
  await h.settle();
  expect(h.state.held).toBe(true);
  expect(h.host.pulls).toBe(3); // ready, the first hint, one catch-up for the rest
  expect(h.state.runReads).toBe(runReads);
  // A secret card on that turn releases it without asking the host again.
  h.state.secretWaits = new Set(["t1"]);
  h.signals().secretsChanged();
  expect(h.state.held).toBe(false);
  expect(h.host.pulls).toBe(3);
  h.stop();
});

test("a host restart or an unanswering host drops its turns instead of holding the Mac awake", async () => {
  const h = harness();
  h.signals().ready();
  h.host.turns = [turn("t1")];
  h.signals().turnsChanged();
  await h.settle();
  await h.settle();
  expect(h.state.held).toBe(true);
  // The host dies mid-turn: its turns died with it.
  h.signals().disconnected();
  expect(h.state.held).toBe(false);
  h.tick();
  await h.settle();
  expect(h.state.held).toBe(false);
  // The respawned host is read on its handshake; a turn it already runs is picked up.
  h.host.turns = [turn("t2")];
  h.signals().ready();
  await h.settle();
  expect(h.state.held).toBe(true);
  // A host that stops answering contributes nothing.
  h.host.turns = "unreachable";
  h.tick();
  await h.settle();
  expect(h.state.held).toBe(false);
  h.stop();
});

test("a read that answers after the host went away is ignored", async () => {
  let answer!: (turns: PowerTurn[]) => void;
  let held = false;
  let signals!: WorkPowerSignals;
  const stop = trackWorkPowerSave({
    blocker: { start: () => { held = true; return 1; }, stop: () => { held = false; } },
    readRuns: () => [], readTars: () => ({ responsibilities: [], reasoning: false }), readSecretWaitTurnIds: () => new Set(),
    pullTurns: () => new Promise((resolve) => { answer = resolve; }),
    subscribe: (handlers) => { signals = handlers; return []; },
    every: () => () => {},
  });
  signals.ready();
  signals.disconnected();
  answer([turn("t1")]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(held).toBe(false);
  stop();
});

test("reconciles startup and reconnect from durable state, drops stale activity after disconnect and unsubscribes on shutdown", async () => {
  const h = harness({ runs: [run()] });
  expect(h.state.held).toBe(true);
  h.signals().disconnected();
  h.signals().runsChanged(); // The database still says running after the host died.
  expect(h.state.held).toBe(false);
  h.state.runs = [];
  h.signals().ready();
  await h.settle();
  expect(h.state.held).toBe(false);
  h.state.runs = [run()];
  h.signals().runsChanged();
  expect(h.state.held).toBe(true);
  h.stop();
  expect(h.state.held).toBe(false);
  expect(h.state.unsubscribed).toBe(1);
  h.signals().runsChanged();
  expect(h.state.held).toBe(false);
});
