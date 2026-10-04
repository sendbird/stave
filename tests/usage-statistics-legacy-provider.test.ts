// temporary-migration: usage-statistics-legacy-provider
import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { UsageStatisticsArgsSchema, UNATTRIBUTED_ACCOUNT_ID } from "../src/lib/providers/usage-statistics";

test("imports the retired provider identity once without inventing an account", () => {
  const db = new Database(":memory:");
  try {
    db.exec(`CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT);
      INSERT INTO turns VALUES ('old', 'stave', '2026-10-01T00:00:00.000Z', '2026-10-01T01:00:00.000Z', '{"inputTokens":10,"outputTokens":2}');`);
    new UsageStatisticsStore(db);
    const store = new UsageStatisticsStore(db);
    const report = store.read(UsageStatisticsArgsSchema.parse({ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timeZone: "UTC" }));
    expect(report.totals.tokens).toBe(12);
    expect(report.turns).toHaveLength(1);
    expect(report.turns[0]?.providerId).toBe("claude-code");
    expect(report.turns[0]?.accountProfileId).toBe(UNATTRIBUTED_ACCOUNT_ID);
  } finally { db.close(); }
});
