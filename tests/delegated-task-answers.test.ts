import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { RunLedgerStore } from "../electron/persistence/run-ledger-store";
import {
  buildDelegatedTaskRunId,
  buildDelegatedTaskStepId,
  delegatedTaskResultReceipt,
  toDelegatedTaskSummary,
} from "../src/lib/runs/delegated-task";
import {
  collectOwedDelegatedTaskAnswers,
  recordDelegatedTaskAnswersDelivered,
  type DelegatedTaskAnswerLedger,
  type DelegatedTaskAnswerRef,
} from "../src/lib/runs/delegated-task-answers";
import { createPendingRun, createPendingRunStep, RUN_LEDGER_SCHEMA_VERSION } from "../src/lib/runs/run-domain";
import {
  buildDelegatedTaskReceiptsRetrievedContext,
  latestTurnStartedAt,
} from "../src/lib/task-context/delegated-task-receipts";

const PARENT = "parent-task";
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function at(minute: number, second = 0) {
  return new Date(Date.UTC(2026, 7, 10, 0, minute, second)).toISOString();
}

function port(store: RunLedgerStore): DelegatedTaskAnswerLedger {
  return {
    listRunAggregatesByOrigin: (args) => store.listAggregatesByOrigin(args),
    listRunReceipts: (args) => store.listReceipts(args),
    appendRunReceipts: (receipts) => store.appendReceipts(receipts),
  };
}

function ids(key: string) {
  const runId = buildDelegatedTaskRunId({ parentTaskId: PARENT, delegationKey: key });
  return { runId, stepId: buildDelegatedTaskStepId(runId) };
}

/** A detached child of the parent, claimed and running. */
function startChild(store: RunLedgerStore, key: string, now = at(0)) {
  const { runId, stepId } = ids(key);
  const run = createPendingRun({
    id: runId, kind: "delegated-task", origin: { kind: "task", id: PARENT },
    ownership: { repositoryPath: "/tmp/stave", workspaceId: "workspace-child", taskId: `task-${key}` },
    policy: { maxAttempts: 3, timeoutMs: 86_400_000, maxTurns: 200, maxOutputBytes: 1_048_576, maxEvents: 4_096 },
    provenance: { createdBy: "delegated-task-coordinator", schemaVersion: RUN_LEDGER_SCHEMA_VERSION }, now,
  });
  const step = createPendingRunStep({
    id: stepId, runId, kind: "delegated-task-turn",
    target: { taskId: `task-${key}`, workspaceId: "workspace-child", turnId: null, providerId: "codex" },
    dependencyIds: [], inputHash: "b".repeat(64), now,
  });
  store.claimStep({ run, step, executionId: `exec-${key}`, idempotencyKey: `claim-${key}`, now });
  return { runId, stepId };
}

/** One child turn ends with an answer, recorded the way this version records it. */
function answer(store: RunLedgerStore, key: string, turnId: string, text: string, now: string) {
  const { runId, stepId } = ids(key);
  const result = store.markStepWaiting({ runId, stepId, executionId: `exec-${key}`, idempotencyKey: `child:exec-${key}:turn:${turnId}`,
    detail: { code: "child-turn-completed", responseText: text, turnId }, reenter: true, now });
  expect(result.accepted).toBe(true);
}

/** An answer recorded before this version: no delivery tracking on the receipt. */
function legacyAnswer(store: RunLedgerStore, key: string, text: string, now: string) {
  const { runId, stepId } = startChild(store, key, now);
  store.appendReceipts([{ runId, stepId, type: "completed", executionId: `exec-${key}`, idempotencyKey: `legacy:${key}`, timestamp: now,
    detail: { code: "child-turn-completed", responseText: text } }]);
}

function summaries(store: RunLedgerStore) {
  return store.listAggregatesByOrigin({ originKind: "task", originId: PARENT, limit: 50 }).flatMap((aggregate) => {
    const receipts = store.listReceipts({ runId: aggregate.run.id });
    const summary = toDelegatedTaskSummary({ ...aggregate, resultReceipt: delegatedTaskResultReceipt(receipts, aggregate.step) });
    return summary ? [summary] : [];
  });
}

type Message = { role: string; startedAt?: string };

/**
 * One parent turn as both turn-start paths run it: read the owed answers,
 * build the context, commit the turn (its assistant row gets `startedAt`),
 * then record what it carried. `afterRead` runs between the read and the
 * commit, where the boundary race lives.
 */
function parentTurn(store: RunLedgerStore, history: Message[], startedAt: string, options: { afterRead?: () => void; attached?: string[] } = {}) {
  const owed = collectOwedDelegatedTaskAnswers(port(store), { parentTaskId: PARENT, lastTurnStartedAt: latestTurnStartedAt(history), now: startedAt });
  const delivered: DelegatedTaskAnswerRef[] = [];
  const part = buildDelegatedTaskReceiptsRetrievedContext({ children: summaries(store), answers: owed.answers, moreAnswers: owed.more, delivered,
    ...(options.attached ? { attachedTaskIds: new Set(options.attached) } : {}) });
  options.afterRead?.();
  history.push({ role: "user" }, { role: "assistant", startedAt });
  recordDelegatedTaskAnswersDelivered(port(store), { parentTaskId: PARENT, parentTurnId: `parent-turn-${history.length}`, answers: delivered, now: startedAt });
  return part?.content ?? "";
}

const long = (label: string) => `<${label}>`.padEnd(2_100, "x");
const count = (content: string, label: string) => content.split(`    <${label}>`).length - 1;

describe("owed subagent answers", () => {
  test("an answer deferred by the budget comes back although a newer message carries no record", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    for (let i = 0; i < 5; i += 1) { startChild(store, `k${i}`); answer(store, `k${i}`, `t${i}`, long(String(i)), at(i + 1)); }
    const history: Message[] = [];
    const first = parentTurn(store, history, at(10));
    expect(count(first, "4")).toBe(0);
    expect(first).toContain('result omitted for now; read the full answer with stave_get_task({"workspaceId":"workspace-child","taskId":"task-k4","turnId":"t4"})');
    // A notice, an interrupted turn or a turn without subagent results: newer, and no record of its own.
    history.push({ role: "assistant", startedAt: at(11) });
    const next = parentTurn(store, history, at(12));
    expect(count(next, "4")).toBe(1);
    expect(count(next, "0")).toBe(0);
  });

  test("an answer that lands after the read and before the turn's start is carried by the next turn", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    startChild(store, "late");
    const history: Message[] = [];
    // The turn reads at 10:00; the answer is recorded at 10:30; the turn's row says it started at 11:00.
    const first = parentTurn(store, history, at(11), { afterRead: () => answer(store, "late", "t1", "LATE-ANSWER", at(10, 30)) });
    expect(first).not.toContain("LATE-ANSWER");
    expect(parentTurn(store, history, at(12))).toContain("    LATE-ANSWER");
    expect(parentTurn(store, history, at(13))).not.toContain("LATE-ANSWER");
  });

  test("each answer of one child arrives exactly once across its follow-up turns", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    startChild(store, "docs");
    const history: Message[] = [];
    answer(store, "docs", "turn-1", "ANSWER-A", at(1));
    expect(parentTurn(store, history, at(2))).toContain("    ANSWER-A");
    // The follow-up runs: the step moves, the answer does not.
    expect(parentTurn(store, history, at(3))).not.toContain("ANSWER-A");
    answer(store, "docs", "turn-2", "ANSWER-B", at(4));
    // A third turn ends before the parent's next turn: neither answer is lost or repeated.
    answer(store, "docs", "turn-3", "ANSWER-C", at(5));
    const next = parentTurn(store, history, at(6));
    expect(next).not.toContain("ANSWER-A");
    expect(next.indexOf("    ANSWER-B")).toBeGreaterThan(0);
    expect(next.indexOf("    ANSWER-C")).toBeGreaterThan(next.indexOf("    ANSWER-B"));
    const stopped = store.cancelStep({ ...ids("docs"), idempotencyKey: "stop", now: at(7) });
    expect(stopped.accepted).toBe(true);
    const after = parentTurn(store, history, at(8));
    expect(after).not.toContain("ANSWER-");
  });

  test("a restart between turns neither loses a deferred answer nor repeats a carried one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "stave-answers-")); dirs.push(dir);
    const file = path.join(dir, "ledger.db");
    let db = new Database(file);
    let store = new RunLedgerStore(db);
    for (let i = 0; i < 6; i += 1) { startChild(store, `k${i}`); answer(store, `k${i}`, `t${i}`, long(String(i)), at(i + 1)); }
    const history: Message[] = [];
    const first = parentTurn(store, history, at(10));
    db.close();
    // Restart: a fresh ledger handle and only the newest message of the task in memory.
    db = new Database(file);
    store = new RunLedgerStore(db);
    const reloaded: Message[] = [history.at(-1)!];
    const second = parentTurn(store, reloaded, at(11));
    for (let i = 0; i < 6; i += 1) expect(count(first, String(i)) + count(second, String(i))).toBe(1);
    expect(parentTurn(store, reloaded, at(12))).not.toContain("xxxx");
    db.close();
  });

  test("after an upgrade, thirty answers older than the last turn never replay", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    for (let i = 0; i < 30; i += 1) legacyAnswer(store, `old-${i}`, long(`old-${i}`), at(i));
    // The task's newest saved turn started after all of them.
    const history: Message[] = [{ role: "user" }, { role: "assistant", startedAt: at(40) }];
    for (let turn = 0; turn < 3; turn += 1) {
      const content = parentTurn(store, history, at(41 + turn));
      expect(content).not.toContain("xxxx");
      expect(content).not.toContain("result omitted");
      expect(content).not.toContain("New answers");
    }
  });

  test("after an upgrade, answers newer than the last turn are owed until carried, across turns", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    legacyAnswer(store, "seen", long("seen"), at(1));
    for (let i = 0; i < 6; i += 1) legacyAnswer(store, `new-${i}`, long(`new-${i}`), at(10 + i));
    const history: Message[] = [{ role: "assistant", startedAt: at(5) }];
    const contents = [at(20), at(21), at(22)].map((startedAt) => parentTurn(store, history, startedAt));
    expect(contents.join("")).not.toContain("<seen>");
    // Four fit the first turn; the two deferred are not settled by the newer turn start.
    expect(contents.map((content) => (content.match(/^ {4}<new-/gm) ?? []).length)).toEqual([4, 2, 0]);
  });

  test("twelve long answers drain over turns in order with none lost or repeated", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    for (let i = 0; i < 12; i += 1) { startChild(store, `k${String(i).padStart(2, "0")}`); answer(store, `k${String(i).padStart(2, "0")}`, `t${i}`, long(String(i)), at(1, i)); }
    const history: Message[] = [];
    const seen: number[] = [];
    for (let turn = 0; turn < 5; turn += 1) {
      const content = parentTurn(store, history, at(10 + turn));
      // Answer text stays within the shared budget; rows and notes are bounded separately.
      const answerText = content.split("\n").filter((line) => line.startsWith("    ")).reduce((sum, line) => sum + line.length - 4, 0);
      expect(answerText).toBeLessThanOrEqual(8_000);
      for (let i = 0; i < 12; i += 1) if (count(content, String(i)) === 1) seen.push(i);
    }
    expect(seen).toEqual(Array.from({ length: 12 }, (_, i) => i));
  });

  test("answers carried by a turn that was then interrupted count as delivered", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    startChild(store, "docs");
    answer(store, "docs", "turn-1", "ANSWER-A", at(1));
    const history: Message[] = [];
    expect(parentTurn(store, history, at(2))).toContain("    ANSWER-A");
    // The parent turn is stopped before it completes: its prompt already reached the provider session.
    history.push({ role: "assistant", startedAt: at(3) });
    expect(parentTurn(store, history, at(4))).not.toContain("ANSWER-A");
  });

  test("an attached child's answer and a held composer review settle once", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    startChild(store, "docs");
    answer(store, "docs", "turn-1", "ATTACHED-ANSWER", at(1));
    startChild(store, "stave-review-20261004120000-a");
    answer(store, "stave-review-20261004120000-a", "turn-1", "REVIEW-FINDINGS", at(2));
    const history: Message[] = [];
    const first = parentTurn(store, history, at(3), { attached: ["task-docs"] });
    expect(first).toContain("result: attached to this message under Attached Stave Tasks");
    expect(first).toContain("result: held until the user attaches this review");
    expect(first).not.toContain("ATTACHED-ANSWER");
    expect(first).not.toContain("REVIEW-FINDINGS");
    const later = parentTurn(store, history, at(4));
    expect(later).not.toContain("attached to this message");
    expect(later).not.toContain("held until");
  });

  test("delivery records leave the child's step, order and summary unchanged, and ignore other parents", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    const { runId, stepId } = startChild(store, "docs");
    answer(store, "docs", "turn-1", "ANSWER-A", at(1));
    const before = store.getAggregate({ runId, stepId });
    const beforeSummary = summaries(store);
    parentTurn(store, [], at(2));
    expect(store.getAggregate({ runId, stepId })).toEqual(before);
    expect(summaries(store)).toEqual(beforeSummary);
    const sequence = store.listReceipts({ runId }).find((receipt) => receipt.detail?.responseText)!.sequence;
    recordDelegatedTaskAnswersDelivered(port(store), { parentTaskId: "other-parent", parentTurnId: "x", answers: [{ runId, sequence }], now: at(3) });
    const deliveries = store.listReceipts({ runId }).filter((receipt) => receipt.type === "delivery");
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]!.detail).toEqual({ code: "delivered", parentTurnId: "parent-turn-2" });
  });

  test("a turn reads a bounded number of owed answers and counts the rest", () => {
    const store = new RunLedgerStore(new Database(":memory:"));
    for (let i = 0; i < 45; i += 1) { const key = `k${String(i).padStart(2, "0")}`; startChild(store, key); answer(store, key, "t", `short ${i}`, at(1, i)); }
    const owed = collectOwedDelegatedTaskAnswers(port(store), { parentTaskId: PARENT, lastTurnStartedAt: null, now: at(2) });
    expect(owed.answers).toHaveLength(40);
    expect(owed.more).toBe(5);
    expect(owed.answers[0]!.text).toBe("short 0");
  });
});
