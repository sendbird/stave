import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars, admitTarsControl, tarsControlRejection } from "../electron/host-service/tars-control";
import { TarsOwnershipLostError, TarsRunEndedError } from "../electron/host-service/tars-ownership";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { tarsObservation } from "../electron/host-service/tars-execution";
import { tarsConfirmationRequestId, type TarsControlOperation, type TarsControlReason, type TarsDecisionAction } from "../src/lib/tars/conversation";
import type { TarsResponsibility, TarsState } from "../src/lib/tars/types";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";

const NOW = "2026-11-05T00:00:00.000Z";
const LATER = "2026-11-05T00:05:00.000Z";
const OPERATIONS: TarsControlOperation[] = ["pause", "resume", "cancel", "takeover", "handBack"];
const BUSY = "The representative's database stayed busy. The unsettled work remains saved and will be retried.";
const databases: Database[] = [];
afterEach(() => { for (const database of databases.splice(0)) database.close(); });

function fixture(overrides: Partial<TarsRuntimePorts> = {}) {
  const database = new Database(":memory:"); databases.push(database);
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  const calls: string[] = [];
  const scopes: string[] = [];
  let clock = NOW;
  let requests = 0;
  const ports: TarsRuntimePorts = {
    store, now: () => clock,
    validateScope: async (row) => { scopes.push(row.workspaceId); },
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => { calls.push("start"); return `run-${row.id}`; },
    observe: async () => { calls.push("observe"); return { state: "running", detail: null }; },
    controlRun: async (_row, operation) => { calls.push(operation); }, ...overrides,
  };
  const runtime = createTarsRuntime(ports);
  const responsibility = (state: TarsState = "running", run = true): TarsResponsibility => {
    const row = store.create({ requestId: `responsibility-${requests++}`, title: "Fix search", instruction: "Fix and verify search.",
      acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
    return store.patch(row.id, row.revision, { state, ...(run ? { taskId: `tars-${row.id}`, executionWorkspaceId: "execution", agentRunId: "owned-run" } : {}) }, NOW);
  };
  const click = (responsibilityId: string, expectedRevision: number, operation: TarsControlOperation, requestId = `click-${requests++}`) =>
    actTars({ requestId, responsibilityId, expectedRevision, operation, source: "click" }, { conversations, runtime, now: () => clock });
  const act = async (row: TarsResponsibility, operation: TarsControlOperation, requestId?: string) =>
    (await click(row.id, row.revision, operation, requestId)).record;
  const controls = () => calls.filter((call) => (OPERATIONS as string[]).includes(call));
  const settle = async () => { await runtime.drain(); await Promise.resolve(); await runtime.drain(); };
  // Words reach the host as a saved decision; the same runtime admits them.
  const say = async (actions: TarsDecisionAction[], text = "멈춰") => {
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const queued = conversations.create({ requestId: `message-${requests++}`, text }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Done as asked.", actions }, NOW);
    const input = { messageId: message.id, expectedRevision: message.revision };
    const decisionPorts = { conversations, responsibilities: store, readRegistry: () => [], now: () => clock,
      requestTick: () => runtime.requestTick(), control: runtime.act };
    return { message, apply: () => applyTarsDecision(input, decisionPorts) };
  };
  return { database, store, conversations, runtime, calls, scopes, responsibility, click, act, controls, settle, say,
    setClock: (value: string) => { clock = value; } };
}

describe("Tars control admission rules", () => {
  const row = (state: TarsState) => ({ id: "goal", revision: 4, state }) as TarsResponsibility;
  const reasonOf = (admit: () => unknown) => { try { admit(); return null; } catch (error) { return tarsControlRejection(error).reason; } };
  test("unknown responsibilities and stale revisions are refused before any rule", () => {
    expect(reasonOf(() => admitTarsControl(null, { responsibilityId: "manual-task", expectedRevision: 1, operation: "pause" }))).toBe("notOwned");
    expect(reasonOf(() => admitTarsControl(row("running"), { responsibilityId: "goal", expectedRevision: 3, operation: "pause" }))).toBe("stale");
    // Dispatch rechecks ownership rules against the current row, not the caller's revision.
    expect(admitTarsControl(row("running"), { responsibilityId: "goal", expectedRevision: 3, operation: "pause" }, "dispatch").state).toBe("running");
  });
  test.each([
    ["running", "pause", null], ["waiting", "takeover", null], ["paused", "resume", null], ["blocked", "resume", null],
    ["queued", "cancel", null], ["takenOver", "handBack", null], ["takenOver", "cancel", null],
    ["takenOver", "resume", "takenOver"], ["takenOver", "pause", "takenOver"], ["takenOver", "takeover", "alreadyTakenOver"],
    ["running", "handBack", "notTakenOver"], ["running", "resume", "notResumable"], ["paused", "pause", "alreadyPaused"],
    ["queued", "startNow", null], ["preparing", "startNow", "notStartable"], ["running", "startNow", "notStartable"],
    ["paused", "startNow", "notStartable"], ["blocked", "startNow", "notStartable"], ["takenOver", "startNow", "notStartable"],
    ["cancelled", "startNow", "ended"], ["completed", "startNow", "ended"],
    ...OPERATIONS.flatMap((operation) => [["cancelled", operation, "ended"], ["completed", operation, "ended"]]),
  ] as Array<[TarsState, TarsControlOperation, TarsControlReason | null]>)("%s + %s", (state, operation, reason) => {
    const admit = () => admitTarsControl(row(state), { responsibilityId: "goal", expectedRevision: 4, operation });
    expect(reasonOf(admit)).toBe(reason);
    if (!reason) expect(admit()).toMatchObject({ state });
  });
  test("run failures map to stable reasons and anything else to unknown", () => {
    expect(tarsControlRejection(new TarsOwnershipLostError("This task was taken over.")).reason).toBe("ownershipLost");
    expect(tarsControlRejection(new TarsRunEndedError()).reason).toBe("runEnded");
    expect(tarsControlRejection(new Error("The task's agent assignment is unavailable."))).toEqual({ reason: "unknown", error: "The task's agent assignment is unavailable." });
  });
});

describe("Tars control through the host path", () => {
  test("a stale revision settles a rejected record with its reason and changes nothing", async () => {
    const f = fixture(); const row = f.responsibility();
    const record = await f.act({ ...row, revision: row.revision - 1 }, "pause");
    expect(record).toMatchObject({ status: "rejected", source: "click", reason: "stale", error: expect.stringContaining("changed") });
    expect(f.store.get(row.id)).toEqual(row);
    expect(f.controls()).toEqual([]);
  });

  test("an unknown or out-of-scope responsibility is rejected", async () => {
    const f = fixture({ validateScope: async () => { throw new Error("The source workspace does not belong to this registered repository."); } });
    expect((await f.click("manual-task", 1, "cancel")).record).toMatchObject({ status: "rejected", reason: "notOwned" });
    // Granting authority again rechecks the registered scope; a removed scope refuses it.
    const paused = f.responsibility("paused");
    expect(await f.act(paused, "resume")).toMatchObject({ status: "rejected", reason: "outOfScope", error: expect.stringContaining("registered repository") });
    expect(f.store.get(paused.id)).toEqual(paused);
    expect(f.controls()).toEqual([]);
  });

  test("takeover stops Tars execution and resume can never reclaim it, even after restart", async () => {
    const f = fixture(); const row = f.responsibility();
    expect((await f.act(row, "takeover")).status).toBe("applied");
    expect(f.store.get(row.id)).toMatchObject({ state: "takenOver", agentRunId: "owned-run", reverifyAfter: null });
    await f.settle();
    expect(f.calls).toEqual(["takeover"]);
    const resumed = await f.act(f.store.get(row.id)!, "resume");
    expect(resumed).toMatchObject({ status: "rejected", reason: "takenOver" });
    f.runtime.stop();
    // A new runtime over the same rows never observes, dispatches or resumes human-owned work.
    const again = createTarsRuntime({ store: f.store, now: () => NOW, validateScope: async () => {}, prepareWorkspace: async () => "x",
      prepareTask: async () => {}, findRun: async () => null, startRun: async () => { f.calls.push("start"); return "late"; },
      observe: async () => { f.calls.push("observe"); return { state: "running", detail: null }; }, controlRun: async (_row, operation) => { f.calls.push(operation); } });
    again.requestTick(); await again.drain();
    expect(f.store.get(row.id)?.state).toBe("takenOver");
    expect(f.calls).toEqual(["takeover"]);
    again.stop();
  });

  test("handBack restores Tars ownership in the same admitted scope and requires re-verification", async () => {
    const f = fixture(); const row = f.responsibility();
    await f.act(row, "takeover");
    f.setClock(LATER);
    const before = f.store.get(row.id)!;
    expect((await f.act(before, "handBack")).status).toBe("applied");
    const after = f.store.get(row.id)!;
    expect(after).toMatchObject({ state: "running", reverifyAfter: LATER, detail: null });
    for (const key of ["workspaceId", "repositoryPath", "providerId", "model", "taskId", "executionWorkspaceId", "agentRunId", "instruction", "acceptanceCriteria", "maxTurns"] as const)
      expect(after[key]).toEqual(row[key]);
    expect(f.scopes).toEqual(["execution"]);
    expect(f.controls()).toEqual(["takeover", "handBack"]);
  });

  test("a hand-back completes only on a final verification started after it", () => {
    const base = agentRunFixture();
    const finalStage = base.agentRun.workflow.stages.at(-1)!.id;
    const completed = (startedAt: string): AgentRunDetail => ({ ...base, agentRun: { ...base.agentRun, state: "completed" }, events: [],
      stages: [{ ...base.stages[0]!, stageId: finalStage, status: "done", startedAt, endedAt: LATER,
        report: { outcome: "complete", summary: "Checked.", decisions: [], artifacts: [], reportedAt: LATER, turnId: "verify-turn",
        evidence: [{ label: "Tests pass", kind: "check", command: "bun test" }] } as never,
      facts: { currentTurnId: "verify-turn", workspaceRevision: { status: "known", revision: "r1" }, diff: null, toolCalls: [], action: null,
        commands: [{ command: "bun test", exitCode: 0, toolCallId: "c1", turnId: "verify-turn", outcome: "succeeded",
          provenance: "provider-structured", sourceRevision: { status: "known", revision: "r1" } }] } as never }],
      report: { outcome: "completed", acceptanceCriteria: [{ text: "Search works", required: true, status: "met" }] } } as AgentRunDetail);
    expect(tarsObservation(completed(NOW), ["Search works"]).state).toBe("completed");
    expect(tarsObservation(completed(NOW), ["Search works"], LATER)).toMatchObject({ state: "blocked", detail: expect.stringContaining("handed back") });
    expect(tarsObservation(completed(LATER), ["Search works"], LATER).state).toBe("completed");
    const takenOver = { ...base, agentRun: { ...base.agentRun, state: "paused", pauseReason: "taken-over", reasonDetail: "You took over." }, events: [], report: null } as AgentRunDetail;
    expect(tarsObservation(takenOver)).toEqual({ state: "takenOver", detail: "You took over." });
  });

  test("cancel is terminal: no later control or tick revives the responsibility", async () => {
    const f = fixture(); const row = f.responsibility();
    expect((await f.act(row, "cancel")).status).toBe("applied");
    const cancelled = f.store.get(row.id)!;
    for (const operation of OPERATIONS)
      expect(await f.act(cancelled, operation)).toMatchObject({ status: "rejected", reason: "ended" });
    await f.settle();
    expect(f.store.get(row.id)).toEqual(cancelled);
    expect(f.calls).toEqual(["cancel"]);
  });

  test("applying the same request twice has exactly one effect", async () => {
    const f = fixture(); const row = f.responsibility();
    const [first, second] = await Promise.all([f.click(row.id, row.revision, "pause", "same-click"), f.click(row.id, row.revision, "pause", "same-click")]);
    const replay = await f.click(row.id, row.revision, "pause", "same-click");
    expect(first.record).toEqual(second.record);
    expect(replay.record).toEqual(first.record);
    expect(first.record.status).toBe("applied");
    expect(f.store.get(row.id)).toMatchObject({ state: "paused", revision: row.revision + 1 });
    expect(f.store.listActivity().filter((event) => event.responsibilityId === row.id && event.state === "paused")).toHaveLength(1);
    expect(f.controls()).toEqual(["pause"]);
    expect(f.conversations.listActions()).toHaveLength(1);
    await expect(f.click(row.id, row.revision, "cancel", "same-click")).rejects.toThrow("different action");
  });

  test("a lock wait leaves the request pending and its retry applies once", async () => {
    const f = fixture(); const row = f.responsibility();
    f.database.exec(`CREATE TRIGGER busy_record BEFORE UPDATE ON tars_action_records
      WHEN json_extract(NEW.body_json, '$.status') = 'applied' BEGIN SELECT RAISE(ABORT, '${BUSY.replaceAll("'", "''")}'); END;`);
    await expect(f.click(row.id, row.revision, "pause", "busy-click")).rejects.toBeInstanceOf(TarsStorageBusyError);
    expect(f.conversations.getAction("busy-click")?.status).toBe("pending");
    expect(f.store.get(row.id)).toEqual(row);
    f.database.exec("DROP TRIGGER busy_record");
    expect((await f.click(row.id, row.revision, "pause", "busy-click")).record.status).toBe("applied");
    expect(f.store.get(row.id)).toMatchObject({ state: "paused", revision: row.revision + 1 });
  });

  test("a spoken start now applies at once, starts each named queued work beside running work and replays once", async () => {
    const f = fixture();
    const running = f.responsibility("running", true);
    const first = f.responsibility("queued", false);
    const second = f.responsibility("queued", false);
    const spoken = await f.say([first, second].map((row) => ({ kind: "control" as const, responsibilityId: row.id, expectedRevision: row.revision, operation: "startNow" as const })), "queued된 작업 바로 실행해");
    const receipts = await spoken.apply();
    // Not a proposal waiting for Confirm: the user's words already asked for it.
    expect(receipts.map((receipt) => receipt.status)).toEqual(["applied", "applied"]);
    await f.settle();
    for (const row of [first, second]) expect(f.store.get(row.id)).toMatchObject({ state: "running", agentRunId: `run-${row.id}` });
    expect(f.store.get(running.id)?.state).toBe("running");
    // A lost acknowledgement replays the saved receipts without starting anything again.
    expect(await spoken.apply()).toEqual(receipts);
    expect(f.calls.filter((call) => call === "start")).toHaveLength(2);
    expect(f.controls()).toEqual([]);
  });

  test("words and clicks take the same admission, run control and outcome", async () => {
    const f = fixture(); const row = f.responsibility();
    const stale = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision + 5, operation: "pause" }]);
    const [staleReceipt] = await stale.apply();
    const staleClick = await f.act({ ...row, revision: row.revision + 5 }, "pause");
    expect(staleReceipt).toMatchObject({ status: "rejected", responsibilityId: null, reason: "stale", error: staleClick.error });
    const spoken = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "takeover" }], "내가 할게");
    const [receipt] = await spoken.apply();
    expect(receipt).toMatchObject({ status: "applied", responsibilityId: row.id });
    // A lost acknowledgement replays the saved receipt without a second effect.
    expect(await spoken.apply()).toEqual([receipt!]);
    expect(f.store.get(row.id)).toMatchObject({ state: "takenOver", revision: row.revision + 1 });
    const resume = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision + 1, operation: "resume" }], "계속해");
    expect((await resume.apply())[0]).toMatchObject({ status: "rejected", reason: "takenOver" });
    expect((await f.act(f.store.get(row.id)!, "handBack")).status).toBe("applied");
    expect(f.controls()).toEqual(["takeover", "handBack"]);
  });

  test("an ended run or a lost ownership refuses hand-back with its own reason", async () => {
    let failure: Error = new TarsRunEndedError();
    const f = fixture({ controlRun: async (_row, operation) => { if (operation === "handBack") throw failure; f.calls.push(operation); } });
    const row = f.responsibility();
    await f.act(row, "takeover");
    expect(await f.act(f.store.get(row.id)!, "handBack")).toMatchObject({ status: "rejected", reason: "runEnded" });
    failure = new TarsOwnershipLostError("This task's agent ownership changed. Tars cannot reclaim it.");
    expect(await f.act(f.store.get(row.id)!, "handBack")).toMatchObject({ status: "rejected", reason: "ownershipLost" });
    expect(f.store.get(row.id)?.state).toBe("takenOver");
  });

  test("a model-proposed accept-as-done waits for the user's Confirm and never touches the run", async () => {
    const f = fixture(); const row = f.responsibility();
    const unverified = f.store.patch(row.id, row.revision, { state: "blocked", detail: "Unverified.", detailCode: "unverifiedCompletion" }, NOW);
    const spoken = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: unverified.revision, operation: "acceptCompletion" }], "완료로 처리해");
    const [receipt] = await spoken.apply();
    expect(receipt).toMatchObject({ status: "proposed" });
    expect(f.store.get(row.id)).toEqual(unverified);
    const confirmed = await f.click(row.id, unverified.revision, "acceptCompletion", tarsConfirmationRequestId(spoken.message.id, 0));
    expect(confirmed.record).toMatchObject({ status: "applied" });
    expect(f.store.get(row.id)).toMatchObject({ state: "completed", detailCode: "acceptedWithoutVerification" });
    expect(f.controls()).toEqual([]);
  });

  test("a model-proposed hand-back waits for the user's confirming click, which applies it once", async () => {
    const f = fixture(); const row = f.responsibility();
    await f.act(row, "takeover");
    const owned = f.store.get(row.id)!;
    const spoken = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: owned.revision, operation: "handBack" }], "다시 맡아줘");
    const [receipt] = await spoken.apply();
    expect(receipt).toMatchObject({ status: "proposed", responsibilityId: null, error: null, reason: null });
    expect(await spoken.apply()).toEqual([receipt!]);
    expect(f.store.get(row.id)).toEqual(owned);
    expect(f.controls()).toEqual(["takeover"]);
    const confirmId = tarsConfirmationRequestId(spoken.message.id, 0);
    const [first, second] = await Promise.all([f.click(row.id, owned.revision, "handBack", confirmId), f.click(row.id, owned.revision, "handBack", confirmId)]);
    expect(first.record).toMatchObject({ status: "applied", source: "click" });
    expect(second.record).toEqual(first.record);
    expect(f.store.get(row.id)).toMatchObject({ state: "running", revision: owned.revision + 1 });
    expect(f.controls()).toEqual(["takeover", "handBack"]);
    // The proposal itself carries the click's outcome, so no Confirm is offered again.
    expect(f.conversations.getReceipt(spoken.message.id, 0)).toMatchObject({ status: "applied", responsibilityId: row.id, revision: receipt!.revision + 1 });
    // A confirmation must repeat exactly what was proposed.
    await expect(f.click(row.id, owned.revision, "cancel", confirmId)).rejects.toThrow("does not match");
  });

  test("resume and cancel proposals also wait; a stale confirmation is refused; pause and takeover still apply at once", async () => {
    const f = fixture(); const row = f.responsibility("paused");
    const spoken = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" },
      { kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "cancel" }], "계속하고 아니면 취소해");
    expect((await spoken.apply()).map((receipt) => receipt.status)).toEqual(["proposed", "proposed"]);
    expect(f.store.get(row.id)).toEqual(row);
    expect((await f.click(row.id, row.revision, "resume", tarsConfirmationRequestId(spoken.message.id, 0))).record.status).toBe("applied");
    // The cancel proposal named the earlier revision; confirming it now is stale.
    expect((await f.click(row.id, row.revision, "cancel", tarsConfirmationRequestId(spoken.message.id, 1))).record).toMatchObject({ status: "rejected", reason: "stale" });
    expect(f.conversations.listReceipts(spoken.message.id).map(({ status, reason }) => [status, reason])).toEqual([["applied", null], ["rejected", "stale"]]);
    const running = f.store.get(row.id)!;
    const stop = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: running.revision, operation: "pause" }], "멈춰");
    expect((await stop.apply())[0]?.status).toBe("applied");
    expect(f.store.get(row.id)?.state).toBe("paused");
    expect(f.controls()).toEqual(["resume", "pause"]);
  });

  test("a confirmation's record, its proposal and the effect commit together or not at all", async () => {
    for (const table of ["tars_action_records", "tars_action_receipts"]) {
      const f = fixture(); const row = f.responsibility("paused");
      const spoken = await f.say([{ kind: "control", responsibilityId: row.id, expectedRevision: row.revision, operation: "resume" }], "계속해");
      await spoken.apply();
      const confirmId = tarsConfirmationRequestId(spoken.message.id, 0);
      f.database.exec(`CREATE TRIGGER refuse_settle BEFORE UPDATE ON ${table}
        WHEN json_extract(NEW.body_json, '$.status') = 'applied' BEGIN SELECT RAISE(ABORT, '${BUSY.replaceAll("'", "''")}'); END;`);
      await expect(f.click(row.id, row.revision, "resume", confirmId)).rejects.toBeInstanceOf(TarsStorageBusyError);
      expect(f.store.get(row.id)).toEqual(row);
      expect(f.conversations.getReceipt(spoken.message.id, 0)?.status).toBe("proposed");
      expect(f.conversations.getAction(confirmId)?.status).toBe("pending");
      f.database.exec("DROP TRIGGER refuse_settle");
      expect((await f.click(row.id, row.revision, "resume", confirmId)).record.status).toBe("applied");
      expect(f.conversations.getReceipt(spoken.message.id, 0)?.status).toBe("applied");
      expect(f.store.get(row.id)).toMatchObject({ state: "running", revision: row.revision + 1 });
    }
  });
});
