import {
  Bot,
  Command as CommandIcon,
  Focus,
  FolderOpen,
  GitBranch,
  GitPullRequest,
  Globe,
  Home,
  History,
  Keyboard,
  Layers3,
  LibraryBig,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Save,
  Search,
  Settings,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  formatAppShortcutLabel,
  hasAppShortcutCommandId,
  type AppShortcutKeys,
} from "@/lib/app-shortcuts";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type { WorkspacePrStatus } from "@/lib/pr-status";

export type CommandPaletteGroup =
  | "navigation"
  | "view"
  | "task"
  | "provider"
  | "settings"
  | "external";

export const COMMAND_PALETTE_GROUP_LABELS: Record<
  CommandPaletteGroup | "pinned" | "recent",
  string
> = {
  pinned: "Pinned",
  recent: "Recent",
  navigation: "Navigation",
  view: "View",
  task: "Task",
  provider: "Provider",
  settings: "Settings",
  external: "External",
};

const COMMAND_PALETTE_GROUP_ORDER: CommandPaletteGroup[] = [
  "navigation",
  "view",
  "task",
  "provider",
  "settings",
  "external",
];

const MAX_RECENT_COMMAND_IDS = 8;

export interface CommandPalettePreferences {
  hiddenIds: string[];
  pinnedIds: string[];
  recentIds: string[];
  showRecent: boolean;
}

export interface CommandPaletteTaskSummary {
  id: string;
  isActive: boolean;
  isResponding: boolean;
  provider: ProviderId;
  title: string;
}

export interface CommandPaletteWorkspaceSummary {
  id: string;
  isActive: boolean;
  isDefault: boolean;
  name: string;
  branch?: string;
  path?: string;
}

export interface CommandPaletteProjectSummary {
  isCurrent: boolean;
  projectName: string;
  projectPath: string;
}

export interface CommandPaletteLayoutState {
  editorVisible: boolean;
  sidebarOverlayTab:
    | "explorer"
    | "changes"
    | "information"
    | "skills"
    | "scripts"
    | "lens";
  sidebarOverlayVisible: boolean;
  terminalDocked: boolean;
  workspaceSidebarCollapsed: boolean;
  zenMode: boolean;
}

export interface CommandPaletteCommandHandlers {
  clearTaskSelection: () => void;
  createPullRequest: () => Promise<void> | void;
  createTask: () => void;
  continueWorkspace: () => Promise<void> | void;
  focusFileSearch: () => void;
  openExplorerSearch: () => void;
  openStaveMuse: () => void;
  openLatestCompletedTurnTask: () => Promise<void> | void;
  openInTerminal: (path: string) => Promise<void> | void;
  openInGhostty: (path: string) => Promise<void> | void;
  openInVSCode: (path: string) => Promise<void> | void;
  openKeyboardShortcuts: () => void;
  openProject: (projectPath: string) => Promise<void> | void;
  openSettings: (options?: {
    projectPath?: string | null;
    section?: SectionId;
  }) => void;
  refreshProjectFiles: () => Promise<void> | void;
  refreshWorkspaces: () => Promise<void> | void;
  revealInFileManager: (path: string) => Promise<void> | void;
  saveActiveEditor: () => Promise<void> | void;
  selectTask: (taskId: string) => void;
  setTaskProvider: (taskId: string, provider: ProviderId) => void;
  showOverlayTab: (tab: CommandPaletteLayoutState["sidebarOverlayTab"]) => void;
  stopActiveTurn: () => void;
  switchWorkspace: (workspaceId: string) => Promise<void> | void;
  toggleChangesPanel: () => void;
  toggleEditor: () => void;
  toggleInformationPanel: () => void;
  toggleTerminal: () => void;
  toggleZenMode: () => void;
  toggleWorkspaceSidebar: () => void;
}

export interface CommandPaletteRuntimeContext {
  activeEditorTabId: string | null;
  activeTaskId: string;
  activeWorkspaceBranch?: string;
  activeWorkspaceIsDefault: boolean;
  activeWorkspacePrStatus: WorkspacePrStatus;
  appShortcutKeys: AppShortcutKeys;
  hasActiveTurn: boolean;
  layout: CommandPaletteLayoutState;
  modifierLabel: "Cmd" | "Ctrl";
  preferences: CommandPalettePreferences;
  projectPath: string | null;
  projects: CommandPaletteProjectSummary[];
  tasks: CommandPaletteTaskSummary[];
  workspacePath: string | null;
  workspaces: CommandPaletteWorkspaceSummary[];
  commands: CommandPaletteCommandHandlers;
}

export interface CommandPaletteAction {
  id: string;
  title: string;
  group: CommandPaletteGroup;
  run: () => Promise<void> | void;
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  source?: "core" | "dynamic" | "contributed";
  subtitle?: string;
  customizable?: boolean;
}

export interface CommandPaletteGroupSection {
  key: CommandPaletteGroup | "pinned" | "recent";
  title: string;
  items: CommandPaletteAction[];
}

interface CommandPaletteCoreCommandDefinition {
  id: string;
  title: string;
  description: string;
  group: CommandPaletteGroup;
  build: (args: CommandPaletteRuntimeContext) => CommandPaletteAction | null;
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?:
    | string
    | ((
        modifierLabel: CommandPaletteRuntimeContext["modifierLabel"],
      ) => string);
}

export interface CommandPaletteCommandMetadata {
  id: string;
  title: string;
  description: string;
  group: CommandPaletteGroup;
  keywords: string[];
  shortcut?: string;
}

export type CommandPaletteContributor = (
  args: CommandPaletteRuntimeContext,
) => CommandPaletteAction[];

const commandPaletteContributors = new Set<CommandPaletteContributor>();

function formatShortcut(args: {
  commandId: string;
  shortcut: CommandPaletteCoreCommandDefinition["shortcut"];
  modifierLabel: CommandPaletteRuntimeContext["modifierLabel"] | "Cmd/Ctrl";
  appShortcutKeys?: AppShortcutKeys;
}) {
  if (hasAppShortcutCommandId(args.commandId)) {
    return formatAppShortcutLabel({
      actionId: args.commandId,
      modifierLabel: args.modifierLabel,
      shortcutKeys: args.appShortcutKeys,
    });
  }

  const { shortcut, modifierLabel } = args;
  if (!shortcut) {
    return undefined;
  }
  return typeof shortcut === "function"
    ? shortcut(modifierLabel as CommandPaletteRuntimeContext["modifierLabel"])
    : shortcut;
}

function formatTaskTitle(title: string) {
  return title.trim() || "Untitled task";
}

function formatWorkspaceTitle(args: { isDefault: boolean; name: string }) {
  if (args.isDefault) {
    return "Default workspace";
  }
  return args.name.trim() || "Workspace";
}

const coreCommandDefinitions: CommandPaletteCoreCommandDefinition[] = [
  {
    id: "navigation.quick-open-file",
    title: "Quick Open File",
    description: "Focus the workspace file search in the top bar.",
    group: "navigation",
    icon: Search,
    keywords: ["file", "quick open", "go to file", "search"],
    shortcut: (modifierLabel) => `${modifierLabel}+P`,
    build: (args) =>
      args.projectPath
        ? {
            id: "navigation.quick-open-file",
            title: "Quick Open File",
            subtitle: "Focus the top-bar file search.",
            group: "navigation",
            icon: Search,
            keywords: ["file", "quick open", "go to file", "search"],
            shortcut: `${args.modifierLabel}+P`,
            run: args.commands.focusFileSearch,
            source: "core",
          }
        : null,
  },
  {
    id: "navigation.home",
    title: "Go Home",
    description: "Clear the active task selection and return to the home view.",
    group: "navigation",
    icon: Home,
    keywords: ["home", "dashboard", "clear task selection"],
    shortcut: (modifierLabel) => `${modifierLabel}+K H`,
    build: (args) => ({
      id: "navigation.home",
      title: "Go Home",
      subtitle: "Return to the project overview.",
      group: "navigation",
      icon: Home,
      keywords: ["home", "dashboard", "clear task selection"],
      shortcut: `${args.modifierLabel}+K H`,
      run: args.commands.clearTaskSelection,
      source: "core",
    }),
  },
  {
    id: "navigation.open-stave-muse",
    title: "Open Stave Muse",
    description: "Open the global Stave Muse widget.",
    group: "navigation",
    icon: Sparkles,
    keywords: ["muse", "assistant", "operator", "global chat", "widget"],
    shortcut: (modifierLabel) => `${modifierLabel}+K M`,
    build: (args) => ({
      id: "navigation.open-stave-muse",
      title: "Open Stave Muse",
      subtitle: "Open the global control-plane Muse.",
      group: "navigation",
      icon: Sparkles,
      keywords: ["muse", "assistant", "operator", "global chat", "widget"],
      shortcut: `${args.modifierLabel}+K M`,
      run: args.commands.openStaveMuse,
      source: "core",
    }),
  },
  {
    id: "navigation.latest-completed-turn-task",
    title: "Go to Latest Completed Turn Task",
    description:
      "Jump to the task with the most recently completed turn across workspaces.",
    group: "navigation",
    icon: History,
    keywords: [
      "latest completed turn",
      "recent task",
      "last completed",
      "recent turn",
    ],
    build: (args) => ({
      id: "navigation.latest-completed-turn-task",
      title: "Go to Latest Completed Turn Task",
      subtitle: "Jump to the newest completed task run.",
      group: "navigation",
      icon: History,
      keywords: [
        "latest completed turn",
        "recent task",
        "last completed",
        "recent turn",
      ],
      run: args.commands.openLatestCompletedTurnTask,
      source: "core",
    }),
  },
  {
    id: "task.new",
    title: "New Task",
    description: "Create a new task in the active workspace.",
    group: "task",
    icon: Bot,
    keywords: ["create task", "new chat", "new conversation"],
    shortcut: (modifierLabel) => `${modifierLabel}+N`,
    build: (args) => ({
      id: "task.new",
      title: "New Task",
      subtitle: "Start a fresh task in the current workspace.",
      group: "task",
      icon: Bot,
      keywords: ["create task", "new chat", "new conversation"],
      shortcut: `${args.modifierLabel}+N`,
      run: args.commands.createTask,
      source: "core",
    }),
  },
  {
    id: "task.create-pr",
    title: "Create Pull Request",
    description: "Open the pull request flow for the active workspace.",
    group: "task",
    icon: GitPullRequest,
    keywords: ["create pr", "pull request", "github", "open pr"],
    build: (args) =>
      !args.activeWorkspaceIsDefault && args.activeWorkspacePrStatus === "no_pr"
        ? {
            id: "task.create-pr",
            title: "Create Pull Request",
            subtitle: args.activeWorkspaceBranch
              ? `Open the PR flow for ${args.activeWorkspaceBranch}.`
              : "Open the PR flow for the active workspace.",
            group: "task",
            icon: GitPullRequest,
            keywords: ["create pr", "pull request", "github", "open pr"],
            run: args.commands.createPullRequest,
            source: "core",
          }
        : null,
  },
  {
    id: "task.continue-workspace",
    title: "Continue in New Workspace",
    description:
      "Create a follow-up workspace with a continuation brief attached.",
    group: "task",
    icon: GitBranch,
    keywords: ["continue", "workspace", "follow up", "branch"],
    build: (args) =>
      !args.activeWorkspaceIsDefault &&
      (args.activeWorkspacePrStatus === "merged" ||
        args.activeWorkspacePrStatus === "closed_unmerged")
        ? {
            id: "task.continue-workspace",
            title: "Continue in New Workspace",
            subtitle: args.activeWorkspaceBranch
              ? `Create a follow-up workspace from ${args.activeWorkspaceBranch}.`
              : "Create a follow-up workspace from the active branch.",
            group: "task",
            icon: GitBranch,
            keywords: ["continue", "workspace", "follow up", "branch"],
            run: args.commands.continueWorkspace,
            source: "core",
          }
        : null,
  },
  {
    id: "task.stop-active-turn",
    title: "Stop Active Turn",
    description: "Abort the current provider run for the active task.",
    group: "task",
    icon: CommandIcon,
    keywords: ["stop", "abort", "cancel generation"],
    build: (args) =>
      args.hasActiveTurn
        ? {
            id: "task.stop-active-turn",
            title: "Stop Active Turn",
            subtitle: "Abort the current provider run.",
            group: "task",
            icon: CommandIcon,
            keywords: ["stop", "abort", "cancel generation"],
            run: args.commands.stopActiveTurn,
            source: "core",
          }
        : null,
  },
  {
    id: "view.toggle-workspace-sidebar",
    title: "Toggle Workspace Sidebar",
    description: "Collapse or expand the left workspace sidebar.",
    group: "view",
    icon: PanelLeft,
    keywords: ["sidebar", "project list", "collapse"],
    shortcut: (modifierLabel) => `${modifierLabel}+B`,
    build: (args) => ({
      id: "view.toggle-workspace-sidebar",
      title: args.layout.workspaceSidebarCollapsed
        ? "Expand Workspace Sidebar"
        : "Collapse Workspace Sidebar",
      subtitle: "Toggle the left project and workspace list.",
      group: "view",
      icon: PanelLeft,
      keywords: ["sidebar", "project list", "collapse"],
      shortcut: `${args.modifierLabel}+B`,
      run: args.commands.toggleWorkspaceSidebar,
      source: "core",
    }),
  },
  {
    id: "view.toggle-changes-panel",
    title: "Toggle Source Control Panel",
    description: "Show or hide the source control overlay panel.",
    group: "view",
    icon: Layers3,
    keywords: ["source control", "changes", "diff", "git"],
    shortcut: (modifierLabel) => `${modifierLabel}+Shift+B`,
    build: (args) => ({
      id: "view.toggle-changes-panel",
      title:
        args.layout.sidebarOverlayVisible &&
        args.layout.sidebarOverlayTab === "changes"
          ? "Hide Source Control Panel"
          : "Show Source Control Panel",
      subtitle: "Toggle the source control overlay on the right rail.",
      group: "view",
      icon: Layers3,
      keywords: ["source control", "changes", "diff", "git"],
      shortcut: `${args.modifierLabel}+Shift+B`,
      run: args.commands.toggleChangesPanel,
      source: "core",
    }),
  },
  {
    id: "view.show-explorer",
    title: "Show Explorer Panel",
    description: "Open the explorer overlay on the right rail.",
    group: "view",
    icon: FolderOpen,
    keywords: ["explorer", "files", "right rail"],
    shortcut: (modifierLabel) => `${modifierLabel}+E`,
    build: (args) => ({
      id: "view.show-explorer",
      title: "Show Explorer Panel",
      subtitle: "Open the explorer overlay.",
      group: "view",
      icon: FolderOpen,
      keywords: ["explorer", "files", "right rail"],
      shortcut: `${args.modifierLabel}+E`,
      run: () => args.commands.showOverlayTab("explorer"),
      source: "core",
    }),
  },
  {
    id: "view.search-in-files",
    title: "Search in Files",
    description: "Open the explorer search panel for exact content search.",
    group: "view",
    icon: Search,
    keywords: ["search", "files", "content", "ripgrep", "explorer"],
    shortcut: (modifierLabel) => `${modifierLabel}+Shift+F`,
    build: (args) => ({
      id: "view.search-in-files",
      title: "Search in Files",
      subtitle: "Search the active workspace contents from the explorer.",
      group: "view",
      icon: Search,
      keywords: ["search", "files", "content", "ripgrep", "explorer"],
      shortcut: `${args.modifierLabel}+Shift+F`,
      run: args.commands.openExplorerSearch,
      source: "core",
    }),
  },
  {
    id: "view.show-information",
    title: "Toggle Information Panel",
    description:
      "Show or hide the workspace information overlay on the right rail.",
    group: "view",
    icon: LibraryBig,
    keywords: ["information", "notes", "jira", "figma", "slack"],
    shortcut: (modifierLabel) => `${modifierLabel}+I`,
    build: (args) => ({
      id: "view.show-information",
      title:
        args.layout.sidebarOverlayVisible &&
        args.layout.sidebarOverlayTab === "information"
          ? "Hide Information Panel"
          : "Show Information Panel",
      subtitle: "Open notes, links, plans, and structured workspace fields.",
      group: "view",
      icon: LibraryBig,
      keywords: ["information", "notes", "jira", "figma", "slack"],
      shortcut: `${args.modifierLabel}+I`,
      run: args.commands.toggleInformationPanel,
      source: "core",
    }),
  },
  {
    id: "view.show-scripts",
    title: "Show Scripts Panel",
    description: "Open the workspace scripts overlay on the right rail.",
    group: "view",
    icon: Sparkles,
    keywords: ["scripts", "hooks", "services", "orbit"],
    shortcut: (modifierLabel) => `${modifierLabel}+K S`,
    build: (args) => ({
      id: "view.show-scripts",
      title: "Show Scripts Panel",
      subtitle: "Open workspace scripts runtime, hooks, and services.",
      group: "view",
      icon: Sparkles,
      keywords: ["scripts", "hooks", "services", "orbit"],
      shortcut: `${args.modifierLabel}+K S`,
      run: () => args.commands.showOverlayTab("scripts"),
      source: "core",
    }),
  },
  {
    id: "view.show-lens",
    title: "Show Lens Panel",
    description: "Open the Lens browser overlay on the right rail.",
    group: "view",
    icon: Globe,
    keywords: ["lens", "browser", "preview", "inspect", "right rail"],
    shortcut: (modifierLabel) => `${modifierLabel}+K L`,
    build: (args) => ({
      id: "view.show-lens",
      title: "Show Lens Panel",
      subtitle:
        "Open the embedded browser for preview, inspection, and element picking.",
      group: "view",
      icon: Globe,
      keywords: ["lens", "browser", "preview", "inspect", "right rail"],
      shortcut: `${args.modifierLabel}+K L`,
      run: () => args.commands.showOverlayTab("lens"),
      source: "core",
    }),
  },
  {
    id: "view.toggle-editor",
    title: "Toggle Editor",
    description: "Show or hide the editor panel.",
    group: "view",
    icon: PanelRight,
    keywords: ["editor", "code", "panel"],
    shortcut: (modifierLabel) => `${modifierLabel}+\\`,
    build: (args) => ({
      id: "view.toggle-editor",
      title: args.layout.editorVisible ? "Hide Editor" : "Show Editor",
      subtitle: "Toggle the editor panel.",
      group: "view",
      icon: PanelRight,
      keywords: ["editor", "code", "panel"],
      shortcut: `${args.modifierLabel}+\\`,
      run: args.commands.toggleEditor,
      source: "core",
    }),
  },
  {
    id: "view.toggle-terminal",
    title: "Toggle Terminal",
    description: "Dock or hide the terminal panel.",
    group: "view",
    icon: Terminal,
    keywords: ["terminal", "console", "shell"],
    shortcut: (modifierLabel) => `${modifierLabel}+\``,
    build: (args) => ({
      id: "view.toggle-terminal",
      title: args.layout.terminalDocked ? "Hide Terminal" : "Show Terminal",
      subtitle: "Toggle the docked terminal.",
      group: "view",
      icon: Terminal,
      keywords: ["terminal", "console", "shell"],
      shortcut: `${args.modifierLabel}+\``,
      run: args.commands.toggleTerminal,
      source: "core",
    }),
  },
  {
    id: "view.toggle-zen-mode",
    title: "Toggle Zen Mode",
    description:
      "Hide surrounding workspace chrome and focus on chat and results.",
    group: "view",
    icon: Focus,
    keywords: ["zen", "focus", "distraction free", "full screen", "chat only"],
    shortcut: (modifierLabel) => `${modifierLabel}+K Z`,
    build: (args) => ({
      id: "view.toggle-zen-mode",
      title: args.layout.zenMode ? "Exit Zen Mode" : "Enter Zen Mode",
      subtitle: "Focus the app on chat, results, and the prompt composer.",
      group: "view",
      icon: Focus,
      keywords: [
        "zen",
        "focus",
        "distraction free",
        "full screen",
        "chat only",
      ],
      shortcut: `${args.modifierLabel}+K Z`,
      run: args.commands.toggleZenMode,
      source: "core",
    }),
  },
  {
    id: "task.save-file",
    title: "Save File",
    description: "Save the active editor tab.",
    group: "task",
    icon: Save,
    keywords: ["save", "editor", "write file"],
    shortcut: (modifierLabel) => `${modifierLabel}+S`,
    build: (args) =>
      args.activeEditorTabId
        ? {
            id: "task.save-file",
            title: "Save File",
            subtitle: "Write the current editor tab to disk.",
            group: "task",
            icon: Save,
            keywords: ["save", "editor", "write file"],
            shortcut: `${args.modifierLabel}+S`,
            run: args.commands.saveActiveEditor,
            source: "core",
          }
        : null,
  },
  {
    id: "provider.set.claude-code",
    title: "Set Provider: Claude",
    description: "Switch the active task to Claude Code.",
    group: "provider",
    icon: Bot,
    keywords: ["provider", "claude", "model"],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "provider.set.claude-code",
            title: "Set Provider: Claude",
            subtitle: "Switch the active task to Claude Code.",
            group: "provider",
            icon: Bot,
            keywords: ["provider", "claude", "model"],
            run: () =>
              args.commands.setTaskProvider(args.activeTaskId, "claude-code"),
            source: "core",
          }
        : null,
  },
  {
    id: "provider.set.codex",
    title: "Set Provider: Codex",
    description: "Switch the active task to Codex.",
    group: "provider",
    icon: Bot,
    keywords: ["provider", "codex", "model"],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "provider.set.codex",
            title: "Set Provider: Codex",
            subtitle: "Switch the active task to Codex.",
            group: "provider",
            icon: Bot,
            keywords: ["provider", "codex", "model"],
            run: () =>
              args.commands.setTaskProvider(args.activeTaskId, "codex"),
            source: "core",
          }
        : null,
  },
  {
    id: "provider.set.stave",
    title: "Set Provider: Stave Auto",
    description: "Switch the active task to the Stave meta-provider.",
    group: "provider",
    icon: Bot,
    keywords: ["provider", "stave", "router", "auto"],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "provider.set.stave",
            title: "Set Provider: Stave Auto",
            subtitle: "Switch the active task to the Stave router.",
            group: "provider",
            icon: Bot,
            keywords: ["provider", "stave", "router", "auto"],
            run: () =>
              args.commands.setTaskProvider(args.activeTaskId, "stave"),
            source: "core",
          }
        : null,
  },
  {
    id: "settings.open",
    title: "Open Settings",
    description: "Open the main settings dialog.",
    group: "settings",
    icon: Settings,
    keywords: ["settings", "preferences"],
    shortcut: (modifierLabel) => `${modifierLabel}+,`,
    build: (args) => ({
      id: "settings.open",
      title: "Open Settings",
      subtitle: "Open the main settings dialog.",
      group: "settings",
      icon: Settings,
      keywords: ["settings", "preferences"],
      shortcut: `${args.modifierLabel}+,`,
      run: () => args.commands.openSettings(),
      source: "core",
    }),
  },
  {
    id: "settings.open.design",
    title: "Open Settings: Design",
    description: "Jump to the Design settings section.",
    group: "settings",
    icon: Settings,
    keywords: ["settings", "design", "theme", "appearance"],
    build: (args) => ({
      id: "settings.open.design",
      title: "Open Settings: Design",
      subtitle: "Jump to theme and design settings.",
      group: "settings",
      icon: Settings,
      keywords: ["settings", "design", "theme", "appearance"],
      run: () => args.commands.openSettings({ section: "theme" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.providers",
    title: "Open Settings: Providers",
    description: "Jump to the Providers settings section.",
    group: "settings",
    icon: Settings,
    keywords: ["settings", "providers", "models"],
    build: (args) => ({
      id: "settings.open.providers",
      title: "Open Settings: Providers",
      subtitle: "Jump to provider and model settings.",
      group: "settings",
      icon: Settings,
      keywords: ["settings", "providers", "models"],
      run: () => args.commands.openSettings({ section: "providers" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.command-palette",
    title: "Open Settings: Command Palette",
    description: "Jump to the global command palette settings section.",
    group: "settings",
    icon: Settings,
    keywords: ["settings", "command palette", "commands"],
    build: (args) => ({
      id: "settings.open.command-palette",
      title: "Open Settings: Command Palette",
      subtitle: "Configure the global IDE command launcher.",
      group: "settings",
      icon: Settings,
      keywords: ["settings", "command palette", "commands"],
      run: () => args.commands.openSettings({ section: "commandPalette" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.shortcuts",
    title: "Open Keyboard Shortcuts",
    description: "Show the keyboard shortcut guide drawer.",
    group: "settings",
    icon: Keyboard,
    keywords: ["keyboard", "shortcuts", "help"],
    shortcut: (modifierLabel) => `${modifierLabel}+/`,
    build: (args) => ({
      id: "settings.open.shortcuts",
      title: "Open Keyboard Shortcuts",
      subtitle: "Show the shortcut guide drawer.",
      group: "settings",
      icon: Keyboard,
      keywords: ["keyboard", "shortcuts", "help"],
      shortcut: `${args.modifierLabel}+/`,
      run: args.commands.openKeyboardShortcuts,
      source: "core",
    }),
  },
  {
    id: "workspace.refresh-files",
    title: "Refresh Project Files",
    description: "Rescan the active workspace file list.",
    group: "navigation",
    icon: RefreshCw,
    keywords: ["refresh", "files", "project"],
    build: (args) =>
      args.projectPath
        ? {
            id: "workspace.refresh-files",
            title: "Refresh Project Files",
            subtitle: "Rescan the active workspace file list.",
            group: "navigation",
            icon: RefreshCw,
            keywords: ["refresh", "files", "project"],
            run: args.commands.refreshProjectFiles,
            source: "core",
          }
        : null,
  },
  {
    id: "workspace.refresh-workspaces",
    title: "Refresh Workspaces",
    description: "Rediscover project workspaces and PR state.",
    group: "navigation",
    icon: RefreshCw,
    keywords: ["refresh", "workspace", "worktree"],
    build: (args) =>
      args.projectPath
        ? {
            id: "workspace.refresh-workspaces",
            title: "Refresh Workspaces",
            subtitle: "Rediscover workspaces for the current project.",
            group: "navigation",
            icon: RefreshCw,
            keywords: ["refresh", "workspace", "worktree"],
            run: args.commands.refreshWorkspaces,
            source: "core",
          }
        : null,
  },
  {
    id: "external.reveal-active-workspace",
    title: "Reveal Active Workspace",
    description: "Show the active workspace in the system file manager.",
    group: "external",
    icon: FolderOpen,
    keywords: ["finder", "explorer", "file manager", "workspace"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.reveal-active-workspace",
            title: "Reveal Active Workspace",
            subtitle: args.workspacePath,
            group: "external",
            icon: FolderOpen,
            keywords: ["finder", "explorer", "file manager", "workspace"],
            run: () => args.commands.revealInFileManager(args.workspacePath!),
            source: "core",
          }
        : null,
  },
  {
    id: "external.open-active-workspace-vscode",
    title: "Open Active Workspace in VS Code",
    description: "Open the active workspace folder in VS Code.",
    group: "external",
    icon: FolderOpen,
    keywords: ["external", "vscode", "editor"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-vscode",
            title: "Open Active Workspace in VS Code",
            subtitle: args.workspacePath,
            group: "external",
            icon: FolderOpen,
            keywords: ["external", "vscode", "editor"],
            run: () => args.commands.openInVSCode(args.workspacePath!),
            source: "core",
          }
        : null,
  },
  {
    id: "external.open-active-workspace-terminal",
    title: "Open Active Workspace in Terminal",
    description: "Open the active workspace folder in the OS default terminal.",
    group: "external",
    icon: Terminal,
    keywords: ["external", "terminal", "shell"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-terminal",
            title: "Open Active Workspace in Terminal",
            subtitle: args.workspacePath,
            group: "external",
            icon: Terminal,
            keywords: ["external", "terminal", "shell"],
            run: () => args.commands.openInTerminal(args.workspacePath!),
            source: "core",
          }
        : null,
  },
  {
    id: "external.open-active-workspace-ghostty",
    title: "Open Active Workspace in Ghostty",
    description:
      "Open the active workspace folder in the Ghostty terminal app.",
    group: "external",
    icon: Terminal,
    keywords: ["external", "ghostty", "terminal"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-ghostty",
            title: "Open Active Workspace in Ghostty",
            subtitle: args.workspacePath,
            group: "external",
            icon: Terminal,
            keywords: ["external", "ghostty", "terminal"],
            run: () => args.commands.openInGhostty(args.workspacePath!),
            source: "core",
          }
        : null,
  },
];

function buildDynamicActions(
  args: CommandPaletteRuntimeContext,
): CommandPaletteAction[] {
  const actions: CommandPaletteAction[] = [];

  for (const task of args.tasks) {
    actions.push({
      id: `task.select.${task.id}`,
      title: `Switch Task: ${formatTaskTitle(task.title)}`,
      subtitle: task.isActive
        ? `Active task · ${getProviderLabel({ providerId: task.provider })}`
        : getProviderLabel({ providerId: task.provider }),
      group: "navigation",
      icon: Bot,
      keywords: ["switch task", "task", task.title, task.provider],
      run: () => args.commands.selectTask(task.id),
      source: "dynamic",
      customizable: false,
    });
  }

  for (const workspace of args.workspaces) {
    actions.push({
      id: `workspace.select.${workspace.id}`,
      title: `Switch Workspace: ${formatWorkspaceTitle({ isDefault: workspace.isDefault, name: workspace.name })}`,
      subtitle: workspace.isActive
        ? `Active workspace${workspace.branch ? ` · ${workspace.branch}` : ""}`
        : (workspace.branch ?? workspace.path ?? "Workspace"),
      group: "navigation",
      icon: FolderOpen,
      keywords: [
        "switch workspace",
        "workspace",
        workspace.name,
        workspace.branch ?? "",
      ],
      run: () => args.commands.switchWorkspace(workspace.id),
      source: "dynamic",
      customizable: false,
    });
  }

  for (const project of args.projects) {
    actions.push({
      id: `project.open.${project.projectPath}`,
      title: `Open Project: ${project.projectName}`,
      subtitle: project.isCurrent ? "Current project" : project.projectPath,
      group: "navigation",
      icon: LibraryBig,
      keywords: [
        "open project",
        "project",
        project.projectName,
        project.projectPath,
      ],
      run: () => args.commands.openProject(project.projectPath),
      source: "dynamic",
      customizable: false,
    });
  }

  return actions;
}

function sortActions(left: CommandPaletteAction, right: CommandPaletteAction) {
  const groupDelta =
    COMMAND_PALETTE_GROUP_ORDER.indexOf(left.group) -
    COMMAND_PALETTE_GROUP_ORDER.indexOf(right.group);
  if (groupDelta !== 0) {
    return groupDelta;
  }
  return left.title.localeCompare(right.title, undefined, {
    sensitivity: "base",
  });
}

function dedupeActions(actions: CommandPaletteAction[]) {
  const byId = new Map<string, CommandPaletteAction>();
  for (const action of actions) {
    byId.set(action.id, action);
  }
  return Array.from(byId.values());
}

function buildCoreActions(args: CommandPaletteRuntimeContext) {
  return coreCommandDefinitions
    .map<CommandPaletteAction | null>((definition) => {
      const action = definition.build(args);
      if (!action) {
        return null;
      }

      return {
        ...action,
        shortcut:
          formatShortcut({
            commandId: definition.id,
            shortcut: definition.shortcut,
            modifierLabel: args.modifierLabel,
            appShortcutKeys: args.appShortcutKeys,
          }) ?? action.shortcut,
        customizable: action.customizable ?? true,
      } satisfies CommandPaletteAction;
    })
    .filter(
      (definition): definition is CommandPaletteAction => definition !== null,
    );
}

export function registerCommandPaletteContributor(
  contributor: CommandPaletteContributor,
) {
  commandPaletteContributors.add(contributor);
  return () => {
    commandPaletteContributors.delete(contributor);
  };
}

export function listCommandPaletteActions(args: CommandPaletteRuntimeContext) {
  const contributed = Array.from(commandPaletteContributors)
    .flatMap((contributor) => contributor(args))
    .map((action) => ({ ...action, source: action.source ?? "contributed" }));

  return dedupeActions([
    ...buildCoreActions(args),
    ...buildDynamicActions(args),
    ...contributed,
  ]);
}

export function buildCommandPaletteGroups(
  args: CommandPaletteRuntimeContext,
): CommandPaletteGroupSection[] {
  const hiddenIds = new Set(args.preferences.hiddenIds);
  const visibleActions = listCommandPaletteActions(args).filter(
    (action) => !hiddenIds.has(action.id),
  );
  const byId = new Map(
    visibleActions.map((action) => [action.id, action] as const),
  );

  const pinnedItems = args.preferences.pinnedIds
    .map((id) => byId.get(id))
    .filter((action): action is CommandPaletteAction => Boolean(action));
  const pinnedIds = new Set(pinnedItems.map((action) => action.id));

  const recentItems = args.preferences.showRecent
    ? args.preferences.recentIds
        .map((id) => byId.get(id))
        .filter((action): action is CommandPaletteAction => Boolean(action))
        .filter((action) => !pinnedIds.has(action.id))
    : [];
  const recentIds = new Set(recentItems.map((action) => action.id));

  const remainingItems = visibleActions
    .filter((action) => !pinnedIds.has(action.id) && !recentIds.has(action.id))
    .sort(sortActions);

  const sections: CommandPaletteGroupSection[] = [];

  if (pinnedItems.length > 0) {
    sections.push({
      key: "pinned",
      title: COMMAND_PALETTE_GROUP_LABELS.pinned,
      items: pinnedItems,
    });
  }

  if (recentItems.length > 0) {
    sections.push({
      key: "recent",
      title: COMMAND_PALETTE_GROUP_LABELS.recent,
      items: recentItems,
    });
  }

  for (const group of COMMAND_PALETTE_GROUP_ORDER) {
    const items = remainingItems.filter((action) => action.group === group);
    if (items.length === 0) {
      continue;
    }
    sections.push({
      key: group,
      title: COMMAND_PALETTE_GROUP_LABELS[group],
      items,
    });
  }

  return sections;
}

export function recordRecentCommandPaletteAction(args: {
  commandId: string;
  recentIds: string[];
}) {
  return [
    args.commandId,
    ...args.recentIds.filter((id) => id !== args.commandId),
  ].slice(0, MAX_RECENT_COMMAND_IDS);
}

export function getCommandPaletteCoreCommands(args?: {
  appShortcutKeys?: AppShortcutKeys;
}) {
  return coreCommandDefinitions.map((definition) => ({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    group: definition.group,
    keywords: definition.keywords ?? [],
    shortcut: formatShortcut({
      commandId: definition.id,
      shortcut: definition.shortcut,
      modifierLabel: "Cmd/Ctrl",
      appShortcutKeys: args?.appShortcutKeys,
    }),
  }));
}
