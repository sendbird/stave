import { afterEach, expect, test } from "bun:test";
import { actTars } from "../electron/host-service/tars-control";
import { admitTarsFollowUps } from "../electron/main/tars-follow-up";
import { tarsTrayFollowUp } from "../src/lib/tars/tray-model";
import { TARS_EVENT_RETENTION_MS, TARS_FOLLOW_UP_CAP, TARS_WAIT_FOLLOW_UP_MS } from "../src/lib/tars/events";
import type { TarsDecisionAction } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture(options: Parameters<typeof followUpFixture>[0] = {}) {
  const f = followUpFixture(options);
  cleanup.push(f.close);
  return f;
}
const receipts = (f: ReturnType<typeof fixture>, index = -1) => f.conversations.listReceipts(f.automatic().at(index)!.id)
  .map((receipt) => [receipt.action.kind, receipt.status, receipt.reason]);
const click = (f: ReturnType<typeof fixture>, row: TarsResponsibility, operation: "pause" | "takeover" | "cancel", requestId: string) =>
  actTars({ requestId, responsibilityId: row.id, expectedRevision: f.responsibilities.get(row.id)!.revision, operation, source: "click" },
    { conversations: f.conversations, runtime: f.runtime, now: f.now });

test("an automatic follow-up never delegates; it can only ask whether the user wants new work", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Stuck." });
  f.replies.push({ reply: "Shall I start a fix?", actions: [
    { kind: "delegate", workspaceId: "source", title: "Fix it", instruction: "Fix the failing step.", acceptanceCriteria: ["It passes."], priority: 50 },
    { kind: "ask", question: "Start new work to fix the failing step?", options: [
      { label: "Start new work", rationale: "Tars plans it after your answer.", effect: { kind: "reply" } },
      { label: "Not now", rationale: "Keep it blocked.", effect: { kind: "reply" } }] }] });
  f.service.start(); await f.settle();
  expect(receipts(f)).toEqual([["delegate", "rejected", "notByFollowUp"], ["ask", "proposed", null]]);
  expect(f.responsibilities.snapshot().responsibilities.map((entry) => entry.id)).toEqual([row.id]);
});

test("work taken over while the planner ran is refused at admission, whatever the follow-up proposes", async () => {
  let taken: TarsResponsibility | null = null;
  const f = fixture({ duringPlanner: async () => { if (taken) await click(f, taken, "takeover", "click-takeover"); } });
  taken = f.responsibility("blocked", { detail: "Stuck." });
  const ended = f.responsibility("completed");
  const blockedRevision = taken.revision;
  const actions: TarsDecisionAction[] = [
    { kind: "control", responsibilityId: taken.id, expectedRevision: blockedRevision, operation: "resume" },
    { kind: "reprioritize", responsibilityId: taken.id, expectedRevision: blockedRevision, priority: 90 },
    { kind: "show", responsibilityId: ended.id, view: "report" },
  ];
  f.replies.push({ reply: "Resume it?", actions });
  f.service.start(); await f.settle();
  expect(f.planner).toHaveLength(1);
  expect(receipts(f)).toEqual([["control", "rejected", "notByFollowUp"], ["reprioritize", "rejected", "notByFollowUp"], ["show", "rejected", "notByFollowUp"]]);
  expect(f.responsibilities.get(taken.id)?.state).toBe("takenOver");
  expect(f.runControls).toEqual(["takeover"]);
});

test("an unverified-completion follow-up does not repeat Stave's own accept-or-cancel card", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Reported without a check.", detailCode: "unverifiedCompletion" });
  f.replies.push({ reply: "Stave could not verify it.", actions: [
    { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "acceptCompletion" },
    { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "cancel" },
    { kind: "ask", question: "Accept it?", options: [
      { label: "Accept", rationale: "Done.", effect: { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "acceptCompletion" } },
      { label: "Explain", rationale: "Tell me more.", effect: { kind: "reply" } }] }] });
  f.service.start(); await f.settle();
  expect(receipts(f)).toEqual([["control", "rejected", "notByFollowUp"], ["control", "rejected", "notByFollowUp"], ["ask", "rejected", "notByFollowUp"]]);
  expect(f.responsibilities.snapshot().pendingDecisions.map((decision) => decision.kind)).toEqual(["unverifiedCompletion"]);
});

test("a follow-up whose change stopped standing before the model call is cancelled without a model call", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Stuck." });
  // Admitted while blocked, then the user paused it before the queue reached the follow-up.
  admitTarsFollowUps({ events: f.responsibilities.events, conversations: f.conversations, responsibilities: f.responsibilities,
    reaskable: () => new Map(), now: f.now });
  await click(f, row, "pause", "click-pause");
  f.service.start(); await f.settle();
  expect(f.planner).toHaveLength(0);
  expect(f.automatic().map((message) => message.state)).toEqual(["cancelled"]);
  expect(f.responsibilities.events.listRecent(5).map((event) => [event.kind, event.status])).toEqual([["blocked", "superseded"]]);
  expect(f.service.getConversation().messages.at(-1)?.origin?.kind).toBe("followUp");
});

test("any user action restarts the automatic-turn count: a control click as much as a typed message", async () => {
  const f = fixture({ maxTurns: 1 }); f.service.start();
  // Exhaust the independent follow-up cap, leaving room in the hourly window for recovery.
  for (let index = 0; index < TARS_FOLLOW_UP_CAP; index++) {
    f.responsibility("blocked", { detail: "Stuck." }); await f.settle();
    f.advance(minutes(61));
  }
  const second = f.responsibility("blocked", { detail: "Stuck." }); await f.settle();
  expect(f.planner).toHaveLength(TARS_FOLLOW_UP_CAP);
  expect(f.responsibilities.snapshot().followUps).toEqual([{ responsibilityId: second.id, kind: "blocked", status: "exhausted", at: null }]);
  f.advance(minutes(1));
  const other = f.responsibility("running");
  await click(f, other, "pause", "click-pause");
  expect(f.responsibilities.snapshot().followUps).toEqual([]);
  f.advance(minutes(1));
  const third = f.responsibility("blocked", { detail: "Stuck." }); await f.settle();
  expect(f.planner).toHaveLength(TARS_FOLLOW_UP_CAP + 1);
  expect(f.automatic().at(-1)?.origin).toMatchObject({ responsibilityId: third.id });
});

test("the next check of waiting work is never shown in the past, nor once that wait was followed up", async () => {
  const f = fixture(); f.service.start();
  const row = f.responsibility("waiting", { detail: "Waiting for your answer.", detailCode: "waitingForUser" });
  const due = new Date(Date.parse(row.updatedAt) + TARS_WAIT_FOLLOW_UP_MS).toISOString();
  expect(f.responsibilities.snapshot().followUps).toEqual([{ responsibilityId: row.id, kind: "waitExpired", status: "nextCheck", at: due }]);
  // Time passed but the host has not looked yet: no past time is reported, and the tray hides an old one.
  f.advance(TARS_WAIT_FOLLOW_UP_MS);
  expect(f.responsibilities.snapshot().followUps).toEqual([]);
  expect(tarsTrayFollowUp(row, [{ responsibilityId: row.id, kind: "waitExpired", status: "nextCheck", at: due }], f.now())).toBeNull();
  await f.settle();
  expect(f.planner).toHaveLength(1);
  expect(f.responsibilities.get(row.id)).toMatchObject({ revision: row.revision, updatedAt: row.updatedAt });
  f.advance(minutes(30));
  // That wait was followed up: nothing further is scheduled for this revision.
  expect(f.responsibilities.snapshot().followUps).toEqual([]);
  await f.settle();
  expect(f.planner).toHaveLength(1);
});

test("retention removes processed events older than 30 days at startup and keeps pending ones", async () => {
  const f = fixture();
  const done = f.responsibility("completed");
  const waiting = f.responsibility("blocked", { detail: "Stuck." });
  f.advance(TARS_EVENT_RETENTION_MS + minutes(1));
  const recent = f.responsibility("completed");
  f.service.start(); await f.service.whenIdle();
  expect(f.responsibilities.events.listRecent(10).map((event) => [event.responsibilityId, event.kind, event.status])).toEqual([
    [waiting.id, "blocked", "followedUp"], [recent.id, "completed", "settled"]]);
  expect(f.responsibilities.events.listRecent(10).some((event) => event.responsibilityId === done.id)).toBe(false);
});

test("an automatic follow-up never changes a priority, even of active work; it can ask instead", async () => {
  const f = fixture();
  const row = f.responsibility("blocked", { detail: "Stuck." });
  const before = f.responsibilities.get(row.id)!;
  f.replies.push({ reply: "This could go first.", actions: [
    { kind: "reprioritize", responsibilityId: row.id, expectedRevision: row.revision, priority: 95 },
    { kind: "ask", question: "Move it ahead of the other work?", options: [
      { label: "Move it first", rationale: "It unblocks the release.", effect: { kind: "reply" } },
      { label: "Keep the order", rationale: "Nothing changes.", effect: { kind: "reply" } }] }] });
  f.service.start(); await f.settle();
  expect(receipts(f)).toEqual([["reprioritize", "rejected", "notByFollowUp"], ["ask", "proposed", null]]);
  expect(f.responsibilities.get(row.id)?.priority).toBe(before.priority);
});
