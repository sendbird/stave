import { afterEach, expect, mock, spyOn, test } from "bun:test";
import { getRateLimitsSnapshot } from "../electron/providers/rate-limits/rate-limits-snapshot";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";
import { clearCodexRateLimitsCache, recordCodexRateLimits } from "../electron/providers/codex-rate-limits-cache";
import { withProviderAccountScope } from "../electron/provider-accounts/runtime-scope";
import * as codexRuntime from "../electron/providers/codex-app-server-runtime";
import * as gatewayRuntime from "../electron/provider-accounts/gateway-runtime";
import { QuotaReadFeedbackSchema } from "../src/lib/providers/quota-read-feedback";
import { emptyRateLimitsSnapshot, mergeRateLimitsSnapshots } from "../src/lib/providers/account-usage-block";
import { readQuota, quotaReadFeedbackText } from "../src/components/usage/quota-read-feedback";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const iso = (after: number) => new Date(NOW + after).toISOString();
const claude = { source: "oauth" as const, session: { usedPercent: 30, resetsAt: null },
  weekly: null, fableWeekly: null, error: null };
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  mock.restore(); clearUsageReadState(); clearCodexRateLimitsCache();
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

test("manual refresh reports the actual read, then the floor, independently per account", async () => {
  spyOn(gatewayRuntime, "currentClaudeGateway").mockReturnValue(undefined);
  let now = NOW;
  spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  const read = (account: string) => getRateLimitsSnapshot({ providers: ["claude-code"], force: true, reason: "manual",
    runtimeOptions: { claudeAccountProfileId: account }, fetchers: { claude: async () => { calls++; return claude; } } });
  expect((await read("a")).reads?.["claude-code"]).toMatchObject({ status: "fresh", reason: "request", nextRefreshAt: iso(60_000) });
  now += 1000;
  expect((await read("a")).reads?.["claude-code"]).toMatchObject({ status: "cached", reason: "manual-floor", nextRefreshAt: iso(60_000) });
  expect((await read("b")).reads?.["claude-code"]?.status).toBe("fresh");
  expect(calls).toBe(2);
  now = NOW + 60_000;
  expect((await read("a")).reads?.["claude-code"]?.status).toBe("fresh");
  expect(calls).toBe(3);
});

test("TTL, failed-read reuse, backoff and manual recovery give distinct feedback without extra reads", async () => {
  let now = NOW;
  spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  const read = (force = false) => getRateLimitsSnapshot({ providers: ["claude-code"], force, reason: "manual",
    fetchers: { claude: async () => { calls++; return calls === 2 ? { ...emptyRateLimitsSnapshot().claude, error: "Sign in again." } : claude; } } });
  await read();
  now += 1000;
  expect((await read()).reads?.["claude-code"]).toMatchObject({ status: "cached", reason: "ttl" });
  now = NOW + 120_000;
  expect((await read()).reads?.["claude-code"]).toMatchObject({ status: "unavailable", reason: "request",
    nextRefreshAt: iso(180_000), nextAutomaticReadAt: iso(420_000), lastReadFailed: true });
  now += 1000;
  expect((await read(true)).reads?.["claude-code"]).toMatchObject({ status: "unavailable", reason: "manual-floor" });
  now = NOW + 241_000;
  const backedOff = await read();
  expect(backedOff.claude.session?.usedPercent).toBe(30);
  expect(backedOff.reads?.["claude-code"]).toMatchObject({ status: "cached", reason: "backoff", lastReadFailed: true });
  expect(calls).toBe(2);
  expect((await read(true)).reads?.["claude-code"]).toMatchObject({ status: "fresh", lastReadFailed: false });
  expect(calls).toBe(3);
});

test("Codex native cache is never a fresh read, including a forced read declined by the floor", async () => {
  let now = NOW;
  spyOn(Date, "now").mockImplementation(() => now);
  let calls = 0;
  spyOn(codexRuntime, "getCodexAppServerClientFromRuntimeOptions").mockReturnValue({ request: async () => {
    calls++;
    return { rateLimits: { primary: { usedPercent: 40, windowDurationMins: 300 } } };
  } } as never);
  withProviderAccountScope({ codexAccountProfileId: "a" }, () => recordCodexRateLimits({ source: "notification", now,
    buckets: [{ limitId: "account", limitName: null, planType: null, primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: null },
      secondary: null, individualLimit: null, credits: null }] }));
  const read = (force = false) => getRateLimitsSnapshot({ providers: ["codex"], force, reason: "manual",
    runtimeOptions: { codexAccountProfileId: "a" } });
  expect((await read()).reads?.codex).toMatchObject({ status: "cached", reason: "provider-cache", nextAutomaticReadAt: iso(900_000) });
  now += 1000;
  expect((await read(true)).reads?.codex).toMatchObject({ status: "cached", reason: "manual-floor" });
  expect(calls).toBe(0);
  now = NOW + 60_000;
  expect((await read(true)).reads?.codex).toMatchObject({ status: "fresh", reason: "request" });
  expect(calls).toBe(1);
});

test("mixed-provider results remain independent and throwing fetches are not called again inside the floor", async () => {
  spyOn(Date, "now").mockReturnValue(NOW);
  let calls = 0;
  const args = { force: true, reason: "manual" as const, optionalReadKey: (provider: string) => provider,
    fetchers: { claude: async () => claude, codex: async () => ({ source: "rpc" as const, buckets: [], error: null }),
      cursor: async () => { calls++; throw new Error("Unavailable"); },
      kiro: async () => ({ source: "acp" as const, planName: null, monthly: null, buckets: [], overagesEnabled: false, error: null }) } };
  const first = await getRateLimitsSnapshot(args);
  expect(first.reads?.cursor).toMatchObject({ status: "unavailable", reason: "request", lastReadFailed: true });
  expect(first.reads?.kiro?.status).toBe("fresh");
  expect(first.reads?.["claude-code"]?.status).toBe("fresh");
  const second = await getRateLimitsSnapshot(args);
  expect(second.reads?.cursor).toMatchObject({ status: "unavailable", reason: "manual-floor" });
  expect(second.reads?.kiro?.status).toBe("cached");
  expect(calls).toBe(1);
});

test("concurrent refreshes share the actual read and its next permitted time", async () => {
  spyOn(Date, "now").mockReturnValue(NOW);
  let resolve!: (value: typeof claude) => void;
  let calls = 0;
  const args = { providers: ["claude-code" as const], force: true,
    fetchers: { claude: () => { calls++; return new Promise<typeof claude>((done) => { resolve = done; }); } } };
  const first = getRateLimitsSnapshot(args), second = getRateLimitsSnapshot(args);
  resolve(claude);
  const results = await Promise.all([first, second]);
  expect(calls).toBe(1);
  expect(results.map((result) => result.reads?.["claude-code"]?.reason)).toEqual(["request", "in-flight"]);
  expect(results[1]?.reads?.["claude-code"]).toMatchObject({ status: "fresh", nextRefreshAt: iso(60_000) });
});

test("renderer trusts feedback from the response instead of assuming force means fresh", async () => {
  const feedback = { status: "cached", reason: "manual-floor", nextRefreshAt: iso(60_000), nextAutomaticReadAt: iso(120_000), lastReadFailed: false } as const;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { provider: { getRateLimitsSnapshot: async (args: unknown) => {
    expect(args).toMatchObject({ providers: ["claude-code"], force: true, reason: "manual", runtimeOptions: { claudeAccountProfileId: "a" } });
    return JSON.parse(JSON.stringify({ ...emptyRateLimitsSnapshot(), claude, reads: { "claude-code": feedback } }));
  } } } } });
  expect(await readQuota("claude-code", "a")).toEqual({ error: null, feedback });
  expect(quotaReadFeedbackText(feedback, "UTC", NOW)).toContain("Showing the last reading.");
  expect(quotaReadFeedbackText(feedback, "UTC", NOW)).toContain("12:01:00");
  expect(quotaReadFeedbackText(feedback, "UTC", NOW + 61_000)).toContain("refresh again now");
});

test("feedback validation rejects malformed times and host-private fields; absent older-host feedback stays unknown", async () => {
  const feedback = { status: "fresh", reason: "request", nextRefreshAt: iso(60_000), nextAutomaticReadAt: iso(120_000), lastReadFailed: false };
  expect(QuotaReadFeedbackSchema.safeParse(feedback).success).toBe(true);
  expect(QuotaReadFeedbackSchema.safeParse({ ...feedback, nextRefreshAt: "not a time" }).success).toBe(false);
  expect(QuotaReadFeedbackSchema.safeParse({ ...feedback, secretEnv: {} }).success).toBe(false);
  Object.defineProperty(globalThis, "window", { configurable: true, value: { api: { provider: { getRateLimitsSnapshot: async () => ({ ...emptyRateLimitsSnapshot(), claude }) } } } });
  expect(await readQuota("claude-code", "a")).toEqual({ error: null, feedback: null });
});

test("filtered snapshot merges keep each provider's feedback with its own numbers", () => {
  const fresh = QuotaReadFeedbackSchema.parse({ status: "fresh", reason: "request", nextRefreshAt: iso(60_000), nextAutomaticReadAt: iso(120_000), lastReadFailed: false });
  const cached = { ...fresh, status: "cached" as const, reason: "manual-floor" as const };
  const current = { ...emptyRateLimitsSnapshot(), reads: { "claude-code": fresh, codex: fresh } };
  const merged = mergeRateLimitsSnapshots({ current, incoming: { ...emptyRateLimitsSnapshot(), reads: { codex: cached } }, providers: ["codex"] });
  expect(merged.reads).toEqual({ "claude-code": fresh, codex: cached });
  expect(mergeRateLimitsSnapshots({ current: merged, incoming: emptyRateLimitsSnapshot(), providers: ["codex"] }).reads).toEqual({ "claude-code": fresh });
});
