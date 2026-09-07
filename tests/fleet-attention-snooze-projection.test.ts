import { describe, expect, test } from "bun:test";
import { buildFleetAttentionProjection } from "@/lib/fleet/attention-projection";
import {
  isFleetAttentionSnoozeActive,
  resolveSnoozeDeadline,
  selectActiveFleetAttentionSnoozeIds,
} from "@/lib/fleet/attention-snooze";
import type { ResultReview } from "@/lib/reviews/result-review";

const result: ResultReview = {
  id: "result",
  projectPath: "/tmp/project",
  projectName: "Project",
  workspaceId: "workspace",
  workspaceName: "Workspace",
  taskId: "task",
  taskTitle: "Task",
  turnId: "turn",
  outcome: "completed",
  summary: "Result",
  createdAt: "2026-09-05T00:00:00.000Z",
  reviewedAt: null,
};
const RESULT_ATTENTION_ID = "turn:result-ready:workspace:task:turn";

const baseArgs = {
  notifications: [],
  liveWorkspaces: [],
  prWorkspaces: [
    {
      projectPath: "/tmp/project",
      projectName: "Project",
      workspaceId: "workspace",
      workspaceName: "Workspace",
      status: "changes_requested" as const,
      url: "https://example.test/pr/1",
      updatedAt: "2026-09-05T00:00:00.000Z",
    },
  ],
  resultReviews: [result],
};

describe("fleet attention snooze projection", () => {
  test("a snoozed row leaves the list, the counts, and the workspace index", () => {
    const before = buildFleetAttentionProjection(baseArgs);
    expect(before.count).toBe(2);
    expect(before.reviewItems).toHaveLength(1);
    expect(before.snoozedItems).toEqual([]);

    const after = buildFleetAttentionProjection({
      ...baseArgs,
      snoozedAttentionIds: new Set([RESULT_ATTENTION_ID]),
    });
    expect(after.count).toBe(1);
    expect(after.reviewItems).toEqual([]);
    expect(after.items.map((item) => item.id)).toEqual([
      "pr:pr-changes-requested:workspace",
    ]);
    expect(after.snoozedItems.map((item) => item.id)).toEqual([
      RESULT_ATTENTION_ID,
    ]);
    // The snoozed row must not linger as the workspace's headline attention.
    expect(after.attentionItemsByWorkspaceId.workspace).toHaveLength(1);
    expect(after.highestAttentionByWorkspaceId.workspace?.kind).toBe(
      "pr-changes-requested",
    );
  });

  test("snoozing a blocking row hides it too, and stays accountable", () => {
    const projection = buildFleetAttentionProjection({
      ...baseArgs,
      snoozedAttentionIds: new Set(["pr:pr-changes-requested:workspace"]),
    });
    expect(projection.blockingItems).toEqual([]);
    expect(projection.snoozedItems.map((item) => item.kind)).toEqual([
      "pr-changes-requested",
    ]);
  });

  test("an unrelated snooze changes nothing", () => {
    expect(
      buildFleetAttentionProjection({
        ...baseArgs,
        snoozedAttentionIds: new Set(["turn:result-ready:other:task:turn"]),
      }).count,
    ).toBe(2);
  });
});

describe("fleet attention snooze deadlines", () => {
  test("an expired snooze stops hiding its item", () => {
    const nowMs = Date.parse("2026-09-07T00:00:00.000Z");
    const snoozes = [
      {
        attentionId: "active",
        workspaceId: "workspace",
        snoozedUntil: new Date(nowMs + 1_000).toISOString(),
        createdAt: "2026-09-06T00:00:00.000Z",
      },
      {
        attentionId: "expired",
        workspaceId: "workspace",
        snoozedUntil: new Date(nowMs - 1_000).toISOString(),
        createdAt: "2026-09-06T00:00:00.000Z",
      },
    ];
    expect([...selectActiveFleetAttentionSnoozeIds({ snoozes, nowMs })]).toEqual(
      ["active"],
    );
  });

  test("a deadline exactly at now has already passed", () => {
    const nowMs = Date.parse("2026-09-07T00:00:00.000Z");
    expect(
      isFleetAttentionSnoozeActive({
        snooze: { snoozedUntil: new Date(nowMs).toISOString() },
        nowMs,
      }),
    ).toBe(false);
  });

  test("an unreadable deadline never hides anything", () => {
    expect(
      isFleetAttentionSnoozeActive({
        snooze: { snoozedUntil: "not a date" },
        nowMs: 0,
      }),
    ).toBe(false);
  });

  test("a deadline is the requested duration from now", () => {
    const nowMs = Date.parse("2026-09-07T00:00:00.000Z");
    expect(resolveSnoozeDeadline({ durationMs: 60_000, nowMs })).toBe(
      "2026-09-07T00:01:00.000Z",
    );
    // A negative duration must not resolve to the past and un-hide nothing.
    expect(resolveSnoozeDeadline({ durationMs: -5_000, nowMs })).toBe(
      "2026-09-07T00:00:00.000Z",
    );
  });
});
