import { describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import { formatDateTime } from "@/i18n/format";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { collectFleetTarsAttentionItems, FLEET_ATTENTION_TIER } from "@/lib/fleet/attention-projection";
import { buildTarsSideViewFixtures } from "../src/dev/tars-preview/tars-side-fixtures";
import { buildTarsTrayFixtures } from "../src/dev/tars-preview/tars-fixtures";
import { collectTarsAttention, tarsStateSignalId } from "../src/lib/tars/attention";
import { describeTarsCardSentence, tarsCardPrimary, tarsCardStatus, tarsTaskStateFacts } from "../src/lib/tars/card-view";
import { tarsRecordedChangeCount } from "../src/lib/tars/outputs-model";
import { buildTarsTray, type TarsTrayAttentionInput } from "../src/lib/tars/tray-model";
import type { TarsPendingDecision, TarsResponsibility } from "../src/lib/tars/types";

const start = new Date("2026-11-05T00:00:00.000Z");
const can = { answer: true, report: true };

/** One piece of work as its tray card, with the Fleet rows and decisions given. */
function cardOf(row: TarsResponsibility, extra: { attention?: TarsTrayAttentionInput[]; decisions?: TarsPendingDecision[]; runs?: Parameters<typeof buildTarsTray>[0]["runs"] } = {}) {
  const model = buildTarsTray({ responsibilities: [row], attentionItems: extra.attention ?? [], runs: extra.runs ?? {}, pendingDecisions: extra.decisions ?? [] });
  return Object.values(model.lanes).flat()[0]!;
}

function read(row: TarsResponsibility, extra: Parameters<typeof cardOf>[1] = {}, openers = can) {
  const card = cardOf(row, extra);
  const status = tarsCardStatus(card);
  return { state: status.state, waitingOn: status.waitingOn, sentence: describeTarsCardSentence(card, status), primary: tarsCardPrimary(card, status, openers) };
}

describe("a Tars work card's state, sentence and action", () => {
  const tray = () => buildTarsTrayFixtures(start);
  const billing = () => tray().responsibilities.find((row) => row.id === "billing")!;

  test("running work is working: its sentence is what Stave observes live, its action opens the task", async () => {
    await applyAppLocale("en");
    const f = tray();
    expect(read(billing(), { runs: f.runs })).toEqual({ state: "working", waitingOn: null, sentence: null, primary: { kind: "openTask" } });
  });

  test("work still being prepared waits and says so; it offers no action, since its task is named before it exists", async () => {
    await applyAppLocale("en");
    // The host saves the task id, then prepares the workspace and creates the task (`tars-runtime.ts`).
    const preparing: TarsResponsibility = { ...billing(), state: "preparing", taskId: "tars-billing", executionWorkspaceId: null, agentRunId: null };
    expect(read(preparing)).toEqual({ state: "on-hold", waitingOn: null, sentence: "Preparing the workspace. The work starts once it is ready.", primary: null });
    // Once its run exists the work has started, and the task exists too.
    expect(read({ ...preparing, executionWorkspaceId: "exec-billing", agentRunId: "run-billing" })).toMatchObject({ state: "working", primary: { kind: "openTask" } });
  });

  test("queued work waits for its turn: it says why and offers Start now", async () => {
    await applyAppLocale("en");
    const queued: TarsResponsibility = { ...billing(), state: "queued", taskId: null, agentRunId: null, executionWorkspaceId: null, queueWait: { code: "capacity", active: 1, limit: 1 } };
    expect(read(queued)).toEqual({ state: "on-hold", waitingOn: null,
      sentence: "Execution limit reached (1 active / 1 allowed). Starts when a slot is released.", primary: { kind: "control", operation: "startNow" } });
    // Without a reason from the scheduler it still waits, and says the reason is not known.
    expect(read({ ...queued, queueWait: undefined })).toMatchObject({ state: "on-hold", sentence: "The reason for waiting has not been confirmed." });
  });

  test("work that has not started never reads as working, whatever else Stave knows about it", async () => {
    await applyAppLocale("en");
    const f = tray();
    for (const state of ["queued", "preparing"] as const) {
      const waiting: TarsResponsibility = { ...billing(), state, agentRunId: null, executionWorkspaceId: null };
      expect(read(waiting, { runs: f.runs }).state, state).toBe("on-hold");
      // A request in its task still asks the user, and a stop still blocks it.
      const approval: TarsTrayAttentionInput = { id: "approval:task-billing", kind: "approval", taskId: "task-billing", detail: "Run the database migration" };
      expect(read(waiting, { attention: [approval] }).state, state).toBe("waiting");
      const failed: TarsTrayAttentionInput = { id: "turn:run-failed:exec-billing:task-billing:turn-1", kind: "run-failed", taskId: "task-billing", detail: "The provider returned an error." };
      expect(read(waiting, { attention: [failed] }), state).toMatchObject({ state: "blocked", sentence: "The provider returned an error." });
    }
  });

  test("work whose run waits for a usage reset is on hold: it says when it resumes and asks for nothing", async () => {
    await applyAppLocale("en");
    const run = tray().runs["run-billing"]!;
    const resetsAt = "2026-11-05T03:00:00.000Z";
    const held: AgentRunDetail = { ...run, agentRun: { ...run.agentRun, state: "paused", pauseReason: "usage-limit",
      usageLimit: { turnId: "turn-1", resetsAt, resumeAt: "2026-11-05T03:01:00.000Z", accountProfileId: "account", fingerprint: run.agentRun.fingerprint } } };
    const waiting: TarsResponsibility = { ...billing(), state: "waiting", detail: "usage-limit", detailCode: "runPaused", detailParams: { reason: "usage-limit" } };
    expect(read(waiting, { runs: { "run-billing": held } })).toEqual({ state: "on-hold", waitingOn: null,
      sentence: `Waiting for usage reset at ${formatDateTime(resetsAt)}. Stave resumes after checking this account.`, primary: null });
    // A request in the work's task still waits on the user while the run is held.
    const approval: TarsTrayAttentionInput = { id: "approval:task-billing", kind: "approval", taskId: "task-billing", detail: "Run the database migration" };
    expect(read(waiting, { runs: { "run-billing": held }, attention: [approval] }).state).toBe("waiting");
    // A run that asked to be woken later is held the same way, though Tars still counts the work as running.
    const at = "2026-11-05T04:00:00.000Z";
    const timed: AgentRunDetail = { ...run, agentRun: { ...run.agentRun, eventWait: { id: "wait-1", kind: "time", target: null, at, stageId: "cause", attempt: 2, turnId: null,
      registeredAt: start.toISOString(), since: start.toISOString(), expiresAt: at, maxWakes: 1, wakes: 0, status: "waiting", waitingSince: start.toISOString(), consumedKeys: [] } } };
    expect(read(billing(), { runs: { "run-billing": timed } })).toMatchObject({ state: "on-hold", sentence: expect.stringContaining(formatDateTime(at)), primary: null });
    // A reset nobody knows the time of does not resume on its own account.
    const unknown: AgentRunDetail = { ...held, agentRun: { ...held.agentRun, usageLimit: { ...held.agentRun.usageLimit!, resetsAt: null, resumeAt: null } } };
    expect(read(waiting, { runs: { "run-billing": unknown } }).state).not.toBe("on-hold");
  });

  test("a proposal Tars waits to have confirmed is waiting for the user, whatever the run does", async () => {
    await applyAppLocale("en");
    const f = tray();
    const release = f.responsibilities.find((row) => row.id === "release")!;
    const view = read(release, { attention: f.attentionItems, decisions: f.pendingDecisions });
    expect(view.state).toBe("waiting");
    expect(view.waitingOn).toBe("approval");
    expect(view.sentence).toBe("Tars proposes to resume this work.");
    expect(view.primary).toEqual({ kind: "confirm", decision: { messageId: "message-plan", actionIndex: 1, responsibilityId: "release", operation: "resume", expectedRevision: 3 } });
  });

  test("a question Tars asks is answered in the conversation: the card says it and leads there", async () => {
    await applyAppLocale("en");
    const ask: TarsTrayAttentionInput = { id: "tars:decision:message-ask:0", kind: "tars-decision", detail: "Tars asks: which database should the export read?", tarsResponsibilityId: "billing", taskId: "task-billing" };
    const view = read(billing(), { attention: [ask] });
    expect(view).toEqual({ state: "waiting", waitingOn: "question", sentence: "Tars asks: which database should the export read?", primary: { kind: "answer" } });
    // A view that cannot show the decision card opens the task instead.
    expect(read(billing(), { attention: [ask] }, { answer: false, report: true }).primary).toEqual({ kind: "openTask" });
  });

  test("a request left open in the work's task waits on the user while the work runs, and is held while it is paused", async () => {
    await applyAppLocale("en");
    const approval: TarsTrayAttentionInput = { id: "approval:task-billing", kind: "approval", taskId: "task-billing", detail: "Run the database migration" };
    expect(read(billing(), { attention: [approval] })).toEqual({ state: "waiting", waitingOn: "approval", sentence: "Run the database migration",
      primary: { kind: "openTask", request: { taskId: "task-billing", workspaceId: "exec-billing" } } });
    const paused = read({ ...billing(), state: "paused" }, { attention: [approval] });
    expect(paused.state).toBe("on-hold");
    expect(paused.sentence).toBe("This work is paused. Resume it to continue.");
    expect(paused.primary).toEqual({ kind: "control", operation: "resume" });
    const signOff: TarsTrayAttentionInput = { id: "agent-run-sign-off:billing", kind: "agent-run-sign-off", taskId: "task-billing" };
    expect(read(billing(), { attention: [signOff] })).toMatchObject({ state: "waiting", waitingOn: "sign-off", primary: { kind: "openTask" } });
  });

  test("a request that waits in a helper's task opens that task in its own workspace, not the work's task", async () => {
    await applyAppLocale("en");
    // The lead waits on a helper (`waitingTaskId`); Fleet's row for the approval sits on the helper's task, in the workspace the helper runs in.
    const waiting: TarsResponsibility = { ...billing(), state: "waiting", detail: "A helper task is waiting for your input or approval.", detailCode: "waitingForUser", waitingTaskId: "task-helper" };
    const approval: TarsTrayAttentionInput = { id: "interaction:approval:exec-helper:task-helper:request-1", kind: "approval", taskId: "task-helper", workspaceId: "exec-helper", detail: "Bash: run the database migration" };
    expect(read(waiting, { attention: [approval] })).toEqual({ state: "waiting", waitingOn: "approval", sentence: "Bash: run the database migration",
      primary: { kind: "openTask", request: { taskId: "task-helper", workspaceId: "exec-helper" } } });
  });

  test("blocked work says why and opens its report; without a side view it resumes", async () => {
    await applyAppLocale("en");
    const side = buildTarsSideViewFixtures(start);
    const search = side.responsibilities.find((row) => row.id === "search")!;
    const view = read(search, { runs: side.runs });
    expect(view.state).toBe("blocked");
    expect(view.sentence).toBe("Stopped with some completion criteria unmet. Open the report to see what is missing.");
    expect(view.primary).toEqual({ kind: "openReport" });
    expect(read(search, { runs: side.runs }, { answer: true, report: false }).primary).toEqual({ kind: "control", operation: "resume" });
    // A task whose turn failed blocks work Tars still counts as running.
    const failed: TarsTrayAttentionInput = { id: "turn:run-failed:exec-billing:task-billing:turn-1", kind: "run-failed", taskId: "task-billing", detail: "The provider returned an error." };
    expect(read(billing(), { attention: [failed] })).toMatchObject({ state: "blocked", sentence: "The provider returned an error.", primary: { kind: "openTask" } });
  });

  test("Fleet's review-only rows never change the state: only a real request or a real stop does", async () => {
    await applyAppLocale("en");
    const f = tray();
    const row = (kind: string): TarsTrayAttentionInput => ({ id: `${kind}:task-billing`, kind, taskId: "task-billing", workspaceId: "exec-billing", detail: `Fleet says ${kind}` });
    const working = read(billing(), { runs: f.runs });
    // A pull request that is ready to merge asks nothing of running work, and a turn that went quiet is still active.
    expect(read(billing(), { runs: f.runs, attention: [row("pr-ready-to-merge")] })).toEqual(working);
    expect(read(billing(), { runs: f.runs, attention: [row("turn-stalled")] })).toEqual(working);
    const seen: Record<string, string> = {};
    for (const [kind, tier] of Object.entries(FLEET_ATTENTION_TIER)) {
      if (kind.startsWith("tars-")) continue;
      const view = read(billing(), { runs: f.runs, attention: [row(kind)] });
      if (tier === "review") expect(view, kind).toEqual(working);
      else seen[kind] = view.waitingOn ? `${view.state}:${view.waitingOn}` : view.state;
    }
    expect(seen).toEqual({ "user-input": "waiting:question", approval: "waiting:approval", "agent-run-sign-off": "waiting:sign-off",
      "run-failed": "blocked", "agent-run-blocked": "blocked", "agent-run-stuck": "blocked" });
  });

  test("work the user took over waits for them in the neutral state: taking over is their choice, not a stop", async () => {
    await applyAppLocale("en");
    const migration = tray().responsibilities.find((row) => row.id === "migration")!;
    const held = { state: "on-hold", waitingOn: null, sentence: "You took over this work. Hand it back to let Tars continue.", primary: { kind: "control", operation: "handBack" } } as const;
    expect(read(migration)).toEqual(held);
    // What Fleet lists for its task while the user holds it is theirs already: neither a request nor a stop changes the card.
    const taken: TarsResponsibility = { ...migration, taskId: "task-migration" };
    for (const kind of ["approval", "user-input", "run-failed", "agent-run-stuck"]) {
      expect(read(taken, { attention: [{ id: `${kind}:task-migration`, kind, taskId: "task-migration", detail: `Fleet says ${kind}` }] }), kind).toEqual(held);
    }
    // A decision Tars itself asks about the work still waits on the user.
    const ask: TarsTrayAttentionInput = { id: "tars:decision:message-ask:0", kind: "tars-decision", detail: "Tars asks: should I pick this up again?", tarsResponsibilityId: migration.id };
    expect(read(migration, { attention: [ask] })).toMatchObject({ state: "waiting", waitingOn: "question", primary: { kind: "answer" } });
  });

  test("work paused on purpose waits in the neutral state like work taken over; a pause that went wrong is blocked", async () => {
    await applyAppLocale("en");
    const paused: TarsResponsibility = { ...billing(), state: "paused" };
    expect(read(paused)).toEqual({ state: "on-hold", waitingOn: null, sentence: "This work is paused. Resume it to continue.", primary: { kind: "control", operation: "resume" } });
    // The words saved with the pause are its sentence.
    const release = tray().responsibilities.find((row) => row.id === "release")!;
    expect(read(release)).toMatchObject({ state: "on-hold", sentence: "Paused by you while the staging deploy finishes.", primary: { kind: "control", operation: "resume" } });
    // A stop in its task does not turn a chosen pause into a problem.
    const failed: TarsTrayAttentionInput = { id: "turn:run-failed:exec-billing:task-billing:turn-1", kind: "run-failed", taskId: "task-billing", detail: "The provider returned an error." };
    expect(read(paused, { attention: [failed] }).state).toBe("on-hold");
    // A pause that ended with Tars no longer in charge says so, and that is a stop.
    expect(read({ ...paused, detail: "ownership changed", detailCode: "ownershipChanged" })).toMatchObject({ state: "blocked",
      sentence: "This task is now controlled elsewhere, so Tars cannot continue it. Continue it in its task.", primary: { kind: "control", operation: "resume" } });
  });

  test("a result waiting for the user's check is a sign-off that opens the report", async () => {
    await applyAppLocale("en");
    const side = buildTarsSideViewFixtures(start);
    const checkout: TarsResponsibility = { ...side.responsibilities.find((row) => row.id === "checkout")!, state: "resultReady", completionGoal: "confirmation" };
    const ready: TarsTrayAttentionInput = { id: `tars:blocked:${checkout.id}:${checkout.revision}`, kind: "tars-decision", tarsResponsibilityId: checkout.id, taskId: checkout.taskId ?? undefined, detail: "Result ready" };
    const view = read(checkout, { attention: [ready], runs: side.runs });
    expect(view).toEqual({ state: "waiting", waitingOn: "sign-off", sentence: "Execution result ready; confirm the endpoint before closing", primary: { kind: "openReport" } });
    expect(read(checkout, { attention: [ready], runs: side.runs }, { answer: true, report: false }).primary).toEqual({ kind: "control", operation: "acceptCompletion" });
  });

  test("a question Tars asks about a result that waits for a check is answered first", async () => {
    await applyAppLocale("en");
    const side = buildTarsSideViewFixtures(start);
    const checkout: TarsResponsibility = { ...side.responsibilities.find((row) => row.id === "checkout")!, state: "resultReady", completionGoal: "confirmation" };
    const decisions: TarsPendingDecision[] = [{ kind: "ask", responsibilityId: checkout.id, messageId: "message-ask", actionIndex: 0, operation: null,
      expectedRevision: checkout.revision, proposedAt: start.toISOString(), question: "Should the saved card stay first on mobile too?", optionCount: 2 }];
    // Fleet's own rows for the snapshot: the question, and the result review Stave adds for every result that is ready.
    const attention = collectFleetTarsAttentionItems(collectTarsAttention({ responsibilities: [checkout], pendingDecisions: decisions }));
    expect(attention.map((item) => item.id)).toEqual(["tars:decision:message-ask:0", tarsStateSignalId(checkout)]);
    expect(read(checkout, { attention, decisions, runs: side.runs })).toEqual({ state: "waiting", waitingOn: "question",
      sentence: "Tars asks: Should the saved card stay first on mobile too?", primary: { kind: "answer" } });
    // A control Tars proposes for the same result keeps its Confirm, whichever row Fleet lists first.
    const proposal: TarsPendingDecision[] = [{ responsibilityId: checkout.id, messageId: "message-plan", actionIndex: 0, operation: "acceptCompletion",
      expectedRevision: checkout.revision, proposedAt: start.toISOString() }];
    const rows = collectFleetTarsAttentionItems(collectTarsAttention({ responsibilities: [checkout], pendingDecisions: proposal }));
    for (const order of [rows, [...rows].reverse()]) expect(read(checkout, { attention: order, decisions: proposal, runs: side.runs })).toMatchObject({ state: "waiting", waitingOn: "approval",
      primary: { kind: "confirm", decision: { messageId: "message-plan", actionIndex: 0, operation: "acceptCompletion" } } });
    // Once it is answered only the result review is left, which opens the report.
    expect(read(checkout, { attention: attention.slice(1), runs: side.runs })).toMatchObject({ waitingOn: "sign-off", primary: { kind: "openReport" } });
  });

  test("finished work leads to what came out: its pull request, else its report, else its task", async () => {
    await applyAppLocale("en");
    const side = buildTarsSideViewFixtures(start);
    const checkout = side.responsibilities.find((row) => row.id === "checkout")!;
    expect(read(checkout, { runs: side.runs })).toEqual({ state: "finished", waitingOn: null,
      sentence: "Resolved both findings and reran the checks on the final revision.", primary: { kind: "openReport" } });
    const published: TarsResponsibility = { ...checkout, publication: { state: "opened", failedStep: null, commit: "f00ba12", branch: "tars/checkout", base: "main",
      commitMessage: "fix: show the saved card first", title: checkout.title, url: "https://example.com/acme/shop/pull/42", number: 42, error: null, reason: null, updatedAt: start.toISOString() } };
    expect(read(published, { runs: side.runs })).toMatchObject({ state: "finished", sentence: "Draft PR #42 open", primary: { kind: "openPullRequest", url: "https://example.com/acme/shop/pull/42", number: 42 } });
    // A run this window has not read has no report to open yet.
    expect(read(checkout)).toMatchObject({ state: "finished", sentence: "Requested goal completed", primary: { kind: "openTask" } });
  });

  test("a card that re-renders while its work streams never walks the run's stage records; what changed is counted once the work finished", async () => {
    await applyAppLocale("en");
    let reads = 0;
    const watched = (run: AgentRunDetail) => new Proxy(run, { get: (target, key, receiver) => { if (key === "stages") reads += 1; return Reflect.get(target, key, receiver); } });
    const running = cardOf(billing(), { runs: { "run-billing": watched(tray().runs["run-billing"]!) } });
    reads = 0;
    const status = tarsCardStatus(running);
    describeTarsCardSentence(running, status);
    tarsCardPrimary(running, status, can);
    expect(status.state).toBe("working");
    expect(reads).toBe(0);
    // Finished work is where the count is read.
    const side = buildTarsSideViewFixtures(start);
    const checkout = cardOf(side.responsibilities.find((row) => row.id === "checkout")!, { runs: side.runs });
    expect(tarsRecordedChangeCount(checkout.run!)).toBeGreaterThan(0);
    expect(tarsTaskStateFacts(checkout).result?.changedFiles).toBe(tarsRecordedChangeCount(checkout.run!)!);
  });

  test("work the user continued in its task keeps the run's state and says whose run it is", async () => {
    await applyAppLocale("en");
    const f = tray();
    // The host marks the run the work followed (`followedRunId`) and saves the code for what it observed (`tarsUserRunObservation`).
    const observed = (row: TarsResponsibility, code: NonNullable<TarsResponsibility["detailCode"]>): TarsResponsibility =>
      ({ ...row, followedRunId: row.agentRunId!, detailCode: code, detail: "The host's own English words.", detailParams: null, resultVerifiedRunId: null, resultUnverifiedRunId: null });
    // Running: the run works, so the card does; its sentence says the user drives it, which the live line cannot.
    expect(read(observed(billing(), "followingUserRun"), { runs: f.runs })).toEqual({ state: "working", waitingOn: null,
      sentence: "You continued this work in its task. Tars follows your run and acts on it only when you confirm.", primary: { kind: "openTask" } });
    const side = buildTarsSideViewFixtures(start);
    // Finished by the user: finished, and the sentence says Tars did not verify it, also over a pull request Tars had opened before.
    const checkout = observed(side.responsibilities.find((row) => row.id === "checkout")!, "finishedByUser");
    expect(read(checkout, { runs: side.runs })).toEqual({ state: "finished", waitingOn: null,
      sentence: "You finished this work in its task. Tars did not verify it.", primary: { kind: "openReport" } });
    expect(read({ ...checkout, detailParams: { pullRequest: 57 } }).sentence).toBe("You finished this work in its task: pull request #57 was opened from your run. Tars did not verify it.");
    const published: TarsResponsibility = { ...checkout, publication: { state: "opened", failedStep: null, commit: "f00ba12", branch: "tars/checkout", base: "main",
      commitMessage: "fix: show the saved card first", title: checkout.title, url: "https://example.com/acme/shop/pull/42", number: 42, error: null, reason: null, updatedAt: start.toISOString() } };
    expect(read(published, { runs: side.runs })).toMatchObject({ state: "finished", sentence: "You finished this work in its task. Tars did not verify it.", primary: { kind: "openPullRequest", number: 42 } });
    // The user's run ended short of the goal: blocked, and the card leads to the task its sentence says to continue in, not to a report Tars did not check.
    const search = observed(side.responsibilities.find((row) => row.id === "search")!, "userRunEnded");
    expect(cardOf(search, { runs: side.runs })).toMatchObject({ owner: "observed", controls: ["cancel"] });
    expect(cardOf(billing(), { runs: f.runs }).owner).toBe("tars");
    expect(read(search, { runs: side.runs })).toEqual({ state: "blocked", waitingOn: null,
      sentence: "Your run in this task ended without reaching the goal. Tars did not verify it. Continue in the task, or cancel this work.", primary: { kind: "openTask" } });
  });

  test("cancelled work is stopped and says so", async () => {
    await applyAppLocale("en");
    const cancelled: TarsResponsibility = { ...billing(), state: "cancelled", agentRunId: null, detail: "The run was cancelled.", detailCode: "runCancelled" };
    expect(read(cancelled)).toEqual({ state: "stopped", waitingOn: null, sentence: "This work was cancelled. Changes already made stay.", primary: { kind: "openTask" } });
  });
});
