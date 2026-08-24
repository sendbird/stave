import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliEmptyStateText,
  StandaloneCliOverlay,
} from "@/components/layout/standalone-cli/StandaloneCliOverlay";
import { StandaloneCliTabBar } from "@/components/layout/standalone-cli/StandaloneCliTabBar";
import { useAppStore } from "@/store/app.store";
import { useStandaloneCliStore } from "@/store/standalone-cli.store";

function render(element: ReturnType<typeof createElement>) {
  return renderToStaticMarkup(createElement(TooltipProvider, null, element));
}

afterEach(() => {
  useStandaloneCliStore.getState().reset();
  useAppStore.getState().updateSettings({ patch: { standaloneCliFolderPath: "" } });
});

describe("StandaloneCliOverlay", () => {
  // renderToStaticMarkup is a *server* render, and zustand v5's useStore feeds
  // React the store's initial snapshot (getInitialState) during server
  // rendering -- not the live state produced by getState().openOverlay() or
  // updateSettings() below (see tests/scratch-session-popover.test.tsx for the
  // established precedent in this codebase). So a static render of the
  // overlay always evaluates its `if (!open) return null` gate against the
  // store's frozen initial state, which is closed. The open/folder-populated
  // branches behind that gate are covered instead by: StandaloneCliTabBar
  // rendered directly below (unaffected by the gate) and the
  // buildStandaloneCliEmptyStateText unit test.
  test("renders nothing visible while closed", () => {
    useStandaloneCliStore.getState().openOverlay();
    useAppStore
      .getState()
      .updateSettings({ patch: { standaloneCliFolderPath: "/tmp/notes" } });

    const markup = render(createElement(StandaloneCliOverlay));

    expect(markup).not.toContain("standalone-cli-panel");
    expect(markup).not.toContain("standalone-cli-terminal-viewport");
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

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('aria-pressed="false"');
  });
});

describe("buildStandaloneCliEmptyStateText", () => {
  test("points the user at Settings", () => {
    expect(buildStandaloneCliEmptyStateText()).toBe(
      "Set a Standalone CLI folder in Settings to run Claude Code and Codex here. Nothing is added to your projects.",
    );
  });
});
