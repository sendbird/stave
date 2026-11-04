import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { i18n, type AppTFunction } from "@/i18n";
import { sx } from "@/components/ads/utils/stylex";
import { chainOfThoughtStyles } from "@/components/ai-elements/chain-of-thought.styles";
import {
  ChainOfThought,
  ChainOfThoughtTrigger,
} from "@/components/ai-elements/chain-of-thought";
import type { AssistantTraceEntry } from "@/components/session/message/assistant-trace-builder";
import { resolveTraceActivity } from "@/components/session/message/trace-activity";
import type { ToolUsePart } from "@/types/chat";

const t = i18n.getFixedT("en") as AppTFunction;

function tool(
  id: string,
  toolName: string,
  input: Record<string, unknown>,
  state: ToolUsePart["state"],
): AssistantTraceEntry {
  return {
    kind: "tool",
    id,
    part: {
      type: "tool_use",
      toolUseId: id,
      toolName,
      input: JSON.stringify(input),
      state,
    },
  };
}

function renderHeader(args: { activity?: string | null }) {
  return renderToStaticMarkup(
    createElement(
      ChainOfThought,
      { isStreaming: true },
      createElement(ChainOfThoughtTrigger, {
        streamingActivity: args.activity,
      }),
    ),
  );
}

/** The markup of the part tagged `data-trace-streaming-part="<name>"`. */
function partIndex(html: string, name: string) {
  return html.indexOf(`data-trace-streaming-part="${name}"`);
}

describe("resolveTraceActivity", () => {
  test("names the newest step still running", () => {
    const entries = [
      tool("read", "Read", { file_path: "src/search.ts" }, "output-available"),
      tool("edit", "Edit", { file_path: "src/styles/globals.css" }, "input-available"),
    ];
    expect(resolveTraceActivity(entries, t)).toBe("Editing globals.css");
  });

  test("skips finished, failed and waiting steps", () => {
    const entries: AssistantTraceEntry[] = [
      tool("read", "Read", { file_path: "src/search.ts" }, "input-streaming"),
      tool("bash", "Bash", { command: "bun test" }, "output-error"),
      tool("grep", "Grep", { pattern: "foo" }, "output-available"),
    ];
    expect(resolveTraceActivity(entries, t)).toBe("Reading search.ts");
    expect(
      resolveTraceActivity([tool("grep", "Grep", { pattern: "foo" }, "output-available")], t),
    ).toBeNull();
  });

  test("words commands, searches, web lookups and other tools", () => {
    expect(resolveTraceActivity([tool("a", "Bash", { command: "bun run typecheck" }, "input-available")], t))
      .toBe("Running bun run typecheck");
    expect(resolveTraceActivity([tool("a", "Grep", { pattern: "traceStepEnter" }, "input-available")], t))
      .toBe("Searching traceStepEnter");
    expect(resolveTraceActivity([tool("a", "WebFetch", { url: "https://example.com/docs" }, "input-available")], t))
      .toBe("Looking up https://example.com/docs");
    expect(resolveTraceActivity([tool("a", "mcp__docs__search", { query: "x" }, "input-available")], t))
      .toBe("Using mcp__docs__search");
  });

  test("a streaming thought, a running subagent and a running plan update count too", () => {
    expect(
      resolveTraceActivity([{ kind: "reasoning", id: "r", parts: [], isStreaming: true }], t),
    ).toBe("Thinking");
    expect(
      resolveTraceActivity([{ kind: "reasoning", id: "r", parts: [], isStreaming: false }], t),
    ).toBeNull();
    const subagent: AssistantTraceEntry = {
      kind: "subagent",
      id: "s",
      part: {
        type: "tool_use",
        toolUseId: "s",
        toolName: "Task",
        input: JSON.stringify({ description: "Map trace motion call sites", subagent_type: "Explore" }),
        state: "input-available",
      },
    };
    expect(resolveTraceActivity([subagent], t)).toBe("Map trace motion call sites");
  });

  test("speaks Korean when the display language is Korean", () => {
    const ko = i18n.getFixedT("ko") as AppTFunction;
    expect(
      resolveTraceActivity([tool("a", "Read", { file_path: "src/search.ts" }, "input-available")], ko),
    ).toBe("search.ts 읽는 중");
  });
});

describe("streaming trace header", () => {
  test("shows current work without rotating phrases or a duplicate clock", () => {
    const html = renderHeader({ activity: "Reading search.ts" });
    expect(partIndex(html, "activity")).toBeGreaterThan(-1);
    expect(html).toContain("Reading search.ts");
    expect(partIndex(html, "phrase")).toBe(-1);
    expect(partIndex(html, "elapsed")).toBe(-1);
  });

  test.each([null, undefined, ""])("falls back to Thinking for activity %p", (activity) => {
    const html = renderHeader({ activity });
    expect(partIndex(html, "activity")).toBeGreaterThan(-1);
    expect(html).toContain(i18n.t("ui:thinking.thinking"));
    expect(partIndex(html, "phrase")).toBe(-1);
    expect(partIndex(html, "elapsed")).toBe(-1);
  });

  test("keeps the activity truncation style", () => {
    const html = renderHeader({ activity: "Reading search.ts" });
    for (const cls of sx(chainOfThoughtStyles.streamingActivity).split(/\s+/)) {
      expect(html).toContain(cls);
    }
    // Rendered truncation is measured in tests/e2e/trace-streaming-header.e2e.ts.
  });

  test("is not a live region, so a label change is never announced", () => {
    const html = renderHeader({ activity: "Reading search.ts" });
    const label = html.slice(html.indexOf("data-trace-streaming-label"));
    expect(label).not.toContain("aria-live");
    expect(label).not.toContain('role="status"');
    expect(label).not.toContain('role="timer"');
  });
});
