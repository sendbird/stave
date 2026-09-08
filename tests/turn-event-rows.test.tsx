import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "bun:test";

import { CommandResult } from "@/components/session/message/command-result";
import {
  ReasoningRow,
  TraceCitations,
} from "@/components/session/message/turn-event-rows";

/**
 * The transcript's ADS-backed rows. These pin the two claims the adoption is
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

    const unmeasured = renderToStaticMarkup(
      <ReasoningRow isStreaming={false} text="Compared." />,
    );
    expect(unmeasured).toContain("Finished thinking");
    expect(unmeasured).not.toMatch(/Thought for/);
  });

  test("holds the streaming thought in a busy capped log region", () => {
    const markup = renderToStaticMarkup(
      <ReasoningRow isStreaming text="Reading the changelog" />,
    );
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("--ads-capped-viewport-cap:220px");
    expect(markup).toContain("Reading the changelog");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-ads-loader-anatomy="think"');
  });

  test("an empty reasoning pass is one quiet line, not an empty disclosure", () => {
    const markup = renderToStaticMarkup(
      <ReasoningRow isStreaming={false} text="   " />,
    );
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

    const passed = renderToStaticMarkup(
      <CommandResult command="bun test" output="1 fail" />,
    );
    // The tone is the only difference, so the two must not render identically.
    expect(failed).not.toBe(passed);
  });

  test("says which state an empty result is in", () => {
    expect(
      renderToStaticMarkup(<CommandResult command="bun test" isStreaming />),
    ).toContain("Waiting for output");
    expect(renderToStaticMarkup(<CommandResult command="bun test" />)).toContain(
      "No output.",
    );
  });
});

describe("TraceCitations", () => {
  test("turns URLs in provider output into an ADS source list", () => {
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
