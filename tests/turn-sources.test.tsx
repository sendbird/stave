import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AssistantMessageBody } from "@/components/session/message/assistant-trace";
import { TurnSources } from "@/components/session/message/turn-event-rows";
import { collectTurnWebSources } from "@/components/session/message/turn-event-state";
import type { MessagePart } from "@/types/chat";

const webParts: MessagePart[] = [
  {
    type: "tool_use",
    toolUseId: "search-1",
    toolName: "WebSearch",
    input: JSON.stringify({ query: "node lts schedule" }),
    output: "Results:\n- https://nodejs.org/en/about/previous-releases\n- https://github.com/nodejs/Release.",
    state: "output-available",
  },
  {
    type: "tool_use",
    toolUseId: "fetch-1",
    toolName: "WebFetch",
    input: JSON.stringify({ url: "https://nodejs.org/en/about/previous-releases" }),
    // The same page again: listed once, where it first appeared.
    output: "Fetched https://nodejs.org/en/about/previous-releases (200)",
    state: "output-available",
  },
  {
    type: "tool_use",
    toolUseId: "fetch-2",
    toolName: "WebFetch",
    input: JSON.stringify({ url: "https://example.invalid/down" }),
    output: "Failed to fetch https://example.invalid/down",
    state: "output-error",
  },
  {
    type: "tool_use",
    toolUseId: "read-1",
    toolName: "Read",
    input: JSON.stringify({ file_path: "README.md" }),
    output: "See https://stave.dev/install for setup.",
    state: "output-available",
  },
];

describe("collectTurnWebSources", () => {
  test("collects web tool URLs once each, in first-seen order, skipping failures and other tools", () => {
    expect(collectTurnWebSources(webParts)).toEqual([
      "https://nodejs.org/en/about/previous-releases",
      "https://github.com/nodejs/Release",
    ]);
  });

  test("a turn without web tools has no sources", () => {
    expect(collectTurnWebSources(webParts.slice(3))).toEqual([]);
  });
});

describe("TurnSources", () => {
  test("renders one compact Sources line with the count", () => {
    const html = renderToStaticMarkup(
      createElement(TurnSources, { urls: collectTurnWebSources(webParts) }),
    );
    expect(html).toContain("data-turn-sources");
    expect(html).toContain(">Sources<");
    expect(html).toMatch(/>2<\/span>/);
    expect(html).toContain('href="https://github.com/nodejs/Release"');
    expect(html).toContain("github.com");
    // Collapsed by default: the line, not the list, is what the reader sees first.
    expect(html).toContain('aria-expanded="false"');
  });

  test("renders nothing without sources", () => {
    expect(renderToStaticMarkup(createElement(TurnSources, { urls: [] }))).toBe("");
  });
});

describe("AssistantMessageBody turn sources", () => {
  const message = (isStreaming: boolean) => ({
    role: "assistant" as const,
    content: "Pin Node 24 in CI.",
    isStreaming,
    parts: [...webParts, { type: "text" as const, text: "Pin Node 24 in CI." }],
  });

  test("a finished turn ends with its sources, after the answer", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMessageBody, {
        message: message(false),
        taskId: "task",
        messageId: "m1",
        streamingEnabled: true,
      }),
    );
    expect(html).toContain("data-turn-sources");
    expect(html.indexOf("Pin Node 24 in CI.")).toBeLessThan(html.indexOf("data-turn-sources"));
  });

  test("a streaming turn shows no sources yet", () => {
    const html = renderToStaticMarkup(
      createElement(AssistantMessageBody, {
        message: message(true),
        taskId: "task",
        messageId: "m1",
        streamingEnabled: true,
      }),
    );
    expect(html).not.toContain("data-turn-sources");
  });
});
