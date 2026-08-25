import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Popover, TooltipProvider } from "@/components/ui";
import {
  buildStandaloneCliEmptyStateText,
  buildStandaloneCliPopoverClassName,
  StandaloneCliPanel,
  StandaloneCliPopoverContent,
} from "@/components/layout/standalone-cli/StandaloneCliPopover";
import { StandaloneCliTabBar } from "@/components/layout/standalone-cli/StandaloneCliTabBar";
import { shouldCancelStandaloneCliOpenChange } from "@/components/layout/TopBarStandaloneCli";
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

describe("shouldCancelStandaloneCliOpenChange", () => {
  // Escape is how you cancel a running turn inside both CLIs' own TUIs. If the
  // popover consumed it the key would never reach the PTY, and the user would
  // lose the only way to interrupt the CLI.
  test("refuses to dismiss on Escape so the key reaches the PTY", () => {
    expect(shouldCancelStandaloneCliOpenChange("escape-key")).toBe(true);
  });

  test.each([
    ["outside-press"],
    ["trigger-press"],
    ["focus-out"],
    ["close-press"],
  ])("lets %s dismiss the popover", (reason) => {
    expect(shouldCancelStandaloneCliOpenChange(reason)).toBe(false);
  });
});

describe("StandaloneCliPopoverContent", () => {
  // renderToStaticMarkup is a *server* render, and zustand v5's useStore feeds
  // React the store's initial snapshot (getInitialState) during server
  // rendering -- not the live state produced by getState().openOverlay()
  // below. A static render therefore always evaluates against the store's
  // frozen initial state, which is closed. That is exactly why the
  // folder-populated markup lives in the prop-driven StandaloneCliPanel below,
  // which needs no store and is tested with explicit props instead.
  // This test deliberately avoids writing to app.store: doing so would trip
  // zustand's default persist storage once another test file has installed a
  // window without localStorage.
  test("boots no CLI until the panel has been opened at least once", () => {
    useStandaloneCliStore.getState().openOverlay();

    const markup = render(
      createElement(Popover, null, createElement(StandaloneCliPopoverContent)),
    );

    expect(markup).not.toContain("standalone-cli-panel");
    expect(markup).not.toContain("standalone-cli-terminal-viewport");
  });
});

describe("StandaloneCliPanel", () => {
  const handlers = { onClose: () => {}, onOpenSettings: () => {} };

  test("renders the empty state when no folder is configured", () => {
    const markup = render(
      createElement(StandaloneCliPanel, {
        folderPath: "",
        visible: true,
        ...handlers,
      }),
    );

    expect(markup).toContain("standalone-cli-panel");
    expect(markup).toContain(buildStandaloneCliEmptyStateText());
    expect(markup).not.toContain("standalone-cli-terminal-viewport");
  });

  // The popover no longer covers the top bar, so Settings is reachable without
  // this button -- but the empty state is the one place the user has no idea
  // where to go, so it keeps offering the direct route.
  test("offers a Settings button in the empty state", () => {
    const markup = render(
      createElement(StandaloneCliPanel, {
        folderPath: "",
        visible: true,
        ...handlers,
      }),
    );

    expect(extractButtonMarkup(markup, "Open Settings")).toContain(
      "Open Settings",
    );
  });

  test("mounts the terminal and both provider tabs once a folder is set", () => {
    const markup = render(
      createElement(StandaloneCliPanel, {
        folderPath: "/tmp/notes",
        visible: true,
        ...handlers,
      }),
    );

    expect(markup).toContain("standalone-cli-terminal-viewport");
    expect(markup).toContain("Claude Code");
    expect(markup).toContain("Codex");
    expect(markup).not.toContain(buildStandaloneCliEmptyStateText());
  });

  // Closing the popover hides the panel instead of unmounting it, so the
  // terminal has to still be in the tree while invisible.
  test("keeps the terminal in the tree while hidden", () => {
    const markup = render(
      createElement(StandaloneCliPanel, {
        folderPath: "/tmp/notes",
        visible: false,
        ...handlers,
      }),
    );

    expect(markup).toContain("standalone-cli-terminal-viewport");
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

describe("buildStandaloneCliPopoverClassName", () => {
  test("gives the terminal a bounded height it can fit into", () => {
    const className = buildStandaloneCliPopoverClassName({
      folderPath: "/tmp/notes",
    });

    // Without the positioner's available height the panel can extend past the
    // bottom of the window, and the terminal fits itself to a viewport that is
    // partly off screen.
    expect(className).toContain("var(--available-height");
    expect(className).toContain("min-h-0");
  });

  test("shrinks to the message when there is no folder to run in", () => {
    const className = buildStandaloneCliPopoverClassName({ folderPath: "" });

    expect(className).not.toContain("h-[min(40rem");
  });
});
