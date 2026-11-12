import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { actTars } from "../electron/host-service/tars-control";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { admitTarsControl } from "../electron/host-service/tars-control";
import { isTarsPublishable } from "../src/lib/tars/publish-model";
import { tarsUnverifiedOptions } from "../src/lib/tars/decisions";
import { tarsGoalNext } from "../src/lib/tars/completion";
import { collectTarsAttention, tarsLaneOf } from "../src/lib/tars/attention";
import { CreateTarsResponsibilityInputSchema } from "../src/lib/tars/types";
import { TarsDecisionActionSchema } from "../src/lib/tars/conversation";

const NOW = "2026-11-11T12:00:00.000Z";
const input = { requestId: "goal", title: "Fix search", instruction: "Implement and verify search, then prepare a PR.",
  acceptanceCriteria: ["Search works"], workspaceId: "source", repositoryPath: "/tmp/project", providerId: "codex" as const };
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("old completed records restore conservatively without rewriting history or the request hash", () => {
  const dir = mkdtempSync(join(tmpdir(), "tars-goal-")); dirs.push(dir);
  const file = join(dir, "tasks.sqlite");
  let db = new Database(file);
  let store = new TarsStore(db);
  const created = store.create(input, NOW);
  // Reproduce the exact pre-feature JSON shape rather than using the new write contract.
  const old = { ...created, state: "completed", taskId: "same-task", executionWorkspaceId: "same-workspace", agentRunId: "run-1" };
  db.prepare("UPDATE tars_responsibilities SET body_json = ? WHERE id = ?").run(JSON.stringify(old), created.id);
  const history = store.listActivity();
  db.close(); db = new Database(file); store = new TarsStore(db);
  const restored = store.get(created.id)!;
  expect(restored).toMatchObject({ state: "resultReady", taskId: "same-task", executionWorkspaceId: "same-workspace", agentRunId: "run-1" });
  expect(restored.completionGoal).toBeUndefined();
  expect(isTarsPublishable(restored)).toBe(false);
  expect(store.create(input, NOW)).toEqual(restored);
  expect(store.listActivity()).toEqual(history);
  expect(JSON.parse((db.prepare("SELECT body_json FROM tars_responsibilities WHERE id = ?").get(created.id) as { body_json: string }).body_json)).toEqual(old);
  let current = store.create({ ...input, requestId: "new-goal", completionGoal: "pullRequest", branchName: "feat/search" }, NOW);
  current = store.patch(current.id, current.revision, { state: "resultReady", agentRunId: "new-run", taskId: "new-task", executionWorkspaceId: "new-workspace" }, NOW);
  current = store.patch(current.id, current.revision, { resultVerifiedRunId: "new-run" }, NOW);
  db.close(); db = new Database(file); store = new TarsStore(db);
  expect(store.get(current.id)).toEqual(current);
  expect(isTarsPublishable(store.get(current.id)!)).toBe(true);
  db.close();
});

test("repeated result checks retain the goal and identities and invalidate old execution evidence", () => {
  const db = new Database(":memory:"); const store = new TarsStore(db);
  let row = store.create({ ...input, completionGoal: "pullRequest", branchName: "feat/search" }, NOW);
  const original = row;
  // Exercise the lifecycle boundary a continuation producer uses; this does not start actual continuation runs.
  for (const agentRunId of ["run-1", "run-2", "run-3"]) {
    row = store.patch(row.id, row.revision, { state: "running", agentRunId, taskId: "same-task", executionWorkspaceId: "same-workspace", resultVerifiedRunId: null }, NOW);
    expect(isTarsPublishable(row)).toBe(false);
    row = store.patch(row.id, row.revision, { state: "resultReady", resultVerifiedRunId: agentRunId }, NOW);
    expect(row).toMatchObject({ id: original.id, completionGoal: "pullRequest", instruction: original.instruction, branchName: "feat/search", taskId: "same-task", executionWorkspaceId: "same-workspace" });
    expect(isTarsPublishable(row)).toBe(true);
    expect(tarsGoalNext(row)).toBe("publish");
    expect(tarsLaneOf(row, new Set([row.id]))).toBe("needsYou");
    expect(collectTarsAttention(store.snapshot())).toHaveLength(1);
    expect(() => admitTarsControl(row, { responsibilityId: row.id, expectedRevision: row.revision, operation: "acceptCompletion" })).toThrow("unobserved");
  }
  expect(store.snapshot().responsibilities).toHaveLength(1);
  expect(store.listActivity().filter((entry) => entry.state === "resultReady")).toHaveLength(3);
  db.close();
});

test("explicit result confirmation is durable and never controls the ended run", async () => {
  const db = new Database(":memory:"); const store = new TarsStore(db); const conversations = new TarsConversationStore(db);
  let row = store.create({ ...input, completionGoal: "confirmation" }, NOW);
  row = store.patch(row.id, row.revision, { state: "resultReady", agentRunId: "run-1" }, NOW);
  row = store.patch(row.id, row.revision, { resultVerifiedRunId: "run-1" }, NOW);
  const unexpected = async (): Promise<never> => { throw new Error("Must not create or control a run"); };
  const runtime = createTarsRuntime({ store, now: () => NOW, validateScope: unexpected, prepareWorkspace: unexpected,
    prepareTask: unexpected, findRun: unexpected, startRun: unexpected, observe: unexpected, controlRun: unexpected, respondTask: unexpected });
  const request = { requestId: "confirm-goal", responsibilityId: row.id, expectedRevision: row.revision, operation: "acceptCompletion", source: "click" };
  expect((await actTars(request, { conversations, runtime, now: () => NOW })).record.status).toBe("applied");
  expect((await actTars(request, { conversations, runtime, now: () => NOW })).record.status).toBe("applied");
  expect(new TarsStore(db).get(row.id)).toMatchObject({ state: "completed", completionConfirmedAt: NOW, agentRunId: "run-1" });
  runtime.stop(); await runtime.drain();
  const confirmed = store.get(row.id)!;
  const revised = store.patch(row.id, confirmed.revision, { state: "running", agentRunId: "run-2" }, NOW);
  expect(revised.completionConfirmedAt).toBeUndefined();
  expect(revised.resultVerifiedRunId).toBeNull();
  expect(store.patch(row.id, revised.revision, { state: "completed" }, NOW).state).toBe("resultReady");
  db.close();
});

test("a PR or merge goal cannot offer an acceptance that would bypass its endpoint", () => {
  for (const goal of ["pullRequest", "merge"] as const) {
    const options = tarsUnverifiedOptions("work", 1, goal);
    expect(options).toHaveLength(2);
    expect(options.some(option => option.kind === "control" && option.control.operation === "acceptCompletion")).toBe(false);
  }
});

test("goal contracts accept old payloads and reject invented endpoints and completion evidence", () => {
  expect(CreateTarsResponsibilityInputSchema.parse(input).completionGoal).toBeUndefined();
  expect(CreateTarsResponsibilityInputSchema.safeParse({ ...input, completionGoal: "deploy" }).success).toBe(false);
  expect(CreateTarsResponsibilityInputSchema.safeParse({ ...input, resultVerifiedRunId: "forged" }).success).toBe(false);
  const proposal = { kind: "delegate", workspaceId: input.workspaceId, title: input.title, instruction: input.instruction, acceptanceCriteria: input.acceptanceCriteria, priority: 50 };
  expect(TarsDecisionActionSchema.parse({ ...proposal, completionGoal: "pullRequest" })).toMatchObject({ completionGoal: "pullRequest" });
  expect(TarsDecisionActionSchema.safeParse({ ...proposal, completionGoal: "deploy" }).success).toBe(false);
});

test("a publication saved before Run binding retains its old execution link after continuation", () => {
  const db = new Database(":memory:"); const store = new TarsStore(db);
  let row = store.create({ ...input, completionGoal: "pullRequest" }, NOW);
  row = store.patch(row.id, row.revision, { state: "resultReady", agentRunId: "old-run", publication: {
    state: "opened", failedStep: null, commit: "abcdef0", branch: "feat/search", base: "main",
    commitMessage: "feat: search", title: "feat: search", url: "https://example.test/pull/1", number: 1,
    error: null, reason: null, updatedAt: NOW,
  } }, NOW);
  row = store.patch(row.id, row.revision, { state: "running", agentRunId: "new-run", previousRunIds: ["old-run"] }, NOW);
  expect(row.publication).toBeUndefined();
  expect(row.publicationHistory).toHaveLength(1);
  expect(row.publicationHistory![0]).toMatchObject({ agentRunId: "old-run", url: "https://example.test/pull/1" });
  expect(isTarsPublishable(row)).toBe(false);
  db.close();
});

test("restored ended results never observe deleted executions or reserve capacity", async () => {
  const db = new Database(":memory:"); const store = new TarsStore(db);
  const original = store.create(input, NOW);
  const old = { ...original, state: "completed", taskId: "archived-task", executionWorkspaceId: "deleted-workspace", agentRunId: "old-run" };
  db.prepare("UPDATE tars_responsibilities SET body_json = ? WHERE id = ?").run(JSON.stringify(old), original.id);
  const queued = store.create({ ...input, requestId: "new-work" }, NOW);
  let oldReads = 0;
  const runtime = createTarsRuntime({ store, concurrencyLimit: () => 1, now: () => NOW,
    validateScope: async () => {}, prepareWorkspace: async () => "new-workspace", prepareTask: async () => {},
    findRun: async () => null, startRun: async () => "new-run", observe: async row => {
      if (row.id === old.id) { oldReads++; throw new Error("Archived task and assignment are unavailable"); }
      return { state: "running", detail: null };
    }, controlRun: async () => {}, respondTask: async () => {},
  });
  for (let tick = 0; tick < 3; tick++) { runtime.requestTick(); await runtime.drain(); }
  expect(oldReads).toBe(0);
  expect(store.get(queued.id)?.state).toBe("running");
  expect(store.get(old.id)).toMatchObject({ state: "resultReady", revision: old.revision });
  expect(JSON.parse((db.prepare("SELECT body_json FROM tars_responsibilities WHERE id = ?").get(old.id) as { body_json: string }).body_json)).toEqual(old);
  runtime.stop(); await runtime.drain(); db.close();
});
