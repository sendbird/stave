import { afterAll, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { DailyUsageStore } from "../electron/persistence/daily-usage-store";
import { usageStatisticsPreload } from "../electron/persistence/usage-statistics-preload";
import { UsageStatisticsArgsSchema, USAGE_STATISTICS_IPC, type UsageStatisticsResponse } from "../src/lib/providers/usage-statistics";

const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
const db = new Database(":memory:");
db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)");
db.exec("CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT, updated_at TEXT)");
const store = new UsageStatisticsStore(db);
const daily = new DailyUsageStore(db, store);
let failRead = false;
mock.module("electron", () => ({ ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) } }));
mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => {
  if (failRead) throw new Error("private database path must stay in main");
  return { usageStatistics: store, dailyUsage: daily };
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

test("daily settings cross preload, strict IPC validation and real SQLite; admission sees updates immediately", async () => {
  expect((await bridge.dailyUsage.read()).providers.every((row) => row.limit === null)).toBe(true);
  const now = new Date().toISOString();
  store.beginTurn({ id: "daily-turn", providerId: "codex", createdAt: now });
  store.completeTurn("daily-turn", now, JSON.stringify({ inputTokens: 30, outputTokens: 20 }));
  const updated = await bridge.dailyUsage.update({ providerId: "codex", limit: { unit: "tokens", amount: 50 } });
  expect(updated.providers.find((row) => row.providerId === "codex")).toMatchObject({ tokens: 50, reached: true });
  expect(daily.refusal("codex")).toBeTruthy();
  await expect(handlers.get("persistence:daily-limit-update")!({}, { providerId: "codex", limit: { unit: "tokens", amount: -1 } })).rejects.toThrow();
  await expect(handlers.get("persistence:daily-limit-update")!({}, { providerId: "codex", limit: null, unknown: true })).rejects.toThrow();
  await bridge.dailyUsage.update({ providerId: "codex", limit: null });
  expect(daily.refusal("codex")).toBeNull();
});

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

test("a comparison period and the provider split cross preload and IPC; an overlapping one is refused", async () => {
  store.beginTurn({ id: "earlier", providerId: "codex", accountProfileId: "system-default", createdAt: "2026-09-30T06:00:00.000Z" });
  store.completeTurn("earlier", "2026-09-30T06:01:00.000Z", JSON.stringify({ inputTokens: 30, outputTokens: 5 }));
  const result = await bridge.usageStatistics({ ...args, previous: { from: "2026-09-30T00:00:00.000Z", to: args.from } });
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.report.previousTotals?.tokens).toBe(35);
  expect(result.report.series[0]?.providers.codex?.turns).toBeGreaterThan(0);
  const overlapping = await bridge.usageStatistics({ ...args, previous: { from: "2026-09-30T00:00:00.000Z", to: args.to } });
  expect(overlapping.ok).toBe(false);
});
