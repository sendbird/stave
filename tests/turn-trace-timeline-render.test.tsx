import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TurnTraceLegend, TurnTraceTimeline } from "@/components/session/TurnTraceTimeline";
import { buildTurnTrace } from "@/components/session/turn-trace.utils";
import type { ToolUsePart } from "@/types/chat";

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
const at = (seconds: number) => new Date(T0 + seconds * 1_000).toISOString();

function tool(overrides: Partial<ToolUsePart> & { toolUseId: string }): ToolUsePart {
  return { type: "tool_use", toolName: "Read", input: JSON.stringify({ file_path: "server/users.ts" }), state: "output-available", ...overrides };
}

describe("TurnTraceTimeline", () => {
  test("draws the turn with its tokens and cost, the slowest step, and the steps without a time", () => {
    const trace = buildTurnTrace({
      messages: [
        {
          role: "assistant",
          providerId: "claude-code",
          usage: { inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 16_000, totalCostUsd: 0.21 },
          parts: [
            tool({ toolUseId: "read", startedAt: at(1), completedAt: at(2) }),
            tool({ toolUseId: "cmd", toolName: "Bash", input: JSON.stringify({ command: "bun test" }), startedAt: at(80), completedAt: at(92) }),
            tool({ toolUseId: "old" }),
          ],
        },
      ],
      turnStartedAt: T0,
      turnCompletedAt: T0 + 95_000,
      live: false,
      now: T0 + 95_000,
    });
    const html = renderToStaticMarkup(createElement(TurnTraceTimeline, { trace }));

    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Turn timeline"');
    expect(html.match(/data-trace-span-id=/g)).toHaveLength(3);
    expect(html).toContain("18k tokens");
    expect(html).toContain("$0.21");
    expect(html).toContain("1m 35s");
    // The 12s command, not the 1s read, carries the tag.
    expect(html.match(/data-trace-slowest="true"/g)).toHaveLength(1);
    expect(html.indexOf('data-trace-span-id="tool:cmd"')).toBeLessThan(html.indexOf("data-trace-slowest"));
    expect(html).not.toContain("data-trace-marker");
    expect(html).toContain('data-testid="turn-trace-unreported"');
    expect(html).toContain("1 step without a reported time");
    expect(html).toContain("Tokens and cost are reported for the whole turn only");
  });

  test("a live turn draws the now line, and the legend names it", () => {
    const trace = buildTurnTrace({
      messages: [{ role: "assistant", parts: [tool({ toolUseId: "run", state: "input-available", startedAt: at(1) })] }],
      turnStartedAt: T0,
      turnCompletedAt: null,
      live: true,
      now: T0 + 5_000,
    });
    const html = renderToStaticMarkup(createElement(TurnTraceTimeline, { trace }));
    const legend = renderToStaticMarkup(createElement(TurnTraceLegend, { live: true }));

    expect(html.match(/data-trace-marker="true"/g)).toHaveLength(2);
    expect(legend).toContain("Now");
    expect(renderToStaticMarkup(createElement(TurnTraceLegend, { live: false }))).not.toContain("Now");
  });
});
