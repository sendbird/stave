import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  canNavigateSurfaceHistory,
  navigateSurfaceHistory,
  readSurfaceHistory,
  resetSurfaceHistory,
  startSurfaceHistoryTracking,
} from "@/components/panes/surface-history-runtime";
import { getBackAppSurfaceKind } from "@/lib/panes/surface-history";
import { runSurfaceTransition } from "@/lib/panes/surface-transition";
import { useAppStore } from "@/store/app.store";
import { WORKSPACE_APP_SURFACE } from "@/store/app-surface";

const TASK = (id: string) => ({
  id,
  title: id,
  provider: "codex" as const,
  updatedAt: "2026-11-01T00:00:00.000Z",
  unread: false,
});

let original: ReturnType<typeof useAppStore.getState>;
let stop: () => void = () => {};

function showTask(taskId: string) {
  useAppStore.setState({
    activeAppSurface: WORKSPACE_APP_SURFACE,
    activeTaskId: taskId,
    activeSurface: { kind: "task", taskId },
  });
}

const surfaceKind = () => useAppStore.getState().activeAppSurface.kind;

beforeEach(() => {
  original = useAppStore.getState();
  resetSurfaceHistory();
  useAppStore.setState({
    // The real actions, whatever an earlier test file left stubbed.
    ...useAppStore.getInitialState(),
    repositoryPath: "/tmp/repo",
    activeWorkspaceId: "ws",
    workspaces: [{ id: "ws", name: "ws", updatedAt: "2026-11-01T00:00:00.000Z" }],
    tasks: [TASK("a"), TASK("b")],
    activeTaskId: "a",
    activeSurface: { kind: "task", taskId: "a" },
    activeAppSurface: WORKSPACE_APP_SURFACE,
  });
  stop = startSurfaceHistoryTracking();
});

afterEach(() => {
  stop();
  resetSurfaceHistory();
  useAppStore.setState(original, true);
});

describe("surface history runtime: global views", () => {
  test("closing a view opened from another view returns to it, then to the workspace", async () => {
    useAppStore.getState().openFleetView();
    useAppStore.getState().openAgentPerformance();
    expect(surfaceKind()).toBe("agents");

    useAppStore.getState().closeAgents();
    expect(surfaceKind()).toBe("fleet-view");

    useAppStore.getState().closeFleetView();
    // Going back to a workspace place awaits the workspace switch.
    await Promise.resolve();
    expect(surfaceKind()).toBe("workspace");
    expect(useAppStore.getState().activeWorkspaceId).toBe("ws");
  });

  test("Back from a task opened in Fleet returns to Fleet, Forward to the task", async () => {
    useAppStore.getState().openFleetView();
    showTask("b");
    expect(getBackAppSurfaceKind(readSurfaceHistory())).toBe("fleet-view");

    expect(await navigateSurfaceHistory("back")).toBe(true);
    expect(surfaceKind()).toBe("fleet-view");
    expect(canNavigateSurfaceHistory("forward")).toBe(true);

    expect(await navigateSurfaceHistory("forward")).toBe(true);
    expect(surfaceKind()).toBe("workspace");
  });

  test("toggling a view closed goes back the same way", () => {
    useAppStore.getState().openIssues();
    useAppStore.getState().toggleAgents();
    useAppStore.getState().toggleAgents();
    expect(surfaceKind()).toBe("issues");
  });

  test("with nowhere to go back to, closing falls back to the workspace", () => {
    stop();
    resetSurfaceHistory();
    useAppStore.setState({ activeWorkspaceId: "", activeAppSurface: WORKSPACE_APP_SURFACE });
    stop = startSurfaceHistoryTracking();
    useAppStore.getState().openFleetView();
    expect(canNavigateSurfaceHistory("back")).toBe(false);
    useAppStore.getState().closeFleetView();
    expect(surfaceKind()).toBe("workspace");
  });

  test("leaving for the workspace does not go back", () => {
    useAppStore.getState().openFleetView();
    useAppStore.getState().openAutomationCenter();
    useAppStore.getState().exitToWorkspace("automation-center");
    expect(surfaceKind()).toBe("workspace");
  });

  test("a multi-step switch records only where it lands", async () => {
    useAppStore.getState().openFleetView();
    await runSurfaceTransition(async () => {
      // A workspace switch shows the workspace's last tab before the task.
      showTask("a");
      await Promise.resolve();
      showTask("b");
    });
    const history = readSurfaceHistory();
    expect(history.entries.at(-1)).toEqual({
      repositoryPath: "/tmp/repo",
      workspaceId: "ws",
      surface: { kind: "task", taskId: "b" },
    });
    expect(getBackAppSurfaceKind(history)).toBe("fleet-view");
  });
});
