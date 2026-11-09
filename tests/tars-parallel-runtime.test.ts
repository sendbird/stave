import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createTarsRuntime, type TarsRuntimePorts } from "../electron/host-service/tars-runtime";
import { TarsStore } from "../electron/persistence/tars-store";
import { TarsConversationStore, TarsStorageBusyError } from "../electron/persistence/tars-conversation-store";
import { TarsConversationSettingsSchema } from "../src/lib/tars/conversation";
import { actTars } from "../electron/host-service/tars-control";

const NOW = "2026-11-09T00:00:00.000Z";
const input = (id: string, priority = 50) => ({ requestId: id, title: id, instruction: "Verify independent work.",
  acceptanceCriteria: ["Verified."], workspaceId: "source", repositoryPath: "/tmp/shared-repository",
  providerId: "codex" as const, model: null, maxTurns: 30, priority });
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const flush = async () => { for (let i = 0; i < 50; i++) await Promise.resolve(); };
function fixture(overrides: Partial<TarsRuntimePorts> = {}, db = new Database(":memory:")) {
  const store = new TarsStore(db), conversations = new TarsConversationStore(db);
  const starts: string[] = [];
  const ports: TarsRuntimePorts = { store, now: () => NOW, validateScope: async () => {},
    prepareWorkspace: async (row) => `workspace-${row.id}`, prepareTask: async () => {}, findRun: async () => null,
    startRun: async (row) => { starts.push(row.requestId); return `run-${row.id}`; },
    observe: async () => ({ state: "running", detail: null }), controlRun: async () => {},
    concurrencyLimit: () => conversations.getSettings()?.maxConcurrentResponsibilities ?? 0, ...overrides };
  const runtime = createTarsRuntime(ports);
  const tick = async () => { runtime.requestTick(); await runtime.drain(); };
  return { db, store, conversations, starts, ports, runtime, tick };
}

test("default admission starts 48 same-repository isolated tasks before any first start finishes, exactly once", async () => {
  const gate = deferred<string>();
  const admitted: string[] = [];
  const f = fixture({ startRun: async (row) => { admitted.push(row.id); await gate.promise; return `run-${row.id}`; } });
  for (let n = 0; n < 48; n++) f.store.create(input(`work-${n}`), NOW);
  f.runtime.requestTick(); await flush();
  expect(admitted).toHaveLength(48);
  expect(new Set(admitted).size).toBe(48);
  expect(f.store.snapshot().responsibilities.every((row) => row.state === "preparing")).toBe(true);
  f.runtime.requestTick(); await flush();
  expect(admitted).toHaveLength(48);
  gate.resolve("release"); await f.runtime.drain(); await f.tick();
  expect(f.store.snapshot().responsibilities.filter((row) => row.state === "running")).toHaveLength(48);
  expect(admitted).toHaveLength(48);
  f.runtime.stop(); f.db.close();
});

test("slow workspace preparation, scope denial and an unreadable run never hold unrelated slots", async () => {
  const gate = deferred<string>();
  const f = fixture({ prepareWorkspace: async (row) => row.requestId === "slow" ? gate.promise : `workspace-${row.id}`,
    validateScope: async (row) => { if (row.repositoryPath === "/tmp/denied") throw new Error("Scope denied"); } });
  f.store.create(input("slow", 100), NOW);
  const denied = f.store.create({ ...input("denied", 90), repositoryPath: "/tmp/denied" }, NOW);
  f.store.create(input("ready", 10), NOW);
  f.runtime.requestTick(); await flush();
  expect(f.starts).toEqual(["ready"]);
  expect(f.store.get(denied.id)?.state).toBe("blocked");
  // Even a new create is not behind slow Git preparation.
  await f.runtime.create(input("new")); await flush();
  expect(f.starts).toEqual(["ready", "new"]);
  gate.resolve("workspace-slow"); await f.runtime.drain();
  const observation = deferred<{ state: "completed"; detail: null }>();
  f.ports.observe = async (row) => row.requestId === "slow" ? observation.promise : { state: "running", detail: null };
  f.store.create(input("while-observing"), NOW); f.runtime.requestTick(); await flush();
  expect(f.starts).toContain("while-observing");
  observation.resolve({ state: "completed", detail: null }); await f.runtime.drain();
  f.runtime.stop(); f.db.close();
});

test("saved limits report observed capacity, change live, and absent or zero never restores a hidden cap", async () => {
  const f = fixture();
  const settings = { providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30 };
  f.conversations.configure({ ...settings, maxConcurrentResponsibilities: 2 });
  for (let n = 0; n < 6; n++) f.store.create(input(`work-${n}`, 100 - n), NOW);
  await f.tick();
  expect(f.starts).toHaveLength(2);
  let queued = (await f.runtime.get()).responsibilities.filter((row) => row.state === "queued");
  expect(queued).toHaveLength(4);
  expect(queued.every((row) => row.queueWait?.code === "capacity" && row.queueWait.active === 2 && row.queueWait.limit === 2)).toBe(true);
  f.conversations.configure({ ...settings, maxConcurrentResponsibilities: 4 }); await f.tick();
  expect(f.starts).toHaveLength(4);
  queued = (await f.runtime.get()).responsibilities.filter((row) => row.state === "queued");
  expect(queued[0]?.queueWait).toEqual({ code: "capacity", active: 4, limit: 4 });
  f.conversations.configure({ ...settings, maxConcurrentResponsibilities: 0 }); await f.tick();
  expect(f.starts).toHaveLength(6);
  expect(TarsConversationSettingsSchema.safeParse({ ...settings, maxConcurrentResponsibilities: -1 }).success).toBe(false);
  expect(TarsConversationSettingsSchema.safeParse({ ...settings, maxConcurrentResponsibilities: 1.5 }).success).toBe(false);
  expect(TarsConversationSettingsSchema.parse({ ...settings, maxConcurrentResponsibilities: 1000 }).maxConcurrentResponsibilities).toBe(1000);
  f.runtime.stop(); f.db.close();
});

for (const outcome of ["completed", "cancelled", "blocked", "waiting"] as const) test(`${outcome} releases its slot and starts queued work without waiting for the next interval`, async () => {
  const f = fixture({ concurrencyLimit: () => 1 });
  f.store.create(input("first", 100), NOW); f.store.create(input("next", 10), NOW); await f.tick();
  // A blocked outcome here is an observed stopped run, not an unreadable result.
  // Existing blocked rows with a saved run retain capacity until its stop is observed again.
  f.ports.observe = async () => ({ state: outcome, detail: outcome === "blocked" ? "Run stopped" : null });
  await f.tick();
  expect(f.starts).toEqual(["first", "next"]);
  f.runtime.stop(); f.db.close();
});

test("a failed admission with no persisted run frees capacity; an unknown receipt retains only one reservation", async () => {
  const f = fixture({ concurrencyLimit: () => 2, startRun: async (row) => { if (row.requestId === "bad") throw new Error("Admission refused"); return `run-${row.id}`; } });
  const first = f.store.create(input("bad", 100), NOW);
  f.store.create(input("ready", 90), NOW); f.store.create(input("next", 10), NOW);
  await f.tick();
  expect(f.store.get(first.id)).toMatchObject({ state: "blocked", executionPending: false });
  expect(f.store.snapshot().responsibilities.filter((row) => row.state === "running")).toHaveLength(2);
  f.runtime.stop(); f.db.close();
});

test("a click cancelling one running task releases its slot while other tasks keep running", async () => {
  const f = fixture({ concurrencyLimit: () => 2 });
  for (let n = 0; n < 3; n++) f.store.create(input(`work-${n}`, 100 - n), NOW);
  await f.tick(); const first = f.store.snapshot().responsibilities[0]!;
  await actTars({ requestId: "cancel", responsibilityId: first.id, expectedRevision: first.revision, operation: "cancel", source: "click" },
    { conversations: f.conversations, runtime: f.runtime, now: () => NOW });
  await f.runtime.drain();
  expect(f.starts).toHaveLength(3);
  expect(f.store.get(first.id)?.state).toBe("cancelled");
  f.runtime.stop(); f.db.close();
});

test("unknown queue reasons and observed database contention are distinct and recover", async () => {
  let locked = true;
  const f = fixture({ validateScope: async () => { if (locked) throw new TarsStorageBusyError(); } });
  f.store.create(input("one"), NOW);
  expect((await f.runtime.get()).responsibilities[0]?.queueWait).toEqual({ code: "unknown" });
  await f.tick();
  expect((await f.runtime.get()).responsibilities[0]?.queueWait).toEqual({ code: "storageBusy" });
  locked = false; await f.tick();
  expect(f.starts).toEqual(["one"]);
  expect((await f.runtime.get()).responsibilities[0]?.queueWait).toBeUndefined();
  f.runtime.stop(); f.db.close();
});

test("reopened SQLite keeps the configured limit and reconciles lost receipts without a duplicate start", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tars-parallel-")), file = path.join(dir, "state.sqlite");
  try {
    const first = fixture({}, new Database(file));
    first.conversations.configure({ providerId: "codex", model: "gpt-6.1-sol", maxTurns: 30, maxConcurrentResponsibilities: 2 });
    const row = first.store.create(input("lost", 100), NOW);
    first.store.patch(row.id, row.revision, { state: "preparing", taskId: "lost-task", executionWorkspaceId: "lost-workspace", executionPending: true }, NOW);
    first.store.create(input("independent", 10), NOW); first.runtime.stop(); first.db.close();
    const f = fixture({ findRun: async (r) => r.id === row.id ? "persisted-run" : null }, new Database(file));
    await f.tick(); await f.tick();
    expect(f.store.get(row.id)).toMatchObject({ state: "running", agentRunId: "persisted-run", executionPending: false });
    expect(f.starts).toEqual(["independent"]);
    expect(f.conversations.getSettings()?.maxConcurrentResponsibilities).toBe(2);
    f.runtime.stop(); f.db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("unknown provider observation reserves one slot and does not block a second independent run", async () => {
  const f = fixture({ concurrencyLimit: () => 2, observe: async (row) => {
    if (row.requestId === "unknown") throw new Error("Account observation unavailable");
    return { state: "running", detail: null };
  } });
  const first = f.store.create(input("unknown", 100), NOW); await f.tick(); await f.tick();
  f.store.create(input("independent", 50), NOW); f.store.create(input("later", 10), NOW); await f.tick();
  expect(f.store.get(first.id)).toMatchObject({ state: "blocked", executionPending: true });
  expect(f.starts).toEqual(["unknown", "independent"]);
  expect((await f.runtime.get()).responsibilities.find((row) => row.requestId === "later")?.queueWait)
    .toEqual({ code: "capacity", active: 2, limit: 2 });
  f.runtime.stop(); f.db.close();
});
