import { afterAll, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteStore } from "../electron/persistence/sqlite-store";
import { TurnDigestStore } from "../electron/persistence/turn-digest-store";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { turnHistoryPreload } from "../electron/persistence/turn-history-preload";

const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
const db = new Database(":memory:");
const store = Object.create(SqliteStore.prototype) as SqliteStore;
Object.assign(store, { db, _closed: false });
(store as unknown as { bootstrap: () => void }).bootstrap();
Object.assign(store, {
  usageStatistics: new UsageStatisticsStore(db as never),
  turnDigests: new TurnDigestStore(db as never),
});
let failRead = false;
mock.module("electron", () => ({
  ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) },
}));
mock.module("../electron/main/state", () => ({
  ensurePersistenceReady: async () => {
    if (failRead) throw new Error("database is locked");
    return store;
  },
}));
const { registerTurnHistoryHandlers } = await import("../electron/main/ipc/turn-history");
registerTurnHistoryHandlers();
const bridge = turnHistoryPreload(async (channel, input) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error("Missing handler");
  return JSON.parse(JSON.stringify(await handler({}, JSON.parse(JSON.stringify(input)))));
});
afterAll(() => {
  db.close();
  mock.restore();
});

test("preload -> validated IPC -> SQLite lists a task's turns newest first with their digest state", async () => {
  store.beginTurn({ id: "first", workspaceId: "w", taskId: "t", providerId: "claude-code", createdAt: "2026-10-22T10:00:00.000Z" });
  store.saveStreamEvent({ turnId: "first", sequence: 1, createdAt: "2026-10-22T10:00:01.000Z", event: { type: "error", message: "Overloaded", recoverable: false } });
  store.completeTurn({ id: "first", completedAt: "2026-10-22T10:01:00.000Z" });
  store.beginTurn({ id: "second", workspaceId: "w", taskId: "t", providerId: "codex", createdAt: "2026-10-22T11:00:00.000Z" });
  const listed = await bridge.listTaskTurnHistory({ workspaceId: "w", taskId: "t", limit: 1 });
  expect(listed).toEqual({
    ok: true,
    page: {
      turns: [{ id: "second", providerId: "codex", createdAt: "2026-10-22T11:00:00.000Z", completedAt: null, outcome: null, error: null, digest: { entryCount: 0, hasError: false, checks: null } }],
      hasMore: true,
    },
  });
  const record = await bridge.readTaskTurnRecord({ workspaceId: "w", taskId: "t", turnId: "first" });
  expect(record.ok && record.record?.digest?.entries).toEqual([
    { kind: "error", at: "2026-10-22T10:00:01.000Z", message: "Overloaded", count: 1 },
  ]);
  expect(await bridge.readTaskTurnRecord({ workspaceId: "w", taskId: "t", turnId: "missing" })).toEqual({ ok: true, record: null });
});

test("invalid requests and unreadable storage answer ok: false instead of throwing", async () => {
  expect(await bridge.listTaskTurnHistory({ workspaceId: "", taskId: "t" })).toMatchObject({ ok: false });
  expect(await bridge.listTaskTurnHistory({ workspaceId: "w", taskId: "t", limit: 1_000 })).toMatchObject({ ok: false });
  expect(await bridge.readTaskTurnRecord({ workspaceId: "w", taskId: "t", turnId: "x", extra: true } as never)).toMatchObject({ ok: false });
  failRead = true;
  expect(await bridge.listTaskTurnHistory({ workspaceId: "w", taskId: "t" })).toMatchObject({ ok: false });
  failRead = false;
});
