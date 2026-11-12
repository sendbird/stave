import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { DailyUsageStore } from "../electron/persistence/daily-usage-store";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { dailyUsageWindow, DailyLimitUpdateSchema } from "../src/lib/usage/daily-limit";
import { applyAppLocale } from "../src/i18n";
import { describeAgentRunUsageLimit } from "../src/lib/agent-runs/usage-limit";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import { agentRunFixture } from "./fixtures/agent-run-fixtures";
import { applyAgentRunDecision } from "../src/lib/agent-runs/policy";
import { resumeAgentRun } from "../src/lib/agent-runs/commands";

let db: Database;
let usage: UsageStatisticsStore;
let daily: DailyUsageStore;
const today = new Date(2026, 10, 12, 12);
beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT);
    CREATE TABLE app_state (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  usage = new UsageStatisticsStore(db);
  daily = new DailyUsageStore(db, usage);
});
afterEach(() => { db.close(); applyAppLocale("en"); });
function turn(id: string, providerId: "claude-code" | "codex", values: unknown, at = today) {
  usage.beginTurn({ id, providerId, accountProfileId: id, createdAt: at.toISOString() });
  usage.completeTurn(id, new Date(at.getTime() + 1000).toISOString(), JSON.stringify(values));
}

describe("durable provider daily limits", () => {
  test("existing Run databases gain the daily pause flag and preserve it through restart until resume", () => {
    new AgentRunStore(db);
    db.exec("ALTER TABLE agent_runs DROP COLUMN daily_usage_limit");
    const runs = new AgentRunStore(db);
    const aggregate = agentRunFixture();
    expect(runs.create({ agentRun: aggregate.agentRun, upserts: aggregate.stages, events: [] }, today).ok).toBe(true);
    const paused = applyAgentRunDecision({ aggregate, now: today, decision: { action: "pause", reason: "usage-limit", detail: "Daily limit reached." } });
    paused.agentRun.dailyUsageLimit = true;
    runs.apply(paused, today);
    const restored = new AgentRunStore(db);
    const read = restored.getAggregate(aggregate.agentRun.id)!;
    expect(read.agentRun).toMatchObject({ state: "paused", dailyUsageLimit: true, pauseReason: "usage-limit" });
    restored.apply(resumeAgentRun({ aggregate: read, now: today }), today);
    expect(restored.getAggregate(aggregate.agentRun.id)!.agentRun.dailyUsageLimit).toBeUndefined();
  });
  test("off by default even after usage, independent per provider and durable across store reopen", () => {
    turn("work", "codex", { inputTokens: 100, outputTokens: 20 });
    expect(daily.read(today).providers.every((row) => row.limit === null && !row.reached)).toBe(true);
    expect(daily.refusal("codex", today)).toBeNull();
    daily.update({ providerId: "codex", limit: { unit: "tokens", amount: 120 } }, today);
    expect(new DailyUsageStore(db, usage).refusal("codex", today)).toBeTruthy();
    expect(daily.refusal("claude-code", today)).toBeNull();
    daily.update({ providerId: "codex", limit: null }, today);
    expect(daily.refusal("codex", today)).toBeNull();
  });

  test("refuses exactly at the limit, aggregates accounts and uses existing cache normalization", () => {
    daily.update({ providerId: "codex", limit: { unit: "tokens", amount: 100 } }, today);
    turn("personal", "codex", { inputTokens: 100, outputTokens: 20, cacheReadTokens: 70, thoughtTokens: 40 });
    expect(daily.refusal("codex", today)).toBeNull(); // 50, with cache reads excluded and reasoning not counted twice.
    turn("work", "codex", { inputTokens: 40, outputTokens: 10 });
    expect(daily.read(today).providers.find((row) => row.providerId === "codex")).toMatchObject({ tokens: 100, reached: true });
    expect(daily.refusal("codex", today)).toBeTruthy();
    daily.update({ providerId: "codex", limit: { unit: "tokens", amount: 101 } }, today);
    expect(daily.refusal("codex", today)).toBeNull();
  });

  test("only reported costs can enable USD; no estimated costs or pending turns count", () => {
    expect(() => daily.update({ providerId: "claude-code", limit: { unit: "usd", amount: 1 } }, today)).toThrow();
    turn("cost", "claude-code", { inputTokens: 10, outputTokens: 5, totalCostUsd: 1 });
    daily.update({ providerId: "claude-code", limit: { unit: "usd", amount: 1 } }, today);
    expect(daily.refusal("claude-code", today)).toBeTruthy();
    usage.beginTurn({ id: "in-flight", providerId: "codex", createdAt: today.toISOString() });
    expect(daily.read(today).providers.find((row) => row.providerId === "codex")).toMatchObject({ tokens: 0, costUsd: null, costAvailable: false });
    turn("unreported", "claude-code", { inputTokens: 100, outputTokens: 20 });
    expect(daily.read(today).providers.find((row) => row.providerId === "claude-code")?.costUsd).toBe(1);
  });

  test("uses local calendar days and rolls over at midnight without changing the saved limit", () => {
    turn("yesterday", "codex", { inputTokens: 1000, outputTokens: 10 }, new Date(2026, 10, 11, 23, 59));
    turn("today", "codex", { inputTokens: 100, outputTokens: 0 });
    daily.update({ providerId: "codex", limit: { unit: "tokens", amount: 100 } }, today);
    const { from, to } = dailyUsageWindow(today);
    expect(new Date(from).getHours()).toBe(0);
    expect(new Date(from).getDate()).toBe(12);
    expect(new Date(to).getDate()).toBe(13);
    expect(daily.refusal("codex", new Date(2026, 10, 12, 23, 59, 59))).toBeTruthy();
    const tomorrow = daily.read(new Date(2026, 10, 13));
    expect(tomorrow.providers.find((row) => row.providerId === "codex")).toMatchObject({ limit: { unit: "tokens", amount: 100 }, tokens: 0, reached: false });
    expect(daily.refusal("codex", new Date(2026, 10, 13))).toBeNull();
  });

  test("rejects invalid settings and translates the refusal in both shipped languages", () => {
    for (const amount of [0, -1, Infinity, NaN]) expect(DailyLimitUpdateSchema.safeParse({ providerId: "codex", limit: { unit: "tokens", amount } }).success).toBe(false);
    turn("spent", "codex", { inputTokens: 1, outputTokens: 0 });
    daily.update({ providerId: "codex", limit: { unit: "tokens", amount: 1 } }, today);
    expect(daily.refusal("codex", today)).toContain("Daily limit reached");
    applyAppLocale("ko");
    expect(daily.refusal("codex", today)).toContain("일일 한도");
    expect(describeAgentRunUsageLimit({ usageLimit: undefined, dailyUsageLimit: true })).toContain("일일 한도");
  });

  test("local boundaries stay correct in non-UTC zones and across daylight-saving changes", () => {
    const code = `import { dailyUsageWindow } from './src/lib/usage/daily-limit';
      const read = (year, month, day) => dailyUsageWindow(new Date(year, month, day, 12));
      console.log(JSON.stringify([read(2026, 2, 8), read(2026, 10, 1)]));`;
    const result = Bun.spawnSync([process.execPath, "--eval", code], { env: { ...process.env, TZ: "America/New_York" } });
    expect(result.exitCode).toBe(0);
    const days = JSON.parse(result.stdout.toString()) as Array<{ from: string; to: string }>;
    expect(days[0]!.from).toBe("2026-03-08T05:00:00.000Z");
    expect(Date.parse(days[0]!.to) - Date.parse(days[0]!.from)).toBe(23 * 60 * 60 * 1000);
    expect(Date.parse(days[1]!.to) - Date.parse(days[1]!.from)).toBe(25 * 60 * 60 * 1000);
  });
});
