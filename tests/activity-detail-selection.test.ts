import { describe, expect, test } from "bun:test";
import { selectActivityMessages } from "@/components/session/activity-detail.utils";
import type { ChatMessage } from "@/types/chat";

function message(id: string, text: string): ChatMessage {
  return {
    id,
    role: "assistant",
    model: "gpt-5.6-sol",
    providerId: "codex",
    content: text,
    isStreaming: true,
    parts: [{ type: "text", text }],
  };
}

describe("ActivityDetailDialog live child attribution", () => {
  test("reads selected inactive child updates without falling back to parent messages", () => {
    const parent = message("parent-1", "Parent only text");
    const first = message("child-1", "Child started");
    const latest = message("child-2", "Child event arrived live");
    const baseState = {
      activeWorkspaceId: "parent-workspace",
      messagesByTask: { "parent-task": [parent] },
      taskWorkspaceIdById: { "child-task": "child-workspace" },
      workspaceRuntimeCacheById: {
        "child-workspace": {
          messagesByTask: { "child-task": [first] },
        },
      },
    };

    expect(selectActivityMessages({
      state: baseState,
      parentTaskId: "parent-task",
      childTaskId: "child-task",
    })).toEqual([first]);

    expect(selectActivityMessages({
      state: {
        ...baseState,
        workspaceRuntimeCacheById: {
          "child-workspace": {
            messagesByTask: { "child-task": [first, latest] },
          },
        },
      },
      parentTaskId: "parent-task",
      childTaskId: "child-task",
    })).toEqual([first, latest]);
  });

  test("returns no messages when a child's workspace cannot be attributed", () => {
    expect(selectActivityMessages({
      state: {
        activeWorkspaceId: "parent-workspace",
        messagesByTask: {
          "parent-task": [message("parent-1", "Parent only text")],
        },
        taskWorkspaceIdById: {},
        workspaceRuntimeCacheById: {},
      },
      parentTaskId: "parent-task",
      childTaskId: "child-task",
    })).toEqual([]);
  });
});
