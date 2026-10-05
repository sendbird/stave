import { expect, test } from "bun:test";
import { groupQuotaAccounts, quotaResetCountdown } from "../src/components/usage/usage-quota.utils";
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
