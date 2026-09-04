import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentStyleProvider } from "@/components/ai-elements/agent-style-context";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/ai-elements/chain-of-thought";

/* `renderToStaticMarkup` substring assertions — no DOM runner in this repo. */

function renderTrace(args: {
  isStreaming: boolean;
  style?: "legacy" | "beui";
  durationSeconds?: number;
  defaultOpen?: boolean;
}) {
  const trace = createElement(
    ChainOfThought,
    {
      isStreaming: args.isStreaming,
      defaultOpen: args.defaultOpen ?? args.isStreaming,
      durationSeconds: args.durationSeconds,
      seed: "message-1",
      summaryItems: [{ icon: null, label: "reads", count: 2 }],
    },
    createElement(ChainOfThoughtTrigger, null),
    createElement(
      ChainOfThoughtContent,
      null,
      createElement(ChainOfThoughtStep, { title: "Read", status: "done" }),
    ),
  );

  return renderToStaticMarkup(
    args.style
      ? createElement(AgentStyleProvider, { style: args.style }, trace)
      : trace,
  );
}

describe("ChainOfThoughtContent", () => {
  /*
   * Regression guard for the fade that ate the "Thinking" header: the cap used
   * to live on the whole trace, so a long streaming thought pushed the step
   * rows themselves under the top mask. The cap now belongs to the reasoning
   * body alone (`StreamingThoughtViewport`).
   */
  test("never caps the trace container, streaming or not", () => {
    for (const isStreaming of [true, false]) {
      const html = renderTrace({ isStreaming, defaultOpen: true });
      expect(html).not.toContain("max-h-[22em]");
      expect(html).not.toContain("justify-end");
      expect(html).not.toContain("mask-image:linear-gradient");
    }
  });

  test("uses the reveal wipe for the new style and the legacy fade for legacy", () => {
    expect(renderTrace({ isStreaming: true })).toContain("motion-safe:animate-trace-reveal");

    const legacy = renderTrace({ isStreaming: true, style: "legacy" });
    expect(legacy).toContain("motion-safe:animate-cot-content-in");
    expect(legacy).not.toContain("animate-trace-reveal");
  });

  test("rows use the spring entrance for the new style and the fade for legacy", () => {
    expect(renderTrace({ isStreaming: true })).toContain("motion-safe:animate-trace-row-in");
    expect(renderTrace({ isStreaming: true, style: "legacy" })).not.toContain(
      "animate-trace-row-in",
    );
  });
});

describe("ChainOfThoughtTrigger", () => {
  test("renders a reduced-cadence matrix loader while streaming and drops it when complete", () => {
    const streaming = renderTrace({ isStreaming: true });
    expect(streaming).toContain('data-loader-variant="matrix"');
    expect(streaming).toContain('data-loader-cadence="reduced"');

    expect(renderTrace({ isStreaming: false })).not.toContain(
      'data-loader-variant="matrix"',
    );
  });

  test("uses the same lightweight status loader under the legacy style", () => {
    const legacy = renderTrace({ isStreaming: true, style: "legacy" });
    expect(legacy).toContain('data-loader-variant="matrix"');
  });

  test("appends the duration to the collapsed completion phrase", () => {
    const html = renderTrace({ isStreaming: false, durationSeconds: 12, defaultOpen: false });
    expect(html).toContain("for 12s");

    const long = renderTrace({ isStreaming: false, durationSeconds: 125, defaultOpen: false });
    expect(long).toContain("for 2m 5s");
  });

  test("hides the duration while streaming and while expanded", () => {
    expect(renderTrace({ isStreaming: true, durationSeconds: 12 })).not.toContain("for 12s");
    expect(
      renderTrace({ isStreaming: false, durationSeconds: 12, defaultOpen: true }),
    ).not.toContain("for 12s");
  });

  test("keeps the completion phrase stable for a given seed across remounts", () => {
    const first = renderTrace({ isStreaming: false, defaultOpen: false });
    const second = renderTrace({ isStreaming: false, defaultOpen: false });
    expect(first).toBe(second);
  });
});
