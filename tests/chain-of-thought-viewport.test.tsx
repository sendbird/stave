import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sx } from "@/components/ads/utils/stylex";
import { chainOfThoughtStyles } from "@/components/ai-elements/chain-of-thought.styles";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
} from "@/components/ai-elements/chain-of-thought";

/* `renderToStaticMarkup` substring assertions — no DOM runner in this repo. */

function renderTrace(args: {
  isStreaming: boolean;
  durationSeconds?: number;
  defaultOpen?: boolean;
  completionLabel?: string;
}) {
  const trace = createElement(
    ChainOfThought,
    {
      isStreaming: args.isStreaming,
      defaultOpen: args.defaultOpen ?? args.isStreaming,
      durationSeconds: args.durationSeconds,
      summaryItems: [{ id: "read", icon: null, label: "2 reads" }],
    },
    createElement(ChainOfThoughtTrigger, {
      completionLabel: args.completionLabel,
    }),
    createElement(
      ChainOfThoughtContent,
      null,
      createElement(ChainOfThoughtStep, { title: "Read", status: "done" }),
    ),
  );

  return renderToStaticMarkup(trace);
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

  test("uses the reveal wipe on the container", () => {
    // Assert against StyleX style identity rather than the former Tailwind
    // `animate-*` class strings: the content container composes
    // `contentTraceMotion` (reveal wipe).
    const traceMotion = sx(chainOfThoughtStyles.contentTraceMotion);

    const html = renderTrace({ isStreaming: true });
    for (const cls of traceMotion.split(/\s+/)) expect(html).toContain(cls);
  });

  test("rows use the spring entrance", () => {
    const rowTrace = sx(chainOfThoughtStyles.stepMotionRowTrace);

    const html = renderTrace({ isStreaming: true });
    for (const cls of rowTrace.split(/\s+/)) expect(html).toContain(cls);
  });
});

describe("ChainOfThoughtTrigger", () => {
  test("renders a reduced-cadence reason loader while streaming and drops it when complete", () => {
    const streaming = renderTrace({ isStreaming: true });
    /*
     * `reason` — a written chain of thought — because this mark stands for
     * the CoT header. `think` is open-ended contemplation, which is the
     * reasoning row's own mark *inside* this trace, so sharing it would draw
     * the identical animation twice and make the header read as a copy of
     * its first step.
     */
    expect(streaming).toContain('data-loader-variant="reason"');
    expect(streaming).toContain('data-loader-cadence="reduced"');
    expect(streaming).not.toContain('data-loader-variant="think"');

    expect(renderTrace({ isStreaming: false })).not.toContain(
      'data-loader-variant="reason"',
    );
  });

  test("puts the reasoning time beside the collapsed title", () => {
    const html = renderTrace({ isStreaming: false, durationSeconds: 12, defaultOpen: false });
    expect(html).toContain(">12s</span>");
    expect(html).toContain('title="Reasoning time: 12s"');

    const long = renderTrace({ isStreaming: false, durationSeconds: 125, defaultOpen: false });
    expect(long).toContain(">2m 5s</span>");
  });

  test("hides the duration while streaming and while expanded", () => {
    expect(renderTrace({ isStreaming: true, durationSeconds: 12 })).not.toContain(">12s<");
    expect(
      renderTrace({ isStreaming: false, durationSeconds: 12, defaultOpen: true }),
    ).not.toContain(">12s<");
  });

  test("titles a finished turn with the label it is given, never a random phrase", () => {
    const titled = renderTrace({
      isStreaming: false,
      defaultOpen: false,
      completionLabel: "Updated the sidebar width spec",
    });
    expect(titled).toContain("Updated the sidebar width spec");
    expect(titled).toContain("2 reads");
    // Without a title the header says the turn finished; it is the same every render.
    const untitled = renderTrace({ isStreaming: false, defaultOpen: false });
    expect(untitled).toContain(">Finished<");
    expect(renderTrace({ isStreaming: false, defaultOpen: false })).toBe(untitled);
  });

  test("shows the playful rotating status only while the turn runs", () => {
    const running = renderTrace({ isStreaming: true, completionLabel: "Updated the sidebar width spec" });
    expect(running).not.toContain("Updated the sidebar width spec");
    expect(running).not.toContain(">Finished<");
  });

  test("uses an explicit terminal label instead of a success phrase", () => {
    expect(
      renderTrace({
        isStreaming: false,
        defaultOpen: true,
        completionLabel: "Run failed",
      }),
    ).toContain("Run failed");
  });
});
