import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts, type TarsExecutionObservation } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { TarsOwnershipLostError, TarsRunEndedError, TarsRunRefusedError } from "../electron/host-service/tars-ownership";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { tarsConfirmationRequestId } from "../src/lib/tars/conversation";
import { tarsExecutionScope } from "../src/lib/tars/continuation";
import { observeTarsContext } from "../electron/main/tars-context";

const NOW = "2026-11-11T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

/** Real persisted actions, host admission and scheduler; only task/provider execution is simulated. */
function fixture() {
  let limit = 0;
  let ended: TarsExecutionObservation | null = null;
  let deliveries = 0;
  let preStartFailure = false;
  const directory = mkdtempSync(path.join(tmpdir(), "tars-continuation-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "store.sqlite");
  let starts = 0;
  let busy = true;
  let runId = "original-run";
  const said: string[] = [];
  const turns = new Set<string>();
  const scopeChecks: string[] = [];
  let lostAck = false;
  let unknownAck = false;
  let unavailable = false;
  let state: "running" | "completed" = "running";
  let createdId = "";
  function open() {
    const db = new Database(filename);
    const store = new TarsStore(db);
    const conversations = new TarsConversationStore(db);
    const ports: TarsRuntimePorts = {
      store, now: () => NOW, concurrencyLimit: () => limit,
      validateScope: async (row) => { scopeChecks.push(row.workspaceId); },
      prepareWorkspace: async () => { throw new Error("Must reuse execution workspace"); },
      prepareTask: async () => { throw new Error("Must reuse execution task"); },
      findRun: async () => runId, startRun: async () => { throw new Error("Must not start initial work"); },
      observe: async (row) => row.id === createdId ? ended ?? { state, detail: null } : { state: row.state === "completed" || row.state === "resultReady" ? "resultReady" : "running", detail: null }, controlRun: async () => {},
      respondTask: async () => { throw new Error("Messages must be persisted before dispatch"); },
      messages: conversations,
      hasUserTurn: (id, turn) => turns.has(`${id}:${turn}`),
      deliverMessage: async (row, text, turn) => {
        deliveries++;
        if (ended) throw new TarsRunEndedError();
        if (busy) return "busy";
        busy = true; said.push(text); turns.add(`${row.agentRunId}:${turn}`); return "sent";
      },
      continueWork: async (row, scope) => {
        if (preStartFailure) throw new TarsRunRefusedError("Continuation preparation failed before start");
        if (unavailable) throw new TarsOwnershipLostError("Execution workspace was removed.");
        expect(row.taskId).toBe("actual-task"); expect(row.executionWorkspaceId).toBe("actual-workspace");
        if (runId !== scope.previousRunId) return runId;
        starts++; runId = `follow-up-${starts}`;
        state = "running"; busy = true;
        if (lostAck) { lostAck = false; if (unknownAck) throw new Error("Lost start acknowledgement"); throw new TarsStorageBusyError(); }
        return runId;
      },
    };
    const runtime = createTarsRuntime(ports);
    const close = () => { runtime.stop(); if (!db.closed) db.close(); };
    cleanup.push(close);
    return { db, store, conversations, runtime, close };
  }
  let current = open();
  current.conversations.configure({ providerId: "codex", model: "test", maxTurns: 6 });
  const created = current.store.create({ requestId: "source-request", title: "Split shared UI work", instruction: "Split and verify shared components.",
    acceptanceCriteria: ["Existing behavior is preserved"], workspaceId: "registered-source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  createdId = created.id;
  const row = current.store.patch(created.id, created.revision, { state: "running", taskId: "actual-task", executionWorkspaceId: "actual-workspace", agentRunId: runId }, NOW);
  let sequence = 0;
  const tick = async () => { current.runtime.requestTick(); await current.runtime.drain(); };
  const currentRow = () => current.store.get(row.id)!;
  const propose = async (text: string) => {
    const saved = current.conversations.create({ requestId: `follow-up-${sequence++}`, text }, NOW);
    const claimed = current.conversations.claim(saved.id, saved.revision, NOW);
    const action = { kind: "control" as const, responsibilityId: row.id, expectedRevision: currentRow().revision, operation: "message" as const, input: { text } };
    const message = current.conversations.answer(claimed.id, claimed.revision, { reply: "Confirm the follow-up.", actions: [action] }, NOW);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations: current.conversations, responsibilities: current.store, readRegistry: () => [], control: current.runtime.act, requestTick: () => {}, now: () => NOW });
    const { kind: _kind, ...control } = action;
    const confirm = () => actTars({ ...control, requestId: tarsConfirmationRequestId(message.id, 0), source: "click" },
      { conversations: current.conversations, runtime: current.runtime, now: () => NOW });
    return { message, action, confirm };
  };
  return {
    get current() { return current; },
    endBlocked: (detailCode: NonNullable<TarsExecutionObservation["detailCode"]>) => { ended = { state: "blocked", detail: "Ended without accepted verification", detailCode }; },
    deliveries: () => deliveries,
    capacity: (value: number) => { limit = value; },
    occupy: (id: string) => {
      const item = current.store.create({ requestId: id, title: id, instruction: id, acceptanceCriteria: [id], workspaceId: "registered-source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
      return current.store.patch(item.id, item.revision, { state: "running", agentRunId: id, taskId: id, executionWorkspaceId: "actual-workspace" }, NOW);
    }, currentRow, propose, tick, said, scopeChecks,
    recordTurn: (id: string, turn: string) => turns.add(`${id}:${turn}`),
    failBeforeStart: (fail = true) => { preStartFailure = fail; },
    starts: () => starts, free: () => { busy = false; },
    complete: async () => { state = "completed"; await tick(); },
    loseAcknowledgement: (unknown = false) => { lostAck = true; unknownAck = unknown; }, unavailable: () => { unavailable = true; },
    restart: () => { current.close(); current = open(); },
    patch: (patch: Parameters<TarsStore["patch"]>[2]) => current.store.patch(row.id, currentRow().revision, patch, NOW),
  };
}

test("confirmed corrections wait in order on the actual task; concurrent duplicates execute once across restart", async () => {
  const f = fixture();
  const first = await f.propose("앞서 나눈 작업에서 공통 토큰을 써줘");
  await Promise.all([first.confirm(), first.confirm()]);
  const second = await f.propose("같은 작업의 한국어 상태도 확인해줘"); await second.confirm();
  expect(f.said).toEqual([]);
  f.restart(); f.free(); await f.tick();
  expect(f.said).toEqual([first.action.input.text]);
  f.free(); await f.tick(); await f.tick();
  expect(f.said).toEqual([first.action.input.text, second.action.input.text]);
  expect(f.current.store.snapshot().responsibilities).toHaveLength(1);
  expect(f.starts()).toBe(0);
  expect(f.scopeChecks.every((id) => id === "actual-workspace")).toBe(true);
});

test.each([false, true])("completed work keeps identity and original scope, starts fresh verification, and recovers a lost start acknowledgement (%s)", async (unknown) => {
  const f = fixture(); await f.complete();
  const original = f.currentRow();
  const next = await f.propose("그 작업을 확인했는데 오류 상태도 추가해줘");
  const snapshot = f.current.store.snapshot();
  expect(snapshot.pendingDecisions).toHaveLength(1);
  expect(projectTarsDecisions({ messages: [next.message], receipts: f.current.conversations.listReceipts(next.message.id), records: [], answers: [], activity: [],
    responsibilities: snapshot.responsibilities })[0]?.state).toBe("waiting");
  f.loseAcknowledgement(unknown); await next.confirm(); await f.tick();
  expect(f.starts()).toBe(1);
  f.restart(); await f.tick(); await f.tick();
  expect(f.starts()).toBe(1);
  expect(f.currentRow()).toMatchObject({ id: original.id, taskId: original.taskId, executionWorkspaceId: original.executionWorkspaceId,
    instruction: original.instruction, acceptanceCriteria: original.acceptanceCriteria, agentRunId: "follow-up-1", previousRunIds: ["original-run"] });
  expect(tarsExecutionScope(f.currentRow()).instruction).toBe(next.action.input.text);
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(next.message.id, 0))?.delivery?.status).toBe("delivered");
  await f.complete();
  const another = await f.propose("같은 변경의 역방향도 검증해줘"); await another.confirm(); await f.tick();
  expect(f.starts()).toBe(2);
  expect(f.currentRow().previousRunIds).toEqual(["original-run", "follow-up-1"]);
  expect(f.currentRow().continuation?.previousInstruction).toBe(next.action.input.text);
});

test.each(["paused", "takenOver", "cancelled"] as const)("follow-up cannot restart %s work", async (state) => {
  const f = fixture(); f.patch({ state });
  const next = await f.propose("이어서 고쳐줘");
  expect(f.current.conversations.listReceipts(next.message.id)[0]?.status).toBe("rejected");
  await f.tick(); expect(f.starts()).toBe(0); expect(f.said).toEqual([]);
});

test("stale confirmation and missing execution location cannot create replacement work", async () => {
  const f = fixture(); await f.complete();
  const next = await f.propose("그 작업에 회귀 테스트를 추가해줘");
  f.patch({ detail: "Changed after observation" });
  expect((await next.confirm()).record).toMatchObject({ status: "rejected", reason: "stale" });
  f.patch({ executionWorkspaceId: null });
  const missing = await f.propose("이어서 해줘");
  expect(f.current.conversations.listReceipts(missing.message.id)[0]).toMatchObject({ status: "rejected", reason: "ownershipLost" });
  expect(f.starts()).toBe(0);
});

test("unusable completed execution surfaces a failed delivery and preserves the completed result", async () => {
  const f = fixture(); await f.complete(); f.unavailable();
  const next = await f.propose("그 작업의 오류도 고쳐줘"); await next.confirm(); await f.tick();
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(next.message.id, 0))?.delivery).toMatchObject({ status: "failed", reason: "ownershipLost" });
  expect(f.currentRow().state).toBe("resultReady"); expect(f.starts()).toBe(0);
});

test("observations distinguish registered source from actual execution and retain follow-up scope", async () => {
  const f = fixture(); await f.complete(); const next = await f.propose("이 작업에 오류 표시도 추가해줘"); await next.confirm(); await f.tick();
  const observed = observeTarsContext({ tars: f.current.store, loadRepositoryRegistry: () => [], loadWorkspaceShellSummary: () => null,
    agentRuns: { getLatestAgentRunForTask: () => null }, tarsConversations: f.current.conversations }, NOW).observation.responsibilities[0];
  expect(observed).toMatchObject({ workspaceId: "registered-source", executionWorkspaceId: "actual-workspace", taskId: "actual-task",
    previousRunIds: ["original-run"], followUpScope: next.action.input.text });
});


test("a reply recorded before completion is not replayed as a new completed-work scope after restart", async () => {
  const f = fixture(); const next = await f.propose("그 작업의 공통 토큰을 사용해줘"); await next.confirm();
  const requestId = tarsConfirmationRequestId(next.message.id, 0);
  f.current.conversations.transitionDelivery(requestId, ["queued"], { status: "delivering", turnId: "already-recorded" }, NOW);
  f.recordTurn("original-run", "already-recorded");
  f.restart(); await f.complete(); await f.tick();
  expect(f.starts()).toBe(0);
  expect(f.current.conversations.getAction(requestId)?.delivery?.status).toBe("delivered");
});

test("queued additions follow the same task across the completion boundary", async () => {
  const f = fixture();
  const first = await f.propose("오류 표시를 추가해줘"); await first.confirm();
  const second = await f.propose("그 변경도 한국어로 확인해줘"); await second.confirm();
  await f.complete(); await f.tick();
  expect(f.starts()).toBe(1);
  f.free(); await f.tick();
  expect(f.said).toEqual([second.action.input.text]);
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(second.message.id, 0))?.delivery?.agentRunId).toBe("follow-up-1");
});

test("concurrent distinct submissions at one observed revision queue without duplicate execution", async () => {
  const f = fixture(); const row = f.currentRow();
  const send = (requestId: string, text: string) => actTars({ requestId, source: "click", responsibilityId: row.id,
    expectedRevision: row.revision, operation: "message", input: { text } }, { conversations: f.current.conversations, runtime: f.current.runtime, now: () => NOW });
  const results = await Promise.all([send("first", "First addition"), send("second", "Second addition")]);
  expect(results.map((result) => result.record.status)).toEqual(["applied", "applied"]);
  f.free(); await f.tick(); f.free(); await f.tick();
  expect(f.said).toEqual(["First addition", "Second addition"]);
  expect(f.starts()).toBe(0);
});


test.each(["runStopped", "incompleteReport", "staleVerification", "unverifiedCompletion"] as const)("an ended run observed as blocked (%s) settles its queued words without repeating delivery", async (code) => {
  const f = fixture();
  const next = await f.propose("Preserve this queued correction"); await next.confirm();
  f.endBlocked(code); await f.tick();
  const requestId = tarsConfirmationRequestId(next.message.id, 0);
  const record = f.current.conversations.getAction(requestId)!;
  expect(record.delivery).toMatchObject({ status: "cancelled", reason: "runEnded" });
  expect(record.action).toMatchObject({ input: { text: next.action.input.text } });
  const count = f.deliveries();
  await f.tick(); f.restart(); await f.tick();
  expect(f.current.conversations.getAction(requestId)).toEqual(record);
  expect(f.deliveries()).toBe(count); expect(f.starts()).toBe(0);
  expect(f.currentRow()).toMatchObject({ state: "blocked", detailCode: code });
});

test("completed follow-up waits for capacity across restart and starts once when a slot is released", async () => {
  const f = fixture(); await f.complete();
  f.capacity(2); const first = f.occupy("other-one"); f.occupy("other-two");
  const next = await f.propose("Continue only after a slot is free"); await next.confirm(); await f.tick();
  expect(f.starts()).toBe(0);
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(next.message.id, 0))?.delivery?.status).toBe("queued");
  expect((await f.current.runtime.get()).responsibilities.find(row => row.id === f.currentRow().id)?.queueWait).toEqual({ code: "capacity", active: 2, limit: 2 });
  f.restart(); await f.tick(); expect(f.starts()).toBe(0);
  f.current.store.patch(first.id, f.current.store.get(first.id)!.revision, { state: "completed" }, NOW);
  await f.tick(); await f.tick(); expect(f.starts()).toBe(1);
  f.restart(); await f.tick(); expect(f.starts()).toBe(1);
});


test("a definitive pre-start refusal settles without retrying or holding a capacity slot", async () => {
  const f = fixture(); await f.complete(); f.capacity(1); f.failBeforeStart();
  const next = await f.propose("This attempt cannot start"); await next.confirm(); await f.tick();
  const requestId = tarsConfirmationRequestId(next.message.id, 0);
  expect(f.current.conversations.getAction(requestId)?.delivery).toMatchObject({ status: "failed", reason: "runRefused" });
  expect(f.currentRow()).toMatchObject({ state: "resultReady", agentRunId: "original-run", executionPending: false });
  f.restart(); await f.tick(); expect(f.starts()).toBe(0);
});

test("an uncertain start retains its one slot and reconciles at capacity after restart", async () => {
  const f = fixture(); await f.complete(); f.capacity(1); f.loseAcknowledgement(true);
  const next = await f.propose("Recover this exact scope"); await next.confirm(); await f.tick();
  expect(f.currentRow()).toMatchObject({ state: "resultReady", executionPending: true });
  expect((await f.current.runtime.get()).responsibilities.find(row => row.id === f.currentRow().id)?.queueWait?.code).toBe("unknown");
  expect(f.starts()).toBe(1);
  f.restart(); await f.tick();
  expect(f.starts()).toBe(1);
  expect(f.currentRow()).toMatchObject({ state: "running", executionPending: false, agentRunId: "follow-up-1" });
});


test("a preflight read refusal during lost-ack recovery cannot erase an uncertain start", async () => {
  const f = fixture(); await f.complete(); f.capacity(1); f.loseAcknowledgement(true);
  const next = await f.propose("Keep the uncertain side effect recoverable"); await next.confirm(); await f.tick();
  f.failBeforeStart(); f.restart(); await f.tick();
  expect(f.starts()).toBe(1);
  expect(f.currentRow()).toMatchObject({ state: "resultReady", executionPending: true });
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(next.message.id, 0))?.delivery?.status).toBe("queued");
  f.failBeforeStart(false); await f.tick(); expect(f.starts()).toBe(1);
  expect(f.currentRow()).toMatchObject({ state: "running", agentRunId: "follow-up-1" });
});

test("a saved message waits while publication is unfinished, then continues after it fails", async () => {
  const f = fixture(); await f.complete();
  f.capacity(1); f.occupy("publishing-blocker");
  const next = await f.propose("Continue after publication"); await next.confirm(); await f.tick();
  const publication = { state: "committing" as const, failedStep: null, commit: null, branch: "feat/test", base: "main",
    commitMessage: "feat: test", title: "feat: test", url: null, number: null, error: null, reason: null, updatedAt: NOW };
  f.patch({ publication }); f.capacity(0);
  await f.tick(); f.restart(); await f.tick();
  expect(f.starts()).toBe(0);
  expect(f.current.conversations.getAction(tarsConfirmationRequestId(next.message.id, 0))?.delivery?.status).toBe("queued");
  f.patch({ publication: { ...publication, state: "failed", failedStep: "commit", error: "Commit failed", reason: "publishFailed" } });
  await f.tick();
  expect(f.starts()).toBe(1);
});
