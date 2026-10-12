import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { Database } from "bun:sqlite";
import * as runtime from "../electron/providers/codex-app-server-runtime";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearCodexRateLimitsCache, readCodexRateLimitsCache, recordCodexRateLimits } from "../electron/providers/codex-rate-limits-cache";
import { mapCodexRateLimitUpdates } from "../electron/providers/codex-rate-limit-updates";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { subscribeQuotaObservations } from "../electron/providers/rate-limits/quota-observations";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import { UsageStatisticsStore } from "../electron/persistence/usage-statistics-store";
import { UsageStatisticsArgsSchema } from "../src/lib/providers/usage-statistics";
import { resolveAccountUsageBlock, resolveTightestAccountUsageWindow } from "../src/lib/providers/account-usage-block";

const START = Date.parse("2026-10-01T12:00:00Z");
const window = (usedPercent: number) => ({ usedPercent, windowDurationMins: 300, resetsAt: 2_000_000_000 });
const bucket = (limitId: string, usedPercent: number) => ({ limitId, limitName: limitId, primary: window(usedPercent) });
const query = UsageStatisticsArgsSchema.parse({ from: "2026-10-01T00:00:00Z", to: "2026-10-02T00:00:00Z", timeZone: "UTC" });
let now: number, db: Database, store: UsageStatisticsStore, unsubscribe: () => void;
let clock: ReturnType<typeof spyOn>, client: ReturnType<typeof spyOn>;
let response: unknown;
let request: () => Promise<unknown>;
const read = () => getRateLimitsSnapshot({ providers: ["codex"], force: true, reason: "dispatch-guard", runtimeOptions: { codexAccountProfileId: "account-a" } });
const push = (rateLimits: unknown, account = "account-a") => withProviderAccountScope({ codexAccountProfileId: account }, () =>
  recordCodexRateLimits({ source: "notification", buckets: mapCodexRateLimitUpdates({ rateLimits }) }));

beforeEach(() => {
  clearUsageReadState(); clearCodexRateLimitsCache(); now = START;
  db = new Database(":memory:");
  db.exec("CREATE TABLE turns (id TEXT PRIMARY KEY, provider_id TEXT, created_at TEXT, completed_at TEXT, usage_json TEXT)");
  store = new UsageStatisticsStore(db);
  unsubscribe = subscribeQuotaObservations((snapshot, meta) => store.recordQuota(snapshot, meta, meta.observedAt));
  clock = spyOn(Date, "now").mockImplementation(() => now);
  request = async () => response;
  client = spyOn(runtime, "getCodexAppServerClientFromRuntimeOptions").mockReturnValue({ request: () => request() } as never);
});
afterEach(() => { unsubscribe(); db.close(); client.mockRestore(); clock.mockRestore(); clearUsageReadState(); clearCodexRateLimitsCache(); });

test("sparse notifications retain buckets, unavailable metadata and permission without re-observing untouched windows", async () => {
  response = { ordinaryUsageAllowed: false, rateLimitsByLimitId: { codex: { ...bucket("codex", 20), spendControlReached: true }, spark: bucket("spark", 100) } };
  await read();
  now += 60_000;
  push({ limitId: "codex", primary: window(21), secondary: null, planType: null, spendControlReached: null });
  const cached = withProviderAccountScope({ codexAccountProfileId: "account-a" }, readCodexRateLimitsCache)!;
  expect(cached.buckets.map((item) => item.limitId)).toEqual(["codex", "spark"]);
  expect(cached.buckets[0]).toMatchObject({ limitName: "codex", spendControlReached: true });
  expect(cached.ordinaryUsageAllowed).toBe(false);
  const current = store.read(query).latestQuota;
  expect(current.map((item) => item.windowId)).toEqual(["codex:primary", "spark:primary"]);
  expect(current[0]?.observedAt).toBe(new Date(now).toISOString());
  expect(current[1]?.observedAt).toBe(new Date(START).toISOString());
  expect(store.read(query).quota).toHaveLength(3);
  push(bucket("other", 99), "account-b");
  expect(cached.buckets).toHaveLength(2);
  // A complete empty response, in contrast, intentionally retires all windows for A.
  now += 60_000; response = { ordinaryUsageAllowed: true, rateLimitsByLimitId: {} };
  await read();
  expect(store.read(query).latestQuota.map((item) => item.accountProfileId)).toEqual(["account-b"]);
});

test("explicit zero budget clears a cached credit percentage; nullable rolling fields do not", async () => {
  response = { rateLimits: { ...bucket("codex", 20), individualLimit: { limit: "100", used: "100" } } };
  await read();
  expect(push({ limitId: "codex", individualLimit: null }).buckets[0]?.individualLimit?.usedPercent).toBe(100);
  expect(push({ limitId: "codex", individualLimit: { limit: "0", used: "0.0", remainingPercent: 0 } }).buckets[0]?.individualLimit).toBeNull();
});

test.each([true, false, null])("RPC included-use permission %s survives serialization and drives guards independently of credit usage", async (allowed) => {
  response = { ordinaryUsageAllowed: allowed, rateLimits: { ...bucket("codex", 20), individualLimit: { limit: "100", used: "100" }, spendControlReached: true } };
  const snapshot = JSON.parse(JSON.stringify(await read()));
  expect(snapshot.codex.ordinaryUsageAllowed).toBe(allowed);
  const block = resolveAccountUsageBlock({ providerId: "codex", snapshot, now });
  expect(block !== null).toBe(allowed !== true);
  if (allowed === true) expect(resolveTightestAccountUsageWindow({ providerId: "codex", snapshot })?.usedPercent).toBe(20);
  if (allowed === false) expect(block?.message).not.toContain("100%");
});

test("backend denial survives low usage and past reset; only a subsequent full permission read recovers it", async () => {
  response = { ordinaryUsageAllowed: false, rateLimits: { ...bucket("codex", 20), primary: { ...window(20), resetsAt: 1 } } };
  let snapshot = await read();
  expect(resolveAccountUsageBlock({ providerId: "codex", snapshot, now })?.resetsAt).toBeNull();
  now += 60_000;
  push(bucket("codex", 0));
  snapshot = await getRateLimitsSnapshot({ providers: ["codex"], runtimeOptions: { codexAccountProfileId: "account-a" } });
  expect(snapshot.codex.ordinaryUsageAllowed).toBe(false);
  expect(resolveAccountUsageBlock({ providerId: "codex", snapshot, now })).not.toBeNull();
  now += 60_000; response = { ordinaryUsageAllowed: null, rateLimits: bucket("codex", 0) };
  snapshot = await read();
  expect(snapshot.codex.ordinaryUsageAllowed).toBe(false);
  expect(resolveAccountUsageBlock({ providerId: "codex", snapshot, now })).not.toBeNull();
  now += 60_000; response = { ordinaryUsageAllowed: true, rateLimits: bucket("codex", 0) };
  expect(resolveAccountUsageBlock({ providerId: "codex", snapshot: await read(), now })).toBeNull();
});

for (const fail of [false, true]) {
  test(`a delayed ${fail ? "failed" : "successful"} RPC cannot overwrite or persist over a newer notification`, async () => {
    response = { rateLimits: bucket("codex", 20) };
    await read();
    now += 60_000;
    let finish!: (value: unknown) => void, reject!: (error: Error) => void;
    request = () => new Promise((yes, no) => { finish = yes; reject = no; });
    const pending = read();
    now += 1000; push(bucket("codex", 100));
    if (fail) reject(new Error("old request failed")); else finish({ rateLimits: bucket("codex", 20) });
    const result = await pending;
    expect(result.codex.buckets[0]?.primary?.usedPercent).toBe(100);
    expect(result.reads?.codex?.status).toBe("cached");
    expect(store.read(query).latestQuota[0]).toMatchObject({ usedPercent: 100, source: "notification", observedAt: new Date(now).toISOString() });
    expect(store.read(query).quota).toHaveLength(2);
    now += 60_000; request = async () => ({ ordinaryUsageAllowed: true, rateLimits: bucket("codex", 0) });
    expect((await read()).codex.buckets[0]?.primary?.usedPercent).toBe(0);
  });
}
