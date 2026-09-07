import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { CappedViewport } from "@/components/ads/components/CappedViewport";
import { FileChangeSummary } from "@/components/ads/components/FileChangeSummary";
import { StepRail } from "@/components/ads/components/StepRail";
import { ToolRun } from "@/components/ads/components/ToolRun";

/**
 * The three components added to ADS (and to this copy) for the turn-event
 * surface, plus the one surgical addition to `ToolRun`. These pin the
 * behaviours the transcript now depends on, so a later ADS re-sync cannot drop
 * one silently.
 */
describe("StepRail", () => {
  test("draws the connector by default and drops it on the last step", () => {
    const withRule = renderToStaticMarkup(
      <StepRail>
        <StepRail.Step marker={<span>dot</span>}>step</StepRail.Step>
      </StepRail>,
    );
    const withoutRule = renderToStaticMarkup(
      <StepRail>
        <StepRail.Step connector={false} marker={<span>dot</span>}>
          step
        </StepRail.Step>
      </StepRail>,
    );

    // The connector is the only `aria-hidden` span the step renders.
    expect(withRule).toContain('aria-hidden="true"');
    expect(withoutRule).not.toContain('aria-hidden="true"');
    expect(withoutRule).toContain("step");
  });

  test("a step with no marker still renders its body and its rule", () => {
    const markup = renderToStaticMarkup(
      <StepRail>
        <StepRail.Step>bare</StepRail.Step>
      </StepRail>,
    );
    expect(markup).toContain("bare");
    expect(markup).toContain('aria-hidden="true"');
  });
});

describe("CappedViewport", () => {
  test("publishes the cap twice so the mask cannot disagree with the box", () => {
    const markup = renderToStaticMarkup(
      <CappedViewport maxBlockSize={220}>output</CappedViewport>,
    );
    expect(markup).toContain("max-block-size:220px");
    expect(markup).toContain("--ads-capped-viewport-cap:220px");
  });

  test("a live viewport is a busy log region; a settled one is not busy", () => {
    const live = renderToStaticMarkup(
      <CappedViewport label="Streaming reasoning" live>
        tokens
      </CappedViewport>,
    );
    expect(live).toContain('role="log"');
    expect(live).toContain('aria-busy="true"');
    expect(live).toContain('aria-live="polite"');

    const settled = renderToStaticMarkup(
      <CappedViewport label="Output">done</CappedViewport>,
    );
    expect(settled).toContain('role="log"');
    expect(settled).not.toContain("aria-busy");
  });

  test("fades the top edge while live and both edges once settled", () => {
    const live = renderToStaticMarkup(<CappedViewport live>a</CappedViewport>);
    const settled = renderToStaticMarkup(<CappedViewport>a</CappedViewport>);
    // Different edge treatments must resolve to different class sets; a shared
    // one would mean the streaming case fades its own live edge.
    expect(live).not.toBe(settled);

    const explicit = renderToStaticMarkup(
      <CappedViewport edge="none">a</CappedViewport>,
    );
    expect(explicit).not.toBe(settled);
  });
});

describe("FileChangeSummary", () => {
  test("truncates the directory and never the basename", () => {
    const markup = renderToStaticMarkup(
      <FileChangeSummary
        added={12}
        path="src/components/session/message/assistant-trace.tsx"
        removed={3}
      />,
    );
    // The path is two cells, so the basename is its own element and cannot be
    // the thing an ellipsis cuts.
    expect(markup).toContain("src/components/session/message/");
    expect(markup).toContain("assistant-trace.tsx");
    expect(markup).toContain("+12");
    expect(markup).toContain("−3");
  });

  test("a path with no directory renders only the basename", () => {
    const markup = renderToStaticMarkup(<FileChangeSummary path="README.md" />);
    expect(markup).toContain("README.md");
    expect(markup).not.toContain("+");
  });

  test("reports the outcome with the shared agent-state word", () => {
    expect(
      renderToStaticMarkup(<FileChangeSummary path="a.ts" state="failed" />),
    ).toContain("Failed");
    expect(
      renderToStaticMarkup(<FileChangeSummary path="a.ts" state="denied" />),
    ).toContain("Denied");
    expect(
      renderToStaticMarkup(<FileChangeSummary path="a.ts" state="skipped" />),
    ).toContain("Skipped");
    expect(
      renderToStaticMarkup(<FileChangeSummary path="a.ts" state="canceled" />),
    ).toContain("Canceled");
  });
});

describe("ToolRun icon", () => {
  test("renders the caller's object glyph instead of the default wrench", () => {
    const custom = renderToStaticMarkup(
      <ToolRun
        icon={<svg data-testid="terminal-glyph" />}
        status="running"
        title="Bash"
      />,
    );
    expect(custom).toContain('data-testid="terminal-glyph"');

    // Omitting it is unchanged behaviour, which is what makes the prop additive.
    const fallback = renderToStaticMarkup(
      <ToolRun status="running" title="Bash" />,
    );
    expect(fallback).toContain("lucide-wrench");
  });

  test("the payload-less row and the disclosure trigger read one glyph", () => {
    const disclosure = renderToStaticMarkup(
      <ToolRun
        icon={<svg data-testid="terminal-glyph" />}
        output="ok"
        status="done"
        title="Bash"
      />,
    );
    expect(disclosure).toContain('data-testid="terminal-glyph"');
    expect(disclosure).not.toContain("lucide-wrench");
  });
});
