import { describe, expect, test } from "bun:test";
import {
  buildPendingProviderTurnState,
  buildSteeredUserMessageState,
  resolveMidTurnSteeringContext,
} from "@/store/chat-state-helpers";
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

describe("resolveMidTurnSteeringContext", () => {
  test("keeps steering bound to the provider that owns the active turn", () => {
    const result = resolveMidTurnSteeringContext({
      activeTurnId: "turn-1",
      activity: {
        turnId: "turn-1",
        providerId: "codex",
      },
      fallbackProviderId: "claude-code",
      messages: [],
      hasAttachments: false,
      isActiveWorkspace: true,
    });

    expect(result).toEqual({
      providerId: "codex",
      unavailableMessage: null,
    });
  });

  test("uses conversation history when activity belongs to another turn", () => {
    const result = resolveMidTurnSteeringContext({
      activeTurnId: "turn-2",
      activity: {
        turnId: "turn-1",
        providerId: "claude-code",
      },
      fallbackProviderId: "claude-code",
      messages: [
        {
          id: "assistant-1",
          role: "assistant",
          model: "gpt-5.4",
          providerId: "codex",
          content: "Working",
          isStreaming: true,
          parts: [],
        },
      ],
      hasAttachments: false,
      isActiveWorkspace: true,
    });

    expect(result.providerId).toBe("codex");
    expect(result.unavailableMessage).toBeNull();
  });

  test("returns the first steering eligibility failure", () => {
    const result = resolveMidTurnSteeringContext({
      activeTurnId: "turn-1",
      fallbackProviderId: "claude-code",
      messages: [],
      hasAttachments: true,
      isActiveWorkspace: false,
    });

    expect(result.unavailableMessage).toBe(
      "Attachments can't be steered into a live turn — press Tab to queue instead.",
    );
  });
});

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

describe("buildSteeredUserMessageState", () => {
  test("segments the live assistant around an accepted steer", () => {
    const taskId = "task-steer";
    const current: ChatMessage[] = [
      {
        id: `${taskId}-m-1`,
        role: "user",
        model: "user",
        providerId: "user",
        content: "Initial request",
        parts: [{ type: "text", text: "Initial request" }],
      },
      {
        id: `${taskId}-m-2`,
        role: "assistant",
        model: "gpt-5.4",
        providerId: "codex",
        content: "Working",
        isStreaming: true,
        parts: [{ type: "text", text: "Working" }],
      },
    ];

    const next = buildSteeredUserMessageState({
      messagesByTask: { [taskId]: current },
      messageCountByTask: { [taskId]: 2 },
      taskId,
      content: "Also update the tests",
      steeredIntoTurnId: "turn-1",
      clientMessageId: "client-steer-1",
      provider: "codex",
      activeModel: "gpt-5.4",
      turnStillActive: true,
    });

    const messages = next.messagesByTask[taskId] ?? [];
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages[1]).toMatchObject({
      id: `${taskId}-m-2`,
      isStreaming: false,
    });
    expect(messages[2]).toMatchObject({
      id: "client-steer-1",
      content: "Also update the tests",
      steeredIntoTurnId: "turn-1",
      steerDeliveryState: "accepted",
    });
    expect(messages[3]).toMatchObject({
      role: "assistant",
      model: "gpt-5.4",
      providerId: "codex",
      content: "",
      isStreaming: true,
    });
    expect(next.messageCountByTask[taskId]).toBe(4);
  });

  test("records a late accepted steer without creating a stale assistant", () => {
    const taskId = "task-late-steer";
    const current: ChatMessage[] = [
      {
        id: `${taskId}-m-1`,
        role: "assistant",
        model: "claude-sonnet-4-5",
        providerId: "claude-code",
        content: "Done",
        isStreaming: false,
        parts: [{ type: "text", text: "Done" }],
      },
    ];

    const next = buildSteeredUserMessageState({
      messagesByTask: { [taskId]: current },
      messageCountByTask: { [taskId]: 1 },
      taskId,
      content: "Late guidance",
      steeredIntoTurnId: "turn-finished",
      clientMessageId: "client-steer-late",
      provider: "claude-code",
      activeModel: "claude-sonnet-4-5",
      turnStillActive: false,
    });

    expect(next.messagesByTask[taskId]).toHaveLength(2);
    expect(next.messagesByTask[taskId]?.at(-1)).toMatchObject({
      id: "client-steer-late",
      role: "user",
      steerDeliveryState: "accepted",
    });
    expect(next.messageCountByTask[taskId]).toBe(2);
  });
});
