import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsExecutionObservation, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars, type TarsControlRequest } from "../electron/host-service/tars-control";
import { applyTarsDecision } from "../electron/host-service/tars-decisions";
import { TarsTaskBusyError } from "../electron/host-service/tars-ownership";
import { AgentRunCommandError } from "../src/lib/agent-runs/domain";
import { projectTarsDecisions } from "../src/lib/tars/decisions";
import { tarsConfirmationRequestId, type TarsControlOperation } from "../src/lib/tars/conversation";
import type { TarsResponsibility } from "../src/lib/tars/types";

const NOW = "2026-11-09T00:00:00.000Z";
const directories: string[] = [];
const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0).reverse()) close();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

/** What the host's task looks like to the fake ports: a running turn, a paused run, the words said and the run's user turns. */
interface TaskState { busy: boolean; said: string[]; userTurns: number; respondCalls: TarsControlRequest[]; deliver?: (text: string) => Promise<"sent" | "busy"> }

/** The real runtime and stores on a file, so a test can stop them and open the same file again as a restart does. */
function host(file: string, task: TaskState, options: { queue?: boolean } = {}) {
  const database = new Database(file); closers.push(() => { if (!database.closed) database.close(); });
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  let observation: TarsExecutionObservation = { state: "running", detail: null, activeStage: "work#1" };
  const ports: TarsRuntimePorts = {
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => "owned-run", startRun: async () => "owned-run",
    observe: async () => observation, controlRun: async () => {},
    respondTask: async (_row, request, respond) => {
      task.respondCalls.push(request);
      if (request.operation === "message" && task.busy) { if (respond?.canQueue) return "queued"; throw new TarsTaskBusyError(); }
      task.said.push(request.input!.text!); task.userTurns++;
    },
    ...(options.queue === false ? {} : {
      messages: conversations,
      deliverMessage: async (_row, text) => {
        if (task.deliver) return task.deliver(text);
        if (task.busy) return "busy";
        task.said.push(text); task.userTurns++;
        // The reply starts a turn in the task: the next message waits for it to end.
        task.busy = true;
        return "sent";
      },
      userTurns: () => task.userTurns,
    }),
  };
  const runtime = createTarsRuntime(ports);
  closers.push(() => runtime.stop());
  const tick = async () => { runtime.requestTick(); await runtime.drain(); await runtime.drain(); };
  return { database, store, conversations, runtime, tick, observe: (value: TarsExecutionObservation) => { observation = value; } };
}

function fixture(options: { queue?: boolean } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-tars-queued-")); directories.push(directory);
  const file = path.join(directory, "stave.sqlite");
  const task: TaskState = { busy: true, said: [], userTurns: 0, respondCalls: [] };
  let current = host(file, task, options);
  const created = current.store.create({ requestId: "owned", title: "Ship search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
  // As last observed, so an unchanged observation saves nothing and the revision the user confirms stays current.
  const row = current.store.patch(created.id, created.revision, { state: "running", taskId: "exec-task", executionWorkspaceId: "execution",
    agentRunId: "owned-run", activeStage: "work#1" }, NOW);
  let messages = 0;
  /** The user asks Tars to tell the run something; Tars proposes it and the user confirms the card. */
  const tell = async (text: string) => {
    const { conversations, store, runtime } = current;
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const queued = conversations.create({ requestId: `message-${messages++}`, text: `그렇게 전해줘: ${text}` }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const revision = store.get(row.id)!.revision;
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Confirm on the card.",
      actions: [{ kind: "control", responsibilityId: row.id, expectedRevision: revision, operation: "message", input: { text } }] }, NOW);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: store, readRegistry: () => [], now: () => NOW, requestTick: () => runtime.requestTick(), control: runtime.act });
    const record = (await actTars({ requestId: tarsConfirmationRequestId(message.id, 0), responsibilityId: row.id, expectedRevision: revision,
      operation: "message", source: "click" }, { conversations, runtime, now: () => NOW })).record;
    await runtime.drain();
    return { message, record };
  };
  const click = async (operation: TarsControlOperation) => (await actTars({ requestId: `click-${messages++}`, responsibilityId: row.id,
    expectedRevision: current.store.get(row.id)!.revision, operation, source: "click" }, { conversations: current.conversations, runtime: current.runtime, now: () => NOW })).record;
  const record = (requestId: string) => current.conversations.getAction(requestId)!;
  return {
    task, row, tell, click, record, get host() { return current; },
    tick: () => current.tick(),
    restart: () => { current.runtime.stop(); current.database.close(); current = host(file, task, options); return current; },
    current: (): TarsResponsibility => current.store.get(row.id)!,
  };
}

describe("words for a work whose task is busy", () => {
  test("are kept, shown as waiting, and said exactly once when the task's turn ends", async () => {
    const f = fixture();
    const before = f.current().revision;
    const { message, record } = await f.tell("다 허락할테니 알아서 진행하라고 하면돼");
    // Admitted and queued, not refused; the work itself does not change, so other decisions on it stay current.
    expect(record).toMatchObject({ status: "applied", delivery: { status: "queued", agentRunId: "owned-run", reason: null } });
    expect(f.current().revision).toBe(before);
    expect(f.task.said).toEqual([]);
    // The card shows where the words stand.
    const decisions = () => projectTarsDecisions({ messages: f.host.conversations.listViews(10), receipts: f.host.conversations.listReceipts(message.id),
      records: f.host.conversations.listActions(10), answers: [], activity: [], responsibilities: f.host.store.snapshot().responsibilities });
    expect(decisions()[0]).toMatchObject({ state: "answered", delivery: { status: "queued" } });

    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.task.said).toEqual([]);
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["다 허락할테니 알아서 진행하라고 하면돼"]);
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "delivered", userTurns: 0 });
    // Later ticks, and the turn ending again, never say it twice.
    f.task.busy = false;
    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.task.said).toHaveLength(1);
    expect(decisions()[0]).toMatchObject({ delivery: { status: "delivered" } });
  });

  test("several are said in order, each after the turn the one before it started", async () => {
    const f = fixture();
    const first = await f.tell("Use the existing index.");
    const second = await f.tell("Then add a regression test.");
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["Use the existing index."]);
    expect(f.record(second.record.requestId).delivery?.status).toBe("queued");
    await f.tick();
    expect(f.task.said).toHaveLength(1);
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["Use the existing index.", "Then add a regression test."]);
    expect([first, second].map(({ record }) => f.record(record.requestId).delivery?.status)).toEqual(["delivered", "delivered"]);
  });

  test("survive a restart, and one under way when Stave stopped is settled from the run's turns, never said twice", async () => {
    const f = fixture();
    const kept = await f.tell("Keep going after the restart.");
    f.restart();
    expect(f.record(kept.record.requestId).delivery?.status).toBe("queued");
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["Keep going after the restart."]);

    // Stave stopped right after saying it: the record is still under way, and the run took the user turn.
    const reached = await f.tell("This one reached the task.");
    f.host.conversations.transitionDelivery(reached.record.requestId, ["queued"], { status: "delivering", userTurns: f.task.userTurns }, NOW);
    f.task.userTurns++;
    f.restart();
    f.task.busy = false;
    await f.tick();
    expect(f.record(reached.record.requestId).delivery?.status).toBe("delivered");
    expect(f.task.said).toEqual(["Keep going after the restart."]);

    // Stave stopped before saying it: no user turn since, so it is queued again and said once.
    f.task.busy = true;
    const lost = await f.tell("This one never left.");
    f.host.conversations.transitionDelivery(lost.record.requestId, ["queued"], { status: "delivering", userTurns: f.task.userTurns }, NOW);
    f.restart();
    f.task.busy = false;
    await f.tick();
    expect(f.record(lost.record.requestId).delivery?.status).toBe("queued");
    await f.tick();
    expect(f.task.said).toEqual(["Keep going after the restart.", "This one never left."]);
    expect(f.record(lost.record.requestId).delivery?.status).toBe("delivered");
  });

  test("are cancelled when the user takes the work over, and stay cancelled after a hand-back", async () => {
    const f = fixture();
    const { record } = await f.tell("Run the migration next.");
    expect(await f.click("takeover")).toMatchObject({ status: "applied" });
    // Cancelled in the same transaction as the takeover, with the reason the interface translates.
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "takenOver" });
    f.host.observe({ state: "takenOver", detail: null });
    await f.tick();
    expect(await f.click("handBack")).toMatchObject({ status: "applied" });
    f.host.observe({ state: "running", detail: null, activeStage: "work#1" });
    f.task.busy = false;
    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.task.said).toEqual([]);
    expect(f.record(record.requestId).delivery?.status).toBe("cancelled");
  });

  test("are cancelled when the work is cancelled, completes, or is taken over in its task; paused work keeps them", async () => {
    const cancelled = fixture();
    const first = await cancelled.tell("Ship it.");
    await cancelled.click("cancel");
    expect(cancelled.record(first.record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "ended" });

    const completed = fixture();
    const second = await completed.tell("Ship it.");
    completed.host.observe({ state: "completed", detail: null });
    await completed.tick();
    completed.task.busy = false;
    await completed.tick();
    expect(completed.record(second.record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "ended" });
    expect(completed.task.said).toEqual([]);

    const inTask = fixture();
    const third = await inTask.tell("Ship it.");
    inTask.host.observe({ state: "takenOver", detail: null });
    await inTask.tick();
    expect(inTask.record(third.record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "takenOver" });

    const paused = fixture();
    const fourth = await paused.tell("Ship it.");
    await paused.click("pause");
    paused.task.busy = false;
    for (let tick = 0; tick < 2; tick++) await paused.tick();
    expect(paused.task.said).toEqual([]);
    expect(paused.record(fourth.record.requestId).delivery?.status).toBe("queued");
    await paused.click("resume");
    await paused.tick();
    expect(paused.task.said).toEqual(["Ship it."]);
  });

  test("a run that refuses the words leaves them visibly not said, and nothing else is answered for the user", async () => {
    const f = fixture();
    const { record } = await f.tell("Approve everything from now on.");
    f.task.busy = false;
    f.task.deliver = async () => { throw new AgentRunCommandError("refused", "Resume the run before sending it a reply."); };
    await f.tick();
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "failed", reason: "runRefused", error: "Resume the run before sending it a reply." });
    await f.tick();
    // The words are only ever the user's reply: no approval, answer or other task operation was sent for them.
    expect(f.task.respondCalls.map((request) => request.operation)).toEqual(["message"]);
    expect(f.current().pendingRequests).toBeUndefined();
  });

  test("a host without the delivery queue still refuses words for a busy task, as before", async () => {
    const f = fixture({ queue: false });
    const { record } = await f.tell("Use the existing index.");
    expect(record).toMatchObject({ status: "rejected", reason: "taskBusy" });
    expect(record).not.toHaveProperty("delivery");
  });
});

describe("the conversation shows where the words stand", () => {
  test("a record line reads waiting, said or not said with its reason, in both languages", async () => {
    const { createElement } = await import("react");
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { i18n, applyAppLocale } = await import("../src/i18n");
    const { TarsActionRecordLine } = await import("../src/components/tars/TarsActionRecordLine");
    const base = { requestId: "confirm:m:0", source: "fleet" as const, requestHash: "a".repeat(64), status: "applied" as const, error: null, reason: null,
      action: { kind: "control" as const, responsibilityId: "r", expectedRevision: 2, operation: "message" as const, input: { text: "Go on." } },
      revision: 2, createdAt: NOW, updatedAt: NOW };
    const delivery = (status: "queued" | "delivered" | "cancelled", reason: "takenOver" | null = null) => ({ status, agentRunId: "run", reason,
      error: reason ? "diagnostic" : null, queuedAt: NOW, updatedAt: NOW });
    const render = (value: ReturnType<typeof delivery>) => renderToStaticMarkup(createElement(TarsActionRecordLine, { record: { ...base, delivery: value } }));
    try {
      for (const [locale, waiting, said, notSaid, pending] of [
        ["en", "Waiting for the run&#x27;s current turn to end", "Said in the task after its turn ended", "Not said: the work was taken over", "Send to task pending · Fleet"],
        ["ko", "실행의 현재 턴이 끝나기를 기다리는 중입니다", "턴이 끝난 뒤 Task에 전달했습니다", "전달하지 않았습니다", "Task에 전달 처리 중 · Fleet"]] as const) {
        applyAppLocale(locale); await i18n.changeLanguage(locale);
        const queued = render(delivery("queued"));
        expect(queued).toContain(waiting);
        // Admitted but not said yet: the line never claims it was sent.
        expect(queued).toContain(pending);
        expect(render(delivery("delivered"))).toContain(said);
        const cancelled = render(delivery("cancelled", "takenOver"));
        expect(cancelled).toContain(notSaid);
        expect(cancelled).toContain('data-tars-reason="takenOver"');
        expect(cancelled).not.toContain("diagnostic");
      }
    } finally { applyAppLocale("en"); await i18n.changeLanguage("en"); }
  });
});
