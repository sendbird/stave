import type { Page } from "@playwright/test";

/** 2,000 tasks across 40 workspaces and eight repository boundaries. */
export async function seedFleetScale(page: Page) {
  await page.addInitScript(() => {
    const updatedAt = new Date().toISOString();
    const rows = Array.from({ length: 40 }, (_, workspaceIndex) => {
      const tasks = Array.from({ length: 50 }, (_, taskIndex) => ({
        id: `scale-${String(workspaceIndex * 50 + taskIndex).padStart(4, "0")}`,
        title: `Scale task ${String(workspaceIndex * 50 + taskIndex).padStart(4, "0")}`,
        provider: "codex", updatedAt, unread: false, archivedAt: null,
        controlMode: "interactive", controlOwner: "stave",
      }));
      return {
        id: `scale-workspace-${workspaceIndex}`, name: `Workspace ${workspaceIndex}`, updatedAt,
        snapshot: { activeTaskId: tasks[0]!.id, tasks, messagesByTask: {}, openTaskTabIds: tasks.map(task => task.id) },
      };
    });
    const repositories = Array.from({ length: 8 }, (_, index) => {
      const workspaces = rows.slice([0, 1, 7, 13, 19, 25, 30, 35][index], [1, 7, 13, 19, 25, 30, 35, 40][index]).map(({ snapshot: _, ...workspace }) => workspace);
      return {
        repositoryPath: `/tmp/fleet-scale/repository-${index}`, repositoryName: `Repository ${index}`,
        lastOpenedAt: updatedAt, defaultBranch: "main", workspaces, activeWorkspaceId: workspaces[0]!.id,
        workspacePathById: Object.fromEntries(workspaces.map((workspace, workspaceIndex) => [workspace.id, workspaceIndex === 0 ? `/tmp/fleet-scale/repository-${index}` : `/tmp/fleet-scale/repository-${index}/workspace-${workspaceIndex}`])),
        workspaceDefaultById: { [workspaces[0]!.id]: true }, workspaceBranchById: {},
      };
    });
    localStorage.setItem("stave:workspace-fallback:v1", JSON.stringify(rows));
    const fixtureState = {
      ...rows[0]!.snapshot, ...repositories[0], recentRepositories: repositories,
      settings: { fleetBoardLayout: "table" },
    };
    localStorage.setItem("stave-store", JSON.stringify({ state: fixtureState, version: 0 }));
    (window as unknown as { api: unknown }).api = {
      provider: { streamTurn: async () => [] },
      terminal: { runCommand: async () => ({ ok: true, code: 0, stdout: "", stderr: "" }) },
      sourceControl: {
        getStatus: async () => ({ ok: true, branch: "main", items: [], hasConflicts: false, stderr: "" }),
        getHistory: async () => ({ ok: true, items: [], stderr: "" }),
      },
    };
  });
  await page.goto("/");
  await page.getByTestId("top-bar").waitFor();
}
