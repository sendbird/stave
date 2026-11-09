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

/**
 * What the host's task looks like to the fake ports: a running turn, the words said, the run's user turns by ID
 * (`turnIds`, any user turn the run recorded, the user's own included) and a gate that holds one work's observation.
 */
interface TaskState {
  busy: boolean; said: string[]; turnIds: string[]; respondCalls: TarsControlRequest[];
  deliver?: (text: string, turnId: string) => Promise<"sent" | "busy">;
  observeGate?: (row: TarsResponsibility) => Promise<void> | undefined;
}

/** The real runtime and stores on a file, so a test can stop them and open the same file again as a restart does. */
function host(file: string, task: TaskState, options: { queue?: boolean } = {}) {
  const database = new Database(file); closers.push(() => { if (!database.closed) database.close(); });
  const store = new TarsStore(database);
  const conversations = new TarsConversationStore(database);
  let observation: TarsExecutionObservation = { state: "running", detail: null, activeStage: "work#1" };
  const ports: TarsRuntimePorts = {
    store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async () => "execution", prepareTask: async () => {}, findRun: async () => "owned-run", startRun: async () => "owned-run",
    observe: async (row) => { await task.observeGate?.(row); return observation; }, controlRun: async () => {},
    respondTask: async (_row, request, respond) => {
      task.respondCalls.push(request);
      // As the host does: a running turn, or older words still kept for the work, keeps these words too.
      if (request.operation === "message" && (task.busy || respond?.queueBehind)) { if (respond?.canQueue) return "queued"; throw new TarsTaskBusyError(); }
      task.said.push(request.input!.text!);
    },
    ...(options.queue === false ? {} : {
      messages: conversations,
      deliverMessage: async (_row, text, turnId) => {
        if (task.deliver) return task.deliver(text, turnId);
        if (task.busy) return "busy";
        task.said.push(text); task.turnIds.push(turnId);
        // The reply starts a turn in the task: the next message waits for it to end.
        task.busy = true;
        return "sent";
      },
      hasUserTurn: (_agentRunId, turnId) => task.turnIds.includes(turnId),
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
  const task: TaskState = { busy: true, said: [], turnIds: [], respondCalls: [] };
  let current = host(file, task, options);
  const created = current.store.create({ requestId: "owned", title: "Ship search", instruction: "Fix and verify search.",
    acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
  // As last observed, so an unchanged observation saves nothing and the revision the user confirms stays current.
  const row = current.store.patch(created.id, created.revision, { state: "running", taskId: "exec-task", executionWorkspaceId: "execution",
    agentRunId: "owned-run", activeStage: "work#1" }, NOW);
  let messages = 0;
  /** The user asks Tars to tell a work's run something; Tars proposes it and the user confirms the card. */
  const tell = async (text: string, work: TarsResponsibility = row) => {
    const { conversations, store, runtime } = current;
    conversations.configure({ providerId: "codex", model: "test-model", maxTurns: 6 });
    const queued = conversations.create({ requestId: `message-${messages++}`, text: `그렇게 전해줘: ${text}` }, NOW);
    const claimed = conversations.claim(queued.id, queued.revision, NOW);
    const revision = store.get(work.id)!.revision;
    const message = conversations.answer(claimed.id, claimed.revision, { reply: "Confirm on the card.",
      actions: [{ kind: "control", responsibilityId: work.id, expectedRevision: revision, operation: "message", input: { text } }] }, NOW);
    await applyTarsDecision({ messageId: message.id, expectedRevision: message.revision }, {
      conversations, responsibilities: store, readRegistry: () => [], now: () => NOW, requestTick: () => runtime.requestTick(), control: runtime.act });
    const record = (await actTars({ requestId: tarsConfirmationRequestId(message.id, 0), responsibilityId: work.id, expectedRevision: revision,
      operation: "message", source: "click" }, { conversations, runtime, now: () => NOW })).record;
    await runtime.drain();
    return { message, record };
  };
  const click = async (operation: TarsControlOperation, work: TarsResponsibility = row) => (await actTars({ requestId: `click-${messages++}`, responsibilityId: work.id,
    expectedRevision: current.store.get(work.id)!.revision, operation, source: "click" }, { conversations: current.conversations, runtime: current.runtime, now: () => NOW })).record;
  /** Another running work Tars owns, with its own task and run. */
  const work = (requestId: string) => {
    const other = current.store.create({ requestId, title: `Work ${requestId}`, instruction: "Do it.", acceptanceCriteria: ["Done"],
      workspaceId: "source", repositoryPath: "/tmp/repository", providerId: "codex" }, NOW);
    return current.store.patch(other.id, other.revision, { state: "running", taskId: `task-${requestId}`, executionWorkspaceId: "execution",
      agentRunId: "owned-run", activeStage: "work#1" }, NOW);
  };
  /**
   * Stave stops while it says the next message: the delivery is saved under way and `deliver` is called, and
   * nothing after it runs. `reached` says whether the run took the reply's user turn before Stave stopped.
   */
  const stopWhileSaying = async (reached: boolean) => {
    let called!: () => void;
    const saying = new Promise<void>((resolve) => { called = resolve; });
    task.busy = false;
    task.deliver = async (text, turnId) => {
      if (reached) { task.said.push(text); task.turnIds.push(turnId); }
      called();
      return new Promise<never>(() => {});
    };
    current.runtime.requestTick();
    await saying;
    task.deliver = undefined;
    current.runtime.stop(); current.database.close(); current = host(file, task, options);
  };
  const record = (requestId: string) => current.conversations.getAction(requestId)!;
  return {
    task, row, tell, click, work, stopWhileSaying, record, get host() { return current; },
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
    // Said as the turn it named before it started.
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "delivered", turnId: f.task.turnIds[0] });
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

  test("survive a restart, and one under way when Stave stopped is settled from its own turn, never said twice", async () => {
    const f = fixture();
    const kept = await f.tell("Keep going after the restart.");
    f.restart();
    expect(f.record(kept.record.requestId).delivery?.status).toBe("queued");
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["Keep going after the restart."]);

    // Stave stopped right after saying it: the record is still under way, and the run took its turn.
    f.task.busy = true;
    const reached = await f.tell("This one reached the task.");
    await f.stopWhileSaying(true);
    expect(f.record(reached.record.requestId).delivery?.status).toBe("delivering");
    f.task.busy = false;
    await f.tick();
    expect(f.record(reached.record.requestId).delivery?.status).toBe("delivered");
    expect(f.task.said).toEqual(["Keep going after the restart.", "This one reached the task."]);

    // Stave stopped before saying it: its turn is not there, so it is queued again and said once.
    f.task.busy = true;
    const lost = await f.tell("This one never left.");
    await f.stopWhileSaying(false);
    f.task.busy = false;
    await f.tick();
    expect(f.record(lost.record.requestId).delivery?.status).toBe("queued");
    await f.tick();
    expect(f.task.said).toEqual(["Keep going after the restart.", "This one reached the task.", "This one never left."]);
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

describe("words for a busy work after a restart, a takeover and alongside other works", () => {
  test("one under way when Stave stopped counts as said only if the run took that very turn, not just any user turn", async () => {
    const f = fixture();
    const { record } = await f.tell("Run the migration next.");
    await f.stopWhileSaying(false);
    expect(f.record(record.requestId).delivery?.status).toBe("delivering");
    // Meanwhile the user typed in the task: the run took a user turn, but not this message's.
    f.task.turnIds.push("user-typed-turn");
    f.task.busy = false;
    await f.tick();
    await f.tick();
    expect(f.task.said).toEqual(["Run the migration next."]);
    expect(f.record(record.requestId).delivery?.status).toBe("delivered");

    // Stave stopped right after the run took the reply's own turn: it is said, and never said again.
    f.task.busy = true;
    const reached = await f.tell("Then add a regression test.");
    await f.stopWhileSaying(true);
    f.task.busy = false;
    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.record(reached.record.requestId).delivery?.status).toBe("delivered");
    expect(f.task.said).toEqual(["Run the migration next.", "Then add a regression test."]);
  });

  test("a takeover discards one left under way too, so a hand-back never says it", async () => {
    const f = fixture();
    const { record } = await f.tell("Run the migration next.");
    await f.stopWhileSaying(false);
    expect(await f.click("takeover")).toMatchObject({ status: "applied" });
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "takenOver" });
    expect(await f.click("handBack")).toMatchObject({ status: "applied" });
    f.task.busy = false;
    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.task.said).toEqual([]);
    expect(f.record(record.requestId).delivery?.status).toBe("cancelled");
  });

  test("one under way that the run did take before a takeover is recorded as said, not discarded", async () => {
    const f = fixture();
    const { record } = await f.tell("Run the migration next.");
    await f.stopWhileSaying(true);
    expect(await f.click("takeover")).toMatchObject({ status: "applied" });
    expect(f.record(record.requestId).delivery?.status).toBe("delivered");
    expect(f.task.said).toEqual(["Run the migration next."]);
  });

  test("a hand-back discards words still kept from before a takeover Tars observed in the task", async () => {
    const f = fixture();
    const { record } = await f.tell("Run the migration next.");
    // Observed as taken over in its task, and Stave stopped before its delivery pass settled the words.
    const row = f.current();
    f.host.store.patch(row.id, row.revision, { state: "takenOver" }, NOW);
    f.restart();
    expect(f.record(record.requestId).delivery?.status).toBe("queued");
    expect(await f.click("handBack")).toMatchObject({ status: "applied" });
    expect(f.record(record.requestId).delivery).toMatchObject({ status: "cancelled", reason: "takenOver" });
    f.task.busy = false;
    for (let tick = 0; tick < 3; tick++) await f.tick();
    expect(f.task.said).toEqual([]);
  });

  test("a work's words are said even when many older words wait for paused work", async () => {
    const f = fixture();
    // More older words than one read holds, for one paused work and then for more paused works than one page holds.
    const paused = f.work("paused");
    for (let index = 0; index < 33; index++) await f.tell(`Paused step ${index}.`, paused);
    await f.click("pause", paused);
    for (let index = 0; index < 32; index++) {
      const other = f.work(`paused-${index}`);
      await f.tell(`Paused work ${index}.`, other);
      await f.click("pause", other);
    }
    const { record } = await f.tell("Ship it.");
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["Ship it."]);
    expect(f.record(record.requestId).delivery?.status).toBe("delivered");
  });

  test("each pass reads a bounded number of works and the next goes on from there, so every work's words are reached", async () => {
    const f = fixture();
    const { store, conversations, database } = f.host;
    // As many paused works with older words as one pass reads (32 pages of 32), so the free work's are beyond its reach.
    const waiting = 32 * 32;
    const kept: TarsResponsibility[] = [];
    database.transaction(() => {
      for (let index = 0; index < waiting; index++) {
        const other = f.work(`paused-${index}`);
        const paused = store.patch(other.id, other.revision, { state: "paused" }, NOW);
        kept.push(paused);
        conversations.recordAction({ requestId: `kept-${index}`, responsibilityId: paused.id, expectedRevision: paused.revision,
          operation: "message", input: { text: `Paused work ${index}.` }, source: "click" }, NOW);
        conversations.applyAction(`kept-${index}`, () => {}, NOW, undefined, { agentRunId: "owned-run" });
      }
    })();
    const { record } = await f.tell("Ship it.");
    const listDeliveryHeads = conversations.listDeliveryHeads.bind(conversations);
    let pages = 0;
    conversations.listDeliveryHeads = (limit, after) => { pages++; return listDeliveryHeads(limit, after); };
    const passes: number[] = [];
    f.task.busy = false;
    for (let tick = 0; tick < 3 && !f.task.said.length; tick++) { pages = 0; await f.tick(); passes.push(pages); }
    expect(f.task.said).toEqual(["Ship it."]);
    expect(f.record(record.requestId).delivery?.status).toBe("delivered");
    expect(Math.max(...passes)).toBeLessThanOrEqual(32);
    // Having read the end, the next pass starts over: the oldest paused work's words are said once it resumes.
    store.patch(kept[0]!.id, kept[0]!.revision, { state: "running" }, NOW);
    f.task.busy = false;
    for (let tick = 0; tick < 2 && f.task.said.length < 2; tick++) await f.tick();
    expect(f.task.said).toEqual(["Ship it.", "Paused work 0."]);
  });

  test("a slow observation of one work does not hold back another work's words", async () => {
    const f = fixture();
    const slow = f.work("slow");
    await f.tell("Slow work's step.", slow);
    const { record } = await f.tell("Ship it.");
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    f.task.observeGate = (row) => row.id === slow.id ? held : undefined;
    f.task.deliver = async (text, turnId) => {
      // Each work's task is its own: the slow work's turn never makes this one busy.
      f.task.said.push(text); f.task.turnIds.push(turnId);
      return "sent";
    };
    f.task.busy = false;
    f.host.runtime.requestTick();
    for (let turn = 0; turn < 50 && !f.task.said.includes("Ship it."); turn++) await new Promise((resolve) => setImmediate(resolve));
    expect(f.task.said).toEqual(["Ship it."]);
    expect(f.record(record.requestId).delivery?.status).toBe("delivered");
    release();
    await f.host.runtime.drain();
    expect(f.task.said).toEqual(["Ship it.", "Slow work's step."]);
  });

  test("new words wait behind words already kept for the same work, even once its task is free", async () => {
    const f = fixture();
    const first = await f.tell("First, use the existing index.");
    f.task.busy = false;
    const second = await f.tell("Second, add a regression test.");
    // Kept behind the first, not said at once; the tick its confirmation asked for says the first.
    expect(second.record).toMatchObject({ status: "applied", delivery: { status: "queued" } });
    expect(f.task.said).toEqual(["First, use the existing index."]);
    await f.tick();
    expect(f.task.said).toEqual(["First, use the existing index."]);
    f.task.busy = false;
    await f.tick();
    expect(f.task.said).toEqual(["First, use the existing index.", "Second, add a regression test."]);
    expect([first, second].map(({ record }) => f.record(record.requestId).delivery?.status)).toEqual(["delivered", "delivered"]);
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
