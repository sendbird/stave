import { describe, expect, test } from "bun:test";
import { Rocket } from "lucide-react";
import {
  assignAppShortcutKey,
  normalizeAppShortcutKeys,
} from "@/lib/app-shortcuts";
import {
  buildCommandPaletteGroups,
  listCommandPaletteActions,
  recordRecentCommandPaletteAction,
  registerCommandPaletteContributor,
  searchCommandPaletteGroups,
  toggleCommandPalettePinnedAction,
  type CommandPaletteRuntimeContext,
} from "@/components/layout/command-palette-registry";

function createContext(
  overrides: Partial<CommandPaletteRuntimeContext> = {},
): CommandPaletteRuntimeContext {
  return {
    activeEditorTabId: "editor-1",
    activeTaskId: "task-1",
    activeWorkspaceBranch: "feature/command-palette",
    activeWorkspaceIsDefault: false,
    activeWorkspacePrStatus: "no_pr",
    appShortcutKeys: normalizeAppShortcutKeys(),
    hasActiveTurn: true,
    layout: {
      sidebarOverlayTab: "explorer",
      sidebarOverlayVisible: false,
      workspaceSidebarCollapsed: false,
    },
    modifierLabel: "Cmd",
    preferences: {
      hiddenIds: [],
      pinnedIds: [],
      recentIds: [],
      showRecent: true,
    },
    projectPath: "/tmp/stave",
    projects: [
      {
        isCurrent: true,
        projectName: "Stave",
        projectPath: "/tmp/stave",
      },
    ],
    tasks: [
      {
        id: "task-1",
        isActive: true,
        isResponding: true,
        provider: "codex",
        title: "Implement command palette",
      },
      {
        id: "task-2",
        isActive: false,
        isResponding: false,
        provider: "claude-code",
        title: "Review shell shortcuts",
      },
    ],
    workspacePath: "/tmp/stave/.stave/workspaces/main",
    workspaces: [
      {
        id: "ws-main",
        isActive: true,
        isDefault: true,
        name: "Default Workspace",
        branch: "main",
        path: "/tmp/stave/.stave/workspaces/main",
      },
      {
        id: "ws-feature",
        isActive: false,
        isDefault: false,
        name: "feature/command-palette",
        branch: "feature/command-palette",
        path: "/tmp/stave/.stave/workspaces/feature-command-palette",
      },
    ],
    commands: {
      clearTaskSelection: () => {},
      createPullRequest: () => {},
      createTask: () => {},
      continueWorkspace: () => {},
      focusFileSearch: () => {},
      openExplorerSearch: () => {},
      openLatestCompletedTurnTask: async () => {},
      openLens: () => {},
      openGitGraph: () => {},
      openKickoff: () => {},
      openInGhostty: async () => {},
      openInTerminal: async () => {},
      openInVSCode: async () => {},
      openFleetView: () => {},
      openKeyboardShortcuts: () => {},
      openProject: async () => {},
      openSettings: () => {},
      refreshProjectFiles: async () => {},
      refreshWorkspaces: async () => {},
      revealInFileManager: async () => {},
      saveActiveEditor: async () => {},
      selectTask: () => {},
      setTaskProvider: () => {},
      startCompareRun: () => {},
      splitActivePanel: () => {},
      showOverlayTab: () => {},
      stopActiveTurn: () => {},
      switchWorkspace: async () => {},
      toggleChangesPanel: () => {},
      toggleEditor: () => {},
      toggleInformationPanel: () => {},
      toggleTerminal: () => {},
      toggleWorkspaceSidebar: () => {},
    },
    ...overrides,
  };
}

describe("command palette registry", () => {
  test("builds grouped core and dynamic actions", () => {
    const groups = buildCommandPaletteGroups(createContext());
    const actions = groups.flatMap((group) => group.items);

    expect(
      actions.some((item) => item.id === "navigation.quick-open-file"),
    ).toBe(true);
    expect(
      actions.some(
        (item) => item.id === "navigation.home" && item.shortcut === "Cmd+K H",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) => item.id === "navigation.latest-completed-turn-task",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "navigation.fleet-view" && item.shortcut === "Cmd+K F",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.open-git-graph" &&
          item.title === "Open commit graph",
      ),
    ).toBe(true);
    expect(actions.some((item) => item.id === "task.select.task-2")).toBe(true);
    expect(
      actions.some((item) => item.id === "workspace.select.ws-feature"),
    ).toBe(true);
    expect(actions.some((item) => item.id === "task.create-pr")).toBe(true);
    expect(actions.some((item) => item.id === "task.stop-active-turn")).toBe(
      true,
    );
    expect(actions.some((item) => item.id === "task.compare-providers")).toBe(
      true,
    );
    expect(actions.find((item) => item.id === "workspace.kickoff")?.icon).toBe(
      Rocket,
    );
    expect(actions.find((item) => item.id === "view.show-scripts")?.title).toBe(
      "Show Workspace Tools",
    );
    expect(actions.some((item) => item.id === "provider.set.codex")).toBe(true);
    expect(actions.some((item) => item.id === "view.show-information")).toBe(
      true,
    );
    expect(
      actions.some(
        (item) =>
          item.id === "view.show-explorer" && item.shortcut === "Cmd+K E",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.search-in-files" && item.shortcut === "Cmd+Shift+F",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.toggle-workspace-sidebar" &&
          item.shortcut === "Cmd+K B",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.toggle-changes-panel" &&
          item.shortcut === "Cmd+K C",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.show-information" && item.shortcut === "Cmd+K I",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.toggle-editor" && item.shortcut === "Cmd+K \\",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.toggle-terminal" && item.shortcut === "Cmd+K `",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.show-scripts" && item.shortcut === "Cmd+K S",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) => item.id === "view.show-lens" && item.shortcut === "Cmd+K L",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.split-pane-right" && item.shortcut === "Cmd+\\",
      ),
    ).toBe(true);
    expect(
      actions.some(
        (item) =>
          item.id === "view.split-pane-down" &&
          item.shortcut === "Cmd+Shift+\\",
      ),
    ).toBe(true);
  });

  test("hides Commit graph without an active workspace", () => {
    const actions = listCommandPaletteActions(
      createContext({
        workspaces: createContext().workspaces.map((workspace) => ({
          ...workspace,
          isActive: false,
        })),
      }),
    );

    expect(actions.some((item) => item.id === "view.open-git-graph")).toBe(
      false,
    );
  });

  test("hides compare until a task is active", () => {
    const groups = buildCommandPaletteGroups(
      createContext({ activeTaskId: "" }),
    );
    const task = groups.find((group) => group.key === "task");

    expect(
      task?.items.some((item) => item.id === "task.compare-providers"),
    ).toBe(false);
  });

  test("uses customized shell chord labels for panel actions", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        appShortcutKeys: assignAppShortcutKey({
          actionId: "view.show-explorer",
          shortcutKeys: normalizeAppShortcutKeys(),
          nextKey: "x",
        }),
      }),
    );
    const view = groups.find((group) => group.key === "view");

    expect(
      view?.items.some(
        (item) =>
          item.id === "view.show-explorer" && item.shortcut === "Cmd+K X",
      ),
    ).toBe(true);
  });

  test("shows continue workspace only for completed PR branches", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        activeWorkspacePrStatus: "merged",
      }),
    );
    const actions = groups.flatMap((group) => group.items);

    expect(actions.some((item) => item.id === "task.continue-workspace")).toBe(
      true,
    );
    expect(actions.some((item) => item.id === "task.create-pr")).toBe(false);
  });

  test("hides workspace kickoff without a project", () => {
    const groups = buildCommandPaletteGroups(
      createContext({ projectPath: null }),
    );

    expect(
      groups.some((group) =>
        group.items.some((item) => item.id === "workspace.kickoff"),
      ),
    ).toBe(false);
  });

  test("applies pinned, hidden, and recent preferences in presentation order", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        activeEditorTabId: null,
        activeWorkspaceIsDefault: true,
        hasActiveTurn: false,
        preferences: {
          hiddenIds: ["workspace.refresh-workspaces"],
          pinnedIds: ["settings.open.command-palette"],
          recentIds: ["settings.open", "settings.open.command-palette"],
          showRecent: true,
        },
      }),
    );

    expect(groups[0]?.key).toBe("pinned");
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "settings.open.command-palette",
    ]);
    expect(groups[1]?.key).toBe("suggested");
    const recent = groups.find((group) => group.key === "recent");
    expect(recent?.items.map((item) => item.id)).toEqual(["settings.open"]);
    expect(
      groups.some((group) =>
        group.items.some((item) => item.id === "workspace.refresh-workspaces"),
      ),
    ).toBe(false);
  });

  test("ranks current work first without dropping or duplicating commands", () => {
    const context = createContext();
    const groups = buildCommandPaletteGroups(context);
    const suggested = groups.find((group) => group.key === "suggested");
    const presentedIds = groups.flatMap((group) =>
      group.items.map((item) => item.id),
    );
    const availableIds = listCommandPaletteActions(context).map(
      (action) => action.id,
    );

    expect(suggested?.items.slice(0, 3).map((item) => item.id)).toEqual([
      "task.stop-active-turn",
      "task.save-file",
      "task.create-pr",
    ]);
    expect(suggested?.items[0]?.contextLabel).toBe("Running now");
    expect(new Set(presentedIds).size).toBe(presentedIds.length);
    expect([...presentedIds].sort()).toEqual([...availableIds].sort());
  });

  test("uses recency to break equal contextual relevance", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        activeEditorTabId: null,
        activeWorkspaceIsDefault: true,
        hasActiveTurn: false,
        preferences: {
          hiddenIds: [],
          pinnedIds: [],
          recentIds: ["view.show-information", "task.compare-providers"],
          showRecent: true,
        },
      }),
    );
    const suggested = groups.find((group) => group.key === "suggested");
    const infoIndex =
      suggested?.items.findIndex(
        (item) => item.id === "view.show-information",
      ) ?? -1;
    const compareIndex =
      suggested?.items.findIndex(
        (item) => item.id === "task.compare-providers",
      ) ?? -1;

    expect(infoIndex).toBeGreaterThanOrEqual(0);
    expect(compareIndex).toBeGreaterThanOrEqual(0);
    expect(infoIndex).toBeLessThan(compareIndex);
  });

  test("searches and scores within the pinned-context-recent hierarchy", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        preferences: {
          hiddenIds: [],
          pinnedIds: ["settings.open"],
          recentIds: ["settings.open.providers"],
          showRecent: true,
        },
      }),
    );
    const results = searchCommandPaletteGroups({
      groups,
      query: "settings",
    });

    expect(results.map((group) => group.key)).toEqual([
      "pinned",
      "recent",
      "settings",
    ]);
    expect(results[0]?.items[0]?.id).toBe("settings.open");
    expect(results[1]?.items[0]?.id).toBe("settings.open.providers");

    expect(
      searchCommandPaletteGroups({ groups, query: "" })
        .flatMap((group) => group.items)
        .map((item) => item.id),
    ).toEqual(groups.flatMap((group) => group.items).map((item) => item.id));
  });

  test("pins newest commands first and restores hidden commands", () => {
    const pinned = toggleCommandPalettePinnedAction({
      commandId: "settings.open",
      hiddenIds: ["settings.open", "task.new"],
      pinnedIds: ["view.toggle-terminal"],
    });
    expect(pinned).toEqual({
      isPinned: true,
      hiddenIds: ["task.new"],
      pinnedIds: ["settings.open", "view.toggle-terminal"],
    });

    expect(
      toggleCommandPalettePinnedAction({
        commandId: "settings.open",
        hiddenIds: pinned.hiddenIds,
        pinnedIds: pinned.pinnedIds,
      }),
    ).toEqual({
      isPinned: false,
      hiddenIds: ["task.new"],
      pinnedIds: ["view.toggle-terminal"],
    });
  });

  test("records recent commands with de-dupe and size limit", () => {
    const recent = recordRecentCommandPaletteAction({
      commandId: "settings.open.command-palette",
      recentIds: [
        "task.save-file",
        "workspace.refresh-files",
        "task.new",
        "settings.open",
        "view.toggle-editor",
        "view.toggle-terminal",
        "provider.set.codex",
        "navigation.quick-open-file",
      ],
    });

    expect(recent).toEqual([
      "settings.open.command-palette",
      "task.save-file",
      "workspace.refresh-files",
      "task.new",
      "settings.open",
      "view.toggle-editor",
      "view.toggle-terminal",
      "provider.set.codex",
    ]);
  });

  test("registers and removes contributed commands", () => {
    const dispose = registerCommandPaletteContributor(() => [
      {
        id: "contrib.test",
        title: "Injected Test Command",
        group: "settings",
        run: () => {},
      },
    ]);

    try {
      const withContributor = buildCommandPaletteGroups(createContext());
      expect(
        withContributor.some((group) =>
          group.items.some((item) => item.id === "contrib.test"),
        ),
      ).toBe(true);
    } finally {
      dispose();
    }

    const withoutContributor = buildCommandPaletteGroups(createContext());
    expect(
      withoutContributor.some((group) =>
        group.items.some((item) => item.id === "contrib.test"),
      ),
    ).toBe(false);
  });
});
