import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkspaceRunProgressText } from "@/components/layout/WorkspaceRunProgress";
import { AgentRunMark } from "@/components/system/AgentRunMark";

describe("the agent run mark", () => {
  test("working is the matrix loader in the provider's ink, for a row that says an agent is live", () => {
    const html = renderToStaticMarkup(createElement(AgentRunMark, { kind: "working", providerId: "codex" }));
    expect(html).toContain('data-run-mark="working"');
    expect(html).toContain('data-loader-variant="matrix"');
  });

  test("what a followed turn runs has its own loader", () => {
    const variants = {
      thinking: "pulse",
      tool: "steps",
      parallel: "parallel",
      subagent: "handoff",
    } as const;
    for (const [kind, variant] of Object.entries(variants)) {
      const html = renderToStaticMarkup(
        createElement(AgentRunMark, { kind: kind as keyof typeof variants, providerId: "claude-code", size: "sm", cadence: "reduced" }),
      );
      expect(html).toContain(`data-run-mark="${kind}"`);
      expect(html).toContain(`data-loader-variant="${variant}"`);
      expect(html).toContain('data-loader-cadence="reduced"');
    }
  });

  test("a turn waiting on a person draws the still state glyph and no loader", () => {
    const approval = renderToStaticMarkup(createElement(AgentRunMark, { kind: "approval", size: "sm" }));
    expect(approval).toContain('data-run-mark="approval"');
    expect(approval).toContain('data-state="approval"');
    expect(approval).toContain("lucide-shield-question");
    expect(approval).not.toContain("data-loader-variant");

    const question = renderToStaticMarkup(createElement(AgentRunMark, { kind: "needs-you", size: "sm" }));
    expect(question).toContain('data-run-mark="needs-you"');
    expect(question).toContain('data-state="needs-you"');
    expect(question).toContain("lucide-hand");
    expect(question).not.toContain("data-loader-variant");
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
