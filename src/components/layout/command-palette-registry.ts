import { i18n } from "@/i18n";
import {
  Bot,
  Gauge,
  Command as CommandIcon,
  FolderOpen,
  GitBranch,
  GitGraph,
  GitPullRequest,
  Globe,
  Home,
  History,
  Keyboard,
  Layers3,
  LibraryBig,
  ChartNoAxesColumn,
  ListTodo,
  PanelLeft,
  PanelRight,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Settings,
  SplitSquareHorizontal,
  Terminal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { getProviderLabel } from "@/lib/providers/model-catalog";
import { OPEN_COMMIT_GRAPH_TITLE_KEY } from "@/lib/git-graph/presentation";
import type { ProviderId } from "@/lib/providers/provider.types";
import {
  formatAppShortcutLabel,
  hasAppShortcutCommandId,
  type AppShortcutKeys,
} from "@/lib/app-shortcuts";
import type { SectionId } from "@/components/layout/settings-dialog.schema";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import type { RightRailPanelId } from "@/lib/right-rail-panels";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

const { icon: WorkspaceToolsIcon } =
  WORKSPACE_TOOLS_PRESENTATION;

export type CommandPaletteGroup =
  | "navigation"
  | "view"
  | "task"
  | "scripts"
  | "provider"
  | "settings"
  | "external";

export const COMMAND_PALETTE_GROUP_LABELS: Record<
  CommandPaletteGroup | "pinned" | "suggested" | "recent",
  string
> = {
  get pinned() { return i18n.t("shell:commandPaletteRegistry.pinned"); },
  get suggested() { return i18n.t("shell:commandPaletteRegistry.suggested"); },
  get recent() { return i18n.t("shell:commandPaletteRegistry.recent"); },
  get navigation() { return i18n.t("shell:commandPaletteRegistry.navigation"); },
  get view() { return i18n.t("shell:commandPaletteRegistry.view"); },
  get task() { return i18n.t("shell:commandPaletteRegistry.task"); },
  get scripts() { return WORKSPACE_TOOLS_PRESENTATION.label; },
  get provider() { return i18n.t("shell:commandPaletteRegistry.provider"); },
  get settings() { return i18n.t("shell:commandPaletteRegistry.settings"); },
  get external() { return i18n.t("shell:commandPaletteRegistry.external"); },
};

const COMMAND_PALETTE_GROUP_ORDER: CommandPaletteGroup[] = [
  "navigation",
  "view",
  "task",
  "scripts",
  "provider",
  "settings",
  "external",
];

const MAX_RECENT_COMMAND_IDS = 8;
const MAX_CONTEXTUAL_COMMAND_IDS = 6;

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

export interface CommandPaletteRepositorySummary {
  isCurrent: boolean;
  repositoryName: string;
  repositoryPath: string;
}

export interface CommandPaletteLayoutState {
  sidebarOverlayTab: RightRailPanelId;
  sidebarOverlayVisible: boolean;
  workspaceSidebarCollapsed: boolean;
}

export interface CommandPaletteCommandHandlers {
  clearTaskSelection: () => void;
  createPullRequest: () => Promise<void> | void;
  createTask: () => void;
  continueWorkspace: () => Promise<void> | void;
  focusFileSearch: () => void;
  openExplorerSearch: () => void;
  openLatestCompletedTurnTask: () => Promise<void> | void;
  openLens: () => void;
  openKickoff: () => void;
  openInTerminal: (path: string) => Promise<void> | void;
  openInGhostty: (path: string) => Promise<void> | void;
  openInVSCode: (path: string) => Promise<void> | void;
  openFleetView: () => void;
  openGitGraph: () => void;
  openAutomationCenter: () => void;
  openIssues: () => void;
  openAgents: () => void;
  openResults: () => void;
  openUsage: () => void;
  newAgent: () => void;
  startWorkWithAgent: () => void;
  refreshTrackerIssues: () => Promise<void> | void;
  openKeyboardShortcuts: () => void;
  openRepository: (repositoryPath: string) => Promise<void> | void;
  openSettings: (options?: {
    repositoryPath?: string | null;
    section?: SectionId;
  }) => void;
  refreshRepositoryFiles: () => Promise<void> | void;
  refreshWorkspaces: () => Promise<void> | void;
  revealInFileManager: (path: string) => Promise<void> | void;
  saveActiveEditor: () => Promise<void> | void;
  selectTask: (taskId: string) => void;
  setTaskProvider: (taskId: string, provider: ProviderId) => void;
  startCompareRun: () => Promise<void> | void;
  splitActivePanel: (direction: "right" | "below") => void;
  showOverlayTab: (tab: CommandPaletteLayoutState["sidebarOverlayTab"]) => void;
  stopActiveTurn: () => void;
  switchWorkspace: (workspaceId: string) => Promise<void> | void;
  toggleChangesPanel: () => void;
  toggleEditor: () => void;
  toggleInformationPanel: () => void;
  toggleTerminal: () => void;
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
  repositoryPath: string | null;
  repositories: CommandPaletteRepositorySummary[];
  /** Bumped when the active workspace's scripts runtime snapshot changes, so
   * memoized consumers re-run the scripts contributor. */
  scriptsRevision?: number;
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
  /**
   * Renders the provider's vendor mark instead of `icon`. A provider id rather
   * than a component because this registry is plain `.ts` and cannot hold JSX;
   * the palette renderer owns the mapping to `ModelIcon`.
   */
  providerIcon?: ProviderId;
  keywords?: string[];
  shortcut?: string;
  source?: "core" | "dynamic" | "contributed";
  subtitle?: string;
  customizable?: boolean;
  contextLabel?: string;
}

export interface CommandPaletteGroupSection {
  key: CommandPaletteGroup | "pinned" | "suggested" | "recent";
  title: string;
  items: CommandPaletteAction[];
}

export interface CommandPaletteContextRelevance {
  label: string;
  score: number;
}

interface CommandPaletteCoreCommandDefinition {
  id: string;
  title: string;
  description: string;
  group: CommandPaletteGroup;
  build: (args: CommandPaletteRuntimeContext) => CommandPaletteAction | null;
  icon?: LucideIcon;
  providerIcon?: ProviderId;
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
  return title.trim() || i18n.t("shell:commandPaletteRegistry.untitledTask");
}

function formatWorkspaceTitle(args: { isDefault: boolean; name: string }) {
  if (args.isDefault) {
    return i18n.t("shell:commandPaletteRegistry.defaultWorkspace");
  }
  return args.name.trim() || i18n.t("shell:commandPaletteRegistry.workspace");
}

const coreCommandDefinitions: CommandPaletteCoreCommandDefinition[] = [
  {
    id: "navigation.quick-open-file",
    get title() { return i18n.t("shell:commandPaletteRegistry.quickOpenFile"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.focusTheWorkspaceFileSearchInThe"); },
    group: "navigation",
    icon: Search,
    keywords: ["file", "quick open", "go to file", "search"],
    shortcut: (modifierLabel) => `${modifierLabel}+P`,
    build: (args) =>
      args.repositoryPath
        ? {
            id: "navigation.quick-open-file",
            title: i18n.t("shell:commandPaletteRegistry.quickOpenFile"),
            subtitle: i18n.t("shell:commandPaletteRegistry.focusTheTopBarFileSearch"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.goHome"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.clearTheActiveTaskSelectionAndReturn"); },
    group: "navigation",
    icon: Home,
    keywords: ["home", "dashboard", "clear task selection"],
    shortcut: (modifierLabel) => `${modifierLabel}+K H`,
    build: (args) => ({
      id: "navigation.home",
      title: i18n.t("shell:commandPaletteRegistry.goHome"),
      subtitle: i18n.t("shell:commandPaletteRegistry.returnToTheRepositoryOverview"),
      group: "navigation",
      icon: Home,
      keywords: ["home", "dashboard", "clear task selection"],
      shortcut: `${args.modifierLabel}+K H`,
      run: args.commands.clearTaskSelection,
      source: "core",
    }),
  },
  {
    id: "navigation.latest-completed-turn-task",
    get title() { return i18n.t("shell:commandPaletteRegistry.goToLatestCompletedTurnTask"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheTaskWithTheMost"); },
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
      title: i18n.t("shell:commandPaletteRegistry.goToLatestCompletedTurnTask"),
      subtitle: i18n.t("shell:commandPaletteRegistry.jumpToTheNewestCompletedTaskRun"),
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
    id: "navigation.fleet-view",
    get title() { return i18n.t("shell:commandPaletteRegistry.openFleetView"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheCrossWorkspaceAgentStatusView"); },
    group: "navigation",
    icon: Bot,
    keywords: ["fleet", "agents", "status", "parallel", "needs input"],
    shortcut: (modifierLabel) => `${modifierLabel}+K F`,
    build: (args) =>
      args.repositoryPath
        ? {
            id: "navigation.fleet-view",
            title: i18n.t("shell:commandPaletteRegistry.openFleetView"),
            subtitle: i18n.t("shell:commandPaletteRegistry.showAgentStatusAcrossWorkspaces"),
            group: "navigation",
            icon: Bot,
            keywords: ["fleet", "agents", "status", "parallel", "needs input"],
            shortcut: `${args.modifierLabel}+K F`,
            run: args.commands.openFleetView,
            source: "core",
          }
        : null,
  },
  {
    id: "navigation.automation-center",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSchedules"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openWorkThatRunsOnItsOwn"); },
    group: "navigation",
    icon: Workflow,
    keywords: [
      "library",
      "automation",
      "automations",
      "routine",
      "schedule",
      "scheduled",
      "cron",
      "cadence",
      "run history",
    ],
    shortcut: (modifierLabel) => `${modifierLabel}+K A`,
    build: (args) => ({
      id: "navigation.automation-center",
      title: i18n.t("shell:commandPaletteRegistry.openSchedules"),
      subtitle: i18n.t("shell:commandPaletteRegistry.workThatRunsOnItsOwnAnd"),
      group: "navigation",
      icon: Workflow,
      keywords: [
        "library",
        "automation",
        "automations",
        "routine",
        "schedule",
        "scheduled",
        "cron",
        "cadence",
        "run history",
      ],
      shortcut: `${args.modifierLabel}+K A`,
      run: args.commands.openAutomationCenter,
      source: "core",
    }),
  },
  {
    id: "navigation.issues",
    get title() { return i18n.t("shell:commandPaletteRegistry.openIssues"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openAssignedTrackerTicketsAndStartA"); },
    group: "navigation",
    icon: ListTodo,
    keywords: [
      "tasks",
      "tickets",
      "issues",
      "assigned",
      "tracker",
      "backlog",
      "due",
    ],
    shortcut: (modifierLabel) => `${modifierLabel}+K T`,
    build: (args) => ({
      id: "navigation.issues",
      title: i18n.t("shell:commandPaletteRegistry.openIssues"),
      subtitle: i18n.t("shell:commandPaletteRegistry.reviewAssignedTicketsAndStartARun"),
      group: "navigation",
      icon: ListTodo,
      keywords: [
        "tasks",
        "tickets",
        "issues",
        "assigned",
        "tracker",
        "backlog",
        "due",
      ],
      shortcut: `${args.modifierLabel}+K T`,
      run: args.commands.openIssues,
      source: "core",
    }),
  },
  {
    id: "navigation.agents",
    get title() { return i18n.t("shell:commandPaletteRegistry.openAgents"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openSavedAgentsTheirWorkflowsAndYour"); },
    group: "navigation",
    icon: Bot,
    keywords: [
      "agents",
      "workflow",
      "standards",
      "my standards",
      "assign",
      "delegate",
    ],
    shortcut: (modifierLabel) => `${modifierLabel}+K G`,
    build: (args) => ({
      id: "navigation.agents",
      title: i18n.t("shell:commandPaletteRegistry.openAgents"),
      subtitle: i18n.t("shell:commandPaletteRegistry.savedAgentsTheirWorkflowsAndYourStandards"),
      group: "navigation",
      icon: Bot,
      keywords: [
        "agents",
        "workflow",
        "standards",
        "my standards",
        "assign",
        "delegate",
      ],
      shortcut: `${args.modifierLabel}+K G`,
      run: args.commands.openAgents,
      source: "core",
    }),
  },
  {
    id: "navigation.results",
    get title() { return i18n.t("shell:commandPaletteRegistry.openResults"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.seeHowEndedAgentRunsAndRuns"); },
    group: "navigation",
    icon: ChartNoAxesColumn,
    keywords: ["results", "outcomes", "stats", "statistics", "insights", "cost", "ready", "runs"],
    build: (args) => ({
      id: "navigation.results",
      title: i18n.t("shell:commandPaletteRegistry.openResults"),
      subtitle: i18n.t("shell:commandPaletteRegistry.outcomesTimeAndCostOfEndedAgent"),
      group: "navigation",
      icon: ChartNoAxesColumn,
      keywords: ["results", "outcomes", "stats", "statistics", "insights", "cost", "ready", "runs"],
      run: args.commands.openResults,
      source: "core",
    }),
  },
  {
    id: "navigation.usage",
    get title() { return i18n.t("shell:commandPaletteRegistry.openAiUsage"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.aiUsageDescription"); },
    group: "navigation",
    icon: Gauge,
    keywords: ["usage", "tokens", "cost", "quota", "account", "model", "AI"],
    build: (args) => ({
      id: "navigation.usage",
      title: i18n.t("shell:commandPaletteRegistry.openAiUsage"),
      subtitle: i18n.t("shell:commandPaletteRegistry.aiUsageDescription"),
      group: "navigation",
      icon: Gauge,
      keywords: ["usage", "tokens", "cost", "quota", "account", "model", "AI"],
      run: args.commands.openUsage,
      source: "core",
    }),
  },
  {
    id: "agents.start-work",
    get title() { return i18n.t("shell:commandPaletteRegistry.assignToAnAgent"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.chooseAnAgentInTheComposerOr"); },
    group: "navigation",
    icon: Bot,
    keywords: ["agent", "assign", "delegate", "kickoff", "start work", "workflow"],
    build: (args) => ({
      id: "agents.start-work",
      title: i18n.t("shell:commandPaletteRegistry.assignToAnAgent"),
      subtitle: i18n.t("shell:commandPaletteRegistry.chooseTheAgentThatDoesThisTaskS"),
      group: "navigation",
      icon: Bot,
      keywords: ["agent", "assign", "delegate", "kickoff", "start work", "workflow"],
      run: args.commands.startWorkWithAgent,
      source: "core",
    }),
  },
  {
    id: "agents.new",
    get title() { return i18n.t("shell:commandPaletteRegistry.newAgent"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.createASavedAgentFromBlankOr"); },
    group: "navigation",
    icon: Bot,
    keywords: ["agent", "new", "create", "add", "make"],
    build: (args) => ({
      id: "agents.new",
      title: i18n.t("shell:commandPaletteRegistry.newAgent"),
      subtitle: i18n.t("shell:commandPaletteRegistry.createASavedAgentFromBlankOr"),
      group: "navigation",
      icon: Bot,
      keywords: ["agent", "new", "create", "add", "make"],
      run: args.commands.newAgent,
      source: "core",
    }),
  },
  {
    id: "tracker.refresh-issues",
    get title() { return i18n.t("shell:commandPaletteRegistry.refreshIssues"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.rePollEveryConnectedTrackerForAssignedTickets"); },
    group: "navigation",
    icon: RefreshCw,
    keywords: ["refresh", "tasks", "tickets", "tracker", "sync"],
    build: (args) => ({
      id: "tracker.refresh-issues",
      title: i18n.t("shell:commandPaletteRegistry.refreshIssues"),
      subtitle: i18n.t("shell:commandPaletteRegistry.rePollConnectedTrackersForAssignedTickets"),
      group: "navigation",
      icon: RefreshCw,
      keywords: ["refresh", "tasks", "tickets", "tracker", "sync"],
      run: args.commands.refreshTrackerIssues,
      source: "core",
    }),
  },
  {
    id: "task.new",
    get title() { return i18n.t("shell:commandPaletteRegistry.newTask"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.createANewTaskInTheActive"); },
    group: "task",
    icon: Bot,
    keywords: ["create task", "new chat", "new conversation"],
    shortcut: (modifierLabel) => `${modifierLabel}+N`,
    build: (args) => ({
      id: "task.new",
      title: i18n.t("shell:commandPaletteRegistry.newTask"),
      subtitle: i18n.t("shell:commandPaletteRegistry.startAFreshTaskInTheCurrent"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.createPullRequest"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openThePullRequestFlowForThe"); },
    group: "task",
    icon: GitPullRequest,
    keywords: ["create pr", "pull request", "github", "open pr"],
    build: (args) =>
      !args.activeWorkspaceIsDefault && args.activeWorkspacePrStatus === "no_pr"
        ? {
            id: "task.create-pr",
            title: i18n.t("shell:commandPaletteRegistry.createPullRequest"),
            subtitle: args.activeWorkspaceBranch
              ? i18n.t("shell:commandPaletteRegistry.openThePRFlowFor", { value1: args.activeWorkspaceBranch })
              : i18n.t("shell:commandPaletteRegistry.openThePRFlowForTheActive"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.continueInNewWorkspace"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.createAFollowUpWorkspaceWithAContinuation"); },
    group: "task",
    icon: GitBranch,
    keywords: ["continue", "workspace", "follow up", "branch"],
    build: (args) =>
      !args.activeWorkspaceIsDefault &&
      (args.activeWorkspacePrStatus === "merged" ||
        args.activeWorkspacePrStatus === "closed_unmerged")
        ? {
            id: "task.continue-workspace",
            title: i18n.t("shell:commandPaletteRegistry.continueInNewWorkspace"),
            subtitle: args.activeWorkspaceBranch
              ? i18n.t("shell:commandPaletteRegistry.createAFollowUpWorkspaceFrom", { value1: args.activeWorkspaceBranch })
              : i18n.t("shell:commandPaletteRegistry.createAFollowUpWorkspaceFromTheActive"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.stopActiveTurn"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.abortTheCurrentProviderRunForThe"); },
    group: "task",
    icon: CommandIcon,
    keywords: ["stop", "abort", "cancel generation"],
    build: (args) =>
      args.hasActiveTurn
        ? {
            id: "task.stop-active-turn",
            title: i18n.t("shell:commandPaletteRegistry.stopActiveTurn"),
            subtitle: i18n.t("shell:commandPaletteRegistry.abortTheCurrentProviderRun"),
            group: "task",
            icon: CommandIcon,
            keywords: ["stop", "abort", "cancel generation"],
            run: args.commands.stopActiveTurn,
            source: "core",
          }
        : null,
  },
  {
    id: "task.compare-providers",
    get title() { return i18n.t("shell:commandPaletteRegistry.compareCurrentDraftAcrossProviders"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.launchClaudeAndCodexVariantsFromThe"); },
    group: "task",
    icon: SplitSquareHorizontal,
    keywords: [
      "compare",
      "best of n",
      "claude",
      "codex",
      "providers",
      "variants",
    ],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "task.compare-providers",
            title: i18n.t("shell:commandPaletteRegistry.compareCurrentDraftAcrossProviders"),
            subtitle: i18n.t("shell:commandPaletteRegistry.startClaudeAndCodexInIsolatedWorkspaces"),
            group: "task",
            icon: SplitSquareHorizontal,
            keywords: [
              "compare",
              "best of n",
              "claude",
              "codex",
              "providers",
              "variants",
            ],
            run: args.commands.startCompareRun,
            source: "core",
          }
        : null,
  },
  {
    id: "view.toggle-workspace-sidebar",
    get title() { return i18n.t("shell:commandPaletteRegistry.toggleWorkspaceSidebar"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.collapseOrExpandTheLeftWorkspaceSidebar"); },
    group: "view",
    icon: PanelLeft,
    keywords: ["sidebar", "repository list", "collapse"],
    shortcut: (modifierLabel) => `${modifierLabel}+B`,
    build: (args) => ({
      id: "view.toggle-workspace-sidebar",
      title: args.layout.workspaceSidebarCollapsed
        ? i18n.t("shell:commandPaletteRegistry.expandWorkspaceSidebar")
        : i18n.t("shell:commandPaletteRegistry.collapseWorkspaceSidebar"),
      subtitle: i18n.t("shell:commandPaletteRegistry.toggleTheLeftRepositoryAndWorkspaceList"),
      group: "view",
      icon: PanelLeft,
      keywords: ["sidebar", "repository list", "collapse"],
      shortcut: `${args.modifierLabel}+B`,
      run: args.commands.toggleWorkspaceSidebar,
      source: "core",
    }),
  },
  {
    id: "view.toggle-changes-panel",
    get title() { return i18n.t("shell:commandPaletteRegistry.toggleSourceControlPanel"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.showOrHideTheSourceControlOverlay"); },
    group: "view",
    icon: Layers3,
    keywords: ["source control", "changes", "diff", "git"],
    shortcut: (modifierLabel) => `${modifierLabel}+K C`,
    build: (args) => ({
      id: "view.toggle-changes-panel",
      title:
        args.layout.sidebarOverlayVisible &&
        args.layout.sidebarOverlayTab === "changes"
          ? i18n.t("shell:commandPaletteRegistry.hideSourceControlPanel")
          : i18n.t("shell:commandPaletteRegistry.showSourceControlPanel"),
      subtitle: i18n.t("shell:commandPaletteRegistry.toggleTheSourceControlOverlayOnThe"),
      group: "view",
      icon: Layers3,
      keywords: ["source control", "changes", "diff", "git"],
      shortcut: `${args.modifierLabel}+K C`,
      run: args.commands.toggleChangesPanel,
      source: "core",
    }),
  },
  {
    id: "view.show-explorer",
    get title() { return i18n.t("shell:commandPaletteRegistry.showExplorerPanel"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheExplorerOverlayOnTheRight"); },
    group: "view",
    icon: FolderOpen,
    keywords: ["explorer", "files", "right rail"],
    shortcut: (modifierLabel) => `${modifierLabel}+E`,
    build: (args) => ({
      id: "view.show-explorer",
      title: i18n.t("shell:commandPaletteRegistry.showExplorerPanel"),
      subtitle: i18n.t("shell:commandPaletteRegistry.openTheExplorerOverlay"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.searchInFiles"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheExplorerSearchPanelForExact"); },
    group: "view",
    icon: Search,
    keywords: ["search", "files", "content", "ripgrep", "explorer"],
    shortcut: (modifierLabel) => `${modifierLabel}+Shift+F`,
    build: (args) => ({
      id: "view.search-in-files",
      title: i18n.t("shell:commandPaletteRegistry.searchInFiles"),
      subtitle: i18n.t("shell:commandPaletteRegistry.searchTheActiveWorkspaceContentsFromThe"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.toggleInformationPanel"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.showOrHideTheWorkspaceInformationOverlay"); },
    group: "view",
    icon: LibraryBig,
    keywords: ["knowledge", "information", "goals", "decisions", "notes", "jira", "figma", "slack"],
    shortcut: (modifierLabel) => `${modifierLabel}+I`,
    build: (args) => ({
      id: "view.show-information",
      title:
        args.layout.sidebarOverlayVisible &&
        args.layout.sidebarOverlayTab === "information"
          ? i18n.t("shell:commandPaletteRegistry.hideInformationPanel")
          : i18n.t("shell:commandPaletteRegistry.showInformationPanel"),
      subtitle: i18n.t("shell:commandPaletteRegistry.openNotesLinksPlansAndStructuredWorkspace"),
      group: "view",
      icon: LibraryBig,
      keywords: ["knowledge", "information", "goals", "decisions", "notes", "jira", "figma", "slack"],
      shortcut: `${args.modifierLabel}+I`,
      run: args.commands.toggleInformationPanel,
      source: "core",
    }),
  },
  {
    id: "view.show-scripts",
    get title() { return i18n.t("shell:commandPaletteRegistry.show", { value1: WORKSPACE_TOOLS_PRESENTATION.label }); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openLongRunningProcessesAndOneShotCommandsOn"); },
    group: "view",
    icon: WorkspaceToolsIcon,
    keywords: [
      "scripts",
      "commands",
      "processes",
      "hooks",
      "services",
      "orbit",
    ],
    shortcut: (modifierLabel) => `${modifierLabel}+K S`,
    build: (args) => ({
      id: "view.show-scripts",
      title: i18n.t("shell:commandPaletteRegistry.show", { value1: WORKSPACE_TOOLS_PRESENTATION.label }),
      subtitle: i18n.t("shell:commandPaletteRegistry.openLongRunningProcessesOneShotCommandsAndTriggers"),
      group: "view",
      icon: WorkspaceToolsIcon,
      keywords: [
        "scripts",
        "commands",
        "processes",
        "hooks",
        "services",
        "orbit",
      ],
      shortcut: `${args.modifierLabel}+K S`,
      run: () => args.commands.showOverlayTab("scripts"),
      source: "core",
    }),
  },
  {
    id: "view.show-lens",
    get title() { return i18n.t("shell:commandPaletteRegistry.openLensTab"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.focusTheLatestLensTabOrCreate"); },
    group: "view",
    icon: Globe,
    keywords: ["lens", "browser", "preview", "inspect", "right rail"],
    shortcut: (modifierLabel) => `${modifierLabel}+K L`,
    build: (args) => ({
      id: "view.show-lens",
      title: i18n.t("shell:commandPaletteRegistry.openLensTab"),
      subtitle: i18n.t("shell:commandPaletteRegistry.focusTheLatestEmbeddedBrowserTabOr"),
      group: "view",
      icon: Globe,
      keywords: ["lens", "browser", "preview", "inspect", "right rail"],
      shortcut: `${args.modifierLabel}+K L`,
      run: args.commands.openLens,
      source: "core",
    }),
  },
  {
    id: "view.open-git-graph",
    get title() { return i18n.t(OPEN_COMMIT_GRAPH_TITLE_KEY); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheCommitGraphForTheActive"); },
    group: "view",
    icon: GitGraph,
    keywords: ["git", "graph", "commits", "log", "branches", "history"],
    build: (args) =>
      args.workspacePath &&
      args.workspaces.some((workspace) => workspace.isActive)
        ? {
            id: "view.open-git-graph",
            get title() { return i18n.t(OPEN_COMMIT_GRAPH_TITLE_KEY); },
            subtitle: i18n.t("shell:commandPaletteRegistry.openTheCommitGraphInAnEditor"),
            group: "view",
            icon: GitGraph,
            keywords: ["git", "graph", "commits", "log", "branches", "history"],
            run: args.commands.openGitGraph,
            source: "core",
          }
        : null,
  },
  {
    id: "view.split-pane-right",
    get title() { return i18n.t("shell:commandPaletteRegistry.splitPaneRight"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.moveTheActiveTabIntoANew"); },
    group: "view",
    icon: SplitSquareHorizontal,
    keywords: ["split", "pane", "right", "group"],
    shortcut: (modifierLabel) => `${modifierLabel}+\\`,
    build: (args) => ({
      id: "view.split-pane-right",
      title: i18n.t("shell:commandPaletteRegistry.splitPaneRight"),
      subtitle: i18n.t("shell:commandPaletteRegistry.moveTheActiveTabIntoANew"),
      group: "view",
      icon: SplitSquareHorizontal,
      keywords: ["split", "pane", "right", "group"],
      shortcut: `${args.modifierLabel}+\\`,
      run: () => args.commands.splitActivePanel("right"),
      source: "core",
    }),
  },
  {
    id: "view.split-pane-down",
    get title() { return i18n.t("shell:commandPaletteRegistry.splitPaneDown"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.moveTheActiveTabIntoANew2"); },
    group: "view",
    icon: SplitSquareHorizontal,
    keywords: ["split", "pane", "down", "below", "group"],
    shortcut: (modifierLabel) => `${modifierLabel}+Shift+\\`,
    build: (args) => ({
      id: "view.split-pane-down",
      title: i18n.t("shell:commandPaletteRegistry.splitPaneDown"),
      subtitle: i18n.t("shell:commandPaletteRegistry.moveTheActiveTabIntoANew2"),
      group: "view",
      icon: SplitSquareHorizontal,
      keywords: ["split", "pane", "down", "below", "group"],
      shortcut: `${args.modifierLabel}+Shift+\\`,
      run: () => args.commands.splitActivePanel("below"),
      source: "core",
    }),
  },
  {
    id: "view.toggle-editor",
    get title() { return i18n.t("shell:commandPaletteRegistry.focusEditor"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.focusTheActiveEditorTabOrSearch"); },
    group: "view",
    icon: PanelRight,
    keywords: ["editor", "code", "panel", "focus"],
    shortcut: (modifierLabel) => `${modifierLabel}+\\`,
    build: (args) => ({
      id: "view.toggle-editor",
      title: i18n.t("shell:commandPaletteRegistry.focusEditor"),
      subtitle: i18n.t("shell:commandPaletteRegistry.focusTheActiveEditorTab"),
      group: "view",
      icon: PanelRight,
      keywords: ["editor", "code", "panel", "focus"],
      shortcut: `${args.modifierLabel}+\\`,
      run: args.commands.toggleEditor,
      source: "core",
    }),
  },
  {
    id: "view.toggle-terminal",
    get title() { return i18n.t("shell:commandPaletteRegistry.toggleTerminal"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.focusTheTerminalPaneOrReturnTo"); },
    group: "view",
    icon: Terminal,
    keywords: ["terminal", "console", "shell"],
    shortcut: (modifierLabel) => `${modifierLabel}+\``,
    build: (args) => ({
      id: "view.toggle-terminal",
      title: i18n.t("shell:commandPaletteRegistry.toggleTerminal"),
      subtitle: i18n.t("shell:commandPaletteRegistry.focusTheTerminalPaneOrReturnTo"),
      group: "view",
      icon: Terminal,
      keywords: ["terminal", "console", "shell"],
      shortcut: `${args.modifierLabel}+\``,
      run: args.commands.toggleTerminal,
      source: "core",
    }),
  },
  {
    id: "task.save-file",
    get title() { return i18n.t("shell:commandPaletteRegistry.saveFile"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.saveTheActiveEditorTab"); },
    group: "task",
    icon: Save,
    keywords: ["save", "editor", "write file"],
    shortcut: (modifierLabel) => `${modifierLabel}+S`,
    build: (args) =>
      args.activeEditorTabId
        ? {
            id: "task.save-file",
            title: i18n.t("shell:commandPaletteRegistry.saveFile"),
            subtitle: i18n.t("shell:commandPaletteRegistry.writeTheCurrentEditorTabToDisk"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.setProviderClaude"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.switchTheActiveTaskToClaudeCode"); },
    group: "provider",
    providerIcon: "claude-code",
    keywords: ["provider", "claude", "model"],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "provider.set.claude-code",
            title: i18n.t("shell:commandPaletteRegistry.setProviderClaude"),
            subtitle: i18n.t("shell:commandPaletteRegistry.switchTheActiveTaskToClaudeCode"),
            group: "provider",
            providerIcon: "claude-code",
            keywords: ["provider", "claude", "model"],
            run: () =>
              args.commands.setTaskProvider(args.activeTaskId, "claude-code"),
            source: "core",
          }
        : null,
  },
  {
    id: "provider.set.codex",
    get title() { return i18n.t("shell:commandPaletteRegistry.setProviderCodex"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.switchTheActiveTaskToCodex"); },
    group: "provider",
    providerIcon: "codex",
    keywords: ["provider", "codex", "model"],
    build: (args) =>
      args.activeTaskId
        ? {
            id: "provider.set.codex",
            title: i18n.t("shell:commandPaletteRegistry.setProviderCodex"),
            subtitle: i18n.t("shell:commandPaletteRegistry.switchTheActiveTaskToCodex"),
            group: "provider",
            providerIcon: "codex",
            keywords: ["provider", "codex", "model"],
            run: () =>
              args.commands.setTaskProvider(args.activeTaskId, "codex"),
            source: "core",
          }
        : null,
  },
  {
    id: "settings.open",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettings"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheMainSettingsDialog"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "preferences"],
    shortcut: (modifierLabel) => `${modifierLabel}+,`,
    build: (args) => ({
      id: "settings.open",
      title: i18n.t("shell:commandPaletteRegistry.openSettings"),
      subtitle: i18n.t("shell:commandPaletteRegistry.openTheMainSettingsDialog"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettingsDesign"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheDesignSettingsSection"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "design", "theme", "appearance"],
    build: (args) => ({
      id: "settings.open.design",
      title: i18n.t("shell:commandPaletteRegistry.openSettingsDesign"),
      subtitle: i18n.t("shell:commandPaletteRegistry.jumpToThemeAndDesignSettings"),
      group: "settings",
      icon: Settings,
      keywords: ["settings", "design", "theme", "appearance"],
      run: () => args.commands.openSettings({ section: "theme" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.autoRouting",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettingsAutoModelRouter"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheAutoModelRouterRole"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "auto", "routing", "router", "stance", "model"],
    build: (args) => ({
      id: "settings.open.autoRouting",
      title: i18n.t("shell:commandPaletteRegistry.openSettingsAutoModelRouter"),
      subtitle: i18n.t("shell:commandPaletteRegistry.routingLevelsPreferenceAllowedModelsAndRules"),
      group: "settings",
      icon: Settings,
      keywords: ["settings", "auto", "routing", "router", "stance", "model"],
      run: () => args.commands.openSettings({ section: "autoRouting" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.providers",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettingsProviders"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheProvidersSettingsSection"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "providers", "models"],
    build: (args) => ({
      id: "settings.open.providers",
      title: i18n.t("shell:commandPaletteRegistry.openSettingsProviders"),
      subtitle: i18n.t("shell:commandPaletteRegistry.jumpToProviderAndModelSettings"),
      group: "settings",
      icon: Settings,
      keywords: ["settings", "providers", "models"],
      run: () => args.commands.openSettings({ section: "providers" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.models",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettingsModels"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheModelsSettingsSection"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "models", "auto", "routing", "model routing"],
    build: (args) => ({
      id: "settings.open.models",
      title: i18n.t("shell:commandPaletteRegistry.openSettingsModels"),
      subtitle: i18n.t("shell:commandPaletteRegistry.configureDefaultModelRoutingAndAutoRouting"),
      group: "settings",
      icon: Settings,
      keywords: ["settings", "models", "auto", "routing", "model routing"],
      run: () => args.commands.openSettings({ section: "models" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.command-palette",
    get title() { return i18n.t("shell:commandPaletteRegistry.openSettingsCommandPalette"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.jumpToTheGlobalCommandPaletteSettings"); },
    group: "settings",
    icon: Settings,
    keywords: ["settings", "command palette", "commands"],
    build: (args) => ({
      id: "settings.open.command-palette",
      title: i18n.t("shell:commandPaletteRegistry.openSettingsCommandPalette"),
      subtitle: i18n.t("shell:commandPaletteRegistry.configureTheGlobalIDECommandLauncher"),
      group: "settings",
      icon: Settings,
      keywords: ["settings", "command palette", "commands"],
      run: () => args.commands.openSettings({ section: "commandPalette" }),
      source: "core",
    }),
  },
  {
    id: "settings.open.shortcuts",
    get title() { return i18n.t("shell:commandPaletteRegistry.openKeyboardShortcuts"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.showTheKeyboardShortcutGuideDrawer"); },
    group: "settings",
    icon: Keyboard,
    keywords: ["keyboard", "shortcuts", "help"],
    shortcut: (modifierLabel) => `${modifierLabel}+/`,
    build: (args) => ({
      id: "settings.open.shortcuts",
      title: i18n.t("shell:commandPaletteRegistry.openKeyboardShortcuts"),
      subtitle: i18n.t("shell:commandPaletteRegistry.showTheShortcutGuideDrawer"),
      group: "settings",
      icon: Keyboard,
      keywords: ["keyboard", "shortcuts", "help"],
      shortcut: `${args.modifierLabel}+/`,
      run: args.commands.openKeyboardShortcuts,
      source: "core",
    }),
  },
  {
    id: "workspace.kickoff",
    get title() { return i18n.t("shell:commandPaletteRegistry.kickOffWorkspace"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.createAWorkspaceFromAnExternalSource"); },
    group: "task",
    icon: Rocket,
    keywords: [
      "kickoff",
      "new workspace",
      "jira",
      "slack",
      "figma",
      "prd",
      "source",
    ],
    build: (args) =>
      args.repositoryPath
        ? {
            id: "workspace.kickoff",
            title: i18n.t("shell:commandPaletteRegistry.kickOffWorkspace"),
            subtitle:
              i18n.t("shell:commandPaletteRegistry.resolveASourcePreviewDetailsAndCreate"),
            group: "task",
            icon: Rocket,
            keywords: [
              "kickoff",
              "new workspace",
              "jira",
              "slack",
              "figma",
              "prd",
              "source",
            ],
            run: args.commands.openKickoff,
            source: "core",
          }
        : null,
  },
  {
    id: "workspace.refresh-files",
    get title() { return i18n.t("shell:commandPaletteRegistry.refreshRepositoryFiles"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.rescanTheActiveWorkspaceFileList"); },
    group: "navigation",
    icon: RefreshCw,
    keywords: ["refresh", "files", "project"],
    build: (args) =>
      args.repositoryPath
        ? {
            id: "workspace.refresh-files",
            title: i18n.t("shell:commandPaletteRegistry.refreshRepositoryFiles"),
            subtitle: i18n.t("shell:commandPaletteRegistry.rescanTheActiveWorkspaceFileList"),
            group: "navigation",
            icon: RefreshCw,
            keywords: ["refresh", "files", "project"],
            run: args.commands.refreshRepositoryFiles,
            source: "core",
          }
        : null,
  },
  {
    id: "workspace.refresh-workspaces",
    get title() { return i18n.t("shell:commandPaletteRegistry.refreshWorkspaces"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.rediscoverRepositoryWorkspacesAndPRState"); },
    group: "navigation",
    icon: RefreshCw,
    keywords: ["refresh", "workspace", "worktree"],
    build: (args) =>
      args.repositoryPath
        ? {
            id: "workspace.refresh-workspaces",
            title: i18n.t("shell:commandPaletteRegistry.refreshWorkspaces"),
            subtitle: i18n.t("shell:commandPaletteRegistry.rediscoverWorkspacesForTheCurrentRepository"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.revealActiveWorkspace"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.showTheActiveWorkspaceInTheSystem"); },
    group: "external",
    icon: FolderOpen,
    keywords: ["finder", "explorer", "file manager", "workspace"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.reveal-active-workspace",
            title: i18n.t("shell:commandPaletteRegistry.revealActiveWorkspace"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInVSCode"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheActiveWorkspaceFolderInVS"); },
    group: "external",
    icon: FolderOpen,
    keywords: ["external", "vscode", "editor"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-vscode",
            title: i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInVSCode"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInTerminal"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheActiveWorkspaceFolderInThe"); },
    group: "external",
    icon: Terminal,
    keywords: ["external", "terminal", "shell"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-terminal",
            title: i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInTerminal"),
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
    get title() { return i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInGhostty"); },
    get description() { return i18n.t("shell:commandPaletteRegistry.openTheActiveWorkspaceFolderInThe2"); },
    group: "external",
    icon: Terminal,
    keywords: ["external", "ghostty", "terminal"],
    build: (args) =>
      args.workspacePath
        ? {
            id: "external.open-active-workspace-ghostty",
            title: i18n.t("shell:commandPaletteRegistry.openActiveWorkspaceInGhostty"),
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
      title: i18n.t("shell:commandPaletteRegistry.switchTask", { value1: formatTaskTitle(task.title) }),
      subtitle: task.isActive
        ? i18n.t("shell:commandPaletteRegistry.activeTask", { value1: getProviderLabel({ providerId: task.provider }) })
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
      title: i18n.t("shell:commandPaletteRegistry.switchWorkspace", { value1: formatWorkspaceTitle({ isDefault: workspace.isDefault, name: workspace.name }) }),
      subtitle: workspace.isActive
        ? i18n.t("shell:commandPaletteRegistry.activeWorkspace", { value1: workspace.branch ? ` · ${workspace.branch}` : "" })
        : (workspace.branch ?? workspace.path ?? i18n.t("shell:commandPaletteRegistry.workspace")),
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

  for (const repository of args.repositories) {
    actions.push({
      id: `project.open.${repository.repositoryPath}`,
      title: i18n.t("shell:commandPaletteRegistry.openRepository", { value1: repository.repositoryName }),
      subtitle: repository.isCurrent ? i18n.t("shell:commandPaletteRegistry.currentRepository") : repository.repositoryPath,
      group: "navigation",
      icon: LibraryBig,
      keywords: [
        "open repository",
        "project",
        repository.repositoryName,
        repository.repositoryPath,
      ],
      run: () => args.commands.openRepository(repository.repositoryPath),
      source: "dynamic",
      customizable: false,
    });
  }

  return actions;
}

function findActiveCommandPaletteTask(args: CommandPaletteRuntimeContext) {
  return (
    args.tasks.find((task) => task.id === args.activeTaskId) ??
    args.tasks.find((task) => task.isActive)
  );
}

export function resolveCommandPaletteContextRelevance(args: {
  action: CommandPaletteAction;
  context: CommandPaletteRuntimeContext;
}): CommandPaletteContextRelevance | null {
  const { action, context } = args;
  const activeTask = findActiveCommandPaletteTask(context);

  if (action.id.startsWith("task.select.")) {
    const taskId = action.id.slice("task.select.".length);
    const task = context.tasks.find((candidate) => candidate.id === taskId);
    if (!task || task.isActive) {
      return null;
    }
    return task.isResponding
      ? { label: i18n.t("shell:commandPaletteRegistry.runningTask"), score: 118 }
      : { label: i18n.t("shell:commandPaletteRegistry.taskSwitch"), score: 72 };
  }

  if (action.id.startsWith("workspace.select.")) {
    const workspaceId = action.id.slice("workspace.select.".length);
    const workspace = context.workspaces.find(
      (candidate) => candidate.id === workspaceId,
    );
    return !workspace || workspace.isActive
      ? null
      : { label: i18n.t("shell:commandPaletteRegistry.workspaceSwitch"), score: 66 };
  }

  if (action.id.startsWith("project.open.")) {
    const repositoryPath = action.id.slice("project.open.".length);
    const repository = context.repositories.find(
      (candidate) => candidate.repositoryPath === repositoryPath,
    );
    return !repository || repository.isCurrent
      ? null
      : { label: i18n.t("shell:commandPaletteRegistry.recentRepository"), score: 52 };
  }

  if (action.id === "task.stop-active-turn" && context.hasActiveTurn) {
    return { label: i18n.t("shell:commandPaletteRegistry.runningNow"), score: 140 };
  }

  if (action.id === "task.save-file" && context.activeEditorTabId) {
    return { label: i18n.t("shell:commandPaletteRegistry.openEditor"), score: 130 };
  }

  if (
    (action.id === "task.create-pr" ||
      action.id === "task.continue-workspace") &&
    !context.activeWorkspaceIsDefault
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.currentBranch"), score: 120 };
  }

  if (
    action.group === "scripts" &&
    context.layout.sidebarOverlayVisible &&
    context.layout.sidebarOverlayTab === "scripts"
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.currentPanel"), score: 112 };
  }

  if (
    action.id === "navigation.fleet-view" &&
    context.tasks.filter((task) => task.isResponding).length > 1
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.parallelWork"), score: 108 };
  }

  if (
    (action.id === "view.split-pane-right" ||
      action.id === "view.split-pane-down" ||
      action.id === "view.toggle-editor") &&
    context.activeEditorTabId
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.openEditor"), score: 96 };
  }

  if (
    action.id === "view.toggle-changes-panel" &&
    !context.activeWorkspaceIsDefault
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.currentBranch"), score: 94 };
  }

  if (
    (action.id === "task.compare-providers" ||
      action.id === "view.show-information") &&
    context.activeTaskId
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.activeTask2"), score: 90 };
  }

  if (action.group === "provider" && activeTask) {
    const providerId = action.id.slice("provider.set.".length);
    return providerId === activeTask.provider
      ? null
      : { label: i18n.t("shell:commandPaletteRegistry.activeTask2"), score: 86 };
  }

  if (action.id === "task.new" && !context.activeTaskId) {
    return { label: i18n.t("shell:commandPaletteRegistry.noTaskOpen"), score: 84 };
  }

  if (
    (action.id === "navigation.quick-open-file" ||
      action.id === "view.search-in-files") &&
    context.repositoryPath
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.currentRepository"), score: 80 };
  }

  if (
    action.id === "view.show-scripts" &&
    context.workspacePath &&
    !(
      context.layout.sidebarOverlayVisible &&
      context.layout.sidebarOverlayTab === "scripts"
    )
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.currentWorkspace"), score: 62 };
  }

  if (
    action.id === "navigation.latest-completed-turn-task" &&
    !context.activeTaskId
  ) {
    return { label: i18n.t("shell:commandPaletteRegistry.resumeWork"), score: 60 };
  }

  return null;
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

  const recentRankById = new Map(
    args.preferences.recentIds.map((id, index) => [id, index] as const),
  );
  const contextualItems = visibleActions
    .filter((action) => !pinnedIds.has(action.id))
    .map((action) => ({
      action,
      relevance: resolveCommandPaletteContextRelevance({
        action,
        context: args,
      }),
    }))
    .filter(
      (
        entry,
      ): entry is {
        action: CommandPaletteAction;
        relevance: CommandPaletteContextRelevance;
      } => Boolean(entry.relevance),
    )
    .sort((left, right) => {
      const relevanceDelta = right.relevance.score - left.relevance.score;
      if (relevanceDelta !== 0) {
        return relevanceDelta;
      }
      const recentDelta =
        (recentRankById.get(left.action.id) ?? Number.MAX_SAFE_INTEGER) -
        (recentRankById.get(right.action.id) ?? Number.MAX_SAFE_INTEGER);
      return recentDelta || sortActions(left.action, right.action);
    })
    .slice(0, MAX_CONTEXTUAL_COMMAND_IDS)
    .map(({ action, relevance }) => ({
      ...action,
      contextLabel: relevance.label,
    }));
  const contextualIds = new Set(contextualItems.map((action) => action.id));

  const recentItems = args.preferences.showRecent
    ? args.preferences.recentIds
        .map((id) => byId.get(id))
        .filter((action): action is CommandPaletteAction => Boolean(action))
        .filter(
          (action) =>
            !pinnedIds.has(action.id) && !contextualIds.has(action.id),
        )
    : [];
  const recentIds = new Set(recentItems.map((action) => action.id));

  const remainingItems = visibleActions
    .filter(
      (action) =>
        !pinnedIds.has(action.id) &&
        !contextualIds.has(action.id) &&
        !recentIds.has(action.id),
    )
    .sort(sortActions);

  const sections: CommandPaletteGroupSection[] = [];

  if (pinnedItems.length > 0) {
    sections.push({
      key: "pinned",
      title: COMMAND_PALETTE_GROUP_LABELS.pinned,
      items: pinnedItems,
    });
  }

  if (contextualItems.length > 0) {
    sections.push({
      key: "suggested",
      title: COMMAND_PALETTE_GROUP_LABELS.suggested,
      items: contextualItems,
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

function normalizeCommandPaletteSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function scoreFuzzySubsequence(value: string, query: string) {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (
    let valueIndex = 0;
    valueIndex < value.length && queryIndex < query.length;
    valueIndex += 1
  ) {
    if (value[valueIndex] !== query[queryIndex]) {
      continue;
    }
    firstMatch = firstMatch === -1 ? valueIndex : firstMatch;
    lastMatch = valueIndex;
    queryIndex += 1;
  }

  if (queryIndex !== query.length || firstMatch === -1) {
    return 0;
  }

  const matchSpan = lastMatch - firstMatch + 1;
  const density = query.length / Math.max(query.length, matchSpan);
  const prefixBonus = firstMatch === 0 ? 0.08 : 0;
  return 0.34 + density * 0.26 + prefixBonus;
}

function scoreCommandPaletteSearchField(value: string, query: string) {
  if (!value) {
    return 0;
  }
  if (value === query) {
    return 1;
  }
  if (value.startsWith(query)) {
    return 0.96;
  }
  if (value.split(" ").some((word) => word.startsWith(query))) {
    return 0.9;
  }
  if (value.includes(query)) {
    return 0.82;
  }
  return scoreFuzzySubsequence(value, query);
}

export function scoreCommandPaletteSearch(args: {
  action: CommandPaletteAction;
  groupTitle: string;
  query: string;
}) {
  const query = normalizeCommandPaletteSearchValue(args.query);
  if (!query) {
    return 1;
  }

  const fields = [
    args.action.title,
    args.action.subtitle ?? "",
    ...(args.action.keywords ?? []),
    args.groupTitle,
  ].map(normalizeCommandPaletteSearchValue);
  const queryTerms = query.split(" ");
  const termScores = queryTerms.map((term) =>
    Math.max(
      ...fields.map((field) => scoreCommandPaletteSearchField(field, term)),
    ),
  );
  if (termScores.some((score) => score === 0)) {
    return 0;
  }

  const phraseScore = Math.max(
    ...fields.map((field) => scoreCommandPaletteSearchField(field, query)),
  );
  const averageTermScore =
    termScores.reduce((total, score) => total + score, 0) / termScores.length;
  return Math.min(1, Math.max(phraseScore, averageTermScore * 0.92));
}

export function searchCommandPaletteGroups(args: {
  groups: CommandPaletteGroupSection[];
  query: string;
}): CommandPaletteGroupSection[] {
  if (!args.query.trim()) {
    return args.groups;
  }

  return args.groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((action, index) => ({
          action,
          index,
          score: scoreCommandPaletteSearch({
            action,
            groupTitle: group.title,
            query: args.query,
          }),
        }))
        .filter((entry) => entry.score > 0)
        .sort(
          (left, right) => right.score - left.score || left.index - right.index,
        )
        .map((entry) => entry.action),
    }))
    .filter((group) => group.items.length > 0);
}

export function toggleCommandPalettePinnedAction(args: {
  commandId: string;
  hiddenIds: string[];
  pinnedIds: string[];
}) {
  const wasPinned = args.pinnedIds.includes(args.commandId);
  return {
    isPinned: !wasPinned,
    hiddenIds: args.hiddenIds.filter((id) => id !== args.commandId),
    pinnedIds: wasPinned
      ? args.pinnedIds.filter((id) => id !== args.commandId)
      : [
          args.commandId,
          ...args.pinnedIds.filter((id) => id !== args.commandId),
        ],
  };
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
