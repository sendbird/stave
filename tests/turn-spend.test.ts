import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import { TurnSpendStore } from "../electron/persistence/turn-spend-store";
import {
  TURN_SPEND_DRIFT_REFRESH_MS,
  TurnSpendArgsSchema,
  resolveTurnSpendPeriods,
  resolveTurnSpendRefreshDelayMs,
} from "../src/lib/providers/turn-spend";

describe("turn spend periods", () => {
  test("start at local midnight and on the 1st of the local month", () => {
    const now = new Date(2026, 9, 2, 0, 30);
    expect(resolveTurnSpendPeriods(now)).toEqual({
      dayStart: new Date(2026, 9, 2).toISOString(),
      monthStart: new Date(2026, 9, 1).toISOString(),
    });
  });

  test("match on the 1st, and roll over at the year boundary", () => {
    const first = resolveTurnSpendPeriods(new Date(2027, 0, 1, 23, 59));
    expect(first.dayStart).toBe(first.monthStart);
    expect(first.monthStart).toBe(new Date(2027, 0, 1).toISOString());
  });

  test("are what the IPC schema accepts, and nothing looser", () => {
    expect(TurnSpendArgsSchema.safeParse(resolveTurnSpendPeriods()).success).toBe(true);
    expect(TurnSpendArgsSchema.safeParse({ dayStart: "today", monthStart: "2026-10-01T00:00:00.000Z" }).success).toBe(false);
    expect(
      TurnSpendArgsSchema.safeParse({
        dayStart: "2026-10-02T00:00:00.000Z",
        monthStart: "2026-10-01T00:00:00.000Z",
        workspaceId: "extra",
      }).success,
    ).toBe(false);
  });

  test("re-read on the drift interval, or just after midnight when sooner", () => {
    expect(resolveTurnSpendRefreshDelayMs(new Date(2026, 9, 2, 12, 0))).toBe(TURN_SPEND_DRIFT_REFRESH_MS);
    expect(resolveTurnSpendRefreshDelayMs(new Date(2026, 9, 2, 23, 58))).toBe(2 * 60_000 + 1_000);
  });
});

describe("turn spend store", () => {
  let db: Database;
  let sequence = 0;
  function turn(providerId: string, createdAt: Date, usage: unknown) {
    sequence += 1;
    db.prepare(
      "INSERT INTO turns (id, workspace_id, task_id, provider_id, created_at, completed_at, usage_json) VALUES (?, 'ws', 'task', ?, ?, NULL, ?)",
    ).run(
      `turn-${sequence}`,
      providerId,
      createdAt.toISOString(),
      typeof usage === "string" || usage === null ? usage : JSON.stringify(usage),
    );
  }
  const cost = (totalCostUsd: number) => ({ inputTokens: 10, outputTokens: 5, totalCostUsd });

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT NOT NULL,
      provider_id TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT, usage_json TEXT)`);
  });
  afterEach(() => db.close());

  test("sums reported cost per provider by the local day and month", () => {
    const periods = resolveTurnSpendPeriods(new Date(2026, 9, 2, 15, 0));
    turn("claude-code", new Date(2026, 9, 2, 0, 0), cost(0.25));
    turn("claude-code", new Date(2026, 9, 2, 14, 0), cost(0.5));
    turn("claude-code", new Date(2026, 9, 1, 23, 59), cost(1));
    turn("claude-code", new Date(2026, 9, 1, 0, 0), cost(2));
    // Last month and malformed rows do not count.
    turn("claude-code", new Date(2026, 8, 30, 23, 59), cost(100));
    turn("claude-code", new Date(2026, 9, 2, 9, 0), "{not json");
    turn("claude-code", new Date(2026, 9, 2, 9, 0), null);
    // A legacy id still belongs to Claude.
    turn("stave", new Date(2026, 9, 2, 10, 0), cost(0.25));

    const [claude] = new TurnSpendStore(db).summarize(periods);
    expect(claude?.providerId).toBe("claude-code");
    expect(claude?.todayUsd).toBeCloseTo(1);
    expect(claude?.monthUsd).toBeCloseTo(4);
    expect(claude?.monthTurns).toBe(5);
  });

  test("a provider that reports tokens only has no entry", () => {
    const periods = resolveTurnSpendPeriods(new Date(2026, 9, 2, 15, 0));
    turn("codex", new Date(2026, 9, 2, 14, 0), { inputTokens: 1200, outputTokens: 300 });
    turn("codex", new Date(2026, 9, 2, 14, 5), cost(0));
    turn("unknown-provider", new Date(2026, 9, 2, 14, 0), cost(1));
    turn("claude-code", new Date(2026, 9, 2, 14, 0), cost(0.1));

    const spend = new TurnSpendStore(db).summarize(periods);
    expect(spend.map((entry) => entry.providerId)).toEqual(["claude-code"]);
  });
});
