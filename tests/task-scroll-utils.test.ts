import { describe, expect, test } from "bun:test";
import {
  createTaskScrollAnchorCache,
  retainTaskScrollToLatestNonce,
} from "../src/store/task-scroll.utils";

describe("task scroll state", () => {
  test("preserves signed anchors and evicts the least recently saved task", () => {
    const cache = createTaskScrollAnchorCache(2);

    cache.save("task-a", { messageId: "message-a", offset: -48 });
    cache.save("task-b", { messageId: "message-b", offset: 120 });
    cache.save("task-a", { messageId: "message-a-2", offset: -36 });
    cache.save("task-c", { messageId: "message-c", offset: 80 });

    expect(cache.get("task-a")).toEqual({
      messageId: "message-a-2",
      offset: -36,
    });
    expect(cache.get("task-b")).toBeUndefined();
    expect(cache.get("task-c")).toEqual({
      messageId: "message-c",
      offset: 80,
    });
  });

  test("does not turn another task's latest-message request into a force event", () => {
    const taskANonce = retainTaskScrollToLatestNonce({
      currentNonce: 1,
      request: { taskId: "task-b", nonce: 2 },
      taskId: "task-a",
    });

    expect(taskANonce).toBe(1);
    expect(
      retainTaskScrollToLatestNonce({
        currentNonce: taskANonce,
        request: { taskId: "task-a", nonce: 3 },
        taskId: "task-a",
      }),
    ).toBe(3);
  });
});
