import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { undoTarsAction } from "../electron/host-service/tars-action-undo";
import { TarsRunRefusedError } from "../electron/host-service/tars-ownership";
import { admitTarsPublish } from "../electron/host-service/tars-publish";
import { isTarsPublishable } from "../src/lib/tars/publish-model";
import { tarsExecutionScope } from "../src/lib/tars/continuation";
import { observeTarsContext } from "../electron/main/tars-context";

const NOW = "2026-11-12T00:00:00.000Z";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "tars-review-regression-"));
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }));
  let mode: "busy" | "unknown" | "definite" | "start" | "unknownWithRun" = "busy", run: string | null = null;
  let failRelease = false, validate: (() => Promise<void>) | undefined, attempts = 0;
  const errors: unknown[] = [];
  function open() {
    const db = new Database(path.join(directory, "store.sqlite")), store = new TarsStore(db), messages = new TarsConversationStore(db);
    const patch = store.patch.bind(store);
    store.patch = (id, revision, value, at, options) => {
      if (failRelease && value.executionPending === false) throw new TarsStorageBusyError();
      return patch(id, revision, value, at, options);
    };
    const ports: TarsRuntimePorts = { store, messages, now: () => NOW, onError: error => { errors.push(error); }, concurrencyLimit: () => 1,
      validateScope: async () => { await validate?.(); }, prepareTask: async () => {}, prepareWorkspace: async () => "execution",
      findRun: async () => run, startRun: async () => { throw new Error("No replacement run"); },
      observe: async row => ({ state: row.state === "running" ? "running" : "completed", detail: null }), controlRun: async () => {}, respondTask: async () => "queued",
      hasUserTurn: () => false, deliverMessage: async () => "busy", reconcileContinuation: async (_row, scope) => run === scope.previousRunId ? null : run,
      continueWork: async (_row, scope, admit) => {
        attempts++; admit?.();
        if (mode === "unknownWithRun") { run = `continued:${scope.requestId}`; throw new Error("Lost acknowledgement after committed start"); }
        if (mode === "unknown") throw new Error("Lost response with no committed run");
        if (mode === "definite") throw new TarsRunRefusedError("Cannot start this request");
        return mode === "busy" ? "busy" : (run = `continued:${scope.requestId}`);
      },
    };
    const runtime = createTarsRuntime(ports);
    const close = () => { runtime.stop(); if (!db.closed) db.close(); };
    cleanup.push(close); return { db, store, messages, runtime, ports, close };
  }
  let current = open();
  // An implementation goal is reached by its verified result, so this work is completed rather than awaiting confirmation.
  const created = current.store.create({ requestId: "original", title: "Completed work", instruction: "Original assignment", acceptanceCriteria: ["Original criterion"], completionGoal: "implementation",
    workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
  current.store.patch(created.id, created.revision, { state: "completed", taskId: "task", executionWorkspaceId: "execution", agentRunId: "original-run" }, NOW);
  const row = () => current.store.get(created.id)!;
  const tick = async () => { current.runtime.requestTick(); await current.runtime.drain(); };
  const queue = async (requestId: string) => {
    const result = await actTars({ requestId, source: "click", responsibilityId: created.id, expectedRevision: row().revision,
      operation: "message", input: { text: `Follow-up ${requestId}` } }, { conversations: current.messages, runtime: current.runtime, now: () => NOW });
    await current.runtime.drain(); return result.record;
  };
  return { get current() { return current; }, row, queue, tick, errors, attempts: () => attempts,
    mode: (value: typeof mode) => { mode = value; }, failRelease: (value: boolean) => { failRelease = value; },
    validate: (fn?: () => Promise<void>) => { validate = fn; },
    patch: (value: Parameters<TarsStore["patch"]>[2]) => current.store.patch(created.id, row().revision, value, NOW),
    restart: () => { current.close(); current = open(); },
    observe: () => observeTarsContext({ tars: current.store, tarsConversations: current.messages, agentRuns: { getLatestAgentRunForTask: () => null },
      loadRepositoryRegistry: () => [], loadWorkspaceShellSummary: () => null }, NOW).observation.responsibilities[0],
    withdraw: (requestId: string) => undoTarsAction({ requestId, expectedRevision: current.messages.getAction(requestId)!.revision }, { conversations: current.messages,
      responsibilities: current.store, readRegistry: () => [], serialize: current.runtime.serializeUndo, withdrawDelivery: current.runtime.withdrawDelivery }),
  };
}

for (const detailCode of ["acceptedWithoutVerification", null] as const) {
  for (const failure of ["unknown", "definite"] as const) {
    test(`a ${failure} follow-up failure preserves completed verification metadata (${detailCode})`, async () => {
      const f = fixture();
      const detail = detailCode ? "You accepted this result without verification." : "Verified original result with its evidence.";
      f.patch({ detail, detailCode }); f.mode(failure);
      await f.queue("repair");
      if (failure === "unknown") expect((await f.withdraw("repair")).refusal).toBeNull();
      expect(f.row()).toMatchObject({ state: "completed", agentRunId: "original-run", detail });
      expect(f.row().detailCode ?? null).toBe(detailCode);
      expect(isTarsPublishable(f.row())).toBe(detailCode === null);
      if (detailCode) expect(() => admitTarsPublish(f.row(), { expectedRevision: f.row().revision })).toThrow("Stave did not verify");
      else expect(admitTarsPublish(f.row(), { expectedRevision: f.row().revision }).id).toBe(f.row().id);
      f.restart(); await f.tick();
      expect(f.row().detail).toBe(detail); expect(f.row().detailCode ?? null).toBe(detailCode);
    });
  }
}

test("a failed reservation release rolls back the delivery failure and retries after restart", async () => {
  const f = fixture(); f.mode("definite"); f.failRelease(true);
  await f.queue("atomic");
  expect(f.current.messages.getAction("atomic")?.delivery?.status).toBe("queued");
  expect(f.row().executionPending).toBe(true);
  f.failRelease(false); f.restart(); await f.tick();
  expect(f.current.messages.getAction("atomic")?.delivery).toMatchObject({ status: "failed", reason: "runRefused" });
  expect(f.row()).toMatchObject({ state: "completed", executionPending: false, agentRunId: "original-run" });
  expect(f.attempts()).toBe(2);
  f.mode("start"); await f.queue("after-release");
  expect(f.row().agentRunId).toBe("continued:after-release");
});

test.each([1, 80])("open delivery scans are bounded per snapshot/tick with %s completed works", async count => {
  const f = fixture();
  for (let index = 1; index < count; index++) {
    const item = f.current.store.create({ requestId: `other:${index}`, title: "Other result", instruction: "Other", acceptanceCriteria: ["Done"],
      workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" }, NOW);
    f.current.store.patch(item.id, item.revision, { state: "completed" }, NOW);
  }
  let scans = 0;
  const prepare = f.current.db.prepare.bind(f.current.db);
  f.current.db.prepare = ((sql: string) => {
    if (sql.includes("tars_action_records") && sql.includes("$.delivery.status")) scans++;
    return prepare(sql);
  }) as typeof f.current.db.prepare;
  f.current.ports.deliverMessage = undefined;
  await f.current.runtime.get(); expect(scans).toBe(1);
  scans = 0; await f.tick(); expect(scans).toBe(1);
});

test("a record revision racing withdrawal scope validation returns the existing stale refusal", async () => {
  const f = fixture(); await f.queue("stale");
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  f.validate(async () => { entered(); await gate; });
  const withdrawing = f.withdraw("stale"); await ready;
  f.current.messages.transitionDelivery("stale", ["queued"], { status: "queued" }, NOW); release();
  expect((await withdrawing).refusal).toBe("stale");
  expect(f.current.messages.getAction("stale")?.delivery?.withdrawRequestedAt).toBeUndefined();
});

test.each(["withdrawn", "failed"] as const)("planner excludes the %s attempted scope but preserves preceding and later execution scopes", async outcome => {
  const f = fixture(); f.mode("start"); await f.queue("first");
  f.patch({ state: "completed", detail: "First follow-up verified" });
  const previous = tarsExecutionScope(f.row());
  f.mode(outcome === "failed" ? "definite" : "busy"); await f.queue("discarded");
  if (outcome === "withdrawn") await f.withdraw("discarded");
  expect(f.observe().followUpScope).toBe(previous.instruction);
  expect(f.observe().acceptanceCriteria).toEqual(previous.acceptanceCriteria.slice(0, 3));
  expect(tarsExecutionScope(f.row())).toMatchObject({ instruction: previous.instruction, acceptanceCriteria: previous.acceptanceCriteria });
  f.mode("start"); await f.queue("later");
  expect(f.row().continuation).toMatchObject({ previousInstruction: previous.instruction, previousCriteria: previous.acceptanceCriteria });
  expect(tarsExecutionScope(f.row()).instruction).toBe("Follow-up later");
  expect(f.observe().followUpScope).toBe("Follow-up later");
});


test("an actual continued run is adopted instead of restoring the old accepted-completion metadata", async () => {
  const f = fixture(); f.patch({ detail: "Accepted original", detailCode: "acceptedWithoutVerification" });
  f.mode("unknownWithRun"); await f.queue("committed");
  expect(f.row()).toMatchObject({ state: "completed", detailCode: "acceptedWithoutVerification" });
  expect((await f.withdraw("committed")).refusal).toBe("started");
  expect(f.row()).toMatchObject({ state: "running", agentRunId: "continued:committed", detail: null });
  expect(f.row().detailCode).not.toBe("acceptedWithoutVerification");
  expect(tarsExecutionScope(f.row()).instruction).toBe("Follow-up committed");
});


test.each(["withdrawn", "failed"] as const)("the first %s follow-up is omitted from the planner's active scope", async outcome => {
  const f = fixture(); f.mode(outcome === "failed" ? "definite" : "busy"); await f.queue("discarded-first");
  if (outcome === "withdrawn") await f.withdraw("discarded-first");
  expect(f.observe().followUpScope).toBeUndefined();
  expect(f.observe().acceptanceCriteria).toEqual(["Original criterion"]);
});

test("a pending withdrawal is not presented as active follow-up instructions while its execution remains unreadable", async () => {
  const f = fixture(); await f.queue("withdrawing");
  f.current.ports.reconcileContinuation = async () => { throw new Error("Execution unreadable"); };
  expect((await f.withdraw("withdrawing")).refusal).toBe("pending");
  expect(f.observe().followUpScope).toBeUndefined(); expect(f.observe().queuedMessages).toBeUndefined();
});
