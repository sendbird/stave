import { describe, expect, test } from "bun:test";
import { buildReferencedTaskRetrievedContext, extractReferencedTaskIds } from "@/lib/task-context/referenced-task-context";
import type { ChatMessage, Task } from "@/types/chat";

function createTask(id: string, title: string): Task {
  return {
    id,
    title,
    provider: "codex",
    updatedAt: "2026-04-07T00:00:00.000Z",
    unread: false,
    archivedAt: null,
    controlMode: "interactive",
    controlOwner: "stave",
  };
}

function createAssistantMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: "assistant",
    model: "gpt-5.4",
    providerId: "codex",
    content,
    parts: [{ type: "text", text: content }],
  };
}

describe("referenced task context", () => {
  test("extracts referenced Stave task ids from the prompt", () => {
    const taskIds = extractReferencedTaskIds({
      text: [
        "stave task id: dfc51641-eebb-422a-a0d6-9847106aad6e",
        "taskid 68a85556-29ec-437e-a2dd-6286a04fbcee",
        "task id: dfc51641-eebb-422a-a0d6-9847106aad6e",
      ].join("\n"),
    });

    expect(taskIds).toEqual([
      "dfc51641-eebb-422a-a0d6-9847106aad6e",
      "68a85556-29ec-437e-a2dd-6286a04fbcee",
    ]);
  });

  test("builds retrieved context from loaded task replies", () => {
    const part = buildReferencedTaskRetrievedContext({
      prompt: [
        "stave task id: dfc51641-eebb-422a-a0d6-9847106aad6e",
        "stave task id: 68a85556-29ec-437e-a2dd-6286a04fbcee",
      ].join("\n"),
      currentTaskId: "2329ba34-e4a7-49a2-b381-f1a7f52dc495",
      tasks: [
        createTask("dfc51641-eebb-422a-a0d6-9847106aad6e", "Persist Tracking State Across Worktrees"),
        createTask("68a85556-29ec-437e-a2dd-6286a04fbcee", "New Task"),
      ],
      messagesByTask: {
        "dfc51641-eebb-422a-a0d6-9847106aad6e": [
          createAssistantMessage("m-1", "First reply"),
          createAssistantMessage("m-2", "Most recent reply from task A"),
        ],
        "68a85556-29ec-437e-a2dd-6286a04fbcee": [
          createAssistantMessage("m-3", "Most recent reply from task B"),
        ],
      },
    });

    expect(part).not.toBeNull();
    expect(part?.sourceId).toBe("stave:referenced-task-replies");
    expect(part?.content).toContain("Most recent reply from task A");
    expect(part?.content).toContain("Most recent reply from task B");
    expect(part?.content).toContain("Do not scan the home directory");
  });

  test("adds an unresolved warning instead of encouraging filesystem search", () => {
    const part = buildReferencedTaskRetrievedContext({
      prompt: "stave task id: dfc51641-eebb-422a-a0d6-9847106aad6e",
      currentTaskId: "2329ba34-e4a7-49a2-b381-f1a7f52dc495",
      tasks: [],
      messagesByTask: {},
    });

    expect(part).not.toBeNull();
    expect(part?.content).toContain("Unresolved task ids:");
    expect(part?.content).toContain("instead of searching the filesystem");
  });
});
