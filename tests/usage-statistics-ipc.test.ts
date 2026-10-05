import { afterAll, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { usageStatisticsPreload } from "../electron/persistence/usage-statistics-preload";
import { UsageStatisticsArgsSchema, USAGE_STATISTICS_IPC, type UsageStatisticsResponse } from "../src/lib/providers/usage-statistics";

const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
const db = new Database(":memory:");
db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)");
const store = new UsageStatisticsStore(db);
let failRead = false;
mock.module("electron", () => ({ ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) } }));
mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => {
  if (failRead) throw new Error("private database path must stay in main");
  return { usageStatistics: store };
} }));
const { registerUsageStatisticsHandlers } = await import("../electron/main/ipc/usage-statistics");
registerUsageStatisticsHandlers();
const bridge = usageStatisticsPreload(async (channel, input) => {
  const handler = handlers.get(channel);
  if (!handler) throw new Error("Missing handler");
  return JSON.parse(JSON.stringify(await handler({}, JSON.parse(JSON.stringify(input)))));
});
const args = UsageStatisticsArgsSchema.parse({ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timeZone: "UTC" });
afterAll(() => { db.close(); mock.restore(); });

test("preload -> validated IPC -> real SQLite -> JSON response preserves account scope and nullable cost", async () => {
  store.beginTurn({ id: "account-one", providerId: "codex", accountProfileId: "system-default", createdAt: args.from });
  store.completeTurn("account-one", args.to, JSON.stringify({ inputTokens: 100, outputTokens: 20, cacheReadTokens: 80 }));
  const result = await bridge.usageStatistics({ ...args, providerId: "codex", accountProfileId: "system-default" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.totals.tokens).toBe(40);
  expect(result.report.totals.costUsd).toBeNull();
  expect(result.report.turns[0]?.accountProfileId).toBe("system-default");
  expect(result.report.turns[0]).not.toHaveProperty("usage_json");
});

test("IPC rejects unbounded/injected requests and recovers after a failed database read", async () => {
  const handler = handlers.get(USAGE_STATISTICS_IPC)!;
  const invalid = await handler({}, { ...args, limit: 10000, sql: "SELECT * FROM messages" }) as UsageStatisticsResponse;
  expect(invalid.ok).toBe(false);
  failRead = true;
  const failed = await bridge.usageStatistics(args);
  expect(failed).toEqual({ ok: false, message: "Usage history could not be read. Try again." });
  failRead = false;
  expect((await bridge.usageStatistics(args)).ok).toBe(true);
});

test("model drilldown crosses preload and IPC without changing quota scope", async () => {
  store.beginTurn({ id: "specific-model", providerId: "codex", accountProfileId: "system-default", modelId: "target-model", createdAt: args.from });
  store.completeTurn("specific-model", args.to, JSON.stringify({ inputTokens: 40, outputTokens: 10 }));
  const result = await bridge.usageStatistics({ ...args, providerId: "codex", modelId: "target-model" });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.totals.tokens).toBe(50);
  expect(result.report.turns.map((row) => row.modelId)).toEqual(["target-model"]);
  const unknown = await bridge.usageStatistics({ ...args, providerId: "codex", modelId: null });
  expect(unknown.ok && unknown.report.turns.every((row) => row.modelId === null)).toBe(true);
});
