import { describe, expect, test } from "bun:test";
import type { FleetAttentionItem } from "@/lib/fleet/attention-projection";
import { classifyWaitAge, FLEET_WAIT_AGE_THRESHOLDS_MS } from "@/lib/fleet/wait-age";
import { findReviewQueueAnchor, locateInReviewQueue, selectReviewQueue } from "@/lib/review/review-queue";
import type { ResultReview } from "@/lib/reviews/result-review";
import { undoResultMarkedReviewed, type ResultReviewUndoOperations } from "@/lib/reviews/result-review-undo";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe("wait age thresholds", () => {
  test("the shared table is one hour for warning and a day for danger", () => {
    expect(FLEET_WAIT_AGE_THRESHOLDS_MS).toEqual({ warningMs: HOUR, dangerMs: 24 * HOUR });
  });

  test("an age is neutral under an hour, warning from an hour, danger from a day", () => {
    expect(classifyWaitAge(ago(59 * MINUTE), NOW)).toBe("neutral");
    expect(classifyWaitAge(ago(HOUR), NOW)).toBe("warning");
    expect(classifyWaitAge(ago(23 * HOUR), NOW)).toBe("warning");
    expect(classifyWaitAge(ago(24 * HOUR), NOW)).toBe("danger");
    expect(classifyWaitAge(NOW - 3 * 24 * HOUR, NOW)).toBe("danger");
  });

  test("a wait with no recorded start, an unreadable one or one in the future stays neutral", () => {
    expect(classifyWaitAge(undefined, NOW)).toBe("neutral");
    expect(classifyWaitAge(null, NOW)).toBe("neutral");
    expect(classifyWaitAge("", NOW)).toBe("neutral");
    expect(classifyWaitAge("not a date", NOW)).toBe("neutral");
    expect(classifyWaitAge(new Date(NOW + 5 * HOUR).toISOString(), NOW)).toBe("neutral");
  });

  test("a caller can pass its own thresholds", () => {
    expect(classifyWaitAge(ago(10 * MINUTE), NOW, { warningMs: 5 * MINUTE, dangerMs: 15 * MINUTE })).toBe("warning");
  });
});

function item(id: string, overrides: Partial<FleetAttentionItem> = {}): FleetAttentionItem {
  return {
    id,
    kind: "result-ready",
    priority: 9,
    repositoryPath: "/tmp/repo",
    repositoryName: "repo",
    workspaceId: "ws",
    workspaceName: "ws",
    taskId: `task-${id}`,
    taskTitle: id,
    turnId: `turn-${id}`,
    createdAt: "2026-11-03T10:00:00.000Z",
    source: "result",
    ...overrides,
  };
}

describe("review queue", () => {
  test("holds results and stage sign-offs, not requests, pull requests or quiet turns", () => {
    const queue = selectReviewQueue([
      item("result"),
      item("failed", { kind: "run-failed" }),
      item("sign-off", { kind: "agent-run-sign-off", agentRunStage: { agentRunId: "run", stageId: "fix", attempt: 1 } }),
      item("approval", { kind: "approval", requestId: "r", messageId: "m" }),
      item("pr", { kind: "pr-ready-to-merge", source: "pr" }),
      item("quiet", { kind: "turn-stalled" }),
      item("no-task", { taskId: undefined }),
      item("no-turn", { turnId: undefined }),
    ]);
    expect(queue.map((entry) => entry.id)).toEqual(["result", "failed", "sign-off"]);
  });

  const queue = [
    item("a", { waitingSince: "2026-11-03T08:00:00.000Z" }),
    item("b", { waitingSince: "2026-11-03T09:00:00.000Z" }),
    item("c", { waitingSince: "2026-11-03T10:00:00.000Z" }),
  ];

  test("next and previous are the neighbors of the task under review, wrapping at the ends", () => {
    const middle = { workspaceId: "ws", taskId: "task-b" };
    expect(locateInReviewQueue({ queue, task: middle, anchor: findReviewQueueAnchor(queue, middle) })).toMatchObject({
      previous: { id: "a" }, next: { id: "c" }, remaining: 2,
    });
    const last = { workspaceId: "ws", taskId: "task-c" };
    expect(locateInReviewQueue({ queue, task: last, anchor: findReviewQueueAnchor(queue, last) })).toMatchObject({
      previous: { id: "b" }, next: { id: "a" },
    });
  });

  test("after the task leaves the queue, next is still the review that followed it", () => {
    const task = { workspaceId: "ws", taskId: "task-b" };
    const anchor = findReviewQueueAnchor(queue, task);
    const after = queue.filter((entry) => entry.id !== "b");
    expect(locateInReviewQueue({ queue: after, task, anchor })).toMatchObject({ previous: { id: "a" }, next: { id: "c" }, remaining: 2 });
  });

  test("a task that never waited goes to the first review and back from the last", () => {
    const task = { workspaceId: "ws", taskId: "task-elsewhere" };
    expect(locateInReviewQueue({ queue, task, anchor: null })).toMatchObject({ next: { id: "a" }, previous: { id: "c" }, remaining: 3 });
  });

  test("the same task id in another workspace is another task", () => {
    const task = { workspaceId: "other", taskId: "task-b" };
    expect(locateInReviewQueue({ queue, task, anchor: null }).remaining).toBe(3);
  });

  test("with nothing else waiting there is nowhere to go", () => {
    const task = { workspaceId: "ws", taskId: "task-a" };
    expect(locateInReviewQueue({ queue: [queue[0]!], task, anchor: queue[0]! })).toEqual({ previous: null, next: null, remaining: 0 });
  });
});

function result(overrides: Partial<ResultReview> = {}): ResultReview {
  return {
    repositoryPath: "/tmp/repo",
    workspaceId: "ws",
    taskId: "task",
    turnId: "turn",
    id: "result",
    repositoryName: "repo",
    workspaceName: "ws",
    taskTitle: "Task",
    outcome: "completed",
    summary: "Done.",
    createdAt: "2026-11-03T10:00:00.000Z",
    reviewedAt: null,
    markedReviewedAt: null,
    ...overrides,
  };
}

function operations(current: ResultReview | null) {
  const calls: unknown[] = [];
  const ops: ResultReviewUndoOperations = {
    read: async () => current,
    setMarkedReviewed: async (args) => {
      calls.push({ marked: args.markedReviewed });
      return result();
    },
    setReviewed: async (args) => {
      calls.push({ read: args.reviewed });
      return result();
    },
  };
  return { ops, calls };
}

describe("undoing Mark reviewed", () => {
  const MARKED = "2026-11-03T11:00:00.000Z";

  test("an unread result goes back to unread and unmarked", async () => {
    const saved = result({ markedReviewedAt: MARKED, reviewedAt: MARKED });
    const { ops, calls } = operations(saved);
    expect(await undoResultMarkedReviewed({ before: result(), saved, operations: ops })).toBe("undone");
    expect(calls).toEqual([{ marked: false }, { read: false }]);
  });

  test("a result read before the mark keeps its read", async () => {
    const saved = result({ markedReviewedAt: MARKED, reviewedAt: "2026-11-03T10:30:00.000Z" });
    const { ops, calls } = operations(saved);
    expect(await undoResultMarkedReviewed({ before: result({ reviewedAt: "2026-11-03T10:30:00.000Z" }), saved, operations: ops })).toBe("undone");
    expect(calls).toEqual([{ marked: false }]);
  });

  test("a mark changed elsewhere since is left alone", async () => {
    const saved = result({ markedReviewedAt: MARKED, reviewedAt: MARKED });
    for (const current of [
      result({ markedReviewedAt: null, reviewedAt: MARKED }),
      result({ markedReviewedAt: "2026-11-03T11:05:00.000Z", reviewedAt: MARKED }),
      null,
    ]) {
      const { ops, calls } = operations(current);
      expect(await undoResultMarkedReviewed({ before: result(), saved, operations: ops })).toBe("changed-elsewhere");
      expect(calls).toEqual([]);
    }
  });

  test("a read taken back and given again elsewhere stays", async () => {
    const saved = result({ markedReviewedAt: MARKED, reviewedAt: MARKED });
    const { ops, calls } = operations(result({ markedReviewedAt: MARKED, reviewedAt: "2026-11-03T11:10:00.000Z" }));
    expect(await undoResultMarkedReviewed({ before: result(), saved, operations: ops })).toBe("undone");
    expect(calls).toEqual([{ marked: false }]);
  });
});
