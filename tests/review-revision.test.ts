import { expect, test } from "bun:test";
import { describeReviewRevision, reviewRevisionLabel, ReviewRevisionArgsSchema } from "../src/lib/reviews/review-revision";
import { sanitizeRunReceiptDetail } from "../src/lib/runs/run-domain";

test("review provenance distinguishes edits during and after review from unavailable state", () => {
  const a = { status: "known" as const, revision: "a" }, b = { status: "known" as const, revision: "b" };
  const unknown = { status: "unknown" as const, reason: "limit" as const };
  expect(describeReviewRevision({ source: a, completed: a, current: a })).toBeNull();
  expect(reviewRevisionLabel({ source: a, completed: a, current: b })).toBe("Code changed since review");
  expect(describeReviewRevision({ source: a, completed: b, current: b })).toContain("while this review");
  expect(reviewRevisionLabel({ source: a, completed: a, current: unknown })).toBe("Current changes not checked");
  expect(reviewRevisionLabel({ source: unknown, completed: a, current: a })).toBe("Review state unavailable");
  expect(sanitizeRunReceiptDetail({ reviewSourceRevision: a, reviewCompletedRevision: b, rawContent: "private" }))
    .toEqual({ reviewSourceRevision: a, reviewCompletedRevision: b });
  expect(ReviewRevisionArgsSchema.safeParse({ parentTaskId: "p", delegationKey: "stave-review-test" }).success).toBe(false);
});
