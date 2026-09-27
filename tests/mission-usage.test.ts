import { describe, expect, test } from "bun:test";
import {
  addMissionUsage,
  describeUsageLong,
  describeUsageShort,
  EMPTY_MISSION_USAGE,
  formatTokenCount,
  sumTurnUsage,
} from "../src/lib/missions/usage";

describe("mission usage", () => {
  test("sums reported turns, keeps cost null until one reports it, and counts unreported turns", () => {
    const codexOnly = sumTurnUsage([{ inputTokens: 120_000, outputTokens: 8_000 }, null]);
    expect(codexOnly).toEqual({ turns: 2, measuredTurns: 1, inputTokens: 120_000, outputTokens: 8_000, costUsd: null });
    expect(describeUsageShort(codexOnly)).toBe("128k tokens");
    expect(describeUsageLong(codexOnly)).toBe("128k tokens (1 turn not reported)");

    const claude = sumTurnUsage([
      { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 900_000, totalCostUsd: 0.4 },
      { inputTokens: 2_000, outputTokens: 700, totalCostUsd: 0.84 },
    ]);
    // Cache reads are in the cost, not the token count.
    expect(claude.inputTokens).toBe(3_000);
    expect(describeUsageShort(claude)).toBe("$1.24");
    expect(describeUsageLong(claude)).toBe("$1.24 · 4.2k tokens");
  });

  test("nothing reported reads as nothing, and a project adds its missions", () => {
    expect(describeUsageShort(EMPTY_MISSION_USAGE)).toBeNull();
    expect(describeUsageShort(sumTurnUsage([null, null]))).toBeNull();
    const total = addMissionUsage([
      sumTurnUsage([{ inputTokens: 10, outputTokens: 5, totalCostUsd: 0.005 }]),
      sumTurnUsage([{ inputTokens: 20, outputTokens: 5 }]),
      null,
    ]);
    expect(total).toMatchObject({ turns: 2, measuredTurns: 2, inputTokens: 30, outputTokens: 10, costUsd: 0.005 });
    expect(describeUsageShort(total)).toBe("<$0.01");
    expect(formatTokenCount(1_250_000)).toBe("1.3M");
    expect(formatTokenCount(999)).toBe("999");
  });
});
