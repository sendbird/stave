import type { I18nKey } from "@/i18n/runtime";
import {
  DEFAULT_APP_SHORTCUT_KEYS,
  type AppShortcutCommandId,
} from "@/lib/app-shortcuts";
import {
  matchesKeyStep,
  parseKeySequence,
  resolveKeybindingPlatform,
  type KeyEventLike,
  type KeybindingPlatform,
  type KeySequence,
} from "@/lib/keybindings/key-chord";
import type { KeybindingScope } from "@/lib/keybindings/keybinding-scopes";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

/**
 * Every keyboard shortcut Stave answers to, in one table: what it does, which
 * keys trigger it, where it is live, and which file acts on it.
 *
 * App-level shortcuts are dispatched from this table by
 * `src/components/layout/useAppKeybindings.ts`. Shortcuts owned by one surface
 * keep their handler next to that surface; their rows here exist so the
 * shortcut list, the docs check and the conflict check see them too. Change a
 * key here and in its handler together.
 */

/**
 * How a shortcut treats focus in an editable field (input, textarea, select,
 * contenteditable, the terminal):
 * - `allow`: fires either way.
 * - `terminal`: not while typing, except in the terminal, where Cmd-based
 *   combinations still fire and Ctrl-only ones stay with the shell.
 * - `block`: never while typing, the terminal and the composer included.
 * - `only`: only while typing in the scope's field.
 */
export type KeybindingEditableRule = "allow" | "terminal" | "block" | "only";

export type KeybindingSectionId =
  | "navigation"
  | "tabs"
  | "panels"
  | "composer"
  | "models"
  | "presets"
  | "editing"
  | "surfaces"
  | "window";

/**
 * Shortcuts whose keys the user picks in Settings. The table holds the
 * default; `resolveKeybindingSequences` applies the stored choice.
 */
export type KeybindingCustomization =
  | "app-chord"
  | "prompt-comment"
  | "visual-comment"
  | "model-slots"
  | "preset-slots";

export interface KeybindingEntry {
  id: string;
  /** Default key sequences on every platform (see `key-chord.ts`). */
  keys: readonly string[];
  /** Replaces `keys` on the named platform. An empty list means none there. */
  platformKeys?: Partial<Record<KeybindingPlatform, readonly string[]>>;
  scope: KeybindingScope;
  /** Live only while focus is inside the scope's element. */
  focus?: boolean;
  editable: KeybindingEditableRule;
  /**
   * The handler skips an event another handler already prevented, so a
   * focused element's own shortcut for the same key wins without a conflict.
   */
  yieldsToHandled?: boolean;
  titleKey: I18nKey;
  descriptionKey: I18nKey;
  /** Interpolation values for `titleKey`, resolved when the title renders. */
  titleValues?: () => Record<string, string>;
  section: KeybindingSectionId;
  /** Repo-relative files that act on the keys. */
  handledBy: readonly string[];
  customization?: KeybindingCustomization;
}

/** The hook that dispatches app-level rows of this table. */
export const APP_SHELL_KEYBINDING_OWNER =
  "src/components/layout/useAppKeybindings.ts";
const APP_SHELL = APP_SHELL_KEYBINDING_OWNER;
const MAIN_WINDOW = "electron/main/window.ts";
const PROMPT_INPUT = "src/components/ai-elements/prompt-input.tsx";

/** A `Cmd/Ctrl+K` chord whose second key the user can change in Settings. */
function appChord<TId extends AppShortcutCommandId>(
  id: TId,
  entry: Pick<
    KeybindingEntry,
    "titleKey" | "descriptionKey" | "section" | "titleValues"
  >,
): KeybindingEntry & { id: TId } {
  return {
    id,
    keys: [`mod+k mod?+${DEFAULT_APP_SHORTCUT_KEYS[id]}`],
    scope: "global",
    editable: "allow",
    handledBy: [APP_SHELL],
    customization: "app-chord",
    ...entry,
  };
}

export const KEYBINDING_SECTION_ORDER: readonly KeybindingSectionId[] = [
  "navigation",
  "tabs",
  "panels",
  "composer",
  "models",
  "presets",
  "editing",
  "surfaces",
  "window",
];

export const KEYBINDING_SECTIONS: Record<
  KeybindingSectionId,
  { titleKey: I18nKey; descriptionKey: I18nKey }
> = {
  navigation: {
    titleKey: "shell:keybindings.sections.navigation.title",
    descriptionKey: "shell:keybindings.sections.navigation.description",
  },
  tabs: {
    titleKey: "shell:keybindings.sections.tabs.title",
    descriptionKey: "shell:keybindings.sections.tabs.description",
  },
  panels: {
    titleKey: "shell:keyboardShortcutsDrawer.panels",
    descriptionKey: "shell:keyboardShortcutsDrawer.controlTheShellLayoutWithoutLeavingThe",
  },
  composer: {
    titleKey: "shell:keybindings.sections.composer.title",
    descriptionKey: "shell:keybindings.sections.composer.description",
  },
  models: {
    titleKey: "shell:keyboardShortcutsDrawer.models",
    descriptionKey: "shell:keyboardShortcutsDrawer.jumpDirectlyToTheModelsYouMapped",
  },
  presets: {
    titleKey: "shell:keyboardShortcutsDrawer.presets",
    descriptionKey: "shell:keyboardShortcutsDrawer.launchThePresetBarWithoutLeavingThe",
  },
  editing: {
    titleKey: "shell:keybindings.sections.editing.title",
    descriptionKey: "shell:keybindings.sections.editing.description",
  },
  surfaces: {
    titleKey: "shell:keybindings.sections.surfaces.title",
    descriptionKey: "shell:keybindings.sections.surfaces.description",
  },
  window: {
    titleKey: "shell:keybindings.sections.window.title",
    descriptionKey: "shell:keybindings.sections.window.description",
  },
};

export const KEYBINDING_REGISTRY = [
  // ── navigation ──────────────────────────────────────────────────────────
  appChord("navigation.home", {
    titleKey: "shell:appShortcuts.goHome",
    descriptionKey: "shell:appShortcuts.clearTheActiveTaskSelectionAndReturn",
    section: "navigation",
  }),
  appChord("navigation.fleet-view", {
    titleKey: "shell:appShortcuts.openFleetView",
    descriptionKey: "shell:appShortcuts.openTheCrossWorkspaceAgentStatusView",
    section: "navigation",
  }),
  appChord("navigation.automation-center", {
    titleKey: "shell:appShortcuts.openSchedules",
    descriptionKey: "shell:appShortcuts.openWorkThatRunsOnItsOwn",
    section: "navigation",
  }),
  appChord("navigation.issues", {
    titleKey: "shell:appShortcuts.openIssues",
    descriptionKey: "shell:appShortcuts.openAssignedTrackerTicketsAndStartA",
    section: "navigation",
  }),
  appChord("navigation.agents", {
    titleKey: "shell:appShortcuts.openAgents",
    descriptionKey: "shell:appShortcuts.openSavedAgentsWorkflowsAndYourStandards",
    section: "navigation",
  }),
  {
    id: "navigation.back",
    keys: ["mod+["],
    scope: "workspace",
    editable: "block",
    titleKey: "shell:keybindings.entries.back.title",
    descriptionKey: "shell:keybindings.entries.back.description",
    section: "navigation",
    handledBy: [APP_SHELL],
  },
  {
    id: "navigation.forward",
    keys: ["mod+]"],
    scope: "workspace",
    editable: "block",
    titleKey: "shell:keybindings.entries.forward.title",
    descriptionKey: "shell:keybindings.entries.forward.description",
    section: "navigation",
    handledBy: [APP_SHELL],
  },
  {
    id: "workspace.select-visible",
    keys: ["mod+shift+1-9"],
    scope: "sidebar",
    editable: "block",
    titleKey: "shell:keyboardShortcutsDrawer.selectWorkspace",
    descriptionKey: "shell:keyboardShortcutsDrawer.jumpToTheFirstNineVisibleWorkspaces",
    section: "navigation",
    handledBy: ["src/components/layout/RepositoryWorkspaceSidebar.tsx"],
  },
  {
    id: "file.quick-open",
    keys: ["mod+p"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.quickOpenFile",
    descriptionKey: "shell:keyboardShortcutsDrawer.searchTheActiveWorkspaceFilesAndOpen",
    section: "navigation",
    handledBy: [APP_SHELL, "src/components/layout/TopBarFileSearch.tsx"],
  },
  {
    id: "command-palette.open",
    keys: ["mod+shift+p"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.openCommandPalette",
    descriptionKey: "shell:keyboardShortcutsDrawer.openTheGlobalStaveCommandLauncherFor",
    section: "navigation",
    handledBy: [APP_SHELL],
  },
  {
    id: "settings.open",
    keys: ["mod+,"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.openSettings",
    descriptionKey: "shell:keyboardShortcutsDrawer.openTheMainStaveSettingsDialog",
    section: "navigation",
    handledBy: [APP_SHELL],
  },

  // ── tasks and tabs ──────────────────────────────────────────────────────
  {
    id: "task.new",
    keys: ["mod+shift?+alt?+n"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.newTask",
    descriptionKey: "shell:keyboardShortcutsDrawer.startAFreshTaskInTheSelected",
    section: "tabs",
    handledBy: [APP_SHELL],
  },
  {
    id: "pane.close-tab",
    keys: ["mod+w"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.closeTabTask",
    descriptionKey: "shell:keyboardShortcutsDrawer.closeTheActivePaneTabWithoutArchiving",
    section: "tabs",
    handledBy: [MAIN_WINDOW, APP_SHELL],
  },
  {
    id: "tabs.reopen-closed",
    keys: ["mod+shift+t"],
    scope: "workspace",
    editable: "allow",
    titleKey: "shell:keybindings.entries.reopenClosedTab.title",
    descriptionKey: "shell:keybindings.entries.reopenClosedTab.description",
    section: "tabs",
    handledBy: [APP_SHELL],
  },
  {
    id: "task.next",
    keys: ["mod+shift+alt?+j", "mod+shift+alt?+arrowdown"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.nextTask",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveSelectionToTheNextTask",
    section: "tabs",
    handledBy: [APP_SHELL],
  },
  {
    id: "task.previous",
    keys: ["mod+shift+alt?+k", "mod+shift+alt?+arrowup"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.previousTask",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveSelectionToThePreviousTask",
    section: "tabs",
    handledBy: [APP_SHELL],
  },
  {
    id: "pane.split-right",
    keys: ["mod+\\"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.splitPaneRight",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveTheActiveTabIntoANew",
    section: "tabs",
    handledBy: [APP_SHELL],
  },
  {
    id: "pane.split-down",
    keys: ["mod+shift+\\"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.splitPaneDown",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveTheActiveTabIntoANew2",
    section: "tabs",
    handledBy: [APP_SHELL],
  },

  // ── panels ──────────────────────────────────────────────────────────────
  appChord("view.toggle-workspace-sidebar", {
    titleKey: "shell:appShortcuts.toggleWorkspaceSidebar",
    descriptionKey: "shell:appShortcuts.collapseOrExpandTheLeftRepositoryAnd",
    section: "panels",
  }),
  appChord("view.toggle-changes-panel", {
    titleKey: "shell:appShortcuts.toggleSourceControlPanel",
    descriptionKey: "shell:appShortcuts.showOrHideTheSourceControlOverlay",
    section: "panels",
  }),
  appChord("view.show-explorer", {
    titleKey: "shell:appShortcuts.openExplorerPanel",
    descriptionKey: "shell:appShortcuts.openTheExplorerOverlayOnTheRight",
    section: "panels",
  }),
  {
    id: "explorer.search-in-files",
    keys: ["mod+shift+f"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.searchInFiles",
    descriptionKey: "shell:keyboardShortcutsDrawer.openTheExplorerSearchUIAndSearch",
    section: "panels",
    handledBy: [APP_SHELL],
  },
  appChord("view.show-information", {
    titleKey: "shell:appShortcuts.toggleInformationPanel",
    descriptionKey: "shell:appShortcuts.showOrHideNotesLinksPlansAnd",
    section: "panels",
  }),
  appChord("view.show-scripts", {
    titleKey: "shell:appShortcuts.open",
    titleValues: () => ({ value1: WORKSPACE_TOOLS_PRESENTATION.label }),
    descriptionKey:
      "shell:appShortcuts.openLongRunningProcessesOneShotCommandsLifecycleTriggers",
    section: "panels",
  }),
  appChord("view.show-lens", {
    titleKey: "shell:appShortcuts.openLensTab",
    descriptionKey: "shell:appShortcuts.focusTheLatestEmbeddedBrowserTabOr",
    section: "panels",
  }),
  {
    id: "lens.visual-comment",
    keys: ["mod+alt+."],
    scope: "lens",
    editable: "block",
    titleKey: "shell:keyboardShortcutsDrawer.visualComment",
    descriptionKey: "shell:keyboardShortcutsDrawer.toggleLensVisualCommentModeWhileThe",
    section: "panels",
    handledBy: [
      "src/components/panes/surfaces/lens/useLensVisualCommentShortcut.ts",
      "electron/main/browser/browser-manager.ts",
    ],
    customization: "visual-comment",
  },
  appChord("view.toggle-editor", {
    titleKey: "shell:appShortcuts.focusEditor",
    descriptionKey: "shell:appShortcuts.focusTheActiveEditorTab",
    section: "panels",
  }),
  appChord("view.toggle-terminal", {
    titleKey: "shell:appShortcuts.toggleTerminal",
    descriptionKey: "shell:appShortcuts.focusTheTerminalPaneCreatingOneIf",
    section: "panels",
  }),

  // ── composer ────────────────────────────────────────────────────────────
  {
    id: "composer.focus",
    keys: ["mod+l", "mod+j"],
    scope: "composer",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keyboardShortcutsDrawer.focusPromptComposer",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveFocusBackToTheChatPrompt",
    section: "composer",
    handledBy: [PROMPT_INPUT],
  },
  {
    id: "composer.stage-comment",
    keys: ["mod+enter"],
    scope: "composer",
    focus: true,
    editable: "only",
    titleKey: "shell:keyboardShortcutsDrawer.stageComment",
    descriptionKey: "shell:keyboardShortcutsDrawer.moveTheCurrentComposerTextIntoThe",
    section: "composer",
    handledBy: [PROMPT_INPUT],
    customization: "prompt-comment",
  },
  {
    id: "task.abort-turn",
    keys: ["alt?+escape"],
    scope: "task-pane",
    focus: true,
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.stopActiveTurn",
    descriptionKey: "shell:keyboardShortcutsDrawer.abortTheCurrentTaskRunWhileFocus",
    section: "composer",
    handledBy: [APP_SHELL, PROMPT_INPUT],
  },
  {
    id: "approval.approve",
    keys: ["enter"],
    scope: "composer",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.approve.title",
    descriptionKey: "shell:keybindings.entries.approve.description",
    section: "composer",
    handledBy: ["src/components/session/ChatInputComposer.tsx"],
  },
  {
    id: "approval.focus-guidance",
    keys: ["tab"],
    scope: "composer",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.approvalGuidance.title",
    descriptionKey: "shell:keybindings.entries.approvalGuidance.description",
    section: "composer",
    handledBy: ["src/components/session/ChatInputComposer.tsx"],
  },

  // ── models ──────────────────────────────────────────────────────────────
  {
    id: "composer.open-model-selector",
    keys: ["alt+p"],
    scope: "composer",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keyboardShortcutsDrawer.openModelSelector",
    descriptionKey: "shell:keyboardShortcutsDrawer.openThePromptModelPickerFromThe",
    section: "models",
    handledBy: [PROMPT_INPUT],
  },
  {
    id: "composer.select-model-slot",
    keys: ["alt+1-0"],
    scope: "composer",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keyboardShortcutsDrawer.modelShortcutSlots",
    descriptionKey: "shell:keyboardShortcutsDrawer.assignAlt10InSettingsCommandPalette",
    section: "models",
    handledBy: [PROMPT_INPUT],
    customization: "model-slots",
  },

  // ── presets ─────────────────────────────────────────────────────────────
  {
    id: "presets.run-slot",
    keys: ["ctrl+1-9"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.presetShortcutSlots",
    descriptionKey: "shell:keyboardShortcutsDrawer.theFirstNinePresetsInSettings",
    section: "presets",
    handledBy: [APP_SHELL],
    customization: "preset-slots",
  },

  // ── editing ─────────────────────────────────────────────────────────────
  {
    id: "editor.save",
    keys: ["mod+shift?+alt?+s"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.saveFile",
    descriptionKey: "shell:keyboardShortcutsDrawer.saveTheActiveEditorTab",
    section: "editing",
    handledBy: [APP_SHELL, "src/components/panes/surfaces/EditorSurfacePanel.tsx"],
  },
  {
    id: "work-queue.undo",
    keys: ["mod+z"],
    scope: "global",
    editable: "block",
    titleKey: "shell:keybindings.entries.undo.title",
    descriptionKey: "shell:keybindings.entries.undo.description",
    section: "editing",
    handledBy: [APP_SHELL, "src/lib/notifications/pending-undo.ts"],
  },
  {
    id: "dialog.primary-action",
    keys: ["enter", "mod+enter"],
    scope: "dialog",
    focus: true,
    editable: "allow",
    titleKey: "shell:keyboardShortcutsDrawer.dialogPrimaryAction",
    descriptionKey:
      "shell:keyboardShortcutsDrawer.runSaveCreateOpenConfirmInTheActiveDialogUse",
    section: "editing",
    handledBy: [
      "src/components/layout/ConfirmDialog.tsx",
      "src/components/layout/CreateWorkspaceDialog.tsx",
      "src/components/ai-elements/local-change-review-dialog.tsx",
    ],
  },

  // ── surfaces ────────────────────────────────────────────────────────────
  {
    id: "fleet.next-attention",
    keys: ["shift?+n"],
    scope: "fleet",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.fleetNext.title",
    descriptionKey: "shell:keybindings.entries.fleetNext.description",
    section: "surfaces",
    handledBy: ["src/components/layout/FleetView.tsx"],
  },
  {
    id: "fleet.close",
    keys: ["shift?+escape"],
    scope: "fleet",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.fleetClose.title",
    descriptionKey: "shell:keybindings.entries.fleetClose.description",
    section: "surfaces",
    handledBy: ["src/components/layout/FleetView.tsx"],
  },
  {
    id: "issues.next",
    keys: ["j", "shift?+arrowdown"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesNext.title",
    descriptionKey: "shell:keybindings.entries.issuesNext.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.previous",
    keys: ["k", "shift?+arrowup"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesPrevious.title",
    descriptionKey: "shell:keybindings.entries.issuesPrevious.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.kickoff",
    keys: ["shift?+enter", "mod+shift?+alt?+enter"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesKickoff.title",
    descriptionKey: "shell:keybindings.entries.issuesKickoff.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.open-ticket",
    keys: ["o"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesOpenTicket.title",
    descriptionKey: "shell:keybindings.entries.issuesOpenTicket.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.refresh",
    keys: ["r"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesRefresh.title",
    descriptionKey: "shell:keybindings.entries.issuesRefresh.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.focus-search",
    keys: ["/"],
    scope: "issues",
    editable: "block",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesSearch.title",
    descriptionKey: "shell:keybindings.entries.issuesSearch.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/useTrackerIssuesKeyboard.ts"],
  },
  {
    id: "issues.close",
    keys: ["mod?+alt?+shift?+escape"],
    scope: "issues",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.issuesClose.title",
    descriptionKey: "shell:keybindings.entries.issuesClose.description",
    section: "surfaces",
    handledBy: ["src/components/layout/issues/IssuesView.tsx"],
  },
  {
    id: "schedules.close",
    keys: ["shift?+escape"],
    scope: "schedules",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.schedulesClose.title",
    descriptionKey: "shell:keybindings.entries.schedulesClose.description",
    section: "surfaces",
    handledBy: ["src/components/layout/automation-center/AutomationCenterView.tsx"],
  },
  {
    id: "agents.close",
    keys: ["shift?+escape"],
    scope: "agents",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.agentsClose.title",
    descriptionKey: "shell:keybindings.entries.agentsClose.description",
    section: "surfaces",
    handledBy: ["src/components/agents/AgentsView.tsx"],
  },
  {
    id: "usage.close",
    keys: ["shift?+escape"],
    scope: "usage",
    editable: "allow",
    yieldsToHandled: true,
    titleKey: "shell:keybindings.entries.usageClose.title",
    descriptionKey: "shell:keybindings.entries.usageClose.description",
    section: "surfaces",
    handledBy: ["src/components/usage/UsageView.tsx"],
  },
  {
    id: "git-graph.search",
    keys: ["mod+f"],
    scope: "git-graph",
    focus: true,
    editable: "allow",
    titleKey: "shell:keybindings.entries.gitGraphSearch.title",
    descriptionKey: "shell:keybindings.entries.gitGraphSearch.description",
    section: "surfaces",
    handledBy: ["src/components/git-graph/GitGraphView.tsx"],
  },
  {
    id: "git-graph.reload",
    keys: ["mod+r"],
    scope: "git-graph",
    focus: true,
    editable: "allow",
    titleKey: "shell:keybindings.entries.gitGraphReload.title",
    descriptionKey: "shell:keybindings.entries.gitGraphReload.description",
    section: "surfaces",
    handledBy: ["src/components/git-graph/GitGraphView.tsx"],
  },
  {
    id: "git-graph.locate-head",
    keys: ["mod+h"],
    scope: "git-graph",
    focus: true,
    editable: "allow",
    titleKey: "shell:keybindings.entries.gitGraphHead.title",
    descriptionKey: "shell:keybindings.entries.gitGraphHead.description",
    section: "surfaces",
    handledBy: ["src/components/git-graph/GitGraphView.tsx"],
  },
  {
    id: "settings.toggle-sidebar",
    keys: ["mod+b"],
    scope: "settings",
    editable: "block",
    titleKey: "shell:keybindings.entries.settingsSidebar.title",
    descriptionKey: "shell:keybindings.entries.settingsSidebar.description",
    section: "surfaces",
    handledBy: ["src/components/ads/components/AppShell.tsx"],
  },
  {
    id: "command-palette.toggle-pin",
    keys: ["alt+shift?+p"],
    scope: "command-palette",
    focus: true,
    editable: "allow",
    titleKey: "shell:keybindings.entries.paletteTogglePin.title",
    descriptionKey: "shell:keybindings.entries.paletteTogglePin.description",
    section: "surfaces",
    handledBy: ["src/components/layout/GlobalCommandPalette.tsx"],
  },

  // ── window and help ─────────────────────────────────────────────────────
  {
    id: "help.keyboard-shortcuts",
    keys: ["mod+/"],
    scope: "global",
    editable: "terminal",
    titleKey: "shell:keyboardShortcutsDrawer.openShortcutGuide",
    descriptionKey: "shell:keyboardShortcutsDrawer.showThisPanelFromAnywhereOutsideText",
    section: "window",
    handledBy: [APP_SHELL],
  },
  {
    id: "view.zoom-in",
    keys: ["mod+shift?+plus"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.zoomIn.title",
    descriptionKey: "shell:keybindings.entries.zoomIn.description",
    section: "window",
    handledBy: [MAIN_WINDOW],
  },
  {
    id: "view.zoom-out",
    keys: ["mod+shift?+-"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.zoomOut.title",
    descriptionKey: "shell:keybindings.entries.zoomOut.description",
    section: "window",
    handledBy: [MAIN_WINDOW],
  },
  {
    id: "view.zoom-reset",
    keys: ["mod+shift?+0"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.zoomReset.title",
    descriptionKey: "shell:keybindings.entries.zoomReset.description",
    section: "window",
    handledBy: [MAIN_WINDOW],
  },
  {
    id: "developer.toggle-devtools",
    keys: ["f12", "mod+shift+i"],
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.devTools.title",
    descriptionKey: "shell:keybindings.entries.devTools.description",
    section: "window",
    handledBy: [MAIN_WINDOW, "electron/main/keyboard-shortcuts.ts"],
  },
  {
    id: "app.quit",
    keys: [],
    platformKeys: { mac: ["meta+q"] },
    scope: "global",
    editable: "allow",
    titleKey: "shell:keybindings.entries.quit.title",
    descriptionKey: "shell:keybindings.entries.quit.description",
    section: "window",
    handledBy: ["electron/main/application-menu.ts"],
  },
] as const satisfies readonly KeybindingEntry[];

export type KeybindingId = (typeof KEYBINDING_REGISTRY)[number]["id"];

const KEYBINDING_BY_ID = new Map<string, KeybindingEntry>(
  KEYBINDING_REGISTRY.map((entry) => [entry.id, entry]),
);

export function getKeybinding(id: KeybindingId): KeybindingEntry;
export function getKeybinding(id: string): KeybindingEntry | null;
export function getKeybinding(id: string): KeybindingEntry | null {
  return KEYBINDING_BY_ID.get(id) ?? null;
}

/** The default key sequences on one platform, before Settings apply. */
export function getDefaultKeybindingKeys(
  entry: KeybindingEntry,
  platform: KeybindingPlatform,
): readonly string[] {
  return entry.platformKeys?.[platform] ?? entry.keys;
}

const parsedSequenceCache = new Map<string, KeySequence>();

function parseCached(value: string): KeySequence {
  let sequence = parsedSequenceCache.get(value);
  if (!sequence) {
    sequence = parseKeySequence(value);
    parsedSequenceCache.set(value, sequence);
  }
  return sequence;
}

/**
 * True when the key press is one of the entry's single-step default keys on
 * `platform`. Multi-step chords never match a single press.
 */
export function matchesKeybinding(
  idOrEntry: KeybindingId | KeybindingEntry,
  event: KeyEventLike,
  platform: KeybindingPlatform = resolveKeybindingPlatform(),
) {
  const entry =
    typeof idOrEntry === "string" ? getKeybinding(idOrEntry) : idOrEntry;
  return getDefaultKeybindingKeys(entry, platform).some((value) => {
    const sequence = parseCached(value);
    return sequence.length === 1 && matchesKeyStep(sequence[0]!, event);
  });
}
