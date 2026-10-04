import { describe, expect, mock, test } from "bun:test";

const children = [
  { delegatedTaskId: "review-task", delegationKey: "stave-review-20261004120000-a" },
  { delegatedTaskId: "agent-child", delegationKey: "docs-0123456789ab" },
];

mock.module("../electron/host-service/delegated-task-signals", () => ({
  listDelegatedTaskSummaries: ({ parentTaskId }: { parentTaskId: string }) =>
    parentTaskId === "task-main" ? children : [],
}));

const { resolveReviewTurnNotification } = await import(
  "../electron/host-service/review-turn-notification"
);

const tasks = [
  { id: "task-main", title: "Main Task" },
  { id: "review-task", title: "Review · Uncommitted changes · GPT-5.5", parentTaskId: "task-main" },
  { id: "agent-child", title: "Docs", parentTaskId: "task-main" },
];

describe("review completion notification on the host", () => {
  test("a composer review's finished turn is addressed to the task it reviewed", () => {
    expect(resolveReviewTurnNotification({ tasks, taskId: "review-task", failed: false })).toEqual({
      title: "Main Task",
      body: "Review finished: Review · Uncommitted changes · GPT-5.5.",
      payload: { reviewParentTaskId: "task-main", reviewParentTaskTitle: "Main Task" },
    });
  });

  test("other subagents and top-level tasks keep their ordinary notification", () => {
    expect(resolveReviewTurnNotification({ tasks, taskId: "agent-child", failed: false })).toBeNull();
    expect(resolveReviewTurnNotification({ tasks, taskId: "task-main", failed: false })).toBeNull();
  });
});
