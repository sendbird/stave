import { expect, test } from "bun:test";
import { groupQuotaAccounts, quotaResetCountdown, quotaWindowState, splitQuotaRows, tightestQuotaWindow } from "../src/components/usage/usage-quota.utils";
import type { QuotaObservation } from "../src/lib/providers/usage-statistics";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const quota = (accountProfileId: string, windowId: string, minutes: number): QuotaObservation => ({
  providerId: "codex", accountProfileId, windowId, label: windowId, usedPercent: 80,
  resetsAt: NOW / 1000 + minutes * 60, observedAt: new Date(NOW).toISOString(), source: "rpc",
});

test("quota windows stay with their account; future reset order ignores expired windows", () => {
  const grouped = groupQuotaAccounts({ observations: [quota("a", "session", 60), quota("a", "weekly", -10), quota("b", "session", 30)],
    accounts: [{ providerId: "codex", accountProfileId: "unseen" }, { providerId: "claude-code", accountProfileId: "other" },
      { providerId: "codex", accountProfileId: "unattributed" }], providerId: "codex", now: NOW });
  expect(grouped.map((row) => row.accountProfileId)).toEqual(["b", "a", "unseen"]);
  expect(grouped[1]?.windows).toHaveLength(2);
  expect(grouped[2]?.windows).toEqual([]);
  expect(groupQuotaAccounts({ observations: [quota("a", "session", 60), quota("b", "session", 30)], accounts: [], accountProfileId: "a", now: NOW })).toHaveLength(1);
});

test("reset countdown preserves missing and elapsed readings instead of suggesting a new allowance", () => {
  expect(quotaResetCountdown(null, NOW)).toBe("Reset time not reported");
  expect(quotaResetCountdown(NOW / 1000, NOW)).toBe("Reset time passed");
  expect(quotaResetCountdown(NOW / 1000 + 1, NOW)).toBe("Resets in 1m");
  expect(quotaResetCountdown(NOW / 1000 + 3660, NOW)).toBe("Resets in 1h 1m");
  expect(quotaResetCountdown(NOW / 1000 + 86400, NOW)).toBe("Resets in 1d");
});

const HOUR = 3_600_000;
const claude = (windowId: string, usedPercent: number, resetInMs: number, observedAgoMs = 0): QuotaObservation => ({
  providerId: "claude-code", accountProfileId: "a", windowId, label: windowId, usedPercent,
  resetsAt: (NOW + resetInMs) / 1000, observedAt: new Date(NOW - observedAgoMs).toISOString(), source: "oauth",
});

test("pace projects the observed average rate to the reset and names when it runs out", () => {
  // 3h of a 5h window passed with 60% used: 20%/h lands on 100% at the reset, which is not a run-out.
  const even = quotaWindowState(claude("session", 60, 2 * HOUR), NOW);
  expect(even.elapsedRatio).toBeCloseTo(0.6);
  expect(even.remainingPercent).toBe(40);
  expect(even.pace).toEqual({ kind: "lasts", projectedPercent: 100 });
  expect(quotaWindowState(claude("session", 61, 2 * HOUR), NOW).pace?.kind).toBe("runsOut");
  // 90% after 3h runs out 20 minutes later, well before the reset.
  expect(quotaWindowState(claude("session", 90, 2 * HOUR), NOW).pace).toEqual({ kind: "runsOut", at: NOW + 20 * 60_000 });
  const slow = quotaWindowState(claude("weekly", 20, 4 * 24 * HOUR), NOW);
  expect(slow.pace?.kind).toBe("lasts");
  expect(slow.pace && "projectedPercent" in slow.pace ? slow.pace.projectedPercent : 0).toBeCloseTo(20 / 3 * 7);
});

test("pace is withheld when it would mislead", () => {
  // Unknown length: Codex stores its window length only in the label.
  expect(quotaWindowState({ ...claude("session", 50, HOUR), providerId: "codex" }, NOW)).toMatchObject({ elapsedRatio: null, pace: null });
  // Just started: one burst is not a pace.
  expect(quotaWindowState(claude("session", 30, 5 * HOUR - 10 * 60_000), NOW).pace).toBeNull();
  // Nothing used yet.
  expect(quotaWindowState(claude("session", 0, 2 * HOUR), NOW).pace).toBeNull();
  // Stale and expired readings cannot speak for now.
  expect(quotaWindowState(claude("session", 50, 2 * HOUR, 20 * 60_000), NOW)).toMatchObject({ stale: true, pace: null });
  expect(quotaWindowState(claude("session", 50, -60_000), NOW)).toMatchObject({ expired: true, elapsedRatio: null, pace: null });
  // Used up is said plainly, whatever the length.
  expect(quotaWindowState({ ...claude("primary", 100, HOUR), providerId: "codex" }, NOW).pace).toEqual({ kind: "exhausted" });
});

test("the tightest window is the one that stops work first", () => {
  const roomy = claude("weekly", 85, 4 * 24 * HOUR);
  const runsOut = claude("session", 70, 2 * HOUR);
  const used = { ...claude("primary", 100, HOUR), providerId: "codex" as const };
  const old = claude("session", 99, 2 * HOUR, 30 * 60_000);
  // Both project a run-out; 70% after 3h of 5h ends in about 1.3h, before 85% after 3 of 7 days (about 12.7h),
  // although the weekly window has less room left.
  expect(tightestQuotaWindow([roomy, runsOut, old], NOW)?.row).toBe(runsOut);
  expect(tightestQuotaWindow([runsOut, roomy, used], NOW)?.row).toBe(used);
  expect(tightestQuotaWindow([claude("session", 10, 2 * HOUR), { ...claude("x", 40, HOUR), providerId: "codex" }], NOW)?.row.windowId).toBe("x");
  expect(tightestQuotaWindow([old], NOW)).toBeNull();
});

test("quota rows hold one provider each; API-billed gateway accounts move to their own row at the end", () => {
  const accounts = [
    { providerId: "claude-code" as const, accountProfileId: "vercel", gateway: true },
    { providerId: "claude-code" as const, accountProfileId: "work", gateway: false },
    { providerId: "codex" as const, accountProfileId: "main", gateway: false },
    { providerId: "claude-code" as const, accountProfileId: "personal", gateway: false },
  ];
  const { providers, gateways } = splitQuotaRows(accounts, (account) => account.gateway);
  expect(providers.map((row) => row.providerId)).toEqual(["claude-code", "codex"]);
  expect(providers[0]?.accounts.map((account) => account.accountProfileId)).toEqual(["work", "personal"]);
  expect(providers[1]?.accounts.map((account) => account.accountProfileId)).toEqual(["main"]);
  expect(gateways.map((account) => account.accountProfileId)).toEqual(["vercel"]);
  expect(splitQuotaRows([], () => false)).toEqual({ providers: [], gateways: [] });
});
