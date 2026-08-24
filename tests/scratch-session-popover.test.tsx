import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui";
import {
  buildScratchEmptyStateText,
  buildScratchTriggerLabel,
  TopBarScratchSession,
} from "@/components/layout/TopBarScratchSession";

function renderTrigger() {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(TopBarScratchSession, { noDragStyle: {} }),
    ),
  );
}

describe("buildScratchTriggerLabel", () => {
  test("names the waiting approval ahead of the running turn", () => {
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 1, turnActive: true }),
    ).toBe("Scratch session — approval waiting");
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 0, turnActive: true }),
    ).toBe("Scratch session — running");
    expect(
      buildScratchTriggerLabel({ pendingApprovalCount: 0, turnActive: false }),
    ).toBe("Scratch session");
  });
});

describe("buildScratchEmptyStateText", () => {
  test("names the folder-first, project-free contract", () => {
    expect(buildScratchEmptyStateText()).toBe(
      "Pick a folder to start a scratch session. Nothing is added to your projects.",
    );
  });
});

describe("TopBarScratchSession", () => {
  // renderToStaticMarkup is a *server* render, and zustand v5's useStore feeds
  // React the store's initial snapshot (getInitialState) during server rendering
  // — not the live state. So a static render always reflects the default state
  // regardless of setState, and the dynamic "approval waiting" label cannot be
  // asserted this way. That branch is covered instead by the buildScratchTrigger-
  // Label unit test above plus selectScratchPendingApprovals in the store tests.
  test("renders a trigger even with no project context and no folder", () => {
    // No setState needed: the SSR snapshot is always getInitialState (see above),
    // so this asserts the default/idle trigger regardless of live store state.
    const markup = renderTrigger();
    expect(markup).toContain("Scratch session");
    expect(markup).toContain("aria-label=\"Scratch session\"");
  });
});
