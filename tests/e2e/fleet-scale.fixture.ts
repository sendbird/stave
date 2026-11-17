import { expect, type Page } from "@playwright/test";

export interface FleetScaleOptions {
  layout?: "table" | "tree" | "cards";
  workspaces?: number;
  tasksPerWorkspace?: number;
}

/** Repository boundaries of the default 40-workspace fixture (eight repositories). */
export const FLEET_SCALE_REPOSITORY_STARTS = [0, 1, 7, 13, 19, 25, 30, 35, 40];

/** 2,000 tasks across 40 workspaces and eight repository boundaries by default. */
export async function seedFleetScale(page: Page, options: FleetScaleOptions = {}) {
  await page.addInitScript(({ layout, workspaceCount, tasksPerWorkspace, defaultStarts }) => {
    const updatedAt = new Date().toISOString();
    const rows = Array.from({ length: workspaceCount }, (_, workspaceIndex) => {
      const tasks = Array.from({ length: tasksPerWorkspace }, (_, taskIndex) => ({
        id: `scale-${String(workspaceIndex * tasksPerWorkspace + taskIndex).padStart(4, "0")}`,
        title: `Scale task ${String(workspaceIndex * tasksPerWorkspace + taskIndex).padStart(4, "0")}`,
        provider: "codex", updatedAt, unread: false, archivedAt: null,
        controlMode: "interactive", controlOwner: "stave",
      }));
      return {
        id: `scale-workspace-${workspaceIndex}`, name: `Workspace ${workspaceIndex}`, updatedAt,
        snapshot: { activeTaskId: tasks[0]!.id, tasks, messagesByTask: {}, openTaskTabIds: tasks.map(task => task.id) },
      };
    });
    const starts = workspaceCount === 40 ? defaultStarts : [0, Math.ceil(workspaceCount / 2), workspaceCount];
    const repositories = starts.slice(0, -1).map((start, index) => {
      const workspaces = rows.slice(start, starts[index + 1]).map(({ snapshot: _, ...workspace }) => workspace);
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
      settings: { fleetBoardLayout: layout },
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
  }, {
    layout: options.layout ?? "table",
    workspaceCount: options.workspaces ?? 40,
    tasksPerWorkspace: options.tasksPerWorkspace ?? 50,
    defaultStarts: FLEET_SCALE_REPOSITORY_STARTS,
  });
  await page.goto("/");
  await page.getByTestId("top-bar").waitFor();
}

/** Opens Fleet and waits until a layout registers every logical selection target. */
export async function openFleetScope(page: Page, scope: "table" | "tree", count: number) {
  await page.getByTestId("top-bar").getByRole("button", { name: "Open Fleet View" }).click();
  if (scope === "tree") {
    await page.getByRole("radiogroup", { name: "Board layout" }).getByRole("radio", { name: "Tree" }).click();
  }
  await expect.poll(() => fleetTargetKeys(page, scope).then((keys) => keys.length)).toBe(count);
}

export function fleetTargetKeys(page: Page, scope: string) {
  return page.evaluate(async (scope) => {
    const { useFleetSelectionStore } = await import("/src/store/fleet-selection-store.ts");
    return (useFleetSelectionStore.getState().scopes.get(scope) ?? []).map((target) => target.key);
  }, scope);
}

/** The logical selection key of the element that has focus, or a tag name when it is not a row. */
export function focusedFleetKey(page: Page) {
  return page.evaluate(() => {
    const active = document.activeElement;
    return active?.closest<HTMLElement>("[data-fleet-select-key]")?.dataset.fleetSelectKey ?? active?.tagName ?? null;
  });
}

export function nextFrames(page: Page, count = 2) {
  return page.evaluate((count) => new Promise<void>((resolve) => {
    let left = count;
    const tick = () => (--left <= 0 ? resolve() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  }), count);
}
