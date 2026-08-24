import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ScratchProviderToggle } from "@/components/layout/scratch-session/ScratchProviderToggle";

const noop = () => {};

describe("ScratchProviderToggle", () => {
  test("marks the active provider and offers both providers", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchProviderToggle, {
        provider: "claude-code",
        disabled: false,
        onSelect: noop,
      }),
    );

    expect(markup).toContain("Claude Code");
    expect(markup).toContain("Codex");
    // The active provider carries aria-pressed="true"; the other is false.
    expect(markup.match(/aria-pressed="true"/g)?.length).toBe(1);
    expect(markup.match(/aria-pressed="false"/g)?.length).toBe(1);
    expect(markup).not.toContain('disabled=""');
  });

  test("disables both providers while a turn is running", () => {
    const markup = renderToStaticMarkup(
      createElement(ScratchProviderToggle, {
        provider: "codex",
        disabled: true,
        onSelect: noop,
      }),
    );

    expect(markup.match(/ disabled=""/g)?.length).toBe(2);
  });
});
