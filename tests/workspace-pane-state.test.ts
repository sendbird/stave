import { describe, expect, test } from "bun:test";
import {
  reduceActiveSurfaceFromPane,
  reduceCloseLensTab,
  reduceCloseTaskTab,
  reduceOpenLensTab,
  reducePaneTabMeta,
  resolveCreatedLensSessionId,
} from "@/store/workspace-pane-state";

function createState() {
  return {
    activeAppSurface: { kind: "workspace" as const },
    activeSurface: { kind: "task" as const, taskId: "task-1" },
    activeTaskId: "task-1",
    activeCliSessionTabId: null,
    activeTerminalTabId: null,
    activeEditorTabId: null,
    activeCompareRunId: null,
    tasks: [{ id: "task-1" }, { id: "task-2" }],
    openTaskTabIds: ["task-1", "task-2"],
    lensTabs: [
      { id: "lens-a", createdAt: 1 },
      { id: "lens-b", createdAt: 2 },
    ],
    paneTabMeta: {
      "task:task-1": { pinned: true },
      "lens:lens-a": { customTitle: "Preview A" },
    },
    dockLayout: null,
    workspaceSnapshotVersion: 4,
  };
}

describe("workspace pane state reducers", () => {
  test("closes an active task tab without removing the task", () => {
    const state = createState();
    const next = reduceCloseTaskTab({
      state,
      taskId: "task-1",
      nextSnapshotVersion: 5,
    });

    expect(next).toMatchObject({
      activeTaskId: "task-2",
      activeSurface: { kind: "task", taskId: "task-2" },
      openTaskTabIds: ["task-2"],
      paneTabMeta: { "lens:lens-a": { customTitle: "Preview A" } },
      workspaceSnapshotVersion: 5,
    });
    expect(state.tasks).toHaveLength(2);
  });

  test("closes only the selected lens tab and selects its neighbor", () => {
    const state = {
      ...createState(),
      activeSurface: { kind: "lens" as const, lensSessionId: "lens-a" },
    };
    const next = reduceCloseLensTab({
      state,
      lensSessionId: "lens-a",
      nextSnapshotVersion: 5,
    });

    expect(next).toMatchObject({
      activeSurface: { kind: "lens", lensSessionId: "lens-b" },
      lensTabs: [{ id: "lens-b", createdAt: 2 }],
      paneTabMeta: { "task:task-1": { pinned: true } },
    });
  });

  test("uses the shared default session for the first Lens tab", () => {
    expect(resolveCreatedLensSessionId([], "generated-id")).toBe("default");
    expect(
      resolveCreatedLensSessionId(
        [{ id: "default", createdAt: 1 }],
        "generated-id",
      ),
    ).toBe("generated-id");
  });

  test("adopts an existing Lens session without duplicating its tab", () => {
    const state = createState();
    const next = reduceOpenLensTab({
      state,
      lensSessionId: "lens-a",
      createdAt: 10,
      nextSnapshotVersion: 5,
    });

    expect(next).toMatchObject({
      activeSurface: { kind: "lens", lensSessionId: "lens-a" },
      lensTabs: state.lensTabs,
      workspaceSnapshotVersion: 5,
    });
  });

  test("keeps identity for an already-active pane", () => {
    const state = createState();

    expect(
      reduceActiveSurfaceFromPane({
        state,
        surface: state.activeSurface,
        nextSnapshotVersion: 5,
      }),
    ).toBe(state);
  });

  test("removes tab metadata when all overrides are cleared", () => {
    const state = createState();
    const next = reducePaneTabMeta({
      state,
      panelId: "task:task-1",
      meta: { pinned: false },
      nextSnapshotVersion: 5,
    });

    expect(next).toMatchObject({
      paneTabMeta: { "lens:lens-a": { customTitle: "Preview A" } },
      workspaceSnapshotVersion: 5,
    });
  });
});
