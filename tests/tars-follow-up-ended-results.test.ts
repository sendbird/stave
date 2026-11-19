import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { createHash } from "node:crypto";
import { TARS_ENDED_FOLLOW_UPS_MAX, TARS_EVENT_RETENTION_MS, TARS_FOLLOW_UPS_WITHOUT_PROGRESS, tarsEndedResultBrake, tarsResultProgressed } from "@/lib/tars/events";
import { tarsTrayFollowUp } from "@/lib/tars/tray-model";
import type { TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { tarsObservation, tarsRunResult } from "../electron/host-service/tars-execution";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";
import { actTars } from "../electron/host-service/tars-control";

// A follow-up on a Run that ended may start a new Run as a continuation, with
// a fresh turn guard and a new run id. Only a change in what the Run ended
// with is progress: continuations that keep ending the same way stop after
// two and the decision goes to the user.

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); });
function fixture(options: Parameters<typeof followUpFixture>[0] = {}) {
  const f = followUpFixture({ continueWork: true, ...options });
  cleanup.push(f.close);
  return f;
}
type F = ReturnType<typeof fixture>;

const hex = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 12);
/**
 * An ended result as `tarsRunResult` writes it: the same unverified outcome,
 * verdict and unmet criteria at workspace revision `revision` (null: the
 * revision could not be read), or another outcome.
 */
const fingerprint = (revision: string | null, outcome = "unverified") => `o.${hex(outcome)}|r.${revision === null ? "?" : hex(revision)}|v.${hex("none")}|u.${hex("[]")}`;
const SAME = fingerprint("rev-1");

/** A Run that reported its criteria met without evidence Stave could confirm, at a workspace result `result`. */
const unverified = (result: string): TarsExecutionObservation => ({ state: "blocked", detailCode: "unverifiedCompletion", runResult: result,
  detail: "The run reported its criteria as met, but Stave has no verified check or passed review for it." });
const endedEvents = (f: F, id: string) => f.responsibilities.events.listRecent(100)
  .filter((event) => event.responsibilityId === id && event.kind === "unverifiedCompletion");

/**
 * The Run ends with `result`; Tars's follow-up (when one starts) answers with
 * a message on the ended work, which Balanced applies at once as a
 * continuation; the continuation's new Run is then running.
 */
async function endRun(f: F, id: string, result: string) {
  f.advance(minutes(5));
  f.observations.set(id, unverified(result));
  f.runtime.requestTick(); await f.runtime.drain();
  f.replies.push({ reply: "Verifying it again.", actions: [{ kind: "control", responsibilityId: id, expectedRevision: f.responsibilities.get(id)!.revision,
    operation: "message", input: { text: "Run the checks and report their evidence." } }] });
  f.service.wake(); await f.service.whenIdle(); await f.runtime.drain();
  // A reply no follow-up took is dropped, so it never answers a later turn.
  f.replies.length = 0;
  await startedContinuation(f);
}

/** The delivery starts a continuation, if one was applied, on the next tick; its new Run is then observed running. */
async function startedContinuation(f: F) {
  f.runtime.requestTick(); await f.runtime.drain();
  f.runtime.requestTick(); await f.runtime.drain();
}

describe("continuations of ended work that end with the same result", () => {
  test("stop after two automatic continuations and hand the decision to the user", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 5; round++) await endRun(f, row.id, SAME);
    // The first follow-up continues; the second covers a continuation that fell short; the third time goes to the user.
    expect(f.planner).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
    expect(f.responsibilities.get(row.id)).toMatchObject({ state: "blocked", detailCode: "unverifiedCompletion" });
    // The user sees what repeated, in the conversation and on the work's card.
    expect(f.service.getConversation().events?.filter((event) => event.status === "exhausted" && event.responsibilityId === row.id)).toHaveLength(1);
    const followUps = f.responsibilities.snapshot().followUps.filter((state) => state.responsibilityId === row.id);
    expect(followUps.map((state) => [state.kind, state.status])).toEqual([["unverifiedCompletion", "exhausted"]]);
    expect(tarsTrayFollowUp(f.responsibilities.get(row.id)!, followUps, f.now())).toEqual({ status: "exhaustedResult", at: null });
    expect(f.errors).toEqual([]);
  });

  test("a continuation that produced a new commit is progress and keeps its follow-up", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 5; round++) await endRun(f, row.id, fingerprint(`commit-${round}`));
    expect(f.planner).toHaveLength(5);
    expect(f.continued).toHaveLength(5);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(Array(5).fill("followedUp"));
  });

  test("a revision read that alternates between known and unknown is no progress: it stops after two", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 6; round++) await endRun(f, row.id, round % 2 ? fingerprint(null) : SAME);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
  });

  test("results alternating between two values cannot escape the count", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 8; round++) await endRun(f, row.id, fingerprint(round % 2 ? "rev-b" : "rev-a"));
    // A, then B (new), then A again (a repeat counted from B): the next repeat goes to the user.
    expect(f.continued).toHaveLength(3);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "followedUp", "exhausted"]);
  });

  test("past the ceiling between user actions, even new results go to the user", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < TARS_ENDED_FOLLOW_UPS_MAX + 2; round++) await endRun(f, row.id, fingerprint(`commit-${round}`));
    expect(f.continued).toHaveLength(TARS_ENDED_FOLLOW_UPS_MAX);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual([...Array(TARS_ENDED_FOLLOW_UPS_MAX).fill("followedUp"), "exhausted"]);
    const followUps = f.responsibilities.snapshot().followUps.filter((state) => state.responsibilityId === row.id);
    expect(tarsTrayFollowUp(f.responsibilities.get(row.id)!, followUps, f.now())).toEqual({ status: "exhaustedResult", at: null });
  });

  test("a user action on the work resets the count", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 3; round++) await endRun(f, row.id, SAME);
    expect(f.continued).toHaveLength(2);
    // The user asks Tars to keep going on this work: that is their decision, so the count starts again.
    f.replies.push({ reply: "Continuing it.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: f.responsibilities.get(row.id)!.revision,
      operation: "message", input: { text: "Try once more with the integration suite." } }] });
    f.advance(minutes(5));
    await f.send("Try once more with the integration suite.");
    await startedContinuation(f);
    expect(f.continued).toHaveLength(3);
    const planned = f.planner.length;
    for (let round = 0; round < 3; round++) await endRun(f, row.id, SAME);
    expect(f.planner.length - planned).toBe(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted", "followedUp", "followedUp", "exhausted"]);
  });

  test("a restart keeps the count", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tars-ended-results-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const filename = path.join(dir, "state.sqlite");
    const first = followUpFixture({ continueWork: true, filename }); first.service.start();
    const row = first.responsibility("running");
    // The revision read alternates between known and unknown; neither is a change.
    for (let round = 0; round < 2; round++) await endRun(first, row.id, round % 2 ? fingerprint(null) : SAME);
    expect(first.continued).toHaveLength(2);
    const advanced = Date.parse(first.now()) - Date.parse("2026-11-05T00:00:00.000Z");
    await first.close();
    const f = fixture({ filename }); f.advance(advanced); f.service.start();
    await endRun(f, row.id, SAME);
    expect(f.planner).toHaveLength(0);
    expect(f.continued).toHaveLength(0);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
  });

  test("a restart after the retention period keeps the count of open work and removes that of ended work", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tars-ended-results-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const filename = path.join(dir, "state.sqlite");
    const first = followUpFixture({ continueWork: true, filename }); first.service.start();
    // Two continuations with the same result, and the second one's Run is still open.
    const open = first.responsibility("running");
    for (let round = 0; round < 2; round++) await endRun(first, open.id, SAME);
    first.advance(minutes(120));
    // Work Tars already handed to the user, who has not acted.
    const handed = first.responsibility("running");
    for (let round = 0; round < 3; round++) await endRun(first, handed.id, SAME);
    first.advance(minutes(120));
    // Work that was continued once and then cancelled.
    const ended = first.responsibility("running");
    await endRun(first, ended.id, SAME);
    first.responsibilities.patch(ended.id, first.responsibilities.get(ended.id)!.revision, { state: "cancelled" }, first.now());
    expect(first.continued).toHaveLength(5);
    expect(endedEvents(first, ended.id).map((event) => event.status)).toEqual(["followedUp"]);
    // Nothing changes for longer than processed changes are kept, then Stave restarts.
    first.advance(TARS_EVENT_RETENTION_MS + minutes(1));
    const advanced = Date.parse(first.now()) - Date.parse("2026-11-05T00:00:00.000Z");
    await first.close();
    const f = fixture({ filename }); f.advance(advanced);
    f.observations.set(open.id, { state: "running", detail: null });
    f.observations.set(handed.id, unverified(SAME));
    f.service.start(); await f.service.whenIdle();
    // The open Run ends the same way a third time: still the user's decision, with no new Run.
    await endRun(f, open.id, SAME);
    expect(f.planner).toHaveLength(0);
    expect(f.continued).toHaveLength(0);
    expect(endedEvents(f, open.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
    // The work handed to the user still says so.
    expect(endedEvents(f, handed.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
    expect(f.responsibilities.snapshot().followUps.filter((state) => state.responsibilityId === handed.id).map((state) => state.status)).toEqual(["exhausted"]);
    // Ended work's changes are removed as before.
    expect(endedEvents(f, ended.id)).toEqual([]);
    expect(f.errors).toEqual([]);
  });

  test("Careful autonomy is unchanged: the follow-up only proposes the continuation", async () => {
    const f = fixture(); f.service.start();
    f.conversations.configure({ ...f.conversations.getSettings()!, autonomy: "careful" });
    const row = f.responsibility("running");
    await endRun(f, row.id, SAME);
    expect(f.planner).toHaveLength(1);
    expect(f.continued).toHaveLength(0);
    expect(f.conversations.listReceipts(f.automatic().at(-1)!.id).map((receipt) => receipt.status)).toEqual(["proposed"]);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp"]);
  });

  test("an ask during a continuation does not reset the count between ended results", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 3; round++) {
      // The continuation's new Run asks; Tars answers it; then the Run ends with the same result as before.
      f.observations.set(row.id, { state: "waiting", detail: "Which suite?", stageAsksUser: true, runTurns: 3, runStage: "work#1" });
      await f.settle();
      await endRun(f, row.id, SAME);
    }
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
  });
});

/** Tars's answer: `count` messages on the ended work, each of which would start a continuation. */
const messages = (f: F, id: string, count: number) => ({ reply: "Verifying it again.", actions: Array.from({ length: count }, (_, index) => ({
  kind: "control" as const, responsibilityId: id, expectedRevision: f.responsibilities.get(id)!.revision, operation: "message" as const,
  input: { text: `Run check ${index + 1} and report its evidence.` } })) });
/** The Run ends with `result`; a follow-up that starts is answered with `reply`, or with nothing. */
async function endWith(f: F, id: string, result: string, reply?: (f: F, id: string) => ReturnType<typeof messages>) {
  f.advance(minutes(5));
  f.observations.set(id, unverified(result));
  f.runtime.requestTick(); await f.runtime.drain();
  if (reply) f.replies.push(reply(f, id));
  f.service.wake(); await f.service.whenIdle(); await f.runtime.drain();
  f.replies.length = 0;
  await startedContinuation(f);
}
const deliveries = (f: F, id: string) => f.conversations.listActions(1_000)
  .filter((record) => record.action.kind === "control" && record.action.responsibilityId === id && record.delivery)
  .map((record) => [record.source, record.delivery!.status, record.delivery!.reason]);

describe("automatic continuation starts, whatever proposed them", () => {
  // Reproduction: two follow-up answers with eight messages each, kept while
  // the task's turn ran; once the Run ended, every message started a new Run,
  // 16 in all, each ending with the same result.
  test("two follow-up answers with eight messages each start at most two Runs without a change", async () => {
    const f = fixture({ taskBusy: true }); f.service.start();
    const row = f.responsibility("running");
    for (const runTurns of [3, 4]) {
      f.observations.set(row.id, { state: "waiting", detail: "Which suite?", stageAsksUser: true, runTurns, runStage: "work#1" });
      f.runtime.requestTick(); await f.runtime.drain();
      f.replies.push(messages(f, row.id, 8));
      await f.settle();
      f.replies.length = 0;
    }
    for (let round = 0; round < 18; round++) await endWith(f, row.id, SAME);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    // One message per work in an automatic answer: the other seven of each are refused at once.
    const answers = f.automatic().filter((message) => f.conversations.listReceipts(message.id).length);
    expect(answers.map((answer) => f.conversations.listReceipts(answer.id).map((receipt) => receipt.status)))
      .toEqual(Array(2).fill(["applied", ...Array(7).fill("rejected")]));
    expect(f.errors).toEqual([]);
  });

  test("queued starts past the brake are refused where the Run would start, and the user is told once", async () => {
    const f = fixture({ taskBusy: true }); f.service.start();
    const row = f.responsibility("running");
    // The user's message is answered with eight messages, kept while the turn runs; each would start a Run once the one before ended.
    f.replies.push(messages(f, row.id, 8));
    await f.send("Keep verifying it.");
    for (let round = 0; round < 10; round++) await endWith(f, row.id, SAME);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(deliveries(f, row.id)).toEqual([...Array(2).fill(["automatic", "delivered", null]), ...Array(6).fill(["automatic", "failed", "notByFollowUp"])]);
    const stops = f.responsibilities.events.listRecent(100).filter((event) => event.responsibilityId === row.id && event.status === "exhausted");
    expect(stops).toHaveLength(1);
    const followUps = f.responsibilities.snapshot().followUps.filter((state) => state.responsibilityId === row.id);
    expect(tarsTrayFollowUp(f.responsibilities.get(row.id)!, followUps, f.now())).toEqual({ status: "exhaustedResult", at: null });
    expect(f.errors).toEqual([]);
  });

  test("a start the user confirms is never braked and starts the count again", async () => {
    const f = fixture({ taskBusy: true }); f.service.start();
    const row = f.responsibility("running");
    f.replies.push(messages(f, row.id, 4));
    await f.send("Keep verifying it.");
    for (let round = 0; round < 4; round++) await endWith(f, row.id, SAME);
    expect(f.continued).toHaveLength(2);
    // The user continues it from the work's card.
    f.advance(minutes(5));
    await actTars({ requestId: "user-continue", responsibilityId: row.id, expectedRevision: f.responsibilities.get(row.id)!.revision,
      operation: "message", input: { text: "Run the integration suite." }, source: "click" }, { conversations: f.conversations, runtime: f.runtime, now: f.now });
    await startedContinuation(f);
    expect(f.continued).toHaveLength(3);
    // Automatic starts count again from the user's: the next answer's continuation starts.
    await endWith(f, row.id, SAME, (f, id) => messages(f, id, 1));
    expect(f.continued).toHaveLength(4);
    expect(f.errors).toEqual([]);
  });

  test("a restart keeps the count of automatic starts", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tars-continuation-starts-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const filename = path.join(dir, "state.sqlite");
    const first = followUpFixture({ continueWork: true, taskBusy: true, filename }); first.service.start();
    const row = first.responsibility("running");
    first.replies.push(messages(first as F, row.id, 4));
    await first.send("Keep verifying it.");
    for (let round = 0; round < 2; round++) await endWith(first as F, row.id, SAME);
    expect(first.continued).toHaveLength(2);
    const advanced = Date.parse(first.now()) - Date.parse("2026-11-05T00:00:00.000Z");
    await first.close();
    const f = fixture({ taskBusy: true, filename }); f.advance(advanced); f.service.start();
    await endWith(f, row.id, SAME);
    expect(f.continued).toHaveLength(0);
    expect(deliveries(f, row.id).map(([, status]) => status)).toEqual(["delivered", "delivered", "failed", "failed"]);
  });
});

describe("what a Run ended with", () => {
  const base = agentRunFixture();
  const finalStage = base.stages.at(-1)!.stageId;
  const ended = (revision: string, runId = "run-1"): AgentRunDetail => ({ ...base,
    agentRun: { ...base.agentRun, id: runId, state: "completed" },
    stages: base.stages.map((stage) => stage.stageId === finalStage ? { ...stage, status: "completed",
      facts: { ...stage.facts, workspaceRevision: { status: "known", revision } } } : stage),
    report: null, events: [] } as AgentRunDetail);
  const result = (detail: AgentRunDetail) => tarsRunResult(detail, tarsObservation(detail));

  test("is the same for a new run that ended the same way, and differs for a new commit or outcome", () => {
    expect(result(ended("rev-a", "run-1"))).toBe(result(ended("rev-a", "run-2")));
    expect(result(ended("rev-a"))).not.toBe(result(ended("rev-b")));
    const stopped = { ...ended("rev-a"), agentRun: { ...ended("rev-a").agentRun, state: "stopped", stopReason: "turn-cap-reached" } } as AgentRunDetail;
    expect(result(stopped)).not.toBe(result(ended("rev-a")));
    expect(tarsRunResult({ ...base, agentRun: { ...base.agentRun, state: "running" } } as AgentRunDetail, { state: "running", detail: null })).toBeNull();
  });

  test("an unknown revision is no change against a known one; a different known revision or outcome is", () => {
    const unknown = { ...ended("rev-a"), stages: ended("rev-a").stages.map((stage) => stage.stageId === finalStage
      ? { ...stage, facts: { ...stage.facts, workspaceRevision: { status: "unknown" } } } : stage) } as AgentRunDetail;
    expect(result(unknown)).toContain("|r.?|");
    expect(tarsResultProgressed(result(unknown)!, result(ended("rev-a"))!)).toBe(false);
    expect(tarsResultProgressed(result(ended("rev-a"))!, result(unknown)!)).toBe(false);
    expect(tarsResultProgressed(result(ended("rev-b"))!, result(ended("rev-a"))!)).toBe(true);
    const stopped = { ...ended("rev-a"), agentRun: { ...ended("rev-a").agentRun, state: "stopped", stopReason: "turn-cap-reached" } } as AgentRunDetail;
    expect(tarsResultProgressed(result(stopped)!, result(unknown)!)).toBe(true);
    // Something that is not a result fingerprint is never progress.
    expect(tarsResultProgressed("result:anything", result(ended("rev-a"))!)).toBe(false);
  });

  test("the brake counts repeats from the last new result and stops at the ceiling", () => {
    const [a, b, c, u] = [fingerprint("a"), fingerprint("b"), fingerprint("c"), fingerprint(null)];
    expect(tarsEndedResultBrake([], a)).toBe(false);
    expect(tarsEndedResultBrake([a], a)).toBe(false);
    expect(tarsEndedResultBrake([a, a], a)).toBe(true);
    expect(tarsEndedResultBrake([a, u], a)).toBe(true);
    expect(tarsEndedResultBrake([a, b, a], b)).toBe(true);
    expect(tarsEndedResultBrake([a, b, a], c)).toBe(false);
    expect(tarsEndedResultBrake([a, b, c, fingerprint("d"), fingerprint("e")], fingerprint("f"))).toBe(true);
  });
});
