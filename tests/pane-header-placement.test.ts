import { describe, expect, test } from "bun:test";
import type { PaneSurfaceDescriptor } from "../src/lib/panes/types";
import {
  openPaneTabInGroup,
  registerPaneHostController,
  shouldDeferSurfaceOpenToStore,
  type OpenSurfaceOptions,
  type PaneHostController,
} from "../src/components/panes/pane-host-controller";

function createControllerHarness() {
  const opens: Array<{
    surface: PaneSurfaceDescriptor;
    options?: OpenSurfaceOptions;
  }> = [];
  const controller: PaneHostController = {
    openSurface: (surface, options) => {
      opens.push({ surface, options });
      return true;
    },
    closeSurface: () => {},
    focusSurface: () => {},
    splitActivePanel: () => {},
    toggleTerminalGroup: () => {},
  };
  return { controller, opens };
}

describe("pane-header tab placement", () => {
  test.each([
    { kind: "task" as const, taskId: "task-new" },
    { kind: "lens" as const, lensSessionId: "lens-new" },
    { kind: "cli-session" as const, cliSessionTabId: "cli-new" },
  ])("opens a newly created $kind tab in the source group", (surface) => {
    const { controller, opens } = createControllerHarness();
    const unregister = registerPaneHostController(controller);

    try {
      openPaneTabInGroup({ surface, groupId: "group-secondary" });
    } finally {
      unregister();
    }

    expect(opens).toEqual([
      {
        surface,
        options: {
          position: {
            referenceGroupId: "group-secondary",
            direction: "within",
          },
        },
      },
    ]);
  });

  test("does not defer an explicitly positioned task to the active group", () => {
    expect(
      shouldDeferSurfaceOpenToStore(
        { kind: "task", taskId: "task-new" },
        {
          position: {
            referencePanelId: "task:task-existing",
            direction: "within",
          },
        },
      ),
    ).toBe(false);
  });
});
