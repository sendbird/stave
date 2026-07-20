import { describe, expect, test } from "bun:test";
import {
  normalizeFableWeeklyWindow,
  normalizeResetsAt,
  normalizeWindow,
} from "../electron/providers/rate-limits/claude-usage-fetcher";

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
      utilization: 0.5,
      resets_at: 1_785_542_400,
    });
    expect(window?.usedPercent).toBe(50);
    expect(window?.resetsAt).toBe(1_785_542_400);
  });

  test("returns null when there's no usage percentage at all", () => {
    expect(normalizeWindow({ resets_at: 123 })).toBeNull();
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
        seven_day_fable: { utilization: 0.42, resets_at: 1_785_542_400 },
      }),
    ).toEqual({ usedPercent: 42, resetsAt: 1_785_542_400 });
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
