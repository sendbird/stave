import { describe, expect, it } from "bun:test";
import { groupUsageTurnsByDay } from "../src/components/usage/usage-view.utils";
import { emptyUsageMetrics, type UsageTurn } from "../src/lib/providers/usage-statistics";

const turn = (id: string, createdAt: string): UsageTurn => ({
  ...emptyUsageMetrics(), id, createdAt, completedAt: createdAt,
  providerId: "codex", accountProfileId: "system-default", modelId: "test-model",
});

describe("turn history date groups", () => {
  it("uses the selected timezone across midnight and preserves report order", () => {
    const turns = [turn("newest", "2026-10-04T15:01:00Z"), turn("same-day", "2026-10-04T15:00:00Z"), turn("older", "2026-10-04T14:59:00Z")];
    const seoul = groupUsageTurnsByDay(turns, "Asia/Seoul");
    expect(seoul.map((group) => group.day)).toEqual(["2026-10-05", "2026-10-04"]);
    expect(seoul.map((group) => group.turns.map((row) => row.id))).toEqual([["newest", "same-day"], ["older"]]);
    expect(groupUsageTurnsByDay(turns, "UTC").map((group) => group.turns.map((row) => row.id))).toEqual([["newest", "same-day", "older"]]);
    expect(turns.map((row) => row.id)).toEqual(["newest", "same-day", "older"]);
  });

  it("keeps both occurrences of a daylight-saving hour in the same day", () => {
    const turns = [turn("standard", "2026-11-01T06:30:00Z"), turn("daylight", "2026-11-01T05:30:00Z")];
    const groups = groupUsageTurnsByDay(turns, "America/New_York");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.day).toBe("2026-11-01");
    expect(groups[0]!.turns.map((row) => row.id)).toEqual(["standard", "daylight"]);
  });

  it("does not create an empty date heading when no turns match", () => {
    expect(groupUsageTurnsByDay([], "UTC")).toEqual([]);
  });
});
