import { expect, test } from "bun:test";
import { buildFleetAttentionProjection } from "../src/lib/fleet/attention-projection";
import type { ResultReview } from "../src/lib/reviews/result-review";

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
  createdAt: "2026-09-05T00:00:00Z",
  reviewedAt: null,
};

test("pending result remains actionable without its notification; exact review removes it", () => {
  const args = {
    notifications: [],
    liveWorkspaces: [],
    prWorkspaces: [],
    resultReviews: [result],
  };
  expect(buildFleetAttentionProjection(args).reviewItems[0]).toMatchObject({
    source: "result",
    resultReview: result,
  });
  expect(
    buildFleetAttentionProjection({
      ...args,
      resultReviews: [{ ...result, reviewedAt: "2026-09-05T01:00:00Z" }],
    }).count,
  ).toBe(0);
  expect(
    buildFleetAttentionProjection({
      ...args,
      knownWorkspaceIds: new Set(["elsewhere"]),
    }).count,
  ).toBe(0);
});

test("read notifications cannot suppress or recreate a durable review", () => {
  const notification = {
    ...result,
    kind: "task.turn_completed" as const,
    title: "Task",
    body: "Result",
    action: null,
    payload: {},
    providerId: "codex" as const,
    readAt: "2026-09-05T01:00:00Z",
  };
  const args = {
    notifications: [notification],
    liveWorkspaces: [],
    prWorkspaces: [],
    resultReviews: [result],
  };
  expect(buildFleetAttentionProjection(args).count).toBe(1);
  expect(
    buildFleetAttentionProjection({
      ...args,
      notifications: [{ ...notification, readAt: null }],
      resultReviews: [],
    }).count,
  ).toBe(0);
});
