import { afterEach, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import { UsageStatisticsArgsSchema } from "../src/lib/providers/usage-statistics";

afterEach(() => clearUsageReadState());

test("TTL and failure-backoff cache responses do not refresh saved quota observations", async () => {
  clearUsageReadState();
  const db = new Database(":memory:");
  db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)");
  const store = new UsageStatisticsStore(db);
  let now = Date.parse("2026-10-01T12:00:00.000Z");
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  const request = () => getRateLimitsSnapshot({
    providers: ["claude-code"],
    fetchers: { claude: async () => {
      calls += 1;
      return calls === 2 ? emptyRateLimitsSnapshot().claude : {
        source: "oauth" as const,
        session: { usedPercent: calls === 1 ? 30 : 40, resetsAt: null },
        weekly: null, fableWeekly: null, error: null,
      };
    } },
    onObservation: (snapshot) => store.recordQuota(snapshot, undefined, new Date(now).toISOString()),
  });
  try {
    await request();
    now += 60_000;
    await request(); // Within TTL.
    now = Date.parse("2026-10-01T12:16:00.000Z");
    expect((await request()).claude.source).toBe("unavailable");
    now = Date.parse("2026-10-01T12:19:00.000Z");
    expect((await request()).claude.session?.usedPercent).toBe(30);
    expect(calls).toBe(2);
    const filters = UsageStatisticsArgsSchema.parse({
      from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timeZone: "UTC",
    });
    const cached = store.read(filters);
    expect(cached.quota).toHaveLength(1);
    expect(cached.latestQuota[0]?.observedAt).toBe("2026-10-01T12:00:00.000Z");
    now = Date.parse("2026-10-01T12:22:00.000Z");
    await request(); // Recovery makes a new observation.
    const recovered = store.read(filters);
    expect(recovered.quota).toHaveLength(2);
    expect(recovered.latestQuota[0]?.usedPercent).toBe(40);
    expect(recovered.latestQuota[0]?.observedAt).toBe("2026-10-01T12:22:00.000Z");
  } finally {
    clock.mockRestore();
    db.close();
  }
});
