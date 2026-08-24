import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliEmptyStateText,
  StandaloneCliOverlay,
  StandaloneCliOverlayView,
} from "@/components/layout/standalone-cli/StandaloneCliOverlay";
import { StandaloneCliTabBar } from "@/components/layout/standalone-cli/StandaloneCliTabBar";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(TooltipProvider, null, element));
}

// Isolates a single rendered <button> element's markup by locating the chunk
// that carries the given provider label, so the aria-pressed assertion below
// binds to the right button instead of matching any aria-pressed anywhere in
// the markup.
function extractButtonMarkup(markup: string, label: string) {
  const button = markup
    .split("<button")
    .slice(1)
    .map((chunk) => `<button${chunk}`)
    .find((chunk) => chunk.includes(label));
  if (!button) {
    throw new Error(`No rendered button found for label: ${label}`);
  }
  return button;
}

afterEach(() => {
  useStandaloneCliStore.getState().reset();
});

describe("StandaloneCliOverlay", () => {
  // renderToStaticMarkup is a *server* render, and zustand v5's useStore feeds
  // React the store's initial snapshot (getInitialState) during server
  // rendering -- not the live state produced by getState().openOverlay() or
  // updateSettings() below (see tests/scratch-session-popover.test.tsx for the
  // established precedent in this codebase). So a static render of the
  // store-connected wrapper always evaluates its `if (!open) return null`
  // gate against the store's frozen initial state, which is closed. That is
  // exactly why the open/folder-populated markup lives in the prop-driven
  // StandaloneCliOverlayView below, which needs no store and is tested with
  // explicit props instead.
  // This test deliberately avoids writing to app.store: doing so would trip
  // zustand's default persist storage once another test file has installed a
  // window without localStorage.
  test("renders nothing visible while closed", () => {
    useStandaloneCliStore.getState().openOverlay();

    const markup = render(createElement(StandaloneCliOverlay));

    expect(markup).not.toContain("standalone-cli-panel");
    expect(markup).not.toContain("standalone-cli-terminal-viewport");
  });
});

describe("StandaloneCliOverlayView", () => {
  test("renders the empty state when no folder is configured", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(StandaloneCliOverlayView, {
          folderPath: "",
          onClose: () => {},
        }),
      ),
    );

    expect(markup).toContain("standalone-cli-panel");
    expect(markup).toContain(buildStandaloneCliEmptyStateText());
    expect(markup).not.toContain("standalone-cli-terminal-viewport");
  });

  test("mounts the terminal and both provider tabs once a folder is set", () => {
    const markup = renderToStaticMarkup(
      createElement(
        TooltipProvider,
        null,
        createElement(StandaloneCliOverlayView, {
          folderPath: "/tmp/notes",
          onClose: () => {},
        }),
      ),
    );

    expect(markup).toContain("standalone-cli-terminal-viewport");
    expect(markup).toContain("Claude Code");
    expect(markup).toContain("Codex");
    expect(markup).not.toContain(buildStandaloneCliEmptyStateText());
  });
});

describe("StandaloneCliTabBar", () => {
  test("renders both provider tabs", () => {
    const markup = render(createElement(StandaloneCliTabBar));

    expect(markup).toContain("Claude Code");
    expect(markup).toContain("Codex");
  });

  test("marks the active tab with aria-pressed and the inactive one without", () => {
    const markup = render(createElement(StandaloneCliTabBar));

    const claudeCodeButton = extractButtonMarkup(markup, "Claude Code");
    const codexButton = extractButtonMarkup(markup, "Codex");

    expect(claudeCodeButton).toContain('aria-pressed="true"');
    expect(codexButton).toContain('aria-pressed="false"');
  });
});

describe("buildStandaloneCliEmptyStateText", () => {
  test("points the user at Settings", () => {
    expect(buildStandaloneCliEmptyStateText()).toBe(
      "Set a Standalone CLI folder in Settings to run Claude Code and Codex here. Nothing is added to your projects.",
    );
  });
});
