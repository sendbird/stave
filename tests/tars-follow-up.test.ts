import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { actTars } from "../electron/host-service/tars-control";
import { tarsEventKey, TARS_FOLLOW_UP_WINDOW_CAP } from "../src/lib/tars/events";
import type { TarsDecisionAction } from "../src/lib/tars/conversation";
import { followUpFixture, minutes, START } from "./tars-follow-up-fixture";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture(options: Parameters<typeof followUpFixture>[0] = {}) {
  const f = followUpFixture(options);
  cleanup.push(f.close);
  return f;
}
const blocked = (detail = "The run stopped: tests fail.") => ({ state: "blocked" as const, detail });
const eventsOf = (f: ReturnType<typeof fixture>, id: string) => f.responsibilities.events.listRecent(100).filter((event) => event.responsibilityId === id);

test("scenario 10: without a new event no model call starts; an expired wait produces exactly one reasoned follow-up", async () => {
  const f = fixture(); f.service.start();
  const row = f.responsibility("running");
  for (let tick = 0; tick < 6; tick++) { await f.settle(); f.advance(minutes(5)); }
  expect(f.planner).toHaveLength(0);
  // Waiting for the user in its task is not by itself something Tars judges.
  f.observations.set(row.id, { state: "waiting", detail: "The execution task is waiting for your input or approval.", detailCode: "waitingForUser", detailParams: null });
  await f.settle();
  expect(f.responsibilities.get(row.id)?.state).toBe("waiting");
  f.advance(minutes(59)); await f.settle();
  expect(f.planner).toHaveLength(0);
  f.advance(minutes(1)); await f.settle();
  expect(f.planner).toHaveLength(1);
  expect(f.automatic().map((message) => message.origin)).toEqual([expect.objectContaining({ kind: "followUp", reason: "waitExpired", responsibilityId: row.id })]);
  expect(f.planner[0]!.input.prompt).toContain('"automaticFollowUp":{"reason":"waitExpired"');
  // The same wait never asks again, however long it lasts.
  for (let tick = 0; tick < 12; tick++) { f.advance(minutes(30)); await f.settle(); }
  expect(f.planner).toHaveLength(1);
  expect(eventsOf(f, row.id).map((event) => [event.kind, event.status])).toEqual([["waitExpired", "followedUp"]]);
  expect(f.errors).toEqual([]);
});

test("one follow-up per episode: repeated observations, new words and duplicate deliveries of one block start one turn", async () => {
  const f = fixture(); f.service.start();
  const row = f.responsibility("running");
  f.observations.set(row.id, blocked());
  await f.settle(); await f.settle();
  f.observations.set(row.id, blocked("The run stopped: tests still fail."));
  await f.settle();
  const [event] = eventsOf(f, row.id);
  expect(event).toMatchObject({ kind: "blocked", status: "followedUp" });
  expect(f.responsibilities.recordEvent({ responsibilityId: row.id, kind: "blocked", episode: event!.episode,
    observedRevision: event!.observedRevision, observedState: "blocked", attempt: event!.attempt }, f.now())).toEqual(event!);
  await f.settle();
  expect(f.planner).toHaveLength(1);
  // A new episode (it ran again, then blocked again) is followed up once more.
  f.observations.set(row.id, { state: "running", detail: null }); await f.settle();
  f.observations.set(row.id, blocked()); await f.settle();
  expect(f.planner).toHaveLength(2);
  expect(eventsOf(f, row.id).map((entry) => entry.status)).toEqual(["followedUp", "followedUp"]);
});

test("global cap: past the window cap events wait, the tray says until when, and the next window takes them", async () => {
  const f = fixture({ maxTurns: 20 }); f.service.start();
  const rows = Array.from({ length: TARS_FOLLOW_UP_WINDOW_CAP + 1 }, () => f.responsibility("blocked", { detail: "Stuck." }));
  await f.settle();
  expect(f.planner).toHaveLength(TARS_FOLLOW_UP_WINDOW_CAP);
  const last = rows.at(-1)!;
  expect(f.responsibilities.snapshot().followUps).toEqual([{ responsibilityId: last.id, kind: "blocked", status: "deferred", at: "2026-11-05T01:00:00.000Z" }]);
  f.advance(minutes(30)); await f.settle();
  expect(f.planner).toHaveLength(TARS_FOLLOW_UP_WINDOW_CAP);
  f.advance(minutes(30)); await f.settle();
  expect(f.planner).toHaveLength(TARS_FOLLOW_UP_WINDOW_CAP + 1);
  expect(f.automatic().at(-1)?.origin).toMatchObject({ kind: "followUp", responsibilityId: last.id });
  expect(f.responsibilities.snapshot().followUps).toEqual([]);
});

test("automatic turns draw from the saved shared turn limit and stop cleanly, with a notice, when it is used up", async () => {
  const f = fixture({ maxTurns: 2 }); f.service.start();
  const rows = [0, 1, 2].map(() => f.responsibility("blocked", { detail: "Stuck." }));
  await f.settle();
  expect(f.planner).toHaveLength(2);
  expect(eventsOf(f, rows[2]!.id)).toEqual([expect.objectContaining({ status: "exhausted", messageId: null })]);
  expect(f.responsibilities.snapshot().followUps).toEqual([{ responsibilityId: rows[2]!.id, kind: "blocked", status: "exhausted", at: null }]);
  expect(f.service.getConversation().events?.filter((event) => event.status === "exhausted")).toHaveLength(1);
  // Nothing retries an exhausted event.
  f.advance(minutes(120)); await f.settle();
  expect(f.planner).toHaveLength(2);
  // Once the user speaks, the limit starts again for the next change.
  await f.send("What happened to the release checks?");
  expect(f.planner).toHaveLength(3);
  expect(f.responsibilities.snapshot().followUps).toEqual([]);
  const next = f.responsibility("blocked", { detail: "Stuck." });
  await f.settle();
  expect(f.planner).toHaveLength(4);
  expect(f.automatic().at(-1)?.origin).toMatchObject({ kind: "followUp", responsibilityId: next.id });
});

test("an event never resumes or reclaims work the user took over or paused", async () => {
  const f = fixture();
  const taken = f.responsibility("running");
  f.observations.set(taken.id, blocked());
  f.runtime.requestTick(); await f.runtime.drain();
  expect(eventsOf(f, taken.id)).toEqual([expect.objectContaining({ kind: "blocked", status: "pending" })]);
  const current = f.responsibilities.get(taken.id)!;
  await actTars({ requestId: "click-takeover", responsibilityId: taken.id, expectedRevision: current.revision, operation: "takeover", source: "click" },
    { conversations: f.conversations, runtime: f.runtime, now: f.now });
  f.service.start(); await f.settle();
  // The takeover won: the event is superseded and no model call started.
  expect(f.planner).toHaveLength(0);
  expect(eventsOf(f, taken.id).map((event) => event.status)).toEqual(["superseded"]);
  // A follow-up about other work cannot hand back, resume or pause anything by itself.
  const paused = f.responsibility("paused");
  const other = f.responsibility("running");
  const actions: TarsDecisionAction[] = [
    { kind: "control", responsibilityId: taken.id, expectedRevision: f.responsibilities.get(taken.id)!.revision, operation: "handBack" },
    { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" },
    { kind: "ask", question: "Continue the paused check?", options: [
      { label: "Continue", rationale: "It is ready.", effect: { kind: "control", responsibilityId: paused.id, expectedRevision: paused.revision, operation: "resume" } },
      { label: "Wait", rationale: "Keep it paused.", effect: { kind: "reply" } }] },
  ];
  f.replies.push({ reply: "It is blocked.", actions });
  f.observations.set(other.id, blocked());
  await f.settle();
  f.observations.set(other.id, { state: "running", detail: null }); await f.settle();
  // The next block is the revision after this one; the follow-up's reply names it.
  const blockedRevision = f.responsibilities.get(other.id)!.revision + 1;
  f.replies.push({ reply: "Pausing it.", actions: [{ kind: "control", responsibilityId: other.id, expectedRevision: blockedRevision, operation: "pause" },
    { kind: "control", responsibilityId: other.id, expectedRevision: blockedRevision, operation: "resume" }] });
  f.observations.set(other.id, blocked()); await f.settle();
  const [first, second] = f.automatic();
  expect(f.conversations.listReceipts(first!.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([
    ["rejected", "notByFollowUp"], ["rejected", "notByFollowUp"], ["rejected", "notByFollowUp"]]);
  // Pause would apply at once, so it is refused; resume of blocked work only waits for the user's Confirm.
  expect(f.conversations.listReceipts(second!.id).map((receipt) => [receipt.status, receipt.reason])).toEqual([
    ["rejected", "notByFollowUp"], ["proposed", null]]);
  expect(f.responsibilities.get(taken.id)?.state).toBe("takenOver");
  expect(f.responsibilities.get(paused.id)?.state).toBe("paused");
  expect(f.responsibilities.get(other.id)?.state).toBe("blocked");
  expect(f.runControls).toEqual(["takeover"]);
});

test("restart processes unprocessed events once", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-follow-up-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "stave.sqlite");
  const before = followUpFixture({ filename });
  const rows = [before.responsibility("blocked", { detail: "Stuck." }), before.responsibility("blocked", { detail: "Stuck." })];
  // Stave stopped before main processed them.
  await before.close();
  const after = fixture({ filename }); after.service.start(); await after.settle();
  expect(after.planner).toHaveLength(2);
  expect(rows.map((row) => eventsOf(after, row.id).map((event) => event.status))).toEqual([["followedUp"], ["followedUp"]]);
  await after.close();
  const again = fixture({ filename }); again.service.start(); await again.settle();
  expect(again.planner).toHaveLength(0);
  expect(again.automatic()).toHaveLength(2);
});

test("events coalesce per responsibility into the newest change that still stands", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Stuck." });
  const reran = f.responsibilities.patch(row.id, row.revision, { state: "running", detail: null }, f.now());
  f.responsibilities.patch(reran.id, reran.revision, { state: "blocked", detail: "Stuck again." }, f.now());
  f.service.start(); await f.settle();
  expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["coalesced", "followedUp"]);
  expect(f.planner).toHaveLength(1);
});

test("a change the user already spoke about starts no follow-up", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Stuck." });
  const reran = f.responsibilities.patch(row.id, row.revision, { state: "running", detail: null }, f.now());
  f.responsibilities.patch(reran.id, reran.revision, { state: "blocked", detail: "Stuck again." }, f.now());
  const quiet = f.responsibility("blocked", { detail: "Stuck." });
  f.advance(minutes(1));
  f.conversations.create({ requestId: "typed", text: "Why is the second check stuck?" }, f.now());
  // Only the second responsibility's change predates the user's words; the first one changed again after them.
  f.advance(minutes(1));
  const again = f.responsibilities.get(row.id)!;
  const moved = f.responsibilities.patch(again.id, again.revision, { state: "running", detail: null }, f.now());
  f.responsibilities.patch(moved.id, moved.revision, { state: "blocked", detail: "Stuck a third time." }, f.now());
  f.service.start(); await f.settle();
  // Its first two blocks predate the user's words, which covered them; the newest one is followed up once.
  expect(eventsOf(f, row.id).map((event) => event.status)).toEqual(["superseded", "superseded", "followedUp"]);
  expect(eventsOf(f, quiet.id).map((event) => event.status)).toEqual(["superseded"]);
  // The user's own message and one follow-up.
  expect(f.planner).toHaveLength(2);
  expect(f.automatic().map((message) => message.origin)).toEqual([expect.objectContaining({ responsibilityId: row.id,
    eventKey: tarsEventKey(eventsOf(f, row.id).at(-1)!) })]);
  expect(Date.parse(f.now()) - Date.parse(START)).toBe(minutes(2));
});
