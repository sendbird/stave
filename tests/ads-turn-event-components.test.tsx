import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { Citation } from "@/components/ads/components/Citation";
import { Thinking } from "@/components/ads/components/Thinking";
import { ToolRun } from "@/components/ads/components/ToolRun";
import { agentStateLabel } from "@/components/ads/components/agent-state";

/**
 * The turn-event family was missing from the installed ADS copy, which is why
 * the transcript hand-rolled every one of these surfaces. These tests do two
 * things: prove the ported files actually render in this host (they came from a
 * revision with a different tsconfig and a different `utils/stylex`), and pin
 * the behaviours the transcript will depend on when it adopts them, so a later
 * re-sync cannot quietly drop one.
 */
describe("ADS turn-event components", () => {
  test("ToolRun renders a row, not a card, and names its own state", () => {
    const markup = renderToStaticMarkup(
      <ToolRun
        status="running"
        title="Search the changelog"
        tool="repo.grep"
        count="12 matches"
        startedAt={Date.now() - 4200}
        now={Date.now()}
      />,
    );
    expect(markup).toContain("Search the changelog");
    expect(markup).toContain("repo.grep");
    expect(markup).toContain("12 matches");
    expect(markup).toContain(agentStateLabel.running);
    expect(markup).toContain('data-tool-run-status="running"');
  });

  test("a ToolRun with a payload becomes a disclosure and stays open while live", () => {
    const markup = renderToStaticMarkup(
      <ToolRun
        status="running"
        title="Read the file"
        input="{ path: 'README.md' }"
        output="# Stave"
        startedAt={Date.now() - 1000}
        now={Date.now()}
      />,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("Arguments");
    expect(markup).toContain("Output");
  });

  test("a failed ToolRun stays expanded and offers exactly one recovery action", () => {
    // `isAttentionState` owns the list of states that keep their payload on
    // screen; a failure that auto-collapsed would hide the only thing worth
    // reading.
    const markup = renderToStaticMarkup(
      <ToolRun
        status="failed"
        title="Run the tests"
        error="exit 1"
        onRetry={() => {}}
      />,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("exit 1");
    expect(markup).toContain("Retry");
    expect(markup).toContain('role="alert"');
  });

  test("a ToolRun group rolls its runs up to the most urgent state", () => {
    const markup = renderToStaticMarkup(
      <ToolRun.Group
        rollUp
        runs={[
          { status: "done", durationMs: 100 },
          { status: "failed", durationMs: 200 },
        ]}
      >
        <ToolRun status="done" title="First" />
        <ToolRun status="failed" title="Second" />
      </ToolRun.Group>,
    );
    expect(markup).toContain("2 tool calls");
    expect(markup).toContain(agentStateLabel.failed);
    expect(markup).toContain('data-tool-run-group-status="failed"');
  });

  test("Thinking reports a measured duration and never invents one", () => {
    const settled = renderToStaticMarkup(
      <Thinking status="settled" durationMs={14_200}>
        Comparing the two migrations.
      </Thinking>,
    );
    expect(settled).toContain("Thought for");
    expect(settled).toContain("14.2s");

    // No start instant, no recorded duration: the component has nothing true to
    // say about the wait, so it says nothing rather than animating a plausible
    // number.
    const unmeasured = renderToStaticMarkup(
      <Thinking status="settled">Some trace.</Thinking>,
    );
    expect(unmeasured).toContain("Finished thinking");
    expect(unmeasured).not.toMatch(/Thought for/);
  });

  test("Thinking with no trace is one row rather than an empty disclosure", () => {
    const markup = renderToStaticMarkup(
      <Thinking phase="Reading the changelog" status="thinking" />,
    );
    expect(markup).toContain("Reading the changelog");
    expect(markup).not.toContain("aria-expanded");
  });

  test("Citation renders an inline mark and a source list from one shape", () => {
    const mark = renderToStaticMarkup(
      <Citation index={2} source="stave.dev" title="Install guide" />,
    );
    expect(mark).toContain("2");
    expect(mark).toContain("Source 2: Install guide");

    const list = renderToStaticMarkup(
      <Citation.List
        defaultOpen
        detail="detailed"
        sources={[
          {
            excerpt: "Packaged builds check for updates.",
            href: "https://stave.dev/install",
            id: "s1",
            index: 1,
            source: "stave.dev",
            title: "Install guide",
          },
        ]}
      />,
    );
    expect(list).toContain("Sources");
    expect(list).toContain("Install guide");
    expect(list).toContain("Packaged builds check for updates.");
    expect(list).toContain('target="_blank"');
  });
});
