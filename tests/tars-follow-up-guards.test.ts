import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { admitTarsFollowUps, claimTarsMessage, releaseTarsFollowUpStart, supersedeStaleTarsFollowUp } from "../electron/main/tars-follow-up";
import { processTarsMessage } from "../electron/main/tars-planner";
import { TARS_FOLLOW_UP_WINDOW_CAP } from "../src/lib/tars/events";
import { tarsTrayFollowUp, tarsTrayNextFollowUpChange } from "../src/lib/tars/tray-model";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";
import { REGISTRY, testContext } from "./tars-test-context";

// Guards on the automatic follow-up budget and its rechecks: the window
// counts planner starts, a follow-up never runs after the user addressed its work or after
// a newer change, a valid event is never hidden behind a page of stale ones,
// a new run turn restarts the quiet wait, and past times leave the tray.

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture(options: Parameters<typeof followUpFixture>[0] = {}) {
  const f = followUpFixture(options);
  cleanup.push(f.close);
  return f;
}
type Fixture = ReturnType<typeof fixture>;
const blocked = (detail = "The run stopped: tests fail.") => ({ state: "blocked" as const, detail });
const eventsOf = (f: Fixture, id: string) => f.responsibilities.events.listRecent(500).filter((event) => event.responsibilityId === id);
const hostTick = async (f: Fixture) => { f.runtime.requestTick(); await f.runtime.drain(); };
/** Admission without the conversation queue, as when main was not running to start the messages. */
const admitOnly = (f: Fixture) => admitTarsFollowUps({ events: f.responsibilities.events, conversations: f.conversations,
  responsibilities: f.responsibilities, now: f.now, reaskable: () => new Map() });

/** Captures the service's long timers (the follow-up window) so a test can fire them on the fake clock. */
function captureWindowTimers() {
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  const timers = new Map<number, { run: () => void; delay: number }>();
  let next = 1;
  globalThis.setTimeout = ((run: () => void, delay?: number, ...rest: unknown[]) => {
    if ((delay ?? 0) < minutes(30)) return realSet(run, delay, ...rest);
    const id = next++;
    timers.set(id, { run, delay: delay ?? 0 });
    return { id, unref() { return this; }, ref() { return this; }, hasRef: () => false, refresh() { return this; },
      [Symbol.toPrimitive]: () => id } as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((handle?: unknown) => {
    const id = (handle as { id?: number } | undefined)?.id;
    if (id !== undefined && timers.has(id)) timers.delete(id);
    else realClear(handle as Parameters<typeof clearTimeout>[0]);
  }) as typeof clearTimeout;
  cleanup.push(() => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; });
  return timers;
}

describe("the window counts planner starts", () => {
  test("follow-ups queued long ago start within the cap, and the window timer starts the rest without a manual wake", async () => {
    const timers = captureWindowTimers();
    const f = fixture({ maxTurns: 50 });
    const late = Array.from({ length: TARS_FOLLOW_UP_WINDOW_CAP }, () => f.responsibility("running"));
    for (const row of late) f.observations.set(row.id, blocked());
    await hostTick(f);
    // Main admitted them but did not start them: they wait queued for two hours.
    expect(admitOnly(f).created).toBe(TARS_FOLLOW_UP_WINDOW_CAP);
    f.advance(minutes(120));
    const fresh = Array.from({ length: TARS_FOLLOW_UP_WINDOW_CAP }, () => f.responsibility("running"));
    for (const row of fresh) f.observations.set(row.id, blocked());
    await hostTick(f);
    f.service.start(); await f.service.whenIdle();
    // Before, the old messages were outside the window by creation time and twelve planner calls started at once.
    expect(f.planner).toHaveLength(TARS_FOLLOW_UP_WINDOW_CAP);
    expect(fresh.flatMap((row) => eventsOf(f, row.id).map((event) => event.status))).toEqual(fresh.map(() => "pending"));
    // The real timer path: the window timer, not a test call, starts the rest once it opens.
    const [timer] = [...timers.values()];
    expect(timers.size).toBe(1);
    expect(timer!.delay).toBe(minutes(60) + 1_000);
    f.advance(timer!.delay);
    timer!.run();
    await f.service.whenIdle();
    expect(f.planner).toHaveLength(2 * TARS_FOLLOW_UP_WINDOW_CAP);
    expect(f.errors).toEqual([]);
  });

  test("a start is recorded with its claim, once, and refused when the window is full", () => {
    const f = fixture({ maxTurns: 50 });
    const events = f.responsibilities.events;
    for (let index = 0; index < TARS_FOLLOW_UP_WINDOW_CAP; index++) expect(events.recordStart(`message-${index}`, f.now())).toBe(true);
    expect(events.recordStart("message-0", f.now())).toBe(true);
    expect(events.recordStart("one-more", f.now())).toBe(false);
    expect(events.startWindowOpening(f.now())).toBe(new Date(Date.parse(f.now()) + minutes(60)).toISOString());
    f.advance(minutes(60) + 1);
    expect(events.startWindowOpening(f.now())).toBeNull();
  });
});

describe("rechecks right before the model call", () => {
  test("an unrelated message does not cancel an already queued follow-up", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, blocked()); await hostTick(f);
    expect(admitOnly(f).created).toBe(1);
    f.advance(1_000);
    f.conversations.create({ requestId: "user-words", text: "What is a workspace?" }, f.now());
    f.service.start(); await f.settle();
    expect(f.planner).toHaveLength(2);
    expect(f.planner[1]!.input.prompt).not.toContain('"automaticFollowUp"');
    expect(f.automatic().map((message) => message.state)).toEqual(["answered"]);
    expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["followedUp"]);
  });

  test("a queued follow-up whose work changed again yields to the newer episode", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, blocked()); await hostTick(f);
    expect(admitOnly(f).created).toBe(1);
    // The work ran again and blocked again: a newer episode is pending behind the queued one.
    f.observations.set(row.id, { state: "running", detail: null }); await hostTick(f);
    f.observations.set(row.id, blocked("The run stopped again.")); await hostTick(f);
    f.service.start(); await f.settle();
    expect(f.planner).toHaveLength(1);
    expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["superseded", "followedUp"]);
    expect(f.automatic().map((message) => message.state)).toEqual(["cancelled", "answered"]);
  });

  test("after the asynchronous claim, a user control on that work cancels its follow-up before execution", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, blocked()); await hostTick(f);
    admitOnly(f);
    const message = f.conversations.listQueued(1)[0]!;
    const calls: string[] = [];
    const coordinator = {
      claim: async () => {
        calls.push("claim");
        // The user takes responsibility for this exact work while its planner step is admitted.
        f.conversations.recordAction({ requestId: "user-during-claim", responsibilityId: row.id,
          expectedRevision: f.responsibilities.get(row.id)!.revision, operation: "takeover", source: "click" }, f.now());
        return { accepted: true, aggregate: { step: { executionId: "execution-1" } } };
      },
      execute: async () => { calls.push("execute"); throw new Error("must not run"); },
      cancel: async () => { calls.push("cancel"); return { accepted: true }; },
      complete: async () => ({ accepted: true }), fail: async () => ({ accepted: true }),
    } as unknown as Parameters<typeof processTarsMessage>[1]["coordinator"];
    f.advance(1_000);
    const ports = { events: f.responsibilities.events, conversations: f.conversations, responsibilities: f.responsibilities, now: f.now };
    await processTarsMessage(message.id, { conversations: f.conversations, coordinator, now: f.now,
      context: async () => testContext(f.responsibilities, REGISTRY),
      supersedeStale: (id) => supersedeStaleTarsFollowUp(ports, id),
      claim: (id, revision, at) => claimTarsMessage(ports, id, revision, at) });
    expect(calls).toEqual(["claim", "cancel"]);
    expect(f.conversations.get(message.id)?.state).toBe("cancelled");
    expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["superseded"]);
  });
});

test("a valid event behind a full page of stale ones is still followed up", async () => {
  const f = fixture(); f.service.start();
  const stale = Array.from({ length: 64 }, () => f.responsibility("running"));
  const valid = f.responsibility("running");
  for (const row of [...stale, valid]) f.observations.set(row.id, blocked());
  await hostTick(f);
  // The first 64 stop standing before main looks; only the 65th still needs judgment.
  for (const row of stale) f.observations.set(row.id, { state: "running", detail: null });
  await hostTick(f);
  await f.settle();
  expect(f.planner).toHaveLength(1);
  expect(f.automatic()[0]?.origin).toMatchObject({ kind: "followUp", responsibilityId: valid.id });
  expect(stale.flatMap((row) => eventsOf(f, row.id).map((event) => event.status))).toEqual(stale.map(() => "superseded"));
});

test("a new run turn restarts the quiet wait even when the wait looks the same", async () => {
  const f = fixture(); f.service.start();
  const row = f.responsibility("running");
  const waiting = (runTurns: number) => ({ state: "waiting" as const, detail: "The execution task is waiting for your input or approval.",
    detailCode: "waitingForUser" as const, detailParams: null, runTurns });
  f.observations.set(row.id, waiting(3)); await f.settle();
  f.advance(minutes(50));
  // Between two looks the run took a turn and came back to the same wait.
  f.observations.set(row.id, waiting(4)); await f.settle();
  expect(f.responsibilities.get(row.id)).toMatchObject({ state: "waiting", observedTurns: 4 });
  f.advance(minutes(15)); await f.settle();
  expect(f.planner).toHaveLength(0);
  f.advance(minutes(45)); await f.settle();
  expect(f.automatic().map((message) => message.origin?.kind === "followUp" ? message.origin.reason : null)).toEqual(["waitExpired"]);
});

describe("the tray shows no time that has passed", () => {
  const row = { id: "r1", state: "blocked" } as TarsResponsibility;
  const now = "2026-11-05T02:00:00.000Z";
  test("a deferral whose window opened reads as about to follow up, and a past next check shows nothing", () => {
    expect(tarsTrayFollowUp(row, [{ responsibilityId: "r1", kind: "blocked", status: "deferred", at: "2026-11-05T01:59:00.000Z" }], now))
      .toEqual({ status: "pending", at: null });
    expect(tarsTrayFollowUp(row, [{ responsibilityId: "r1", kind: "blocked", status: "deferred", at: "2026-11-05T02:30:00.000Z" }], now))
      .toEqual({ status: "deferred", at: "2026-11-05T02:30:00.000Z" });
    expect(tarsTrayFollowUp({ ...row, state: "waiting" }, [{ responsibilityId: "r1", kind: "waitExpired", status: "nextCheck", at: now }], now)).toBeNull();
  });
  test("the view recomputes at the earliest future next check or deferral", () => {
    expect(tarsTrayNextFollowUpChange([
      { responsibilityId: "a", kind: "waitExpired", status: "nextCheck", at: "2026-11-05T03:00:00.000Z" },
      { responsibilityId: "b", kind: "blocked", status: "deferred", at: "2026-11-05T02:20:00.000Z" },
      { responsibilityId: "c", kind: "waitExpired", status: "nextCheck", at: "2026-11-05T01:00:00.000Z" },
      { responsibilityId: "d", kind: "blocked", status: "following", at: null },
    ], now)).toBe("2026-11-05T02:20:00.000Z");
    expect(tarsTrayNextFollowUpChange([], now)).toBeNull();
  });
});

test("cancelled follow-ups take no start: a new change right after them is followed up at once", async () => {
  const f = fixture({ maxTurns: 50 });
  const queued = Array.from({ length: TARS_FOLLOW_UP_WINDOW_CAP }, () => f.responsibility("running"));
  for (const row of queued) f.observations.set(row.id, blocked());
  await hostTick(f);
  expect(admitOnly(f).created).toBe(TARS_FOLLOW_UP_WINDOW_CAP);
  f.advance(1_000);
  f.conversations.create({ requestId: "user-words", text: "I will look at these myself." }, f.now());
  for (const row of queued) f.conversations.recordAction({ requestId: `takeover-${row.id}`, responsibilityId: row.id,
    expectedRevision: f.responsibilities.get(row.id)!.revision, operation: "takeover", source: "click" }, f.now());
  f.advance(1_000);
  const fresh = f.responsibility("running");
  f.observations.set(fresh.id, blocked()); await hostTick(f);
  f.service.start(); await f.settle();
  // The six are cancelled without a model call and leave no start behind.
  expect(f.automatic().filter((message) => message.state === "cancelled")).toHaveLength(TARS_FOLLOW_UP_WINDOW_CAP);
  // The user's message and the new change both reach the model now, not an hour later.
  expect(f.planner).toHaveLength(2);
  expect(eventsOf(f, fresh.id).map((event) => event.status)).toEqual(["followedUp"]);
  expect(f.responsibilities.events.startWindowOpening(f.now())).toBeNull();
});

describe("each ask is its own episode", () => {
  const ask = (runTurns: number, detail: string, runStage = "work#1") => ({ state: "waiting" as const, detail, stageAsksUser: true, runTurns, runStage });

  test("a run that continued and asked again between two looks gets a second follow-up; the same turn does not", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    f.observations.set(row.id, ask(3, "Which database should the export use?")); await f.settle();
    expect(f.planner).toHaveLength(1);
    // Unobserved: the user answered in the task, the run took a turn and asked something else.
    f.observations.set(row.id, ask(4, "Which region should the export use?")); await f.settle();
    expect(f.planner).toHaveLength(2);
    // The same turn seen again, even with new words, is the same ask.
    f.observations.set(row.id, ask(4, "Still waiting: which region should the export use?")); await f.settle(); await f.settle();
    expect(f.planner).toHaveLength(2);
    // A new attempt of the stage is a new ask too.
    f.observations.set(row.id, ask(4, "Which region should the export use?", "work#2")); await f.settle();
    expect(f.planner).toHaveLength(3);
    expect(eventsOf(f, row.id).map((event) => [event.kind, event.status])).toEqual([
      ["stageAsksUser", "followedUp"], ["stageAsksUser", "followedUp"], ["stageAsksUser", "followedUp"]]);
  });

  test("an ask whose follow-up never reached the model still gets the quiet-wait follow-up", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, ask(3, "Which database should the export use?"));
    await hostTick(f);
    f.advance(1_000);
    // The user wrote to Tars about it, so the immediate follow-up is superseded.
    f.conversations.create({ requestId: "user-words", text: "I saw the question." }, f.now());
    f.conversations.recordAction({ requestId: "look-at-question", responsibilityId: row.id,
      expectedRevision: f.responsibilities.get(row.id)!.revision, operation: "resume", source: "click" }, f.now());
    f.service.start(); await f.settle();
    expect(eventsOf(f, row.id).map((event) => [event.kind, event.status])).toEqual([["stageAsksUser", "superseded"]]);
    expect(f.planner).toHaveLength(1);
    f.advance(minutes(60)); await f.settle();
    expect(f.planner).toHaveLength(2);
    expect(f.automatic().at(-1)?.origin).toMatchObject({ kind: "followUp", reason: "waitExpired", responsibilityId: row.id });
  });
});

describe("a queued ask is not yet covered", () => {
  const ask = { state: "waiting" as const, detail: "Which database should the export use?", stageAsksUser: true, runTurns: 3, runStage: "work#1" };

  test("an ask queued but not run for 61 minutes gets exactly one model call when processing resumes", async () => {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, ask); await hostTick(f);
    expect(admitOnly(f).created).toBe(1);
    f.advance(minutes(61));
    await hostTick(f);
    f.service.start(); await f.settle();
    expect(f.planner).toHaveLength(1);
    for (let tick = 0; tick < 12; tick++) { f.advance(minutes(15)); await f.settle(); }
    expect(f.planner).toHaveLength(1);
    expect(f.errors).toEqual([]);
  });

  test("the same holds across a restart in the middle", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tars-ask-restart-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, "tars.db");
    const first = followUpFixture({ filename });
    const row = first.responsibility("running");
    first.observations.set(row.id, ask); await hostTick(first);
    expect(admitOnly(first).created).toBe(1);
    await first.close();
    const second = fixture({ filename });
    second.observations.set(row.id, ask);
    second.advance(minutes(61));
    await hostTick(second);
    second.service.start(); await second.settle();
    expect(second.planner).toHaveLength(1);
    for (let tick = 0; tick < 12; tick++) { second.advance(minutes(15)); await second.settle(); }
    expect(second.planner).toHaveLength(1);
  });

  test("an ask followed up before a restart is not followed up again after the hourly start log is pruned", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "tars-ask-pruned-"));
    cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
    const filename = path.join(directory, "tars.db");
    const first = followUpFixture({ filename });
    const row = first.responsibility("running");
    first.observations.set(row.id, ask);
    first.service.start(); await first.settle();
    expect(first.planner).toHaveLength(1);
    await first.close();
    // Restart 61 minutes later with the same ask still standing; startup prunes the start log.
    const second = fixture({ filename });
    second.observations.set(row.id, ask);
    second.advance(minutes(61));
    second.service.start(); await second.settle();
    expect(second.responsibilities.events.startWindowOpening(second.now())).toBeNull();
    for (let tick = 0; tick < 12; tick++) { second.advance(minutes(15)); await second.settle(); }
    expect(second.planner).toHaveLength(0);
    expect(eventsOf(second, row.id).map((event) => [event.kind, event.status])).toEqual([["stageAsksUser", "followedUp"], ["waitExpired", "settled"]]);
  });

  test("bookkeeping rows are not a newer change", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    f.observations.set(row.id, ask); await f.settle();
    expect(f.planner).toHaveLength(1);
    f.advance(minutes(61)); await f.settle();
    const [asked, wait] = eventsOf(f, row.id);
    expect([asked?.status, wait?.kind, wait?.status]).toEqual(["followedUp", "waitExpired", "settled"]);
    expect(f.responsibilities.events.hasNewerChange(asked!.key)).toBe(false);
  });
});

describe("a follow-up that ends before its model call releases its start", () => {
  const ask = { state: "waiting" as const, detail: "Which database should the export use?", stageAsksUser: true, runTurns: 3, runStage: "work#1" };
  async function endBeforeModel(during: (f: Fixture, messageId: string) => void) {
    const f = fixture();
    const row = f.responsibility("running");
    f.observations.set(row.id, ask); await hostTick(f);
    admitOnly(f);
    const message = f.conversations.listQueued(1)[0]!;
    const calls: string[] = [];
    const coordinator = {
      claim: async () => { calls.push("claim"); return { accepted: true, aggregate: { step: { executionId: "execution-1" } } }; },
      execute: async () => { calls.push("execute"); throw new Error("must not run"); },
      cancel: async () => { calls.push("cancel"); return { accepted: true }; },
      complete: async () => ({ accepted: true }), fail: async () => { calls.push("fail"); return { accepted: true }; },
    } as unknown as Parameters<typeof processTarsMessage>[1]["coordinator"];
    const ports = { events: f.responsibilities.events, conversations: f.conversations, responsibilities: f.responsibilities, now: f.now };
    await processTarsMessage(message.id, { conversations: f.conversations, coordinator, now: f.now,
      context: async () => { during(f, message.id); return testContext(f.responsibilities, REGISTRY); },
      supersedeStale: (id) => supersedeStaleTarsFollowUp(ports, id),
      claim: (id, revision, at) => claimTarsMessage(ports, id, revision, at),
      releaseStart: (id) => releaseTarsFollowUpStart(ports, id) });
    expect(calls).not.toContain("execute");
    const [event] = eventsOf(f, row.id);
    expect(event?.startedAt ?? null).toBeNull();
    expect(f.responsibilities.events.askCovered(row.id)).toBe(false);
    // The one-hour wait still follows the ask up, exactly once.
    f.advance(minutes(61));
    f.service.start(); await f.settle();
    for (let tick = 0; tick < 12; tick++) { f.advance(minutes(15)); await f.settle(); }
    expect(f.planner).toHaveLength(1);
    expect(f.automatic().at(-1)?.origin).toMatchObject({ kind: "followUp", reason: "waitExpired", responsibilityId: row.id });
    return { f, message };
  }

  test("the user cancels it while its context is read", async () => {
    const { f, message } = await endBeforeModel((fx, id) => {
      const current = fx.conversations.get(id)!;
      fx.conversations.cancel(id, current.revision, fx.now());
    });
    expect(f.conversations.get(message.id)?.state).toBe("cancelled");
  });

  test("an error before the call", async () => {
    const { f, message } = await endBeforeModel(() => { throw new Error("context unavailable"); });
    expect(f.conversations.get(message.id)?.state).toBe("failed");
  });
});
