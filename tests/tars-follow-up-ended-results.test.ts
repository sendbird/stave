import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { TARS_FOLLOW_UPS_WITHOUT_PROGRESS } from "@/lib/tars/events";
import { tarsTrayFollowUp } from "@/lib/tars/tray-model";
import type { TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { tarsObservation, tarsRunResult } from "../electron/host-service/tars-execution";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";
import { followUpFixture, minutes } from "./tars-follow-up-fixture";

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
    for (let round = 0; round < 5; round++) await endRun(f, row.id, "same-unverified-result");
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
    for (let round = 0; round < 5; round++) await endRun(f, row.id, `commit-${round}`);
    expect(f.planner).toHaveLength(5);
    expect(f.continued).toHaveLength(5);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(Array(5).fill("followedUp"));
  });

  test("a user action on the work resets the count", async () => {
    const f = fixture(); f.service.start();
    const row = f.responsibility("running");
    for (let round = 0; round < 3; round++) await endRun(f, row.id, "same-unverified-result");
    expect(f.continued).toHaveLength(2);
    // The user asks Tars to keep going on this work: that is their decision, so the count starts again.
    f.replies.push({ reply: "Continuing it.", actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: f.responsibilities.get(row.id)!.revision,
      operation: "message", input: { text: "Try once more with the integration suite." } }] });
    f.advance(minutes(5));
    await f.send("Try once more with the integration suite.");
    await startedContinuation(f);
    expect(f.continued).toHaveLength(3);
    const planned = f.planner.length;
    for (let round = 0; round < 3; round++) await endRun(f, row.id, "same-unverified-result");
    expect(f.planner.length - planned).toBe(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted", "followedUp", "followedUp", "exhausted"]);
  });

  test("a restart keeps the count", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tars-ended-results-"));
    cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
    const filename = path.join(dir, "state.sqlite");
    const first = followUpFixture({ continueWork: true, filename }); first.service.start();
    const row = first.responsibility("running");
    for (let round = 0; round < 2; round++) await endRun(first, row.id, "same-unverified-result");
    expect(first.continued).toHaveLength(2);
    const advanced = Date.parse(first.now()) - Date.parse("2026-11-05T00:00:00.000Z");
    await first.close();
    const f = fixture({ filename }); f.advance(advanced); f.service.start();
    await endRun(f, row.id, "same-unverified-result");
    expect(f.planner).toHaveLength(0);
    expect(f.continued).toHaveLength(0);
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
  });

  test("Careful autonomy is unchanged: the follow-up only proposes the continuation", async () => {
    const f = fixture(); f.service.start();
    f.conversations.configure({ ...f.conversations.getSettings()!, autonomy: "careful" });
    const row = f.responsibility("running");
    await endRun(f, row.id, "same-unverified-result");
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
      await endRun(f, row.id, "same-unverified-result");
    }
    expect(endedEvents(f, row.id).map((event) => event.status)).toEqual(["followedUp", "followedUp", "exhausted"]);
    expect(f.continued).toHaveLength(TARS_FOLLOW_UPS_WITHOUT_PROGRESS);
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
});
