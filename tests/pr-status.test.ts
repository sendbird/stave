import { describe, expect, test } from "bun:test";
import {
  derivePrStatus,
  describePrStatusHint,
  PR_STATUS_ACTIONS,
  PR_STATUS_VISUAL,
  type GitHubPrPayload,
} from "@/lib/pr-status";

function pr(overrides: Partial<GitHubPrPayload> = {}): GitHubPrPayload {
  return {
    number: 1,
    title: "fix: example",
    state: "OPEN",
    isDraft: false,
    url: "https://github.com/acme/repo/pull/1",
    reviewDecision: "APPROVED",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    checksRollup: "SUCCESS",
    mergedAt: null,
    baseRefName: "main",
    headRefName: "fix/example",
    headRefOid: "abc123",
    ...overrides,
  };
}

describe("derivePrStatus", () => {
  test("terminal and draft states win", () => {
    expect(derivePrStatus(pr({ mergedAt: "2026-01-01T00:00:00Z" }))).toBe("merged");
    expect(derivePrStatus(pr({ state: "CLOSED" }))).toBe("closed_unmerged");
    expect(derivePrStatus(pr({ isDraft: true, mergeStateStatus: "DRAFT" }))).toBe("draft");
  });

  test("approved and clean is ready to merge", () => {
    expect(derivePrStatus(pr())).toBe("ready_to_merge");
    expect(derivePrStatus(pr({ mergeStateStatus: "HAS_HOOKS" }))).toBe("ready_to_merge");
  });

  test("repositories without a review requirement still reach ready to merge", () => {
    // Regression: an empty reviewDecision used to pin the badge on "Review
    // required" forever, so the Merge PR action never appeared.
    expect(derivePrStatus(pr({ reviewDecision: "" }))).toBe("ready_to_merge");
    expect(derivePrStatus(pr({ reviewDecision: null }))).toBe("ready_to_merge");
    expect(derivePrStatus(pr({ reviewDecision: "REVIEW_REQUIRED" }))).toBe("review_required");
  });

  test("GitHub's merge gate overrides a green review and checks", () => {
    // Regression: APPROVED + SUCCESS showed "Ready to merge" while branch
    // protection still blocked the merge, so Merge PR failed.
    expect(derivePrStatus(pr({ mergeStateStatus: "BLOCKED" }))).toBe("blocked");
    expect(
      derivePrStatus(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "REVIEW_REQUIRED" })),
    ).toBe("review_required");
    expect(derivePrStatus(pr({ mergeStateStatus: "BLOCKED", reviewDecision: "" }))).toBe(
      "review_required",
    );
  });

  test("unknown mergeability is never reported as ready", () => {
    expect(derivePrStatus(pr({ mergeStateStatus: "UNKNOWN", mergeable: "UNKNOWN" }))).toBe(
      "checks_pending",
    );
    expect(
      derivePrStatus(
        pr({ mergeStateStatus: "UNKNOWN", mergeable: "UNKNOWN", reviewDecision: "" }),
      ),
    ).toBe("review_required");
  });

  test("blocking conditions keep their priority", () => {
    expect(derivePrStatus(pr({ mergeable: "CONFLICTING" }))).toBe("merge_conflict");
    expect(derivePrStatus(pr({ mergeStateStatus: "DIRTY" }))).toBe("merge_conflict");
    expect(derivePrStatus(pr({ mergeStateStatus: "BEHIND" }))).toBe("behind_base");
    expect(derivePrStatus(pr({ reviewDecision: "CHANGES_REQUESTED" }))).toBe("changes_requested");
    expect(derivePrStatus(pr({ checksRollup: "FAILURE" }))).toBe("checks_failed");
    expect(derivePrStatus(pr({ mergeStateStatus: "UNSTABLE" }))).toBe("checks_failed");
    expect(derivePrStatus(pr({ checksRollup: "PENDING" }))).toBe("checks_pending");
  });

  test("blocked status has a visual, actions, and a hint", () => {
    expect(PR_STATUS_VISUAL.blocked.label).toBe("Merge blocked");
    expect(PR_STATUS_ACTIONS.blocked.primary).toBeNull();
    expect(describePrStatusHint(pr({ mergeStateStatus: "BLOCKED" }))).toContain("branch protection");
    expect(describePrStatusHint(pr())).toBeNull();
  });
});
