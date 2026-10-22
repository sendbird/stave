import { describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  derivePrStatus,
  describePrChecks,
  describePrStatusHint,
  formatPrChecksCount,
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

  test("running non-required checks are pending, not failed", () => {
    // Regression: GitHub reports UNSTABLE for any non-passing non-required
    // check, including ones still running, so a PR with CI in progress was
    // badged "Checks failed".
    expect(
      derivePrStatus(pr({ checksRollup: "PENDING", mergeStateStatus: "UNSTABLE" })),
    ).toBe("checks_pending");
    expect(
      derivePrStatus(pr({ checksRollup: "FAILURE", mergeStateStatus: "UNSTABLE" })),
    ).toBe("checks_failed");
  });

  test("blocked status has a visual, actions, and a hint", () => {
    expect(PR_STATUS_VISUAL.blocked.label).toBe("Merge blocked");
    expect(PR_STATUS_ACTIONS.blocked.primary).toBeNull();
    expect(describePrStatusHint(pr({ mergeStateStatus: "BLOCKED" }))).toContain("branch protection");
    expect(describePrStatusHint(pr())).toBeNull();
  });
});

describe("PR check counts", () => {
  test("payloads without per-check counts stay valid and show no count", () => {
    expect(formatPrChecksCount(pr().checks)).toBeNull();
    expect(describePrChecks(pr().checks)).toEqual([]);
  });

  test("the chip shows passed of total and the tooltip names failing and running checks", () => {
    const checks = {
      total: 7,
      passed: 2,
      failed: 4,
      pending: 1,
      failedNames: ["lint", "e2e", "build", "docs"],
      pendingNames: ["deploy"],
    };
    expect(formatPrChecksCount(checks)).toBe("2/7 checks");
    expect(describePrChecks(checks)).toEqual([
      "2 of 7 checks passed",
      "Failing: lint, e2e, build and 1 more",
      "Still running: deploy",
    ]);
  });

  test("checks without names are counted instead", () => {
    expect(
      describePrChecks({ total: 2, passed: 0, failed: 2, pending: 0 }),
    ).toEqual(["0 of 2 checks passed", "Failing: 2 checks"]);
  });

  test("Korean copy", () => {
    applyAppLocale("ko");
    try {
      expect(formatPrChecksCount({ total: 5, passed: 3, failed: 1, pending: 1 })).toBe("검사 3/5");
      expect(
        describePrChecks({
          total: 5,
          passed: 3,
          failed: 1,
          pending: 1,
          failedNames: ["lint"],
          pendingNames: ["e2e"],
        }),
      ).toEqual(["검사 5개 중 3개 통과", "실패: lint", "실행 중: e2e"]);
    } finally {
      applyAppLocale("en");
    }
  });
});
