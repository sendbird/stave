import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { replayProviderEventsToTaskState } from "@/lib/session/provider-event-replay";
import type { ChatMessage } from "@/types/chat";

function createAssistantMessage(
  args: Partial<Pick<ChatMessage, "content" | "parts" | "isStreaming">>,
): Pick<ChatMessage, "content" | "parts" | "isStreaming"> {
  return {
    content: args.content ?? "",
    parts: args.parts ?? [],
    isStreaming: args.isStreaming,
  };
}

async function loadAssistantMessageBodies() {
  const localStorageStub = {
    getItem: (_key: string) => null,
    setItem: (_key: string, _value: string) => {},
    removeItem: (_key: string) => {},
    clear: () => {},
    key: (_index: number) => null,
    length: 0,
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageStub,
    configurable: true,
  });

  Object.defineProperty(globalThis, "window", {
    value: {
      api: {
        fs: {
          pickRoot: async () => ({ ok: false }),
          readFile: async () => ({ ok: false }),
          writeFile: async () => ({ ok: false }),
        },
      },
    },
    configurable: true,
  });

  const standardModule = await import("@/components/session/message/assistant-trace");
  const zenModule = await import("@/components/session/message/ZenAssistantMessageBody");
  return {
    AssistantMessageBody: standardModule.AssistantMessageBody,
    ZenAssistantMessageBody: zenModule.ZenAssistantMessageBody,
  };
}

describe("AssistantMessageBody", () => {
  test("shows only the CoT trigger before the first streaming trace entry arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Thinking...</p>");
    expect(html).not.toContain("No response.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("renders the reasoning step once thinking content arrives", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("Inspecting files.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(2);
  });

  test("keeps streaming reasoning text plain for hot-path performance", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Open https://example.com/docs.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).toContain("https://example.com/docs");
    expect(html).not.toContain("<a");
  });

  test("suppresses reasoning details in zen mode while keeping a minimal working state", async () => {
    const { ZenAssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(ZenAssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Inspecting files.");
    expect(html).toContain("Working...");
  });

  test("keeps assistant trace collapsed in manual expansion mode", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        isStreaming: true,
        parts: [{ type: "thinking", text: "Inspecting files.", isStreaming: true }],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      traceExpansionMode: "manual",
    }));

    expect(html).not.toContain("Inspecting files.");
    expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  });

  test("keeps markdown rendering for the pre-plan assistant message after plan splitting", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const replayed = replayProviderEventsToTaskState({
      taskId: "task-1",
      messages: [],
      events: [
        { type: "text", text: "## Review\n\n- Keep markdown\n- Preserve bullets" },
        { type: "plan_ready", planText: "1. Inspect\n2. Patch" },
        { type: "done" },
      ],
      provider: "codex",
      model: "gpt-5.4",
    });

    const priorAssistantMessage = replayed.messages[0];
    if (!priorAssistantMessage) {
      throw new Error("expected prior assistant message");
    }

    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: priorAssistantMessage,
      taskId: "task-1",
      messageId: priorAssistantMessage.id,
      streamingEnabled: true,
    }));

    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("Keep markdown");
  });

  test("hides interim assistant messages by default", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });

  test("renders interim assistant messages when enabled", async () => {
    const { AssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(AssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "text", text: "Inspecting the repo.", segmentId: "commentary-1" },
          { type: "text", text: "Patched the issue.", segmentId: "final-1" },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
      showInterimMessages: true,
    }));

    expect(html).toContain("Inspecting the repo.");
    expect(html).toContain("Patched the issue.");
  });

  test("keeps final response text visible in zen mode", async () => {
    const { ZenAssistantMessageBody } = await loadAssistantMessageBodies();
    const html = renderToStaticMarkup(createElement(ZenAssistantMessageBody, {
      message: createAssistantMessage({
        parts: [
          { type: "thinking", text: "Inspecting files.", isStreaming: false },
          { type: "text", text: "Patch applied successfully." },
        ],
      }),
      taskId: "task-1",
      messageId: "message-1",
      streamingEnabled: true,
    }));

    expect(html).not.toContain("Inspecting files.");
    expect(html).toContain("Patch applied successfully.");
  });
});
