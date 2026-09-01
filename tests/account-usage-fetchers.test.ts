import { describe, expect, test } from "bun:test";
import { mapCursorUsageResponse } from "../electron/providers/rate-limits/cursor-usage-fetcher";
import { mapKiroUsageResponse } from "../electron/providers/rate-limits/kiro-usage-fetcher";

describe("Cursor account usage mapping", () => {
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
  test("maps credit breakdowns and chooses the tightest monthly limit", () => {
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
