import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceRunProgressText } from "@/components/layout/WorkspaceRunProgress";
import { AgentRunMark } from "@/components/system/AgentRunMark";

describe("the agent run mark", () => {
  test("working is the matrix loader in the provider's ink", () => {
    const html = renderToStaticMarkup(createElement(AgentRunMark, { kind: "working", providerId: "codex" }));
    expect(html).toContain('data-run-mark="working"');
    expect(html).toContain('data-loader-variant="matrix"');
  });

  test("waiting on helpers has its own loader, never the working one", () => {
    const html = renderToStaticMarkup(createElement(AgentRunMark, { kind: "waiting", providerId: "claude-code" }));
    expect(html).toContain('data-run-mark="waiting"');
    expect(html).toContain('data-loader-variant="dots"');
    expect(html).not.toContain('data-loader-variant="matrix"');
  });

  test("a stall draws the still halted glyph and no loader", () => {
    const html = renderToStaticMarkup(createElement(AgentRunMark, { kind: "stalled" }));
    expect(html).toContain('data-run-mark="stalled"');
    expect(html).toContain('data-state="halted"');
    expect(html).not.toContain("data-loader-variant");
  });

  test("system work keeps the spinner", () => {
    const html = renderToStaticMarkup(createElement(AgentRunMark, { kind: "busy" }));
    expect(html).toContain('data-loader-variant="spinner"');
  });
});

describe("the sidebar row's progress words", () => {
  test("name the state and carry it as data for the row", () => {
    const html = renderToStaticMarkup(
      createElement(WorkspaceRunProgressText, {
        progress: { kind: "stalled", step: null, todo: null, durationMs: 360_000, helperCount: 0 },
      }),
    );
    expect(html).toContain('data-run-progress="stalled"');
    expect(html).toContain("No output · 6m");
  });
});
