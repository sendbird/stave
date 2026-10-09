import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildInlineRenderToolResult } from "@/lib/inline-render/inline-render";
import type { ChatMessage } from "@/types/chat";

const RENDER_ID = "0123456789abcdef-0f0e0d0c-0b0a-4908-8706-050403020100";

async function loadAssistantMessageBody() {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    },
    configurable: true,
  });
  // No desktop bridge: the browser-only path builds the page from the input.
  Object.defineProperty(globalThis, "window", {
    value: { api: {} },
    configurable: true,
  });
  const module = await import("@/components/session/message/assistant-trace");
  return module.AssistantMessageBody;
}

function messageWithRender(): Pick<ChatMessage, "content" | "parts" | "isStreaming"> {
  return {
    content: "The chart above compares the two weeks.",
    isStreaming: false,
    parts: [
      {
        type: "tool_use",
        toolUseId: "call-1",
        toolName: "mcp__stave-local-mcp__stave_render_html",
        input: JSON.stringify({ title: "Weekly spend", html: "<div id=\"spend-chart\">chart</div>" }),
        output: JSON.stringify(
          buildInlineRenderToolResult({ renderId: RENDER_ID, title: "Weekly spend", height: 300 }),
          null,
          2,
        ),
        state: "output-available",
      },
      { type: "text", text: "The chart above compares the two weeks." },
    ],
  };
}

describe("inline HTML render in the conversation", () => {
  test("shows the page in a sandboxed frame ahead of the reply", async () => {
    const AssistantMessageBody = await loadAssistantMessageBody();
    const html = renderToStaticMarkup(
      createElement(AssistantMessageBody, {
        message: messageWithRender(),
        taskId: "task-1",
        messageId: "message-1",
      } as never),
    );

    expect(html).toContain("<figure");
    expect(html).toContain("Weekly spend");
    const frame = /<iframe[^>]*>/.exec(html)?.[0] ?? "";
    expect(frame).toContain('sandbox="allow-scripts allow-forms"');
    expect(frame).not.toContain("allow-same-origin");
    expect(frame).toMatch(/referrerpolicy="no-referrer"/i);
    // The browser-only page carries its CSP in a meta tag ahead of the markup.
    expect(frame).toContain("Content-Security-Policy");
    expect(html.indexOf("<figure")).toBeLessThan(html.indexOf("The chart above compares"));
  });

  test("leaves an ordinary tool output alone", async () => {
    const AssistantMessageBody = await loadAssistantMessageBody();
    const message = messageWithRender();
    const [toolPart, textPart] = message.parts;
    const html = renderToStaticMarkup(
      createElement(AssistantMessageBody, {
        message: {
          ...message,
          parts: [{ ...toolPart, toolName: "Bash", output: "ok" } as never, textPart as never],
        },
        taskId: "task-1",
        messageId: "message-1",
      } as never),
    );
    expect(html).not.toContain("<figure");
  });
});
