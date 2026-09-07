import { describe, expect, test } from "bun:test";
import {
  FLEET_RESULT_AUTO_REVIEW_DWELL_MS,
  selectAutoReviewableResults,
} from "@/lib/fleet/result-auto-review";
import type { ResultReview } from "@/lib/reviews/result-review";

const NOW_MS = Date.parse("2026-09-07T00:00:00.000Z");
const OLD_ENOUGH = new Date(
  NOW_MS - FLEET_RESULT_AUTO_REVIEW_DWELL_MS - 1_000,
).toISOString();

function buildResult(overrides: Partial<ResultReview> = {}): ResultReview {
  return {
    id: "result-1",
    projectPath: "/workspace/project",
    projectName: "Project",
    workspaceId: "workspace-1",
    workspaceName: "checkout",
    taskId: "task-1",
    taskTitle: "Review checkout",
    turnId: "turn-1",
    outcome: "completed",
    summary: "Finished",
    createdAt: OLD_ENOUGH,
    reviewedAt: null,
    ...overrides,
  };
}

const WATCHING = {
  activeWorkspaceId: "workspace-1",
  visibleTaskId: "task-1",
  windowFocused: true,
};

function select(overrides: Partial<Parameters<typeof selectAutoReviewableResults>[0]> = {}) {
  return selectAutoReviewableResults({
    results: [buildResult()],
    surface: WATCHING,
    dwellStartedAtMs: NOW_MS - FLEET_RESULT_AUTO_REVIEW_DWELL_MS - 500,
    nowMs: NOW_MS,
    ...overrides,
  });
}

describe("fleet result auto review", () => {
  test("acknowledges a finished result the user dwelled on", () => {
    expect(select().map((result) => result.turnId)).toEqual(["turn-1"]);
  });

  test("acknowledges a failed turn on the same evidence", () => {
    expect(
      select({ results: [buildResult({ outcome: "failed" })] }),
    ).toHaveLength(1);
  });

  test("waits for the dwell before acknowledging anything", () => {
    expect(select({ dwellStartedAtMs: NOW_MS - 100 })).toEqual([]);
    expect(select({ dwellStartedAtMs: null })).toEqual([]);
  });

  test("proves nothing while the window is unfocused", () => {
    expect(
      select({ surface: { ...WATCHING, windowFocused: false } }),
    ).toEqual([]);
  });

  test("proves nothing while no task is on screen", () => {
    expect(select({ surface: { ...WATCHING, visibleTaskId: null } })).toEqual(
      [],
    );
  });

  test("leaves results belonging to another task or workspace alone", () => {
    expect(select({ results: [buildResult({ taskId: "task-2" })] })).toEqual(
      [],
    );
    expect(
      select({ results: [buildResult({ workspaceId: "workspace-2" })] }),
    ).toEqual([]);
  });

  test("makes a result that just landed serve its own dwell", () => {
    expect(
      select({
        results: [buildResult({ createdAt: new Date(NOW_MS).toISOString() })],
      }),
    ).toEqual([]);
  });

  test("never acknowledges the turn that is still running", () => {
    expect(select({ activeTurnId: "turn-1" })).toEqual([]);
    expect(select({ activeTurnId: "turn-2" })).toHaveLength(1);
  });

  test("leaves an already reviewed result untouched", () => {
    expect(
      select({
        results: [buildResult({ reviewedAt: "2026-09-06T00:00:00.000Z" })],
      }),
    ).toEqual([]);
  });

  test("keeps an unparseable timestamp on the explicit path", () => {
    expect(select({ results: [buildResult({ createdAt: "not a date" })] })).toEqual(
      [],
    );
  });
});
