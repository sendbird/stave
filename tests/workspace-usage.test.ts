import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { Database } from "bun:sqlite";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { WorkspaceUsageStore } from "../electron/persistence/workspace-usage-store";
import { usageStatisticsPreload } from "../electron/persistence/usage-statistics-preload";
import { WorkspaceUsageArgsSchema, WORKSPACE_USAGE_IPC, type WorkspaceUsageResponse } from "../src/lib/providers/workspace-usage";

let db: Database;
let usage: UsageStatisticsStore;
let store: WorkspaceUsageStore;

function setup() {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL, provider_id TEXT NOT NULL,
    created_at TEXT NOT NULL, completed_at TEXT, usage_json TEXT)`);
  usage = new UsageStatisticsStore(db);
  store = new WorkspaceUsageStore(db);
}

/** A completed turn as Stave records it: the turn row (workspace) and its usage row (provider, account, counters). */
function turn(args: { id: string; workspaceId: string | null; providerId: "claude-code" | "codex" | "cursor"; at: string; usage: unknown; account?: string; completed?: boolean }) {
  const json = typeof args.usage === "string" ? args.usage : JSON.stringify(args.usage);
  if (args.workspaceId) {
    db.prepare("INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at, usage_json) VALUES (?, ?, 'task', ?, ?, ?, ?)")
      .run(args.id, args.workspaceId, args.providerId, args.at, args.completed === false ? null : args.at, json);
  }
  usage.beginTurn({ id: args.id, providerId: args.providerId, accountProfileId: args.account, createdAt: args.at });
  if (args.completed !== false) usage.completeTurn(args.id, args.at, json);
}

const args = (overrides: Record<string, unknown> = {}) => WorkspaceUsageArgsSchema.parse({
  from: "2026-10-01T00:00:00Z", to: "2026-10-04T00:00:00Z", timeZone: "UTC", ...overrides,
});

describe("workspace usage store", () => {
  beforeEach(setup);

  test("sums tokens per workspace and day across providers, with cost only where reported", () => {
    turn({ id: "a1", workspaceId: "ws-a", providerId: "claude-code", at: "2026-10-01T10:00:00.000Z", usage: { inputTokens: 100, outputTokens: 50, cacheCreationTokens: 10, totalCostUsd: 0.25 } });
    turn({ id: "a2", workspaceId: "ws-a", providerId: "codex", at: "2026-10-02T09:00:00.000Z", usage: { inputTokens: 300, outputTokens: 20, cacheReadTokens: 200 } });
    turn({ id: "b1", workspaceId: "ws-b", providerId: "codex", at: "2026-10-03T23:59:00.000Z", usage: { inputTokens: 1000, outputTokens: 0 } });
    turn({ id: "c1", workspaceId: "ws-c", providerId: "cursor", at: "2026-10-02T12:00:00.000Z", usage: "not json" });

    const report = store.read(args());
    expect(report.days).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(report.workspaces.map((row) => row.workspaceId)).toEqual(["ws-b", "ws-a", "ws-c"]);
    const [b, a, c] = report.workspaces;
    // Claude: input + cache writes + output; Codex: input without cache reads + output.
    expect(a).toMatchObject({ tokens: 160 + 120, turns: 2, measuredTurns: 2, costUsd: 0.25, costReportedTurns: 1, lastActiveAt: "2026-10-02T09:00:00.000Z" });
    expect(a!.providerIds.toSorted()).toEqual(["claude-code", "codex"]);
    expect(a!.days["2026-10-01"]).toMatchObject({ tokens: 160, costUsd: 0.25 });
    expect(a!.days["2026-10-02"]).toMatchObject({ tokens: 120, costUsd: null });
    expect(b).toMatchObject({ tokens: 1000, costUsd: null, costReportedTurns: 0 });
    expect(Object.keys(b!.days)).toEqual(["2026-10-03"]);
    // Malformed usage is a turn without measurements, never a zero cost.
    expect(c).toMatchObject({ tokens: 0, turns: 1, measuredTurns: 0, costUsd: null });
    expect(report.totals).toMatchObject({ tokens: 1280, turns: 4, measuredTurns: 3, costUsd: 0.25, costReportedTurns: 1 });
  });

  test("groups days in the report's zone and compares with the earlier period", () => {
    turn({ id: "late", workspaceId: "ws-a", providerId: "codex", at: "2026-10-01T16:30:00.000Z", usage: { inputTokens: 10, outputTokens: 10 } });
    turn({ id: "earlier", workspaceId: "ws-a", providerId: "codex", at: "2026-09-29T12:00:00.000Z", usage: { inputTokens: 5, outputTokens: 5 } });
    const report = store.read(args({ from: "2026-09-30T15:00:00Z", to: "2026-10-03T15:00:00Z", timeZone: "Asia/Seoul",
      previous: { from: "2026-09-27T15:00:00Z", to: "2026-09-30T15:00:00Z" } }));
    expect(report.days).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    // 16:30 UTC is 01:30 the next day in Seoul.
    expect(Object.keys(report.workspaces[0]!.days)).toEqual(["2026-10-02"]);
    expect(report.totals.tokens).toBe(20);
    expect(report.previousTotals).toMatchObject({ tokens: 10, turns: 1 });
  });

  test("keeps usage of deleted tasks under no workspace, skips running turns and honours provider and account filters", () => {
    turn({ id: "kept", workspaceId: "ws-a", providerId: "claude-code", account: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f", at: "2026-10-01T01:00:00.000Z", usage: { inputTokens: 1, outputTokens: 1 } });
    turn({ id: "orphan", workspaceId: null, providerId: "claude-code", at: "2026-10-01T02:00:00.000Z", usage: { inputTokens: 7, outputTokens: 0 } });
    turn({ id: "running", workspaceId: "ws-a", providerId: "claude-code", at: "2026-10-01T03:00:00.000Z", usage: {}, completed: false });
    turn({ id: "other", workspaceId: "ws-b", providerId: "codex", at: "2026-10-01T04:00:00.000Z", usage: { inputTokens: 50, outputTokens: 0 } });

    const all = store.read(args());
    expect(all.workspaces.find((row) => row.workspaceId === null)).toMatchObject({ tokens: 7, turns: 1 });
    expect(all.totals.turns).toBe(3);
    const claude = store.read(args({ providerId: "claude-code" }));
    expect(claude.workspaces.map((row) => row.workspaceId)).toEqual([null, "ws-a"]);
    const work = store.read(args({ providerId: "claude-code", accountProfileId: "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f" }));
    expect(work.workspaces.map((row) => row.workspaceId)).toEqual(["ws-a"]);
    usage.resolveModel("other", "gpt-5", 1);
    expect(store.read(args({ modelId: "gpt-5" })).workspaces.map((row) => row.workspaceId)).toEqual(["ws-b"]);
    expect(store.read(args({ modelId: null })).totals.turns).toBe(2);
    expect(store.read(args({ from: "2026-11-01T00:00:00Z", to: "2026-11-02T00:00:00Z" }))).toMatchObject({ workspaces: [], totals: { turns: 0, tokens: 0, costUsd: null } });
  });
});

describe("workspace usage IPC", () => {
  const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
  let failRead = false;
  mock.module("electron", () => ({ ipcMain: { handle: (channel: string, handler: (event: unknown, input: unknown) => Promise<unknown>) => handlers.set(channel, handler) } }));
  mock.module("../electron/main/state", () => ({ ensurePersistenceReady: async () => {
    if (failRead) throw new Error("private database path must stay in main");
    return { workspaceUsage: store, usageStatistics: usage };
  } }));
  afterAll(() => mock.restore());

  test("crosses preload, strict validation and SQLite, and reports failures without details", async () => {
    setup();
    const { registerUsageStatisticsHandlers } = await import("../electron/main/ipc/usage-statistics");
    registerUsageStatisticsHandlers();
    const bridge = usageStatisticsPreload(async (channel, input) => JSON.parse(JSON.stringify(await handlers.get(channel)!({}, JSON.parse(JSON.stringify(input))))));
    turn({ id: "t", workspaceId: "ws-a", providerId: "codex", at: "2026-10-01T01:00:00.000Z", usage: { inputTokens: 4, outputTokens: 2 } });
    const result = await bridge.workspaceUsage(args());
    expect(result.ok && result.report.workspaces[0]).toMatchObject({ workspaceId: "ws-a", tokens: 6 });

    const handler = handlers.get(WORKSPACE_USAGE_IPC)!;
    expect((await handler({}, { ...args(), sql: "SELECT 1" }) as WorkspaceUsageResponse).ok).toBe(false);
    expect((await handler({}, { ...args(), accountProfileId: "work" }) as WorkspaceUsageResponse).ok).toBe(false);
    expect((await handler({}, { ...args(), to: "2027-12-01T00:00:00Z" }) as WorkspaceUsageResponse).ok).toBe(false);
    failRead = true;
    const failed = await handler({}, args()) as WorkspaceUsageResponse;
    expect(failed).toEqual({ ok: false, message: "Project usage could not be read. Try again." });
    failRead = false;
    expect((await handler({}, args()) as WorkspaceUsageResponse).ok).toBe(true);
  });
});
