import { describe, expect, test } from "bun:test";
import {
  assignAppShortcutKey,
  normalizeAppShortcutKeys,
} from "@/lib/app-shortcuts";
import {
  buildCommandPaletteGroups,
  recordRecentCommandPaletteAction,
  registerCommandPaletteContributor,
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
      editorVisible: true,
      sidebarOverlayTab: "explorer",
      sidebarOverlayVisible: false,
      terminalDocked: false,
      workspaceSidebarCollapsed: false,
      zenMode: false,
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
      openStaveMuse: () => {},
      openLatestCompletedTurnTask: async () => {},
      openInGhostty: async () => {},
      openInTerminal: async () => {},
      openInVSCode: async () => {},
      openKeyboardShortcuts: () => {},
      openProject: async () => {},
      openSettings: () => {},
      refreshProjectFiles: async () => {},
      refreshWorkspaces: async () => {},
      revealInFileManager: async () => {},
      saveActiveEditor: async () => {},
      selectTask: () => {},
      setTaskProvider: () => {},
      showOverlayTab: () => {},
      stopActiveTurn: () => {},
      switchWorkspace: async () => {},
      toggleChangesPanel: () => {},
      toggleEditor: () => {},
      toggleInformationPanel: () => {},
      toggleTerminal: () => {},
      toggleZenMode: () => {},
      toggleWorkspaceSidebar: () => {},
    },
    ...overrides,
  };
}

describe("command palette registry", () => {
  test("builds grouped core and dynamic actions", () => {
    const groups = buildCommandPaletteGroups(createContext());
    const navigation = groups.find((group) => group.key === "navigation");
    const task = groups.find((group) => group.key === "task");
    const provider = groups.find((group) => group.key === "provider");
    const view = groups.find((group) => group.key === "view");

    expect(
      navigation?.items.some(
        (item) => item.id === "navigation.quick-open-file",
      ),
    ).toBe(true);
    expect(
      navigation?.items.some(
        (item) => item.id === "navigation.home" && item.shortcut === "Cmd+K H",
      ),
    ).toBe(true);
    expect(
      navigation?.items.some(
        (item) =>
          item.id === "navigation.open-stave-muse" &&
          item.shortcut === "Cmd+K M",
      ),
    ).toBe(true);
    expect(
      navigation?.items.some(
        (item) => item.id === "navigation.latest-completed-turn-task",
      ),
    ).toBe(true);
    expect(
      navigation?.items.some((item) => item.id === "task.select.task-2"),
    ).toBe(true);
    expect(
      navigation?.items.some(
        (item) => item.id === "workspace.select.ws-feature",
      ),
    ).toBe(true);
    expect(task?.items.some((item) => item.id === "task.create-pr")).toBe(true);
    expect(
      task?.items.some((item) => item.id === "task.stop-active-turn"),
    ).toBe(true);
    expect(
      provider?.items.some((item) => item.id === "provider.set.codex"),
    ).toBe(true);
    expect(
      view?.items.some((item) => item.id === "view.show-information"),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.show-explorer" && item.shortcut === "Cmd+K E",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.search-in-files" && item.shortcut === "Cmd+Shift+F",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.toggle-workspace-sidebar" &&
          item.shortcut === "Cmd+K B",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.toggle-changes-panel" &&
          item.shortcut === "Cmd+K C",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.show-information" && item.shortcut === "Cmd+K I",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.toggle-editor" && item.shortcut === "Cmd+K \\",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.toggle-terminal" && item.shortcut === "Cmd+K `",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.show-scripts" && item.shortcut === "Cmd+K S",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) => item.id === "view.show-lens" && item.shortcut === "Cmd+K L",
      ),
    ).toBe(true);
    expect(
      view?.items.some(
        (item) =>
          item.id === "view.toggle-zen-mode" && item.shortcut === "Cmd+K Z",
      ),
    ).toBe(true);
  });

  test("switches zen-mode command label when zen mode is active", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        layout: {
          editorVisible: true,
          sidebarOverlayTab: "explorer",
          sidebarOverlayVisible: false,
          terminalDocked: false,
          workspaceSidebarCollapsed: false,
          zenMode: true,
        },
      }),
    );
    const view = groups.find((group) => group.key === "view");
    const zenModeAction = view?.items.find(
      (item) => item.id === "view.toggle-zen-mode",
    );

    expect(zenModeAction?.title).toBe("Exit Zen Mode");
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
    const task = groups.find((group) => group.key === "task");

    expect(
      task?.items.some((item) => item.id === "task.continue-workspace"),
    ).toBe(true);
    expect(task?.items.some((item) => item.id === "task.create-pr")).toBe(
      false,
    );
  });

  test("applies pinned, hidden, and recent preferences in presentation order", () => {
    const groups = buildCommandPaletteGroups(
      createContext({
        preferences: {
          hiddenIds: ["workspace.refresh-workspaces"],
          pinnedIds: ["settings.open.command-palette"],
          recentIds: ["task.save-file", "settings.open.command-palette"],
          showRecent: true,
        },
      }),
    );

    expect(groups[0]?.key).toBe("pinned");
    expect(groups[0]?.items.map((item) => item.id)).toEqual([
      "settings.open.command-palette",
    ]);
    expect(groups[1]?.key).toBe("recent");
    expect(groups[1]?.items.map((item) => item.id)).toEqual(["task.save-file"]);
    expect(
      groups.some((group) =>
        group.items.some((item) => item.id === "workspace.refresh-workspaces"),
      ),
    ).toBe(false);
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
