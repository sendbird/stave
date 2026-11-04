import { afterEach, describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WorkQueueRow } from "../src/components/layout/workspace-sidebar-rows";
import type { SidebarWorkQueueEntry } from "../src/components/layout/RepositoryWorkspaceSidebar.utils";
import { useAppStore } from "../src/store/app.store";
import {
  FLEET_VIEW_APP_SURFACE,
  WORKSPACE_APP_SURFACE,
} from "../src/store/app-surface";

/*
 * S-3: one "you are here". The active workspace row is the current page only
 * while the workspace shows; on a global view it is the last place opened,
 * with no selected fill and no `aria-current`.
 */

/* Server rendering reads the store's initial state, so the surface is seeded there. */
const app = useAppStore.getInitialState();
const originalSurface = app.activeAppSurface;

afterEach(() => {
  Object.assign(app, { activeAppSurface: originalSurface });
});

const entry = (isActive: boolean): SidebarWorkQueueEntry => ({
  repositoryPath: "/tmp/repo",
  repositoryName: "repo",
  workspaceId: isActive ? "ws-active" : "ws-idle",
  workspaceName: isActive ? "Active" : "Idle",
  isDefault: false,
  isActive,
  status: "idle",
});

function render(isActive: boolean) {
  return renderToStaticMarkup(
    createElement(WorkQueueRow, { entry: entry(isActive), onOpen: () => {} }),
  );
}

describe("workspace row: current place", () => {
  test("the active row is the current page while the workspace shows", () => {
    Object.assign(app, { activeAppSurface: WORKSPACE_APP_SURFACE });
    expect(render(true)).toContain('aria-current="page"');
    expect(render(false)).not.toContain("aria-current");
  });

  test("on a global view the active row is only the last opened, styled apart", () => {
    Object.assign(app, { activeAppSurface: WORKSPACE_APP_SURFACE });
    const current = render(true);
    Object.assign(app, { activeAppSurface: FLEET_VIEW_APP_SURFACE });
    const lastOpened = render(true);
    expect(lastOpened).not.toContain("aria-current");
    // Not the selected fill: its own quieter class set.
    expect(lastOpened).not.toBe(current);
  });
});
