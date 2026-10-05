import { afterEach, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";
import { UsageStatisticsArgsSchema } from "../src/lib/providers/usage-statistics";
import { subscribeQuotaObservations } from "../electron/providers/rate-limits/quota-observations";
import { mapClaudeMessageToEvents } from "../electron/providers/claude-sdk-runtime";
import { clearCodexRateLimitsCache, recordCodexRateLimits } from "../electron/providers/codex-rate-limits-cache";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import * as gatewayRuntime from "../electron/provider-accounts/gateway-runtime";
import * as codexRuntime from "../electron/providers/codex-app-server-runtime";

afterEach(() => {
  clearUsageReadState();
  clearCodexRateLimitsCache();
});

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

function quotaFixture() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)");
  const store = new UsageStatisticsStore(db);
  const unsubscribe = subscribeQuotaObservations((snapshot, metadata) =>
    store.recordQuota(snapshot, metadata, metadata.observedAt));
  const filters = UsageStatisticsArgsSchema.parse({
    from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timeZone: "UTC",
  });
  return { store, filters, close: () => { unsubscribe(); db.close(); } };
}

test("native Claude observations save only the observed account window during manual refresh cooldown", async () => {
  const fixture = quotaFixture();
  const gateway = spyOn(gatewayRuntime, "currentClaudeGateway").mockReturnValue(undefined);
  let now = Date.parse("2026-10-01T12:00:00.000Z");
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  const read = (account: string, force = false) => getRateLimitsSnapshot({
    providers: ["claude-code"], force, reason: "manual",
    runtimeOptions: { claudeAccountProfileId: account },
    fetchers: { claude: async () => {
      calls += 1;
      return { source: "oauth", session: { usedPercent: 25, resetsAt: 1000 },
        weekly: { usedPercent: 10, resetsAt: 2000 },
        fableWeekly: { usedPercent: 5, resetsAt: 3000 }, error: null };
    } },
  });
  const push = (rateLimitType: string, utilization: number) => withProviderAccountScope(
    { claudeAccountProfileId: "account-a" }, () => mapClaudeMessageToEvents({
      message: { type: "rate_limit_event", rate_limit_info: { status: "allowed", rateLimitType, utilization } } as never,
      claudeDebugStream: false,
    }));
  try {
    await read("account-a");
    await read("account-b");
    now += 30_000;
    expect(push("five_hour", 0.6)).toEqual([]);
    now += 1000;
    expect((await read("account-a", true)).claude.session?.usedPercent).toBe(60);
    expect(calls).toBe(2);
    const samples = () => fixture.store.read(fixture.filters).latestQuota;
    expect(samples().find(s => s.accountProfileId === "account-a" && s.windowId === "session"))
      .toMatchObject({ usedPercent: 60, observedAt: "2026-10-01T12:00:30.000Z", source: "sdk" });
    for (const windowId of ["weekly", "fable-weekly"]) {
      expect(samples().find(s => s.accountProfileId === "account-a" && s.windowId === windowId)?.observedAt)
        .toBe("2026-10-01T12:00:00.000Z");
    }
    expect(samples().find(s => s.accountProfileId === "account-b" && s.windowId === "session"))
      .toMatchObject({ usedPercent: 25, observedAt: "2026-10-01T12:00:00.000Z", source: "oauth" });
    now += 10_000;
    push("five_hour", 0.6); // No change is not a new observation.
    push("seven_day_opus", 0.9); // A model-specific window cannot be attributed to Fable.
    expect(samples().find(s => s.accountProfileId === "account-a" && s.windowId === "session")?.observedAt)
      .toBe("2026-10-01T12:00:30.000Z");
    expect(fixture.store.read(fixture.filters).quota).toHaveLength(6);
  } finally {
    clock.mockRestore();
    gateway.mockRestore();
    fixture.close();
  }
});

test("a fresh Codex RPC is saved at response time while its cached reads remain unchanged", async () => {
  const fixture = quotaFixture();
  let now = Date.parse("2026-10-01T12:00:00.000Z");
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  const client = spyOn(codexRuntime, "getCodexAppServerClientFromRuntimeOptions").mockReturnValue({
    request: async (method: string) => {
      expect(method).toBe("account/rateLimits/read");
      calls += 1;
      now += 5000;
      return { rateLimits: { limitId: "account", primary: { usedPercent: 31, windowDurationMins: 300, resetsAt: null } } };
    },
  } as never);
  const read = () => getRateLimitsSnapshot({
    providers: ["codex"], runtimeOptions: { codexAccountProfileId: "account-a" },
  });
  try {
    expect((await read()).codex.buckets[0]?.primary?.usedPercent).toBe(31);
    now += 3 * 60_000;
    await read();
    expect(calls).toBe(1);
    const report = fixture.store.read(fixture.filters);
    expect(report.quota).toHaveLength(1);
    expect(report.latestQuota[0]).toMatchObject({
      accountProfileId: "account-a", usedPercent: 31, source: "rpc", observedAt: "2026-10-01T12:00:05.000Z",
    });
  } finally {
    client.mockRestore();
    clock.mockRestore();
    fixture.close();
  }
});

test("Codex native cache reads preserve push time and account without adding observations", async () => {
  const fixture = quotaFixture();
  let now = Date.parse("2026-10-01T12:00:00.000Z");
  const clock = spyOn(Date, "now").mockImplementation(() => now);
  const push = (account: string, usedPercent: number) => withProviderAccountScope(
    { codexAccountProfileId: account }, () => recordCodexRateLimits({
      buckets: [{ limitId: "account", limitName: "Account",
        primary: { usedPercent, windowDurationMins: 300, resetsAt: null },
        secondary: null, individualLimit: null, credits: null }],
      source: "notification",
    }));
  let observations = 0;
  const read = () => getRateLimitsSnapshot({
    providers: ["codex"], runtimeOptions: { codexAccountProfileId: "account-a" },
    onObservation: () => { observations += 1; },
  });
  try {
    push("account-a", 25);
    push("account-b", 75);
    expect((await read()).codex.buckets[0]?.primary?.usedPercent).toBe(25);
    now += 3 * 60_000;
    expect((await read()).codex.buckets[0]?.primary?.usedPercent).toBe(25);
    expect(observations).toBe(0);
    const report = fixture.store.read(fixture.filters);
    expect(report.quota).toHaveLength(2);
    expect(report.latestQuota.find(s => s.accountProfileId === "account-a"))
      .toMatchObject({ usedPercent: 25, observedAt: "2026-10-01T12:00:00.000Z", source: "notification" });
    expect(report.latestQuota.find(s => s.accountProfileId === "account-b"))
      .toMatchObject({ usedPercent: 75, observedAt: "2026-10-01T12:00:00.000Z", source: "notification" });
    push("account-a", 40);
    expect(fixture.store.read(fixture.filters).latestQuota.find(s => s.accountProfileId === "account-a"))
      .toMatchObject({ usedPercent: 40, observedAt: "2026-10-01T12:03:00.000Z" });
    expect(fixture.store.read(fixture.filters).quota).toHaveLength(3);
  } finally {
    clock.mockRestore();
    fixture.close();
  }
});
