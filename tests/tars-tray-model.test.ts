import { describe, expect, test } from "bun:test";
import { buildTarsRecap, buildTarsTray, tarsCardActions, tarsControlsFor, tarsPendingProposalKeys, tarsStageSegments, tarsStepCount, tarsTrayStatus } from "../src/lib/tars/tray-model";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import type { TarsResponsibility } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");
const fixtures = () => buildTarsTrayFixtures(start);
const card = (model: ReturnType<typeof buildTarsTray>, id: string) =>
  [...model.lanes.needsYou, ...model.lanes.running, ...model.lanes.done].find((value) => value.row.id === id)!;

describe("Tars tray read model", () => {
  test("lanes and counts follow Fleet's attention rows, and the count is Fleet's row count", () => {
    const f = buildTarsTrayFixtures(start);
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(model.lanes.needsYou.map((value) => value.row.id)).toEqual([f.ids.release]);
    expect(model.lanes.running.map((value) => value.row.id)).toEqual([f.ids.billing, f.ids.migration]);
    expect(model.lanes.done.map((value) => value.row.id)).toEqual([f.ids.docs]);
    expect(model.counts).toEqual({ needsYou: 1, running: 2, done: 1 });
    // A Fleet row on the task (not a Tars kind) also lands the work in needs you, and counts as one more row.
    const signOff = { id: "agent-run-sign-off:run-billing", kind: "agent-run-sign-off", taskId: "task-billing", detail: "Stage 2 · Cause" };
    const both = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [...f.attentionItems, signOff], runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(both.counts.needsYou).toBe(2);
    expect(both.lanes.needsYou.map((value) => value.row.id)).toEqual([f.ids.release, f.ids.billing]);
    expect(card(both, f.ids.billing).attention.map((row) => row.item.kind)).toEqual(["agent-run-sign-off"]);
    // Rows for work Tars does not own are not Tars's.
    const foreign = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [{ id: "x", kind: "approval", taskId: "someone-else" }], runs: f.runs });
    expect(foreign.counts.needsYou).toBe(0);
  });

  test("a card shows its workspace branch once the workspace exists, and queued work names what holds the one slot", () => {
    const f = buildTarsTrayFixtures(start);
    const billing = f.responsibilities.find((row) => row.id === f.ids.billing)!;
    const queued: TarsResponsibility = { ...billing, id: "queued-work", requestId: "queued-request", title: "Queued work", state: "queued",
      taskId: null, executionWorkspaceId: null, agentRunId: null };
    const named = { ...billing, branchName: "fix/billing-export-3fa9c1d2" };
    const rows = f.responsibilities.map((row) => row.id === billing.id ? named : row).concat(queued);
    const model = buildTarsTray({ responsibilities: rows, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(card(model, billing.id).branch).toBe("fix/billing-export-3fa9c1d2");
    expect(card(model, "queued-work").branch).toBeNull();
    expect(card(model, "queued-work").waitingBehind).toBe(billing.title);
    expect(card(model, billing.id).waitingBehind).toBeNull();
    // Work admitted before branch naming keeps its old branch.
    const legacy = f.responsibilities.map((row) => row.id === billing.id ? { ...row, branchName: undefined } : row);
    expect(card(buildTarsTray({ responsibilities: legacy, attentionItems: [], runs: f.runs }), billing.id).branch).toBe(`tars/${billing.id}`);
    // The run's spend reaches the card; a run the host read no usage for stays unknown.
    const usage = { turns: 3, measuredTurns: 3, inputTokens: 1200, outputTokens: 300, costUsd: 0.42 };
    const spent = buildTarsTray({ responsibilities: rows, attentionItems: [], runs: { ...f.runs, "run-billing": { ...f.runs["run-billing"]!, usage } } });
    expect(card(spent, billing.id).usage).toEqual(usage);
    expect(card(model, billing.id).usage).toBeNull();
    // Nothing active: queued work is next, not waiting behind anything.
    const idle = buildTarsTray({ responsibilities: [queued], attentionItems: [], runs: {} });
    expect(card(idle, "queued-work").waitingBehind).toBeNull();
  });

  test("a Fleet decision row carries the live proposal for Confirm; a stale proposal offers none", () => {
    const f = buildTarsTrayFixtures(start);
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(card(model, f.ids.release).attention).toEqual([{ item: f.attentionItems[0]!,
      decision: { messageId: "message-plan", actionIndex: 1, responsibilityId: f.ids.release, operation: "resume", expectedRevision: 3 } }]);
    const moved = f.responsibilities.map((row) => row.id === f.ids.release ? { ...row, revision: 4 } : row);
    const stale = buildTarsTray({ responsibilities: moved, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    expect(card(stale, f.ids.release).attention[0]!.decision).toBeNull();
  });

  test("stage progress, remaining turns and helpers come from the run; unknown values are null, never 0", () => {
    const f = buildTarsTrayFixtures(start);
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    const billing = card(model, f.ids.billing);
    expect(billing.progress).toMatchObject({ finished: 1, total: 3, current: { id: "cause", title: "Cause", status: "running", attempt: 2 } });
    expect(billing.remainingTurns).toBe(18);
    expect(billing.helpers).toBe(2);
    expect(billing.owner).toBe("tars");
    expect(billing.fleetTarget).toEqual({ workspaceId: "exec-billing", taskId: "task-billing" });
    // No run read (pruned or not started): no progress, no turns, no helpers.
    const docs = card(model, f.ids.docs);
    expect([docs.progress, docs.remainingTurns, docs.helpers]).toEqual([null, null, null]);
    // A host that does not report resources gives no helper count.
    const run = f.runs["run-billing"]!;
    const quiet = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [], runs: { [run.agentRun.id]: { ...run, resources: undefined } } });
    expect(card(quiet, f.ids.billing).helpers).toBeNull();
    // An ended run has no remaining budget to show.
    const ended = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [], runs: { [run.agentRun.id]: { ...run, agentRun: { ...run.agentRun, state: "completed" } } } });
    expect(card(ended, f.ids.billing).remainingTurns).toBeNull();
    expect(card(ended, f.ids.billing).progress?.current).toBeNull();
  });

  test("owner and controls follow the state, as the row controls always did", () => {
    const f = buildTarsTrayFixtures(start);
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: [], runs: {} });
    expect(card(model, f.ids.migration).owner).toBe("you");
    const state = (value: TarsResponsibility["state"]) => tarsControlsFor({ state: value });
    expect(state("running")).toEqual(["pause", "takeover", "cancel"]);
    // Queued work leads with starting it now, ahead of its place in the queue.
    expect(state("queued")).toEqual(["startNow", "pause", "takeover", "cancel"]);
    expect(tarsCardActions({ controls: state("queued"), attention: [], fleetTarget: null }).primary).toEqual({ kind: "control", operation: "startNow" });
    expect(state("paused")).toEqual(["resume", "takeover", "cancel"]);
    expect(state("blocked")).toEqual(["resume", "takeover", "cancel"]);
    expect(state("takenOver")).toEqual(["handBack", "cancel"]);
    expect(state("completed")).toEqual([]);
    expect(state("cancelled")).toEqual([]);
    // A completion Stave could not verify leaves only the user's decision.
    expect(tarsControlsFor({ state: "blocked", detailCode: "unverifiedCompletion" })).toEqual(["acceptCompletion", "cancel"]);
  });

  test("a card shows one main action; a waiting proposal's Confirm replaces the control it would repeat", () => {
    const f = fixtures();
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    const kinds = (value: ReturnType<typeof tarsCardActions>) => [value.primary, ...value.more].map((action) => action?.kind === "control" ? action.operation : action?.kind);
    expect(kinds(tarsCardActions(card(model, f.ids.release)))).toEqual(["confirm", "takeover", "fleet", "cancel"]);
    expect(kinds(tarsCardActions(card(model, f.ids.billing)))).toEqual(["pause", "takeover", "fleet", "cancel"]);
    expect(kinds(tarsCardActions(card(model, f.ids.docs)))).toEqual([undefined, "fleet"]);
    // A proposal for another control takes the main slot; the state's own control moves into the menu and Cancel is not offered twice.
    const running = card(model, f.ids.billing);
    const cancel = { ...running, attention: [{ item: { id: "d", kind: "tars-decision" }, decision: { messageId: "m", actionIndex: 0, responsibilityId: f.ids.billing, operation: "cancel" as const, expectedRevision: 2 } }] };
    expect(kinds(tarsCardActions(cancel))).toEqual(["confirm", "pause", "takeover", "fleet"]);
  });

  test("status is unknown until a read succeeds, and only live proposals can be confirmed", () => {
    expect(tarsTrayStatus({ bridge: true, snapshot: null, error: null })).toBe("checking");
    expect(tarsTrayStatus({ bridge: true, snapshot: null, error: "Read failed." })).toBe("unavailable");
    expect(tarsTrayStatus({ bridge: false, snapshot: null, error: null })).toBe("unavailable");
    expect(tarsTrayStatus({ bridge: true, snapshot: {}, error: "Later read failed." })).toBe("ready");
    const f = fixtures();
    expect(tarsPendingProposalKeys(null)).toBeNull();
    expect([...tarsPendingProposalKeys({ responsibilities: f.responsibilities, pendingDecisions: f.pendingDecisions })!]).toEqual(["confirm:message-plan:1"]);
    const moved = f.responsibilities.map((row) => row.id === f.ids.release ? { ...row, revision: 4 } : row);
    expect(tarsPendingProposalKeys({ responsibilities: moved, pendingDecisions: f.pendingDecisions })!.size).toBe(0);
  });
});

describe("Tars run monitor model", () => {
  test("segments follow each stage's latest attempt; the step count is the current stage, or the finished ones once ended", () => {
    const f = fixtures();
    const model = buildTarsTray({ responsibilities: f.responsibilities, attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    const progress = card(model, f.ids.billing).progress!;
    expect(tarsStageSegments(progress)).toEqual(["finished", "current", "pending"]);
    expect(tarsStepCount(progress)).toEqual({ position: 2, total: 3 });
    // The stage start comes from the run's own record, never a guess.
    expect(progress.current?.startedAt).toBe("2026-11-05T00:06:00.000Z");
    expect(progress.stages[2]!.startedAt).toBeNull();
    const ended = { ...progress, current: null, stages: progress.stages.map((stage) => ({ ...stage, current: false, status: stage.id === "cause" ? "blocked" as const : stage.status })) };
    expect(tarsStageSegments(ended)).toEqual(["finished", "stopped", "pending"]);
    expect(tarsStepCount(ended)).toEqual({ position: 1, total: 3 });
    // No stages is an unknown count, not "0/0".
    expect(tarsStepCount({ stages: [], current: null, finished: 0, total: 0 })).toBeNull();
  });
});

describe("while you were away", () => {
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000).toISOString();
  const recapOf = (patch: Partial<Parameters<typeof buildTarsRecap>[0]> = {}) => {
    const f = fixtures();
    const failed: TarsResponsibility = { ...f.responsibilities[3]!, id: "queue", title: "Migrate the export queue", state: "cancelled", updatedAt: at(20) };
    const model = buildTarsTray({ responsibilities: [...f.responsibilities, failed], attentionItems: f.attentionItems, runs: f.runs, pendingDecisions: f.pendingDecisions });
    return buildTarsRecap({ model, since: at(-60), until: at(60), pendingDecisions: f.pendingDecisions, ...patch });
  };

  test("counts what came to need you, ended unfinished or finished between the last visit and this one, needs you first", () => {
    const recap = recapOf()!;
    expect(recap.counts).toEqual({ needsYou: 1, failed: 1, done: 1 });
    expect(recap.items.map((item) => [item.kind, item.responsibilityId])).toEqual([["needsYou", "release"], ["failed", "queue"], ["done", "docs"]]);
    // Each opens its place in the side view: a result report for finished work, the timeline otherwise.
    expect(recap.items.map((item) => item.side.kind)).toEqual(["timeline", "timeline", "report"]);
    // A proposal made while away is when the work came to need you.
    expect(recap.items[0]!.at).toBe(at(6));
    expect(recap.more).toBe(0);
  });

  test("nothing on a first visit, nothing outside the away span, and a cancel the user applied is not a failure", () => {
    expect(recapOf({ since: null })).toBeNull();
    expect(recapOf({ since: at(60), until: at(30) })).toBeNull();
    // Changes made while the view was open belong to the visit, not the time away.
    expect(recapOf({ since: at(-60), until: at(-1) })).toBeNull();
    expect(recapOf({ cancelledByYou: new Set(["queue"]) })!.counts).toEqual({ needsYou: 1, failed: 0, done: 1 });
    const limited = recapOf({ limit: 2 })!;
    expect(limited.items).toHaveLength(2);
    expect(limited.more).toBe(1);
  });
});
