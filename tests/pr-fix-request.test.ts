import { expect, test } from "bun:test";
import { canFixPr, defaultPrSelection, prFixInstruction } from "../src/lib/pr-fix-request";
import type { GitHubPrPayload } from "../src/lib/pr-status";
import type { PrContextIndex } from "../src/lib/pr-context";

const pr: GitHubPrPayload = { state: "OPEN", number: 7, title: "", url: "", mergedAt: null, isDraft: false,
  baseRefName: "release", headRefName: "feature", checksRollup: null, reviewDecision: null,
  mergeable: "MERGEABLE", mergeStateStatus: "BEHIND" };

test("visibility uses independent facts and checkout permissions", () => {
  expect(canFixPr(pr, true)).toBe(false);
  expect(canFixPr(pr, true, 1)).toBe(true);
  const broken = { ...pr, mergeable: "CONFLICTING" as const, checks: { failed: 1, total: 1, passed: 0, pending: 0, failedNames: ["lint"] } };
  expect(canFixPr(broken, true)).toBe(true);
  expect(canFixPr(broken, false)).toBe(false);
  for (const state of ["CLOSED", "MERGED"] as const) expect(canFixPr({ ...broken, state }, true)).toBe(false);
  expect(prFixInstruction(broken)).toContain("lint");
  expect(prFixInstruction(broken)).toContain('onto "release"');
});

test("default attachment limits checks and skips outdated and resolved threads", () => {
  const index = { failedChecks: [1, 2, 3, 4, 5, 6].map(id => ({ id })),
    threads: [{ id: "old", isOutdated: true }, { id: "done", isResolved: true }, { id: "open" }] } as PrContextIndex;
  expect(defaultPrSelection(index)).toEqual({ checkIds: [1, 2, 3], threadIds: ["open"] });
  expect(defaultPrSelection(index, 5, false)).toEqual({ checkIds: [1, 2, 3, 4, 5], threadIds: [] });
});
