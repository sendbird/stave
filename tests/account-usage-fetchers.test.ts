import { afterEach, describe, expect, test } from "bun:test";
import {
  fetchCursorUsageSnapshot,
  mapCursorUsageResponse,
  readCursorMacKeychainToken,
} from "../electron/providers/rate-limits/cursor-usage-fetcher";
import { mapKiroUsageResponse } from "../electron/providers/rate-limits/kiro-usage-fetcher";

const originalFetch = globalThis.fetch;

function stubCursorUsageApi(statusByToken: Record<string, number>): string[] {
  const requestedTokens: string[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const token = String(
      (init?.headers as Record<string, string>).Authorization,
    ).replace("Bearer ", "");
    requestedTokens.push(token);
    const status = statusByToken[token] ?? 500;
    return new Response(
      JSON.stringify({ planUsage: { totalPercentUsed: 25 } }),
      { status },
    );
  }) as typeof fetch;
  return requestedTokens;
}

describe("Cursor account usage mapping", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("reads the Agent login from its account-qualified macOS Keychain entry", async () => {
    expect(
      await readCursorMacKeychainToken(async (args) => {
        expect(args).toEqual([
          "find-generic-password",
          "-s",
          "cursor-access-token",
          "-a",
          "cursor-user",
          "-w",
        ]);
        return "saved-token\n";
      }, "darwin"),
    ).toBe("saved-token");
  });

  test("skips Keychain outside macOS and tolerates an unavailable entry", async () => {
    expect(
      await readCursorMacKeychainToken(async () => {
        throw new Error("should not read Keychain");
      }, "linux"),
    ).toBeNull();
    expect(
      await readCursorMacKeychainToken(async () => {
        throw new Error("entry unavailable");
      }, "darwin"),
    ).toBeNull();
  });

  test("falls back to the next credential when a token is rejected", async () => {
    const requestedTokens = stubCursorUsageApi({
      "stale-agent": 401,
      "valid-ide": 200,
    });
    const snapshot = await fetchCursorUsageSnapshot([
      () => "stale-agent",
      () => null,
      () => "stale-agent",
      () => "valid-ide",
    ]);
    expect(snapshot).toMatchObject({ source: "dashboard" });
    expect(requestedTokens).toEqual(["stale-agent", "valid-ide"]);
  });

  test("reports expired sign-in only after every credential is rejected", async () => {
    stubCursorUsageApi({ "stale-agent": 401, "stale-ide": 403 });
    const snapshot = await fetchCursorUsageSnapshot([
      () => "stale-agent",
      () => "stale-ide",
    ]);
    expect(snapshot).toMatchObject({
      source: "unavailable",
      error: "Cursor sign-in expired. Sign in again and retry.",
    });
  });

  test("does not retry other credentials on non-auth failures", async () => {
    const requestedTokens = stubCursorUsageApi({ "agent-token": 500 });
    const snapshot = await fetchCursorUsageSnapshot([
      () => "agent-token",
      () => "ide-token",
    ]);
    expect(snapshot).toMatchObject({
      source: "unavailable",
      error: "Cursor usage request failed (HTTP 500).",
    });
    expect(requestedTokens).toEqual(["agent-token"]);
  });

  test("maps monthly spend and model buckets", () => {
    expect(
      mapCursorUsageResponse({
        billingCycleEnd: "1788220800000",
        planType: "pro",
        planUsage: {
          totalPercentUsed: 25,
          autoPercentUsed: 10,
          apiPercentUsed: 40,
          totalSpend: 700,
          includedSpend: 500,
          limit: 2_000,
        },
      }),
    ).toMatchObject({
      source: "dashboard",
      planType: "pro",
      monthly: {
        usedPercent: 25,
        resetsAt: 1_788_220_800,
        used: 5,
        limit: 20,
      },
      buckets: [
        { id: "cursor-models", usedPercent: 10 },
        { id: "other-models", usedPercent: 40 },
      ],
    });
  });

  test("rejects responses without a total percentage", () => {
    expect(mapCursorUsageResponse({ planUsage: { limit: 2_000 } })).toBeNull();
  });
});

describe("Kiro account usage mapping", () => {
  test("maps credit breakdowns and uses the included monthly credit limit", () => {
    expect(
      mapKiroUsageResponse({
        success: true,
        data: {
          planName: "Pro",
          billingCycleReset: "2026-10-01",
          overagesEnabled: false,
          usageBreakdowns: [
            {
              resourceType: "credits",
              displayName: "Credits",
              used: 750,
              limit: 1_000,
              percentage: 75,
            },
            {
              resourceType: "bonus",
              displayName: "Bonus credits",
              used: 10,
              limit: 100,
              percentage: 10,
            },
          ],
        },
      }),
    ).toMatchObject({
      source: "acp",
      planName: "Pro",
      monthly: {
        usedPercent: 75,
        used: 750,
        limit: 1_000,
      },
      overagesEnabled: false,
      buckets: [
        { id: "credits", label: "Credits", usedPercent: 75 },
        { id: "bonus", label: "Bonus credits", usedPercent: 10 },
      ],
    });
  });

  test("rejects unsuccessful command responses", () => {
    expect(
      mapKiroUsageResponse({
        success: false,
        data: {
          usageBreakdowns: [],
        },
      }),
    ).toBeNull();
  });
});
