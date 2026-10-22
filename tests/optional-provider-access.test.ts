import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import type {
  CursorUsageSnapshot,
  KiroUsageSnapshot,
} from "../src/lib/providers/provider.types";
import {
  accountUsageAccess,
  readOptionalProviderAccess,
} from "../electron/providers/optional-provider-access";
import { clearUsageReadState } from "../electron/providers/rate-limits/usage-read-policy";

const cursor = (
  limit: number | null,
  usedPercent = 0,
): CursorUsageSnapshot => ({
  source: "dashboard",
  planType: "Test",
  monthly: { limit, usedPercent, resetsAt: null, used: 0 },
  buckets: [],
  error: null,
});
const kiro = (limit?: number): KiroUsageSnapshot => ({
  source: "acp",
  planName: "Q Developer Pro",
  monthly: null,
  buckets:
    limit === undefined
      ? []
      : [
          {
            id: "CREDIT",
            label: "Credits",
            used: 0,
            limit,
            usedPercent: 0,
            resetsAt: null,
            unit: "CREDIT",
          },
        ],
  overagesEnabled: false,
  error: null,
});
beforeEach(() => clearUsageReadState());
afterEach(() => clearUsageReadState());

test("plan labels and login do not establish an allowance", () => {
  expect(accountUsageAccess(cursor(0))).toBe("unavailable");
  expect(accountUsageAccess(kiro())).toBe("unavailable");
  expect(accountUsageAccess(cursor(null))).toBe("unknown");
});

test("positive free, trial and supplemental allowances remain eligible, including exhausted accounts", () => {
  expect(accountUsageAccess({ ...cursor(100, 100), planType: "free" })).toBe(
    "ready",
  );
  expect(accountUsageAccess(kiro(100))).toBe("ready");
  expect(accountUsageAccess({ ...kiro(), overagesEnabled: true })).toBe(
    "ready",
  );
  expect(accountUsageAccess({ ...cursor(0), buckets: kiro(25).buckets })).toBe(
    "ready",
  );
});

test("transient usage failures never establish or revoke login", () => {
  expect(
    accountUsageAccess({
      ...cursor(100),
      source: "unavailable",
      error: "Offline",
    }),
  ).toBe("unknown");
});

test("discovery coalesces and caches entitlement reads; a forced retry recovers the plan", async () => {
  let calls = 0;
  let snapshot = kiro();
  const dependencies = {
    env: {},
    kiro: async () => {
      calls++;
      return snapshot;
    },
  };
  const args = { providerId: "kiro" as const };
  expect(
    await Promise.all([
      readOptionalProviderAccess(args, dependencies),
      readOptionalProviderAccess(args, dependencies),
    ]),
  ).toEqual(["unavailable", "unavailable"]);
  expect(calls).toBe(1);
  await readOptionalProviderAccess(args, dependencies);
  expect(calls).toBe(1);
  const now = spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
  try {
    snapshot = kiro(100);
    expect(
      await readOptionalProviderAccess({ ...args, force: true }, dependencies),
    ).toBe("ready");
    expect(calls).toBe(2);
  } finally {
    now.mockRestore();
  }
});

test("a failed refresh cannot resurrect cached access during backoff", async () => {
  const now = spyOn(Date, "now").mockReturnValue(1_000_000);
  let calls = 0;
  const dependencies = {
    env: {},
    cursor: async () => {
      calls++;
      return calls === 1
        ? cursor(100)
        : { ...cursor(100), source: "unavailable" as const, error: "Offline" };
    },
  };
  try {
    const args = { providerId: "cursor" as const };
    expect(await readOptionalProviderAccess(args, dependencies)).toBe("ready");
    now.mockReturnValue(1_061_000);
    expect(
      await readOptionalProviderAccess({ ...args, force: true }, dependencies),
    ).toBe("unknown");
    now.mockReturnValue(1_362_000);
    expect(
      await readOptionalProviderAccess({ ...args, force: true }, dependencies),
    ).toBe("unknown");
    now.mockReturnValue(1_663_000);
    expect(await readOptionalProviderAccess(args, dependencies)).toBe(
      "unknown",
    );
    expect(calls).toBe(3);
  } finally {
    now.mockRestore();
  }
});

test("automated launches skip entitlement requests even when forced", async () => {
  for (const providerId of ["cursor", "kiro"] as const) {
    expect(
      await readOptionalProviderAccess(
        { providerId, force: true },
        {
          env: { STAVE_DISABLE_ACCOUNT_USAGE_READS: "1" },
          cursor: async () => {
            throw new Error("must not fetch");
          },
          kiro: async () => {
            throw new Error("must not launch ACP");
          },
        },
      ),
    ).toBe("unknown");
  }
});
