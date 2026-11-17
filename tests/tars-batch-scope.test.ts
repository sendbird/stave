import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createTarsRuntime } from "../electron/host-service/tars-runtime";
import { actTars } from "../electron/host-service/tars-control";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { createTarsBatchRuntime } from "../electron/host-service/tars-batch";
import type { TarsBatchAction } from "../src/lib/tars/batch";
import { buildTarsPlannerPrompt } from "../electron/main/tars-planner";
import { testContext } from "./tars-test-context";

const dbs: Database[] = [];
afterEach(() => { for (const db of dbs.splice(0)) db.close(); });
const now = "2026-11-16T00:00:00.000Z";
function fixture() {
  const db = new Database(":memory:"); dbs.push(db);
  db.exec("CREATE TABLE app_state(key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT)");
  const responsibilities = new TarsStore(db);
  const conversations = new TarsConversationStore(db);
  const make = (state: "running" | "completed" | "cancelled" | "takenOver" | "paused") => {
    const row = responsibilities.create({ requestId: crypto.randomUUID(), workspaceId: "source", repositoryPath: "/tmp/repository", title: "Work", instruction: "Verify work", acceptanceCriteria: ["Verified"], providerId: "codex" }, now);
    const ended = state === "completed" || state === "cancelled";
    return responsibilities.patch(row.id, row.revision, { state, executionWorkspaceId: `exec-${row.id}`,
      ...(ended ? { completionConfirmedAt: now } : { taskId: `task-${row.id}`, agentRunId: `run-${row.id}` }) }, now);
  };
  return { db, responsibilities, conversations, make };
}
type Fixture = ReturnType<typeof fixture>;
const noCleanup = { list: async () => { throw new Error("Unexpected cleanup"); }, act: async () => { throw new Error("Unexpected cleanup"); } };
const emptyCleanup = { list: async () => ({ rows: [], policy: undefined as never, recent: [] }), act: noCleanup.act };
const refuse = async () => { throw new Error("Unexpected control"); };
const cleanupAll: TarsBatchAction = { kind: "cleanup", scope: { kind: "all" }, deleteBranches: false, permanentlyDeleteArchived: false };
const pauseAll: TarsBatchAction = { kind: "bulkControl", operation: "pause", scope: { kind: "all" } };
function liveRuntime(f: Fixture) {
  return createTarsRuntime({ store: f.responsibilities, now: () => now, validateScope: async () => {}, prepareWorkspace: async () => "exec", prepareTask: async () => {}, findRun: async () => null,
    startRun: async row => `run-${row.id}`, observe: async () => ({ state: "running", detail: null }), controlRun: async () => {} });
}
const batchOf = (f: Fixture, ports: Partial<Parameters<typeof createTarsBatchRuntime>[0]> = {}) =>
  createTarsBatchRuntime({ conversations: () => f.conversations, responsibilities: () => f.responsibilities, cleanup: noCleanup, control: refuse, ...ports });

test.each(["careful", "balanced", "handsOff"] as const)("%s: the autonomy policy keeps bulk control and cleanup behind their confirmation card", autonomy => {
  const f = fixture();
  f.conversations.configure({ providerId: "codex", model: "model", maxTurns: 10, autonomy });
  const message = f.conversations.create({ requestId: "request", text: "Pause everything" }, now);
  const prompt = buildTarsPlannerPrompt(message, testContext(f.responsibilities), []);
  const policy = prompt.slice(prompt.indexOf("The user set your autonomy level"));
  expect(policy).toContain("bulkControl and cleanup always wait for the user's confirmation on their card");
  expect(policy).toMatch(/never say .*paused, resumed, cancelled or cleaned up.* before .*confirm/i);
});

test("pause all lists only work it can pause and counts ended work once", async () => {
  const f = fixture();
  const running = f.make("running"); f.make("completed"); f.make("cancelled");
  const preview = await batchOf(f).invoke({ operation: "preview", action: pauseAll });
  expect(preview.items.map(item => item.responsibilityId)).toEqual([running.id]);
  expect(preview.omitted).toBe(2);
});

test("the size limit applies after filtering: 1,000+ ended rows do not block pausing 3 running items", async () => {
  const f = fixture();
  for (let index = 0; index < 1001; index++) f.make("completed");
  for (let index = 0; index < 3; index++) f.make("running");
  const preview = await batchOf(f).invoke({ operation: "preview", action: pauseAll });
  expect(preview.items).toHaveLength(3);
  expect(preview.omitted).toBe(1001);
});

test("cleanup previews only ended work and counts unfinished work once", async () => {
  const f = fixture();
  f.make("running");
  const preview = await batchOf(f, { cleanup: emptyCleanup, pr: async () => ({ ok: true, pr: null, stderr: "" }) }).invoke({ operation: "preview", action: cleanupAll });
  expect(preview.items).toHaveLength(0);
  expect(preview.omitted).toBe(1);
});

test("bulk cancel leaves work the user took over, with the takenOver reason", async () => {
  const f = fixture();
  const held = f.make("takenOver");
  let calls = 0;
  const batch = batchOf(f, { control: async () => { calls++; throw new Error("Unexpected control"); } });
  const preview = await batch.invoke({ operation: "preview", action: { kind: "bulkControl", operation: "cancel", scope: { kind: "all" } } });
  expect(preview.items).toMatchObject([{ responsibilityId: held.id, status: "skipped", reason: "takenOver" }]);
  await batch.invoke({ operation: "confirm", id: preview.id });
  expect(calls).toBe(0);
  expect(f.responsibilities.get(held.id)!.state).toBe("takenOver");
});

test("pause all still pauses running work whose revision advanced after the preview", async () => {
  const f = fixture();
  const row = f.make("running");
  const runtime = liveRuntime(f);
  const batch = batchOf(f, { control: input => actTars(input, { conversations: f.conversations, runtime, responsibilities: f.responsibilities }) });
  const preview = await batch.invoke({ operation: "preview", action: pauseAll });
  // Running work saves every observation.
  const observed = f.responsibilities.patch(row.id, row.revision, { priority: 5 }, now);
  f.responsibilities.patch(row.id, observed.revision, { priority: 6 }, now);
  const result = await batch.invoke({ operation: "confirm", id: preview.id });
  expect(result.items).toMatchObject([{ status: "applied" }]);
  expect(f.responsibilities.get(row.id)!.state).toBe("paused");
  runtime.stop();
});

test("opening the same cleanup twice reuses one open preview, and Decline removes it", async () => {
  const f = fixture();
  const batch = batchOf(f, { cleanup: emptyCleanup });
  const first = await batch.invoke({ operation: "preview", action: cleanupAll });
  const second = await batch.invoke({ operation: "preview", action: cleanupAll });
  expect(second.id).toBe(first.id);
  expect(batch.list()).toHaveLength(1);
  await batch.invoke({ operation: "decline", id: first.id } as never);
  expect(batch.list()).toHaveLength(0);
});

test("finished records stay bounded and one unreadable record never hides the others", async () => {
  const f = fixture();
  const batch = batchOf(f);
  for (let index = 0; index < 60; index++) {
    const preview = await batch.invoke({ operation: "preview", action: { kind: "bulkControl", operation: "pause", scope: { kind: "ids", ids: [`missing-${index}`] } } });
    await batch.invoke({ operation: "confirm", id: preview.id });
  }
  expect(batch.list().length).toBeLessThanOrEqual(50);
  f.db.prepare("INSERT INTO tars_batch_records (id, state, created_at, body_json) VALUES ('broken', 'applied', ?, '{\"id\":')").run(now);
  expect(batch.list().length).toBeGreaterThan(0);
});

function cleanupFake(f: Fixture, act: (archived: { value: boolean; at: string | null }) => { ok: boolean; reason: string | null; readOnly?: boolean }) {
  const row = f.make("completed");
  const archived = { value: false, at: null as string | null };
  const workspace = () => ({ id: row.executionWorkspaceId!, repositoryPath: row.repositoryPath, repositoryName: "Repository", name: "Work", path: "/tmp/work", branch: "work",
    archived: archived.value, branchOnly: false, readOnly: false, archivedAt: archived.at, lastActive: null, blockers: [], reasons: [], bytes: null, branchDeletable: true });
  return { row, archived, cleanup: {
    list: async () => ({ rows: [workspace()], policy: undefined as never, recent: [] }),
    act: async (input: { action: string }) => ({ workspaceId: row.executionWorkspaceId!, action: input.action as "archive", ...act(archived) }),
  } };
}

test("a failed archive counts as applied only when this batch made the archive", async () => {
  const f = fixture();
  // The user archived it between the check and the action: the archive is not this batch's to restore.
  const theirs = cleanupFake(f, archived => { archived.value = true; archived.at = "2026-11-15T00:00:00.000Z"; return { ok: false, reason: "notActiveWorkspace" }; });
  const batch = batchOf(f, { cleanup: theirs.cleanup, pr: async () => ({ ok: true, pr: null, stderr: "" }) });
  const preview = await batch.invoke({ operation: "preview", action: cleanupAll });
  const result = await batch.invoke({ operation: "confirm", id: preview.id });
  expect(result.items).toMatchObject([{ status: "skipped", reason: "alreadyArchived" }]);

  const g = fixture();
  // This batch's own archive kept its record although removing the checkout failed.
  const ours = cleanupFake(g, archived => { archived.value = true; archived.at = new Date(Date.now() + 1000).toISOString(); return { ok: false, reason: "worktreeRemoveFailed" }; });
  const own = batchOf(g, { cleanup: ours.cleanup, pr: async () => ({ ok: true, pr: null, stderr: "" }) });
  const second = await own.invoke({ operation: "confirm", id: (await own.invoke({ operation: "preview", action: cleanupAll })).id });
  expect(second.items).toMatchObject([{ status: "applied", reason: "worktreeRemoveFailed" }]);
});

test("a restore without its branch is recorded read-only", async () => {
  const f = fixture();
  const fake = cleanupFake(f, archived => {
    const restoring = archived.value; archived.value = !restoring; archived.at = restoring ? null : now;
    return restoring ? { ok: true, reason: null, readOnly: true } : { ok: true, reason: null };
  });
  const batch = batchOf(f, { cleanup: fake.cleanup, pr: async () => ({ ok: true, pr: null, stderr: "" }) });
  const preview = await batch.invoke({ operation: "preview", action: cleanupAll });
  await batch.invoke({ operation: "confirm", id: preview.id });
  const restored = await batch.invoke({ operation: "restore", id: preview.id });
  expect(restored.items).toMatchObject([{ status: "restored", readOnly: true }]);
});

test("unavailable pull request status skips every item with one shared reason", async () => {
  const f = fixture();
  const fake = cleanupFake(f, () => ({ ok: true, reason: null }));
  const batch = batchOf(f, { cleanup: fake.cleanup, pr: async () => ({ ok: false, pr: null, stderr: "gh: not logged in" }) });
  const preview = await batch.invoke({ operation: "preview", action: cleanupAll });
  expect(preview.items).toMatchObject([{ status: "skipped", reason: "prStatusUnavailable" }]);
});

test("a batch interrupted mid-run settles to interrupted after restart and Continue finishes the frozen remainder", async () => {
  const f = fixture();
  const rows = [f.make("running"), f.make("running")];
  const runtime = liveRuntime(f);
  let calls = 0;
  const control = (input: Parameters<typeof actTars>[0]) => actTars(input, { conversations: f.conversations, runtime, responsibilities: f.responsibilities });
  const first = batchOf(f, { control: async input => { if (++calls === 2) throw new Error("The app quit"); return control(input); } });
  const preview = await first.invoke({ operation: "preview", action: pauseAll });
  await first.invoke({ operation: "confirm", id: preview.id }).catch(() => null);
  const restarted = batchOf(f, { control });
  const interrupted = restarted.list().find(record => record.id === preview.id)!;
  expect(interrupted.state).toBe("interrupted");
  expect(interrupted.items.map(item => item.status)).toEqual(["applied", "included"]);
  const continued = await restarted.invoke({ operation: "confirm", id: preview.id });
  expect(continued.state).toBe("applied");
  for (const row of rows) expect(f.responsibilities.get(row.id)!.state).toBe("paused");
  runtime.stop();
});
