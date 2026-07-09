import { describe, expect, test } from "bun:test";
import {
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
