import { describe, expect, test } from "bun:test";
import type { StateStorage } from "zustand/middleware";
import type { SentReviewComment } from "@/lib/sent-review-comments";
import {
  createSentReviewCommentsStore,
  normalizeSentReviewComments,
  SENT_REVIEW_COMMENT_TTL_MS,
} from "@/store/sent-review-comments-store";

const NOW = Date.parse("2026-11-03T12:00:00.000Z");

function memoryStorage(initial: Record<string, string> = {}): StateStorage & { values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem: (name) => values[name] ?? null,
    setItem: (name, value) => {
      values[name] = value;
    },
    removeItem: (name) => {
      delete values[name];
    },
  };
}

function sent(id: string, sentAt = "2026-11-03T11:00:00.000Z"): SentReviewComment {
  return {
    comment: { id, filePath: "src/a.ts", line: 2, side: "modified", body: `Comment ${id}`, createdAt: "2026-11-03T10:59:00.000Z" },
    sentAt,
    anchor: ["one", "two", "three"],
  };
}

describe("sent review comments across restarts", () => {
  test("what was sent is read back by the next app session", () => {
    const storage = memoryStorage();
    const first = createSentReviewCommentsStore({ storage, now: () => NOW });
    first.getState().recordSent({ taskId: "task-1", entries: [sent("a"), sent("b")] });
    first.getState().resolve({ taskId: "task-1", commentId: "a" });

    const next = createSentReviewCommentsStore({ storage, now: () => NOW });
    expect(next.getState().byTask["task-1"]?.map((entry) => entry.comment.id)).toEqual(["b"]);
    expect(next.getState().byTask["task-1"]?.[0]).toEqual(sent("b"));
  });

  test("resolving the last comment of a task forgets the task", () => {
    const storage = memoryStorage();
    const store = createSentReviewCommentsStore({ storage, now: () => NOW });
    store.getState().recordSent({ taskId: "task-1", entries: [sent("a")] });
    store.getState().resolve({ taskId: "task-1", commentId: "a" });
    expect(createSentReviewCommentsStore({ storage, now: () => NOW }).getState().byTask).toEqual({});
  });

  test("damaged, expired and future entries are dropped, the rest kept", () => {
    const old = new Date(NOW - SENT_REVIEW_COMMENT_TTL_MS - 1).toISOString();
    const future = new Date(NOW + 60_000).toISOString();
    const normalized = normalizeSentReviewComments({
      "task-1": [
        sent("kept"),
        sent("expired", old),
        sent("future", future),
        { ...sent("bad-anchor"), anchor: ["only one"] },
        { ...sent("bad-line"), comment: { ...sent("x").comment, id: "bad-line", line: 0 } },
        { comment: null, sentAt: "2026-11-03T11:00:00.000Z", anchor: null },
        "not an entry",
      ],
      "task-2": "not a list",
      "": [sent("no-task")],
    }, NOW);
    expect(Object.keys(normalized)).toEqual(["task-1"]);
    expect(normalized["task-1"]?.map((entry) => entry.comment.id)).toEqual(["kept"]);
  });

  test("a stored value that is not an object reads as nothing sent", () => {
    for (const value of [null, undefined, "x", 3, []]) {
      expect(normalizeSentReviewComments(value, NOW)).toEqual({});
    }
  });

  test("a task keeps its latest 50 comments and the store its 200 latest tasks", () => {
    const many = Array.from({ length: 60 }, (_, index) => sent(`c${index}`));
    expect(normalizeSentReviewComments({ "task-1": many }, NOW)["task-1"]?.map((entry) => entry.comment.id)).toEqual(
      many.slice(10).map((entry) => entry.comment.id),
    );
    const tasks = Object.fromEntries(Array.from({ length: 210 }, (_, index) => [
      `task-${index}`,
      [sent(`c${index}`, new Date(NOW - (index + 1) * 60_000).toISOString())],
    ]));
    const kept = Object.keys(normalizeSentReviewComments(tasks, NOW));
    expect(kept).toHaveLength(200);
    // The most recently sent are kept; the oldest ten go.
    expect(kept).toContain("task-0");
    expect(kept).not.toContain("task-209");
  });
});
