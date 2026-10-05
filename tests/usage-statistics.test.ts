import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { TurnSpendStore } from "../electron/persistence/turn-spend-store";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import { addUsageMetrics, emptyUsageMetrics, usageBucketKey, UsageStatisticsArgsSchema, UNATTRIBUTED_ACCOUNT_ID, type UsageStatisticsArgs } from "../src/lib/providers/usage-statistics";
import { usageRange } from "../src/components/usage/usage-view.utils";

const ACCOUNT_A = "e1c06d30-cf21-4362-887a-5679b9fdfae1";
const ACCOUNT_B = "e1c06d30-cf21-4362-887a-5679b9fdfae2";
const FROM = "2026-10-01T00:00:00.000Z";
const TO = "2026-10-03T00:00:00.000Z";
const filters = (patch: Partial<UsageStatisticsArgs> = {}) => UsageStatisticsArgsSchema.parse({ from: FROM, to: TO, timeZone: "UTC", ...patch });
let db: Database;
let store: UsageStatisticsStore;
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, created_at TEXT NOT NULL,
    completed_at TEXT, usage_json TEXT)`);
  store = new UsageStatisticsStore(db);
});
afterEach(() => db.close());

function turn(id: string, providerId: "claude-code" | "codex" | "cursor" | "kiro", account: string, usage: unknown, at = FROM) {
  store.beginTurn({ id, providerId, accountProfileId: account, modelId: "model-a", createdAt: at });
  store.completeTurn(id, "2026-10-02T12:00:00.000Z", typeof usage === "string" ? usage : usage === null ? null : JSON.stringify(usage));
}
function sum(rows: import("../src/lib/providers/usage-statistics").UsageMetrics[]) {
  const value = emptyUsageMetrics();
  for (const row of rows) addUsageMetrics(value, row);
  return value;
}

describe("account usage query", () => {
  test("model drilldown filters every turn aggregate without filtering account quota", () => {
    turn("model-a", "codex", ACCOUNT_A, { inputTokens: 100, outputTokens: 20 });
    turn("model-b", "codex", ACCOUNT_A, { inputTokens: 500, outputTokens: 40 });
    store.resolveModel("model-b", "model-b", 1);
    store.beginTurn({ id: "unknown-model", providerId: "codex", accountProfileId: ACCOUNT_A, createdAt: FROM });
    store.completeTurn("unknown-model", TO, JSON.stringify({ inputTokens: 3, outputTokens: 2 }));
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.codex = { source: "rpc", error: null, buckets: [{ limitId: "account", limitName: "Account", primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null }, secondary: null, credits: null }] };
    store.recordQuota(snapshot, { codexAccountProfileId: ACCOUNT_A }, FROM);
    const onlyA = store.read(filters({ providerId: "codex", accountProfileId: ACCOUNT_A, modelId: "model-a" }));
    expect(onlyA.totals.tokens).toBe(120);
    expect(sum(onlyA.series)).toEqual(onlyA.totals);
    expect(sum(onlyA.accounts)).toEqual(onlyA.totals);
    expect(onlyA.models.map((row) => row.modelId)).toEqual(["model-a"]);
    expect(onlyA.turns.map((row) => row.id)).toEqual(["model-a"]);
    expect(onlyA.latestQuota[0]?.usedPercent).toBe(25);
    expect(store.read(filters({ providerId: "codex", modelId: null })).totals.tokens).toBe(5);
    expect(store.read(filters({ modelId: "not-a-model" })).totals.turns).toBe(0);
    expect(UsageStatisticsArgsSchema.safeParse({ ...filters(), modelId: "" }).success).toBe(false);
    expect(UsageStatisticsArgsSchema.safeParse({ ...filters(), modelId: "x".repeat(501) }).success).toBe(false);
  });
  test("isolates accounts, reconciles cache-normalized totals and never adds reasoning twice", () => {
    turn("claude-a", "claude-code", ACCOUNT_A, { inputTokens: 100, outputTokens: 20, cacheReadTokens: 900, cacheCreationTokens: 50, thoughtTokens: 10, totalCostUsd: 0.25 });
    turn("claude-b", "claude-code", ACCOUNT_B, { inputTokens: 7, outputTokens: 3 });
    turn("codex-a", "codex", ACCOUNT_A, { inputTokens: 1000, outputTokens: 80, cacheReadTokens: 700, thoughtTokens: 50 });
    const report = store.read(filters());
    expect(report.totals.tokens).toBe(560); // (100 + 50 + 20) + (7 + 3) + (1000 - 700 + 80)
    expect(report.totals.costUsd).toBe(0.25);
    expect(report.totals.costReportedTurns).toBe(1);
    expect(sum(report.accounts)).toEqual(report.totals);
    expect(sum(report.models)).toEqual(report.totals);
    expect(sum(report.series)).toEqual(report.totals);
    const onlyA = store.read(filters({ providerId: "claude-code", accountProfileId: ACCOUNT_A }));
    expect(onlyA.totals.tokens).toBe(170);
    expect(onlyA.turns.map((row) => row.id)).toEqual(["claude-a"]);
    expect(onlyA.accounts).toHaveLength(1);
  });

  test("matches the existing status-bar token and reported-cost convention", () => {
    for (const provider of ["claude-code", "codex"] as const) {
      const usage = { inputTokens: 120, outputTokens: 20, cacheReadTokens: 80, cacheCreationTokens: 10, totalCostUsd: 0.7 };
      turn(provider, provider, ACCOUNT_A, usage);
      db.prepare("INSERT INTO turns VALUES (?, ?, ?, ?, ?)").run(provider, provider, FROM, TO, JSON.stringify(usage));
    }
    const spend = new TurnSpendStore(db).summarize({ monthStart: FROM, dayStart: FROM });
    for (const account of store.read(filters()).accounts) {
      const old = spend.find((row) => row.providerId === account.providerId)!;
      expect(account.tokens).toBe(old.monthTokens);
      expect(account.costUsd).toBeCloseTo(old.monthUsd);
    }
  });

  test("missing, zero, malformed and negative values remain distinguishable", () => {
    turn("missing", "cursor", ACCOUNT_A, null);
    turn("invalid", "codex", ACCOUNT_A, "{invalid");
    turn("negative", "codex", ACCOUNT_A, { inputTokens: -5, outputTokens: 1, totalCostUsd: -1 });
    turn("zero", "kiro", ACCOUNT_A, { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 });
    turn("overflow", "codex", ACCOUNT_A, '{"inputTokens":1e999,"outputTokens":0,"totalCostUsd":1e999}');
    const report = store.read(filters());
    expect(report.totals.turns).toBe(5);
    expect(report.totals.measuredTurns).toBe(1);
    expect(report.totals.costReportedTurns).toBe(1);
    expect(report.totals.costUsd).toBe(0);
    expect(Number.isFinite(report.totals.inputTokens)).toBe(true);
    expect(store.read(filters({ providerId: "cursor" })).totals.costUsd).toBeNull();
    expect(store.read(filters({ providerId: "claude-code" })).totals).toEqual(emptyUsageMetrics());
  });

  test("old rows stay unattributed after reopening; account removal and workspace pruning do not erase totals", () => {
    db.exec("DELETE FROM usage_statistics_meta");
    db.prepare("INSERT INTO turns VALUES ('legacy', 'codex', ?, ?, ?)").run(FROM, TO, JSON.stringify({ inputTokens: 40, outputTokens: 10 }));
    store = new UsageStatisticsStore(db);
    turn("new", "codex", ACCOUNT_A, { inputTokens: 100, outputTokens: 20 });
    store = new UsageStatisticsStore(db);
    db.exec("DELETE FROM turns");
    const report = store.read(filters());
    expect(report.totals.tokens).toBe(170);
    expect(store.read(filters({ providerId: "codex", accountProfileId: UNATTRIBUTED_ACCOUNT_ID })).totals.tokens).toBe(50);
    expect(store.read(filters({ providerId: "codex", accountProfileId: ACCOUNT_A })).totals.tokens).toBe(120);
    expect(report.knownAccounts).toContainEqual({ providerId: "codex", accountProfileId: UNATTRIBUTED_ACCOUNT_ID });
  });

  test("last cumulative usage replaces earlier usage, and a missing late completion cannot erase it", () => {
    turn("one", "codex", ACCOUNT_A, { inputTokens: 10, outputTokens: 2 });
    store.completeTurn("one", TO, JSON.stringify({ inputTokens: 20, outputTokens: 4 }));
    store.completeTurn("one", TO, null);
    const result = store.read(filters());
    expect(result.totals.tokens).toBe(24);
    expect(result.totals.turns).toBe(1);
    expect(result.turns[0]?.completedAt).toBe("2026-10-02T12:00:00.000Z");
  });

  test("resolved model events resist out-of-order replay; native session identity can correct attribution", () => {
    turn("resolved", "codex", ACCOUNT_A, { inputTokens: 10, outputTokens: 2 });
    store.observeEvent("resolved", { type: "model_resolved", resolvedProviderId: "codex", resolvedModel: "model-b" }, 8);
    store.observeEvent("resolved", { type: "model_resolved", resolvedProviderId: "codex", resolvedModel: "old-model" }, 3);
    store.observeEvent("resolved", { type: "provider_session", providerId: "codex", accountProfileId: ACCOUNT_B, nativeSessionId: "session" }, 9);
    store.observeEvent("resolved", { type: "provider_session", providerId: "codex", accountProfileId: ACCOUNT_A, nativeSessionId: "session" }, 2);
    const report = store.read(filters({ providerId: "codex", accountProfileId: ACCOUNT_B }));
    expect(report.turns[0]?.modelId).toBe("model-b");
    expect(report.totals.tokens).toBe(12);
  });

  test("uses a half-open start-time range and returns stable, limited pages", () => {
    turn("before", "codex", ACCOUNT_A, { inputTokens: 100, outputTokens: 1 }, "2026-09-30T23:59:59.999Z");
    turn("a", "codex", ACCOUNT_A, { inputTokens: 3, outputTokens: 1 });
    turn("b", "codex", ACCOUNT_A, { inputTokens: 5, outputTokens: 1 });
    turn("after", "codex", ACCOUNT_A, { inputTokens: 100, outputTokens: 1 }, TO);
    store.beginTurn({ id: "running", providerId: "codex", createdAt: FROM });
    const first = store.read(filters({ limit: 1 }));
    const second = store.read(filters({ limit: 1, offset: 1 }));
    expect(first.turns[0]?.id).toBe("b");
    expect(second.turns[0]?.id).toBe("a");
    expect(first.totals).toEqual(second.totals);
    expect(first.totals.tokens).toBe(10);
  });

  test("buckets near midnight in the requested timezone, including fractional offsets", () => {
    turn("india-1", "codex", ACCOUNT_A, { inputTokens: 10, outputTokens: 1 }, "2026-10-01T18:29:59.000Z");
    turn("india-2", "codex", ACCOUNT_A, { inputTokens: 20, outputTokens: 1 }, "2026-10-01T18:30:00.000Z");
    const result = store.read(filters({ timeZone: "Asia/Kolkata" }));
    expect(result.series.find((row) => row.at === "2026-10-01")?.tokens).toBe(11);
    expect(result.series.find((row) => row.at === "2026-10-02")?.tokens).toBe(21);
    expect(sum(result.series)).toEqual(result.totals);
  });

  test("includes empty hours on both sides of a short boundary-crossing range", () => {
    const result = store.read(filters({ from: "2026-10-01T00:59:00.000Z", to: "2026-10-01T01:01:00.000Z", granularity: "hour" }));
    expect(result.series.map((row) => row.at.split(" GMT")[0])).toEqual(["2026-10-01 00:00", "2026-10-01 01:00"]);
  });
});

describe("quota observations", () => {
  test("records each account and window independently, deduplicates a minute, and never stores unavailable as zero", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: { usedPercent: 25, resetsAt: 2000000000 }, weekly: { usedPercent: 50, resetsAt: 2001000000 }, fableWeekly: null, error: null };
    store.recordQuota(snapshot, { claudeAccountProfileId: ACCOUNT_A }, "2026-10-01T12:00:01.000Z");
    snapshot.claude.session!.usedPercent = 30;
    store.recordQuota(snapshot, { claudeAccountProfileId: ACCOUNT_A }, "2026-10-01T12:00:30.000Z");
    store.recordQuota(snapshot, { claudeAccountProfileId: ACCOUNT_B }, "2026-10-01T12:00:40.000Z");
    const a = store.read(filters({ providerId: "claude-code", accountProfileId: ACCOUNT_A }));
    expect(a.quota).toHaveLength(2);
    expect(a.quota.find((row) => row.windowId === "session")?.usedPercent).toBe(30);
    expect(a.quota.every((row) => row.accountProfileId === ACCOUNT_A)).toBe(true);
    expect(store.read(filters({ providerId: "codex" })).quota).toHaveLength(0);
    store.recordQuota(emptyRateLimitsSnapshot(), { claudeAccountProfileId: ACCOUNT_A }, "2026-10-02T12:00:00.000Z");
    expect(store.read(filters({ providerId: "claude-code", accountProfileId: ACCOUNT_A })).latestQuota).toEqual(a.latestQuota);
  });

  test("reset crossings retain independent observed readings and latest quota is independent of the selected token period", () => {
    const snapshot = emptyRateLimitsSnapshot();
    snapshot.claude = { source: "oauth", session: { usedPercent: 99, resetsAt: 1790906400 }, weekly: null, fableWeekly: null, error: null };
    store.recordQuota(snapshot, { claudeAccountProfileId: ACCOUNT_A }, "2026-10-01T00:00:01.000Z");
    snapshot.claude.session = { usedPercent: 2, resetsAt: 1790924400 };
    store.recordQuota(snapshot, { claudeAccountProfileId: ACCOUNT_A }, "2026-10-02T00:00:01.000Z");
    const old = store.read(filters({ to: "2026-10-02T00:00:00.000Z" }));
    expect(old.quota[0]?.usedPercent).toBe(99);
    expect(old.latestQuota[0]?.usedPercent).toBe(2);
    expect(old.totals.tokens).toBe(0);
  });
});

describe("time and query validation", () => {
  test("repeated DST hours remain distinct and the spring-forward hour is absent", () => {
    expect(usageBucketKey("2026-11-01T05:15:00Z", "America/New_York", "hour")).toBe("2026-11-01 01:00 GMT-4");
    expect(usageBucketKey("2026-11-01T06:15:00Z", "America/New_York", "hour")).toBe("2026-11-01 01:00 GMT-5");
    const result = store.read(filters({ from: "2026-03-08T05:00:00.000Z", to: "2026-03-09T04:00:00.000Z", timeZone: "America/New_York", granularity: "hour" }));
    expect(result.series).toHaveLength(23);
    expect(result.series.some((row) => row.at.includes(" 02:00"))).toBe(false);
  });
  test("rejects unbounded queries, bad zones, ambiguous account filters and injected fields", () => {
    for (const patch of [{ to: FROM }, { to: "2028-01-01T00:00:00Z" }, { timeZone: "bad/timezone" }, { limit: 101 },
      { offset: -1 }, { accountProfileId: ACCOUNT_A }, { providerId: "unknown" }, { sql: "SELECT *" }, { from: "today" }]) {
      expect(UsageStatisticsArgsSchema.safeParse({ ...filters(), ...patch }).success).toBe(false);
    }
  });
  test("date presets include today's calendar day and custom ranges include the final date", () => {
    expect(usageRange({ period: "7", start: "", end: "", utc: true, now: new Date("2026-10-04T09:00:00Z") })).toEqual({ from: "2026-09-28T00:00:00.000Z", to: "2026-10-05T00:00:00.000Z" });
    expect(usageRange({ period: "custom", start: "2026-10-01", end: "2026-10-01", utc: true })).toEqual({ from: FROM, to: "2026-10-02T00:00:00.000Z" });
    expect(usageRange({ period: "custom", start: "", end: "", utc: true })).toBeNull();
  });
});
