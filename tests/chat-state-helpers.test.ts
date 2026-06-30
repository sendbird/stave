import { describe, expect, test } from "bun:test";
import { buildPendingProviderTurnState } from "@/store/chat-state-helpers";
import type { ChatMessage, Task } from "@/types/chat";

function task(id: string): Task {
  return {
    id,
    title: id,
    provider: "codex",
    updatedAt: "2026-03-10T00:00:00.000Z",
    unread: false,
    archivedAt: null,
  };
}

const sharedArgs = {
  activeTurnIdsByTask: {},
  taskWorkspaceIdById: {},
  workspaceSnapshotVersion: 0,
  taskWorkspaceId: "ws-1",
  turnId: "turn-1",
  provider: "codex" as const,
  activeModel: "gpt-5.4",
  content: "hello",
};

describe("buildPendingProviderTurnState — message IDs", () => {
  test("anchors new IDs to the durable total when the window is trimmed", () => {
    const taskId = "task-1";
    // Only the last 2 of a 10-message history are resident in memory.
    const resident: ChatMessage[] = [
      { id: `${taskId}-m-9`, role: "assistant", model: "gpt-5.4", providerId: "codex", content: "older", parts: [] },
      { id: `${taskId}-m-10`, role: "user", model: "user", providerId: "user", content: "prior", parts: [] },
    ];

    const next = buildPendingProviderTurnState({
      ...sharedArgs,
      tasks: [task(taskId)],
      messagesByTask: { [taskId]: resident },
      messageCountByTask: { [taskId]: 10 },
      taskId,
    });

    const appended = (next.messagesByTask[taskId] ?? []).slice(-2);
    // Pre-fix scheme used window length (2) -> m-3/m-4, colliding with the real
    // on-disk m-3/m-4 (silently overwritten by the additive upsert).
    expect(appended.map((m) => m.id)).toEqual([`${taskId}-m-11`, `${taskId}-m-12`]);
    expect(next.messageCountByTask[taskId]).toBe(12);
  });

  test("matches positional IDs for a fully-resident history (backward compatible)", () => {
    const taskId = "task-2";
    const resident: ChatMessage[] = [
      { id: `${taskId}-m-1`, role: "user", model: "user", providerId: "user", content: "hi", parts: [] },
      { id: `${taskId}-m-2`, role: "assistant", model: "gpt-5.4", providerId: "codex", content: "yo", parts: [] },
    ];

    const next = buildPendingProviderTurnState({
      ...sharedArgs,
      tasks: [task(taskId)],
      messagesByTask: { [taskId]: resident },
      messageCountByTask: { [taskId]: 2 },
      taskId,
    });

    const appended = (next.messagesByTask[taskId] ?? []).slice(-2);
    expect(appended.map((m) => m.id)).toEqual([`${taskId}-m-3`, `${taskId}-m-4`]);
  });
});

describe("buildPendingProviderTurnState — display content", () => {
  test("keeps raw prompt content separate from rendered display content", () => {
    const taskId = "task-display";
    const next = buildPendingProviderTurnState({
      ...sharedArgs,
      tasks: [task(taskId)],
      messagesByTask: { [taskId]: [] },
      messageCountByTask: { [taskId]: 0 },
      taskId,
      content: "raw selector and html",
      displayContent: "comment plus screenshot",
      imageContexts: [
        {
          dataUrl: "data:image/png;base64,abc",
          label: "Visual comment 1",
          mimeType: "image/png",
        },
      ],
    });

    const userMessage = next.messagesByTask[taskId]?.[0];
    expect(userMessage?.content).toBe("raw selector and html");
    expect(userMessage?.displayContent).toBe("comment plus screenshot");
    expect(userMessage?.parts.at(-1)).toEqual({
      type: "text",
      text: "raw selector and html",
    });
    expect(userMessage?.displayParts?.at(-1)).toEqual({
      type: "text",
      text: "comment plus screenshot",
    });
  });

  test("strips raw Lens visual comment details from rendered display parts", () => {
    const taskId = "task-lens-display";
    const rawLensBlock = [
      "고쳐봐 이것들",
      "",
      "[Lens Visual Comments]",
      "",
      "The user left 2 visual comments on the live page.",
      "",
      "1. Element Comment",
      "",
      "Comment: 구글검색",
      "Selector: input[aria-label=\"Google 검색\"]",
      "HTML:",
      "<input aria-label=\"Google 검색\" />",
    ].join("\n");
    const next = buildPendingProviderTurnState({
      ...sharedArgs,
      tasks: [task(taskId)],
      messagesByTask: { [taskId]: [] },
      messageCountByTask: { [taskId]: 0 },
      taskId,
      content: rawLensBlock,
      displayParts: [
        { type: "text", text: rawLensBlock },
        {
          type: "image_context",
          dataUrl: "data:image/png;base64,abc",
          label: "구글검색",
          mimeType: "image/png",
        },
      ],
    });

    const userMessage = next.messagesByTask[taskId]?.[0];
    expect(userMessage?.content).toContain("[Lens Visual Comments]");
    expect(userMessage?.displayParts).toEqual([
      { type: "text", text: "고쳐봐 이것들" },
      {
        type: "image_context",
        dataUrl: "data:image/png;base64,abc",
        label: "구글검색",
        mimeType: "image/png",
      },
    ]);
  });
});
