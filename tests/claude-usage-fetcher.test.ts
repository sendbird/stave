import { describe, expect, test } from "bun:test";
import {
  classifyOAuthUsageStatus,
  normalizeFableWeeklyWindow,
  normalizeNamedWindow,
  normalizeResetsAt,
  normalizeWindow,
} from "../electron/providers/rate-limits/claude-usage-fetcher";

/**
 * Trimmed capture of a real `GET /api/oauth/usage` response. `utilization` and
 * `limits[].percent` report the same number, which is what proves the field is
 * a 0..100 percentage rather than a 0..1 fraction.
 */
const LIVE_USAGE_RESPONSE = {
  five_hour: {
    utilization: 1.0,
    resets_at: "2026-08-04T01:20:00.213357+00:00",
  },
  seven_day: {
    utilization: 3.0,
    resets_at: "2026-08-10T12:00:00.213378+00:00",
  },
  seven_day_opus: null,
  extra_usage: { utilization: 0.07 },
  limits: [
    {
      kind: "session",
      group: "session",
      percent: 1,
      resets_at: "2026-08-04T01:20:00.213357+00:00",
      scope: null,
      is_active: false,
    },
    {
      kind: "weekly_all",
      group: "weekly",
      percent: 3,
      resets_at: "2026-08-10T12:00:00.213378+00:00",
      scope: null,
      is_active: true,
    },
    {
      kind: "weekly_scoped",
      group: "weekly",
      percent: 0,
      resets_at: null,
      scope: { model: { id: null, display_name: "Fable" }, surface: null },
      is_active: false,
    },
  ],
};

describe("normalizeResetsAt", () => {
  test("accepts an epoch-seconds number", () => {
    expect(normalizeResetsAt(1_785_542_400)).toBe(1_785_542_400);
  });

  test("accepts an ISO-8601 string and converts to epoch seconds", () => {
    const iso = "2026-07-09T18:00:00.000Z";
    expect(normalizeResetsAt(iso)).toBe(Math.floor(Date.parse(iso) / 1000));
  });

  test("accepts a numeric string", () => {
    expect(normalizeResetsAt("1785542400")).toBe(1_785_542_400);
  });

  test("returns null for missing/unparseable values", () => {
    expect(normalizeResetsAt(undefined)).toBeNull();
    expect(normalizeResetsAt(null)).toBeNull();
    expect(normalizeResetsAt("not-a-date")).toBeNull();
  });
});

describe("normalizeWindow", () => {
  test("keeps a real resets_at instead of dropping it when it's an ISO string", () => {
    const window = normalizeWindow({
      used_percentage: 42,
      resets_at: "2026-07-09T18:00:00.000Z",
    });
    expect(window).not.toBeNull();
    expect(window?.usedPercent).toBe(42);
    expect(window?.resetsAt).not.toBeNull();
  });

  test("still supports the numeric epoch-seconds shape", () => {
    const window = normalizeWindow({
      utilization: 50,
      resets_at: 1_785_542_400,
    });
    expect(window?.usedPercent).toBe(50);
    expect(window?.resetsAt).toBe(1_785_542_400);
  });

  test("treats utilization as a 0..100 percentage, never a fraction", () => {
    // Regression: `utilization <= 1 ? * 100` pegged a 1%-used session at 100%
    // (red "limit reached" meter) for the whole window after a reset.
    expect(normalizeWindow({ utilization: 1 })?.usedPercent).toBe(1);
    expect(normalizeWindow({ utilization: 0.07 })?.usedPercent).toBe(0.07);
    expect(normalizeWindow({ utilization: 0 })?.usedPercent).toBe(0);
  });

  test("clamps out-of-range percentages", () => {
    expect(normalizeWindow({ utilization: 143 })?.usedPercent).toBe(100);
    expect(normalizeWindow({ used_percentage: -5 })?.usedPercent).toBe(0);
  });

  test("returns null when there's no usage percentage at all", () => {
    expect(normalizeWindow({ resets_at: 123 })).toBeNull();
    expect(normalizeWindow({ utilization: Number.NaN })).toBeNull();
  });
});

describe("normalizeNamedWindow", () => {
  test("reads session/weekly from the canonical limits array", () => {
    expect(
      normalizeNamedWindow(LIVE_USAGE_RESPONSE, "session", "five_hour"),
    ).toEqual({
      usedPercent: 1,
      resetsAt: Math.floor(
        Date.parse("2026-08-04T01:20:00.213357+00:00") / 1000,
      ),
    });
    expect(
      normalizeNamedWindow(LIVE_USAGE_RESPONSE, "weekly_all", "seven_day"),
    ).toEqual({
      usedPercent: 3,
      resetsAt: Math.floor(
        Date.parse("2026-08-10T12:00:00.213378+00:00") / 1000,
      ),
    });
  });

  test("ignores is_active, which marks the binding limit rather than validity", () => {
    // The live session entry above is `is_active: false` but still carries a
    // real percent; dropping it would blank the headline meter.
    expect(
      normalizeNamedWindow(LIVE_USAGE_RESPONSE, "session", "five_hour")
        ?.usedPercent,
    ).toBe(1);
  });

  test("falls back to the legacy top-level window when limits is absent", () => {
    expect(
      normalizeNamedWindow(
        { five_hour: { utilization: 12, resets_at: 1_785_542_400 } },
        "session",
        "five_hour",
      ),
    ).toEqual({ usedPercent: 12, resetsAt: 1_785_542_400 });
  });

  test("returns null when neither shape reports the window", () => {
    expect(
      normalizeNamedWindow(
        { limits: [{ kind: "weekly_all", percent: 3 }] },
        "session",
        "five_hour",
      ),
    ).toBeNull();
  });
});

describe("classifyOAuthUsageStatus", () => {
  test("does not spawn a CLI for answers the server already gave", () => {
    expect(classifyOAuthUsageStatus(429).action).toBe("terminal");
    expect(classifyOAuthUsageStatus(400).action).toBe("terminal");
  });

  test("treats auth rejections as repairable by running the CLI", () => {
    expect(classifyOAuthUsageStatus(401).action).toBe("retryAfterCliRepair");
    expect(classifyOAuthUsageStatus(403).action).toBe("retryAfterCliRepair");
  });

  test("treats server errors as fallback-only", () => {
    expect(classifyOAuthUsageStatus(503).action).toBe("fallbackOnly");
  });
});

describe("normalizeFableWeeklyWindow", () => {
  test("parses the current model-scoped limits shape", () => {
    const window = normalizeFableWeeklyWindow({
      limits: [
        {
          kind: "weekly_scoped",
          percent: 37,
          resets_at: "2026-07-27T00:00:00.000Z",
          scope: { model: { display_name: "Fable" } },
        },
      ],
    });

    expect(window?.usedPercent).toBe(37);
    expect(window?.resetsAt).toBe(
      Math.floor(Date.parse("2026-07-27T00:00:00.000Z") / 1000),
    );
  });

  test("supports the legacy top-level Fable window", () => {
    expect(
      normalizeFableWeeklyWindow({
        seven_day_fable: { utilization: 42, resets_at: 1_785_542_400 },
      }),
    ).toEqual({ usedPercent: 42, resetsAt: 1_785_542_400 });
  });

  test("keeps an inactive zero-percent Fable window from the live response", () => {
    expect(normalizeFableWeeklyWindow(LIVE_USAGE_RESPONSE)).toEqual({
      usedPercent: 0,
      resetsAt: null,
    });
  });

  test("ignores scoped weekly limits for other models", () => {
    expect(
      normalizeFableWeeklyWindow({
        limits: [
          {
            kind: "weekly_scoped",
            percent: 12,
            scope: { model: { display_name: "Sonnet" } },
          },
        ],
      }),
    ).toBeNull();
  });
});
