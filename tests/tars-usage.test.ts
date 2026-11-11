import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import path from "node:path";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { TarsConversationStore } from "../electron/persistence/tars-conversation-store";
import { readTarsUsageReport } from "../electron/main/tars-usage";
import type { TarsResponsibility } from "../src/lib/tars/types";
import {
  TARS_USAGE_MAX_TURNS, TARS_USAGE_MAX_WORKS, TarsUsageInputSchema, TarsUsageReportSchema, aggregateTarsUsage, emptyTarsUsageMetrics,
  tarsUsageBarMeasure, tarsUsageShare, tarsUsageTokens, tarsUsageWindows, type TarsUsageInput, type TarsUsageTurn, type TarsUsageWorkSource,
} from "../src/lib/tars/usage";

const works: TarsUsageWorkSource[] = [
  { id: "billing", title: "Fix the billing export", state: "running", repositoryPath: "/tmp/repo" },
  { id: "docs", title: "Update the setup guide", state: "completed", repositoryPath: "/tmp/repo" },
];
/** A fixed period: today starts 2026-11-10T00:00Z, 7 days 2026-11-04, 30 days 2026-10-12, asked at noon. */
const period: TarsUsageInput = { todayStart: "2026-11-10T00:00:00.000Z", sevenDaysStart: "2026-11-04T00:00:00.000Z",
  thirtyDaysStart: "2026-10-12T00:00:00.000Z", until: "2026-11-10T12:00:00.000Z" };
const turn = (responsibilityId: string, createdAt: string, patch: Partial<TarsUsageTurn> = {}): TarsUsageTurn => ({
  responsibilityId, providerId: "codex", modelId: "gpt-codex", createdAt, completedAt: patch.completedAt ?? new Date(Date.parse(createdAt) + 60_000).toISOString(),
  usage: { inputTokens: 1_000, outputTokens: 100 }, ...patch,
});
const aggregate = (turns: TarsUsageTurn[], extra: Partial<Parameters<typeof aggregateTarsUsage>[0]> = {}) =>
  aggregateTarsUsage({ period, works, turns, replies: [], generatedAt: period.until, ...extra });

/** The periods as a process in `timeZone` computes them: its own process, so no other test's clock changes. */
function windowsIn(timeZone: string, now: string): TarsUsageInput {
  const source = `import { tarsUsageWindows } from "./src/lib/tars/usage"; console.log(JSON.stringify(tarsUsageWindows(new Date(${JSON.stringify(now)}))));`;
  const result = Bun.spawnSync({ cmd: [process.execPath, "--eval", source], cwd: path.join(import.meta.dir, ".."), env: { ...process.env, TZ: timeZone }, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode, result.stderr.toString()).toBe(0);
  return JSON.parse(result.stdout.toString()) as TarsUsageInput;
}

describe("usage periods in local time", () => {
  test("today, 7 days and 30 days start at local midnight, in a zone behind and a zone ahead of UTC", () => {
    // 09:30 local on Nov 10 in New York (EST, UTC-5).
    expect(windowsIn("America/New_York", "2026-11-10T14:30:00.000Z")).toEqual({
      todayStart: "2026-11-10T05:00:00.000Z", sevenDaysStart: "2026-11-04T05:00:00.000Z",
      // Oct 12 is still daylight time (UTC-4): a calendar day, not 24 hours times 29.
      thirtyDaysStart: "2026-10-12T04:00:00.000Z", until: "2026-11-10T14:30:00.000Z",
    });
    // 00:30 local on Nov 11 in Seoul (UTC+9): the local day is already the 11th while UTC is still the 10th.
    const seoul = windowsIn("Asia/Seoul", "2026-11-10T15:30:00.000Z");
    expect(seoul).toEqual({
      todayStart: "2026-11-10T15:00:00.000Z", sevenDaysStart: "2026-11-04T15:00:00.000Z",
      thirtyDaysStart: "2026-10-12T15:00:00.000Z", until: "2026-11-10T15:30:00.000Z",
    });
    expect(TarsUsageInputSchema.safeParse(seoul).success).toBe(true);
    // In this process's own zone the same rule holds: local midnight today, six and 29 calendar days back.
    const now = new Date("2026-11-10T15:30:00.000Z");
    expect(tarsUsageWindows(now)).toEqual({ todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      sevenDaysStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6).toISOString(),
      thirtyDaysStart: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).toISOString(), until: now.toISOString() });
  });

  test("the day a clock change shortens is still one day", () => {
    // Mar 8 2026 has 23 hours in New York; Mar 9 at 10:00 local is 14:00Z (EDT).
    const windows = windowsIn("America/New_York", "2026-03-09T14:00:00.000Z");
    expect(windows.todayStart).toBe("2026-03-09T04:00:00.000Z");
    // Six days back is Mar 3, still standard time (UTC-5).
    expect(windows.sevenDaysStart).toBe("2026-03-03T05:00:00.000Z");
  });

  test("main refuses a period that is out of order, too long or carries anything else", () => {
    expect(TarsUsageInputSchema.safeParse(period).success).toBe(true);
    expect(TarsUsageInputSchema.safeParse({ ...period, sevenDaysStart: "2026-11-11T00:00:00.000Z" }).success).toBe(false);
    expect(TarsUsageInputSchema.safeParse({ ...period, thirtyDaysStart: "2026-01-01T00:00:00.000Z" }).success).toBe(false);
    expect(TarsUsageInputSchema.safeParse({ ...period, until: "2026-11-09T00:00:00.000Z" }).success).toBe(false);
    expect(TarsUsageInputSchema.safeParse({ ...period, taskId: "any" }).success).toBe(false);
    expect(TarsUsageInputSchema.safeParse({ ...period, todayStart: "yesterday" }).success).toBe(false);
  });
});

describe("usage aggregation", () => {
  test("a turn counts in the period its start falls in, and each boundary belongs to the later period", () => {
    const report = aggregate([
      turn("billing", "2026-11-10T00:00:00.000Z"), // exactly today's start: today
      turn("billing", "2026-11-09T23:59:59.999Z"), // a millisecond earlier: 7 days only
      turn("billing", "2026-11-04T00:00:00.000Z"), // exactly the 7-day start
      turn("billing", "2026-11-03T23:59:59.999Z"), // 30 days only
      turn("docs", "2026-10-12T00:00:00.000Z"), // exactly the 30-day start
      turn("docs", "2026-10-11T23:59:59.999Z"), // before the period
      turn("docs", "2026-11-10T12:00:00.000Z"), // at `until`, which is exclusive
      turn("docs", "not a time", { completedAt: "2026-11-10T01:00:00.000Z" }),
    ]);
    expect([report.totals.today.turns, report.totals.sevenDays.turns, report.totals.thirtyDays.turns]).toEqual([1, 3, 5]);
    expect(report.totals.thirtyDays).toEqual({ turns: 5, measuredTurns: 5, tokens: 5_500, costUsd: null, costReportedTurns: 0, durationMs: 300_000 });
    const billing = report.works.find((work) => work.responsibilityId === "billing")!;
    expect([billing.usage.today.turns, billing.usage.sevenDays.turns, billing.usage.thirtyDays.turns]).toEqual([1, 3, 4]);
    const docs = report.works.find((work) => work.responsibilityId === "docs")!;
    expect([docs.usage.today.turns, docs.usage.sevenDays.turns, docs.usage.thirtyDays.turns]).toEqual([0, 0, 1]);
    expect(TarsUsageReportSchema.safeParse(report).success).toBe(true);
  });

  test("no turns is an empty report, never rows of zeros", () => {
    const report = aggregate([]);
    expect(report.works).toEqual([]);
    expect(report.models).toEqual([]);
    expect(report.totals.today).toEqual(emptyTarsUsageMetrics());
    expect(report.totals.thirtyDays).toEqual(emptyTarsUsageMetrics());
    expect(report.replies).toEqual({ today: 0, sevenDays: 0, thirtyDays: 0 });
    expect(report.truncated).toBe(false);
    expect(tarsUsageShare(report.totals.today, report.totals.today)).toBe(0);
    expect(TarsUsageReportSchema.safeParse(report).success).toBe(true);
  });

  test("partial data stays partial: an unreported turn has time but no tokens, and cost exists only where a provider reported it", () => {
    const report = aggregate([
      turn("billing", "2026-11-10T01:00:00.000Z", { usage: null }),
      turn("billing", "2026-11-10T02:00:00.000Z", { usage: { inputTokens: 2_000, outputTokens: 300 } }),
      turn("docs", "2026-11-10T03:00:00.000Z", { providerId: "claude-code", modelId: "claude-sonnet", usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 400, cacheReadTokens: 90_000, totalCostUsd: 0.25 } }),
      turn("docs", "2026-11-10T04:00:00.000Z", { providerId: "claude-code", modelId: null, usage: { inputTokens: 10, outputTokens: 5, totalCostUsd: 0 } }),
      // A malformed row: counters that are not numbers are not a measurement.
      turn("docs", "2026-11-10T05:00:00.000Z", { usage: { inputTokens: "many", outputTokens: 5 } as never }),
    ]);
    expect(report.totals.today).toEqual({ turns: 5, measuredTurns: 3, tokens: 2_300 + 550 + 15, costUsd: 0.25, costReportedTurns: 2, durationMs: 300_000 });
    const billing = report.works.find((work) => work.responsibilityId === "billing")!;
    // Codex reported tokens and never a cost: the cost stays null rather than becoming zero.
    expect(billing.usage.today).toMatchObject({ turns: 2, measuredTurns: 1, tokens: 2_300, costUsd: null, costReportedTurns: 0 });
    expect(billing.modelIds.today).toEqual(["gpt-codex"]);
    // A reported zero cost is a report; an unrecorded model is listed as such, not guessed.
    expect(report.models.map((model) => [model.providerId, model.modelId, model.usage.today.turns, model.usage.today.costUsd])).toEqual([
      ["codex", "gpt-codex", 3, null], ["claude-code", "claude-sonnet", 1, 0.25], ["claude-code", null, 1, 0],
    ]);
  });

  test("tokens follow each provider's cache convention and never count cache reads", () => {
    expect(tarsUsageTokens("claude-code", { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 400, cacheReadTokens: 90_000 })).toBe(550);
    expect(tarsUsageTokens("codex", { inputTokens: 10_000, outputTokens: 500, cacheReadTokens: 8_000 })).toBe(2_500);
    expect(tarsUsageTokens("codex", { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 8_000 })).toBe(500);
    expect(tarsUsageTokens("cursor", { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 8_000 })).toBe(1_500);
    expect(tarsUsageTokens("codex", { inputTokens: -5, outputTokens: Number.NaN })).toBe(0);
  });

  test("turns of work that is not Tars's are ignored, models follow the period, and rows sort largest first", () => {
    const report = aggregate([
      turn("someone-else", "2026-11-10T01:00:00.000Z"),
      turn("docs", "2026-11-10T01:00:00.000Z", { usage: { inputTokens: 9_000, outputTokens: 1_000 } }),
      turn("billing", "2026-11-10T01:00:00.000Z"),
      turn("billing", "2026-10-20T01:00:00.000Z", { modelId: "gpt-older" }),
    ]);
    expect(report.totals.thirtyDays.turns).toBe(3);
    expect(report.works.map((work) => work.responsibilityId)).toEqual(["docs", "billing"]);
    const billing = report.works[1]!;
    expect(billing.modelIds).toEqual({ today: ["gpt-codex"], sevenDays: ["gpt-codex"], thirtyDays: ["gpt-codex", "gpt-older"] });
    // The bar measures tokens when any were reported, otherwise turns.
    expect(tarsUsageBarMeasure(report.totals.today)).toBe("tokens");
    expect(tarsUsageShare(report.works[0]!.usage.today, report.totals.today)).toBeCloseTo((10_000 / 11_100) * 100, 5);
    const unmeasured = aggregate([turn("billing", "2026-11-10T01:00:00.000Z", { usage: null }), turn("docs", "2026-11-10T02:00:00.000Z", { usage: null })]);
    expect(tarsUsageBarMeasure(unmeasured.totals.today)).toBe("turns");
    expect(tarsUsageShare(unmeasured.works[0]!.usage.today, unmeasured.totals.today)).toBe(50);
  });

  test("Tars's own replies are counted by period, and unread replies stay unread instead of zero", () => {
    const counted = aggregate([], { replies: ["2026-11-10T08:00:00.000Z", "2026-11-06T08:00:00.000Z", "2026-10-15T08:00:00.000Z", "2026-09-01T08:00:00.000Z"] });
    expect(counted.replies).toEqual({ today: 1, sevenDays: 2, thirtyDays: 3 });
    expect(aggregate([], { replies: null }).replies).toBeNull();
  });
});

describe("reading usage from saved turns", () => {
  function open() {
    const database = new Database(":memory:");
    // The turns table as `SqliteStore` creates it, with the usage column its migration adds.
    database.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, provider_id TEXT NOT NULL,
      created_at TEXT NOT NULL, completed_at TEXT, usage_json TEXT);
      CREATE INDEX idx_turns_workspace_task_created ON turns (workspace_id, task_id, created_at);`);
    const usageStatistics = new UsageStatisticsStore(database as never);
    const tarsConversations = new TarsConversationStore(database as never);
    const insertTurn = database.prepare("INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const add = (id: string, workspaceId: string, taskId: string, createdAt: string, options: { completed?: boolean; usage?: object | string | null; modelId?: string; providerId?: string } = {}) => {
      const providerId = options.providerId ?? "codex";
      const usage = options.usage === undefined ? { inputTokens: 1_000, outputTokens: 100 } : options.usage;
      const usageJson = usage === null ? null : typeof usage === "string" ? usage : JSON.stringify(usage);
      const completedAt = options.completed === false ? null : new Date(Date.parse(createdAt) + 120_000).toISOString();
      insertTurn.run(id, workspaceId, taskId, providerId, createdAt, completedAt, usageJson);
      usageStatistics.beginTurn({ id, providerId: providerId as never, modelId: options.modelId, createdAt });
      if (completedAt) usageStatistics.completeTurn(id, completedAt, usageJson);
    };
    return { database, usageStatistics, tarsConversations, add };
  }
  const row = (patch: Partial<TarsResponsibility> & Pick<TarsResponsibility, "id">): TarsResponsibility => ({
    requestId: `request-${patch.id}`, title: `Work ${patch.id}`, instruction: "Do it.", acceptanceCriteria: ["Done."], workspaceId: "source", repositoryPath: "/tmp/repo",
    providerId: "codex", model: null, agentId: null, priority: 50, maxTurns: 30, revision: 1, state: "running", detail: null, taskId: `task-${patch.id}`,
    executionWorkspaceId: `exec-${patch.id}`, agentRunId: `run-${patch.id}`, reverifyAfter: null, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-09T00:00:00.000Z", ...patch,
  } as TarsResponsibility);
  const ports = (store: ReturnType<typeof open>, responsibilities: TarsResponsibility[]) => ({
    tars: { snapshot: () => ({ runtime: "desktop" as const, identity: { id: "personal" as const, name: "Tars", instructions: "", updatedAt: period.until }, responsibilities }) },
    usageStatistics: store.usageStatistics, tarsConversations: store.tarsConversations,
  });

  test("only completed turns of each work's own task in the period are read, with the model the turn recorded", () => {
    const store = open();
    store.add("t1", "exec-a", "task-a", "2026-11-10T01:00:00.000Z", { modelId: "gpt-codex" });
    store.add("t2", "exec-a", "task-a", "2026-11-05T01:00:00.000Z", { modelId: "gpt-codex", usage: { inputTokens: 5_000, outputTokens: 500, cacheReadTokens: 4_000 } });
    store.add("t3", "exec-a", "task-a", "2026-11-10T02:00:00.000Z", { completed: false });
    store.add("t4", "exec-a", "task-a", "2026-09-01T01:00:00.000Z");
    // Another task in the same workspace (a helper), and the same task id in another workspace: neither is this work's.
    store.add("t5", "exec-a", "task-helper", "2026-11-10T03:00:00.000Z");
    store.add("t6", "exec-other", "task-a", "2026-11-10T03:00:00.000Z");
    // Work with no execution workspace yet reads its source workspace; a malformed usage row is an unmeasured turn.
    store.add("t7", "source", "task-b", "2026-11-10T04:00:00.000Z", { providerId: "claude-code", usage: "{broken" });
    store.add("t8", "source", "task-b", "2026-11-10T05:00:00.000Z", { providerId: "claude-code", modelId: "claude-sonnet", usage: { inputTokens: 100, outputTokens: 50, totalCostUsd: 0.5 } });
    const report = readTarsUsageReport(ports(store, [row({ id: "a" }), row({ id: "b", executionWorkspaceId: null }), row({ id: "queued", taskId: null })]), period, period.until);
    expect(TarsUsageReportSchema.safeParse(report).success).toBe(true);
    const a = report.works.find((work) => work.responsibilityId === "a")!;
    expect([a.usage.today.turns, a.usage.sevenDays.turns, a.usage.thirtyDays.turns]).toEqual([1, 2, 2]);
    expect(a.usage.sevenDays).toMatchObject({ tokens: 1_100 + 1_500, durationMs: 240_000, costUsd: null });
    expect(a.modelIds.today).toEqual(["gpt-codex"]);
    const b = report.works.find((work) => work.responsibilityId === "b")!;
    expect(b.usage.today).toMatchObject({ turns: 2, measuredTurns: 1, tokens: 150, costUsd: 0.5, costReportedTurns: 1 });
    expect(report.works.map((work) => work.responsibilityId).sort()).toEqual(["a", "b"]);
    expect(report.totals.thirtyDays.turns).toBe(4);
    expect(report.truncated).toBe(false);
    expect(report.omittedWorks).toBe(0);
    store.database.close();
  });

  test("the read is bounded: a row budget across works and a cap on works, both reported", () => {
    const store = open();
    for (let index = 0; index < 5; index += 1) store.add(`a${index}`, "exec-a", "task-a", `2026-11-10T0${index}:00:00.000Z`);
    for (let index = 0; index < 3; index += 1) store.add(`b${index}`, "exec-b", "task-b", `2026-11-09T0${index}:00:00.000Z`);
    const tasks = [{ key: "a", workspaceId: "exec-a", taskId: "task-a" }, { key: "b", workspaceId: "exec-b", taskId: "task-b" }];
    const all = store.usageStatistics.readTaskTurns({ tasks, from: period.thirtyDaysStart, until: period.until, limit: 100 });
    expect([all.turns.length, all.truncated]).toEqual([8, false]);
    // Newest first within a task.
    expect(all.turns.slice(0, 2).map((item) => item.createdAt)).toEqual(["2026-11-10T04:00:00.000Z", "2026-11-10T03:00:00.000Z"]);
    const exact = store.usageStatistics.readTaskTurns({ tasks, from: period.thirtyDaysStart, until: period.until, limit: 8 });
    expect([exact.turns.length, exact.truncated]).toEqual([8, false]);
    const cut = store.usageStatistics.readTaskTurns({ tasks, from: period.thirtyDaysStart, until: period.until, limit: 6 });
    expect([cut.turns.length, cut.truncated, cut.turns.filter((item) => item.key === "b").length]).toEqual([6, true, 1]);
    const spent = store.usageStatistics.readTaskTurns({ tasks, from: period.thirtyDaysStart, until: period.until, limit: 5 });
    expect([spent.turns.length, spent.truncated]).toEqual([5, true]);
    expect(TARS_USAGE_MAX_TURNS).toBeGreaterThan(0);
    // More work than one report reads: the most recently changed is kept and the rest counted.
    const many = Array.from({ length: TARS_USAGE_MAX_WORKS + 2 }, (_, index) => row({ id: `w${index}`, taskId: index === 0 ? "task-a" : `task-w${index}`,
      executionWorkspaceId: index === 0 ? "exec-a" : `exec-w${index}`, updatedAt: index === 0 ? "2026-11-10T00:00:00.000Z" : "2026-11-01T00:00:00.000Z" }));
    const report = readTarsUsageReport(ports(store, many), period, period.until);
    expect(report.omittedWorks).toBe(2);
    expect(report.works.map((work) => work.responsibilityId)).toEqual(["w0"]);
    store.database.close();
  });

  test("Tars's own replies are only counted, and a conversation that cannot be read does not hide the work's usage", () => {
    const store = open();
    store.add("t1", "exec-a", "task-a", "2026-11-10T01:00:00.000Z");
    const insert = store.database.prepare("INSERT INTO tars_messages (id, request_id, request_hash, revision, state, created_at, body_json) VALUES (?, ?, ?, 1, ?, ?, '{}')");
    insert.run("m1", "r1", "h1", "answered", "2026-11-10T02:00:00.000Z");
    insert.run("m2", "r2", "h2", "answered", "2026-11-05T02:00:00.000Z");
    insert.run("m3", "r3", "h3", "failed", "2026-11-10T03:00:00.000Z");
    insert.run("m4", "r4", "h4", "answered", "2026-09-01T02:00:00.000Z");
    const report = readTarsUsageReport(ports(store, [row({ id: "a" })]), period, period.until);
    expect(report.replies).toEqual({ today: 1, sevenDays: 2, thirtyDays: 2 });
    const unreadable = readTarsUsageReport({ ...ports(store, [row({ id: "a" })]), tarsConversations: { answeredTimes: () => { throw new Error("locked"); } } }, period, period.until);
    expect(unreadable.replies).toBeNull();
    expect(unreadable.totals.today.turns).toBe(1);
    store.database.close();
  });
});
