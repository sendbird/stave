import { describe, expect, test } from "bun:test";
import {
  parsePersistedTurnUsage,
  toPersistenceTurnUsage,
} from "../electron/persistence/turn-usage";

describe("toPersistenceTurnUsage", () => {
  test("keeps every reported counter and the cost", () => {
    expect(
      toPersistenceTurnUsage({
        type: "usage",
        inputTokens: 1_000,
        outputTokens: 500,
        cacheReadTokens: 90_000,
        cacheCreationTokens: 9_000,
        thoughtTokens: 320,
        totalCostUsd: 0.12,
        ttftMs: 800,
      }),
    ).toEqual({
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 90_000,
      cacheCreationTokens: 9_000,
      thoughtTokens: 320,
      totalCostUsd: 0.12,
    });
  });

  test("drops zero-valued optional counters so absent stays distinguishable", () => {
    // "This provider reported no cache read" and "the cache read was 0" are
    // the same number but not the same fact; only the latter is worth storing.
    expect(
      toPersistenceTurnUsage({
        type: "usage",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 0,
        thoughtTokens: 0,
      }),
    ).toEqual({ inputTokens: 10, outputTokens: 5 });
  });

  test("does not store latency, which the turn timestamps already carry", () => {
    expect(
      toPersistenceTurnUsage({
        type: "usage",
        inputTokens: 10,
        outputTokens: 5,
        ttftMs: 1_200,
      }),
    ).not.toHaveProperty("ttftMs");
  });
});

describe("parsePersistedTurnUsage", () => {
  test("round-trips what it wrote", () => {
    const usage = toPersistenceTurnUsage({
      type: "usage",
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 90_000,
    });
    expect(parsePersistedTurnUsage(JSON.stringify(usage))).toEqual(usage);
  });

  test("degrades to null rather than throwing on unreadable rows", () => {
    expect(parsePersistedTurnUsage(null)).toBeNull();
    expect(parsePersistedTurnUsage("")).toBeNull();
    expect(parsePersistedTurnUsage("{ not json")).toBeNull();
    expect(parsePersistedTurnUsage("null")).toBeNull();
    expect(parsePersistedTurnUsage('{"inputTokens":"1000"}')).toBeNull();
    expect(parsePersistedTurnUsage('{"inputTokens":1000}')).toBeNull();
  });
});
