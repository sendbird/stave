import { afterEach, describe, expect, test } from "bun:test";
import { applyAppLocale } from "@/i18n";
import {
  buildCommandPaletteLeaves,
  MAX_COMMAND_PALETTE_LEAF_SUGGESTIONS,
  rankCommandPaletteLeaves,
  startTaskInRepository,
  type CommandPaletteLocation,
  type CommandPaletteLeafSources,
} from "@/components/layout/command-palette-leaves";
import {
  listCommandPaletteActions,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";
import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { searchTasks, type TaskSearchSource } from "../electron/persistence/task-search";

afterEach(() => applyAppLocale("en"));

function sources(calls: string[] = []): CommandPaletteLeafSources {
  return {
    themes: [
      { id: "dracula", name: "Dracula", baseMode: "dark" },
      { id: "dark-high-contrast", name: "Dark High Contrast", baseMode: "dark" },
      { id: "nord-snow", name: "Nord Snow", baseMode: "light" },
      { id: "nord-polar", name: "Nord Polar", baseMode: "dark" },
      { id: "nordic", name: "Nordic", baseMode: "dark" },
      { id: "github-light", name: "GitHub Light Default", baseMode: "light" },
    ],
    activeThemeId: null,
    appearanceMode: "dark",
    repositories: [
      { isCurrent: true, repositoryName: "stave", repositoryPath: "/repos/stave" },
      { isCurrent: false, repositoryName: "docs", repositoryPath: "/repos/docs" },
    ],
    actions: {
      applyTheme: (id) => void calls.push(`theme:${id}`),
      setAppearanceMode: (mode) => void calls.push(`mode:${mode}`),
      newTaskInRepository: (repository) => void calls.push(`task:${repository.repositoryPath}`),
    },
  };
}

describe("command palette leaves", () => {
  test("offer themes, appearance modes and a new task per repository", () => {
    const calls: string[] = [];
    const leaves = buildCommandPaletteLeaves(sources(calls));
    const titles = leaves.map((leaf) => leaf.title);
    expect(titles).toContain("Theme: Dracula");
    expect(titles).toContain("Appearance: Dark");
    expect(titles).toContain("New task in docs");
    // The mode in use is marked; leaves cannot be pinned.
    expect(leaves.find((leaf) => leaf.id === "leaf.appearance.dark")?.subtitle).toBe("Current");
    expect(leaves.every((leaf) => leaf.customizable === false)).toBe(true);

    for (const id of ["leaf.theme.dracula", "leaf.appearance.light", "leaf.new-task./repos/docs"]) {
      void leaves.find((leaf) => leaf.id === id)!.run();
    }
    expect(calls).toEqual(["theme:dracula", "mode:light", "task:/repos/docs"]);
  });

  test("stay out of an empty query", () => {
    const leaves = buildCommandPaletteLeaves(sources());
    expect(rankCommandPaletteLeaves({ leaves, query: "" })).toEqual([]);
    expect(rankCommandPaletteLeaves({ leaves, query: "   " })).toEqual([]);
  });

  test("an exact name ranks first and at most three are suggested", () => {
    const leaves = buildCommandPaletteLeaves(sources());
    const nord = rankCommandPaletteLeaves({ leaves, query: "nordic" });
    expect(nord[0]?.title).toBe("Theme: Nordic");

    const dark = rankCommandPaletteLeaves({ leaves, query: "Dark" });
    expect(dark).toHaveLength(MAX_COMMAND_PALETTE_LEAF_SUGGESTIONS);
    // "Dark" is the appearance mode's own name, ahead of every dark theme.
    expect(dark[0]?.id).toBe("leaf.appearance.dark");

    expect(rankCommandPaletteLeaves({ leaves, query: "nord" }).length).toBeLessThanOrEqual(3);
    expect(rankCommandPaletteLeaves({ leaves, query: "docs" })[0]?.id).toBe("leaf.new-task./repos/docs");
    expect(rankCommandPaletteLeaves({ leaves, query: "zzzz" })).toEqual([]);
    // Scattered letters ("g-u-i-d-e" across "GitHub Light Default") are not a match.
    expect(rankCommandPaletteLeaves({ leaves, query: "guide" })).toEqual([]);
  });

  test("names follow the app language", () => {
    applyAppLocale("ko");
    const titles = buildCommandPaletteLeaves(sources()).map((leaf) => leaf.title);
    expect(titles).toContain("테마: Dracula");
    expect(titles).toContain("모양: 다크");
    expect(titles).toContain("docs에서 새 작업");
  });
});

describe("new task in a repository", () => {
  const A = { isCurrent: true, repositoryName: "a", repositoryPath: "/repos/a" };
  const B = { isCurrent: false, repositoryName: "b", repositoryPath: "/repos/b" };

  /** A fake app: opening a repository resolves when the test says so. */
  function fakeApp() {
    const location: CommandPaletteLocation = { repositoryPath: "/repos/a", activeWorkspaceId: "a-main", workspaceIds: ["a-main", "a-c"] };
    const created: string[] = [];
    const pendingOpens: Array<() => void> = [];
    return {
      location,
      created,
      finishOpen: () => pendingOpens.shift()?.(),
      deps: {
        openRepository: (repositoryPath: string) =>
          new Promise<void>((resolve) => {
            pendingOpens.push(() => {
              Object.assign(location, { repositoryPath, activeWorkspaceId: `${repositoryPath}#main`, workspaceIds: [`${repositoryPath}#main`] });
              resolve();
            });
          }),
        createTask: () => void created.push(`${location.repositoryPath}:${location.activeWorkspaceId}`),
        readLocation: () => ({ ...location }),
      },
    };
  }

  test("the open repository starts the task at once", async () => {
    const app = fakeApp();
    expect(await startTaskInRepository({ repository: A, ...app.deps })).toBe("created");
    expect(app.created).toEqual(["/repos/a:a-main"]);
  });

  test("another repository opens first, then the task starts there", async () => {
    const app = fakeApp();
    const result = startTaskInRepository({ repository: B, ...app.deps });
    app.finishOpen();
    expect(await result).toBe("created");
    expect(app.created).toEqual(["/repos/b:/repos/b#main"]);
  });

  test("going to another workspace while the repository opens creates nothing", async () => {
    const app = fakeApp();
    const result = startTaskInRepository({ repository: B, ...app.deps });
    app.finishOpen();
    // The person switched to workspace C in repository A before the open settled.
    Object.assign(app.location, { repositoryPath: "/repos/a", activeWorkspaceId: "a-c", workspaceIds: ["a-main", "a-c"] });
    expect(await result).toBe("moved");
    expect(app.created).toEqual([]);
  });

  test("an active workspace outside the opened repository creates nothing", async () => {
    const app = fakeApp();
    const result = startTaskInRepository({ repository: B, ...app.deps });
    app.finishOpen();
    Object.assign(app.location, { activeWorkspaceId: "a-c" });
    expect(await result).toBe("moved");
    expect(app.created).toEqual([]);
  });

  test("a newer request supersedes one still waiting for its repository", async () => {
    const app = fakeApp();
    const first = startTaskInRepository({ repository: B, ...app.deps });
    const second = startTaskInRepository({
      repository: { isCurrent: false, repositoryName: "d", repositoryPath: "/repos/d" },
      ...app.deps,
    });
    app.finishOpen();
    app.finishOpen();
    expect(await first).toBe("superseded");
    expect(await second).toBe("created");
    expect(app.created).toEqual(["/repos/d:/repos/d#main"]);
  });
});

describe("delegated tasks in task search", () => {
  test("the palette's task list gives a delegated child no entry of its own", () => {
    const context = {
      activeEditorTabId: null,
      activeTaskId: "child",
      activeWorkspaceIsDefault: true,
      activeWorkspacePrStatus: "no_pr",
      appShortcutKeys: normalizeAppShortcutKeys(),
      hasActiveTurn: false,
      layout: { sidebarOverlayTab: "explorer", sidebarOverlayVisible: false, workspaceSidebarCollapsed: false },
      modifierLabel: "Cmd",
      preferences: { hiddenIds: [], pinnedIds: [], recentIds: [], showRecent: false },
      repositoryPath: "/repos/stave",
      repositories: [],
      tasks: [
        { id: "parent", isActive: false, isResponding: false, provider: "codex", title: "Parent" },
        { id: "child", isActive: true, isResponding: false, provider: "codex", title: "Child", isDelegated: true },
      ],
      workspacePath: "/repos/stave",
      workspaces: [],
      commands: new Proxy({}, { get: () => () => undefined }),
    } as unknown as CommandPaletteRuntimeContext;
    const ids = listCommandPaletteActions(context).map((action) => action.id);
    expect(ids).toContain("task.select.parent");
    expect(ids).not.toContain("task.select.child");
  });

  test("search across repositories leaves delegated children out", () => {
    const source: TaskSearchSource = {
      loadRepositoryRegistry: () => [
        {
          repositoryPath: "/repos/stave",
          repositoryName: "stave",
          lastOpenedAt: "2026-10-01T00:00:00.000Z",
          defaultBranch: "main",
          workspaces: [{ id: "ws", name: "Default Workspace", updatedAt: "2026-10-01T00:00:00.000Z" }],
          activeWorkspaceId: "ws",
          workspaceBranchById: { ws: "main" },
          workspacePathById: { ws: "/repos/stave" },
          workspaceDefaultById: { ws: true },
        },
      ],
      listWorkspaceTasks: () => [
        { id: "parent", title: "Fix login", provider: "codex", updatedAt: "2026-10-20T00:00:00.000Z", unread: false, archivedAt: null },
        { id: "child", title: "Fix login tests", provider: "codex", updatedAt: "2026-10-21T00:00:00.000Z", unread: false, archivedAt: null, parentTaskId: "parent" },
      ],
      listTurns: () => [],
    };
    expect(searchTasks(source, { query: "login" }).map((result) => result.taskId)).toEqual(["parent"]);
    expect(searchTasks(source, { query: "" }).map((result) => result.taskId)).toEqual(["parent"]);
  });
});
