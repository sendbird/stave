import { expect, test } from "bun:test";
import { lensMemoryBudgetKB, lensReopenCooldownUntil } from "../src/lib/lens/lens-memory-policy";
import type { LensResourceEvent } from "../src/lib/lens/lens-resource-history";

test("device budget is bounded with an explicit unknown-capacity fallback", () => {
  expect(lensMemoryBudgetKB(8 * 1024 ** 2)).toBe(256 * 1024);
  expect(lensMemoryBudgetKB(64 * 1024 ** 2)).toBe(512 * 1024);
  expect(lensMemoryBudgetKB(1024)).toBe(128 * 1024);
  expect(lensMemoryBudgetKB(NaN)).toBe(512 * 1024);
});

test("reopen cooldown grows, expires and is isolated to its session", () => {
  const events: LensResourceEvent[] = [{ workspaceId: "w", lensSessionId: "t", kind: "reopened", at: 1000 }];
  expect(lensReopenCooldownUntil(events, "w", "t", 1000)).toBe(121000);
  events.push({ ...events[0]!, at: 2000 });
  expect(lensReopenCooldownUntil(events, "w", "t", 2000)).toBe(242000);
  expect(lensReopenCooldownUntil(events, "other", "t", 2000)).toBe(0);
  expect(lensReopenCooldownUntil(events, "w", "t", 31 * 60_000)).toBe(0);
});
