import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { CommandResult } from "@/components/session/message/command-result";
import {
  countLines,
  ReasoningRow,
  TraceCitations,
  TraceOutput,
} from "@/components/session/message/turn-event-rows";
import { TraceToolRun } from "@/components/session/message/turn-event-tool-runs";

/**
 * The transcript's AUI-backed rows. These pin the two claims the adoption is
 * for: reasoning reports only measured time, and a command result shows an
 * error tone without inventing an exit code the provider never sent.
 */
describe("ReasoningRow", () => {
  test("reports a measured duration and refuses to invent one", () => {
    const measured = renderToStaticMarkup(
      <ReasoningRow durationMs={14_200} isStreaming={false} text="Compared." />,
    );
    expect(measured).toContain("Thought for");
    expect(measured).toContain("14.2s");

    const unmeasured = renderToStaticMarkup(<ReasoningRow isStreaming={false} text="Compared." />);
    expect(unmeasured).toContain("Finished thinking");
    expect(unmeasured).not.toMatch(/Thought for/);
  });

  test("defers the busy thought region while its disclosure is closed", () => {
    const markup = renderToStaticMarkup(<ReasoningRow isStreaming text="Reading the changelog" />);
    expect(markup).not.toContain('aria-busy="true"');
    expect(markup).not.toContain("--aui-capped-viewport-cap:220px");
    expect(markup).not.toContain("Reading the changelog");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-aui-loader-anatomy="think"');
  });

  test("an empty reasoning pass is one quiet line, not an empty disclosure", () => {
    const markup = renderToStaticMarkup(<ReasoningRow isStreaming={false} text="   " />);
    expect(markup).not.toContain("aria-expanded");
  });
});

describe("CommandResult", () => {
  test("shows the command line, the output and a copy action", () => {
    const markup = renderToStaticMarkup(
      <CommandResult command="bun run typecheck" output="tsc --noEmit" />,
    );
    expect(markup).toContain("bun run typecheck");
    expect(markup).toContain("tsc --noEmit");
    expect(markup).toContain("Copy");
  });

  test("takes its failure tone from isError and prints no exit code", () => {
    // `NormalizedProviderEvent.tool_result` carries `output` and `isError` and
    // nothing else, so an exit code here would be fabricated.
    const failed = renderToStaticMarkup(
      <CommandResult command="bun test" isError output="1 fail" />,
    );
    expect(failed).toContain("1 fail");
    expect(failed).not.toMatch(/exit\s+\d/);

    const passed = renderToStaticMarkup(<CommandResult command="bun test" output="1 fail" />);
    // The tone is the only difference, so the two must not render identically.
    expect(failed).not.toBe(passed);
  });

  test("says which state an empty result is in", () => {
    expect(renderToStaticMarkup(<CommandResult command="bun test" isStreaming />)).toContain(
      "Waiting for output",
    );
    expect(renderToStaticMarkup(<CommandResult command="bun test" />)).toContain("No output.");
  });
});

describe("TraceCitations", () => {
  test("turns URLs in provider output into an AUI source list", () => {
    const markup = renderToStaticMarkup(
      <TraceCitations output="Found https://stave.dev/install and https://example.com/a" />,
    );
    expect(markup).toContain("Sources");
    expect(markup).toContain("https://stave.dev/install");
    expect(markup).toContain("stave.dev");
  });

  test("renders nothing when the output cites nothing", () => {
    expect(renderToStaticMarkup(<TraceCitations output="no links" />)).toBe("");
  });
});

describe("Tool call card values", () => {
  test("caps a long output in the shared viewport and keeps its copy action", () => {
    const longOutput = Array.from(
      { length: 500 },
      (_, index) => `src/file-${index}.ts:1: match`,
    ).join("\n");
    const markup = renderToStaticMarkup(
      <TraceOutput capped label="Output" linkify={false} text={longOutput} />,
    );
    expect(markup).toContain('data-trace-output-capped="true"');
    expect(markup).toContain('role="log"');
    expect(markup).toContain('aria-label="Output"');
    expect(markup).toContain("--aui-capped-viewport-cap:220px");
    expect(markup).toContain("src/file-499.ts:1: match");
    expect(markup).toContain('aria-label="Copy"');
    // The line count is measured in the browser once the box overflows.
    expect(markup).not.toContain("trace-output-line-note");
    expect(countLines(longOutput)).toBe(500);
    expect(countLines(`${longOutput}\n`)).toBe(500);
    expect(countLines("")).toBe(0);
  });

  test("defers argument and output viewports while the tool is closed", () => {
    const markup = renderToStaticMarkup(
      <TraceToolRun
        taskId="task-1"
        part={{
          type: "tool_use",
          toolUseId: "toolu_grep",
          toolName: "Grep",
          input: JSON.stringify({ pattern: "traceStepEnter", path: "src", glob: "*.tsx" }),
          output: "src/a.tsx:1: traceStepEnter",
          state: "output-available",
        }}
      />,
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('data-trace-output-capped="true"');
    expect(markup).not.toContain('aria-label="Arguments"');
    expect(markup).not.toContain('aria-label="Copy"');
  });

  test("an uncapped value keeps its plain layout", () => {
    const markup = renderToStaticMarkup(<TraceOutput text="short" />);
    expect(markup).not.toContain("data-trace-output-capped");
    expect(markup).not.toContain('role="log"');
  });
});
