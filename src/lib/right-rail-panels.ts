import { i18n } from "@/i18n/runtime";
import {
  ClipboardList,
  FolderTree,
  GitBranch,
  Info,
  SearchCheck,
  type LucideIcon,
} from "lucide-react";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

export type RightRailPanelId =
  | "explorer"
  | "changes"
  | "information"
  | "skills"
  | "scripts"
  | "task";

/** Panels the right rail actually renders as sidebar overlays. */
export const RIGHT_RAIL_PANEL_IDS: readonly RightRailPanelId[] = [
  "explorer",
  "changes",
  "information",
  "skills",
  "scripts",
  "task",
];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  get explorer() { return i18n.t("shell:rightRailPanels.explorer"); },
  get changes() { return i18n.t("shell:rightRailPanels.sourceControl"); },
  get information() { return i18n.t("shell:rightRailPanels.information"); },
  get skills() { return i18n.t("shell:rightRailPanels.skills"); },
  get scripts() { return WORKSPACE_TOOLS_PRESENTATION.label; },
  get task() { return i18n.t("shell:rightRailPanels.task"); },
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  skills: SearchCheck,
  scripts: WORKSPACE_TOOLS_PRESENTATION.icon,
  task: ClipboardList,
};

/**
 * The Task panel's tabs. One rail entry answers "what is this task doing,
 * what does it need from me, what did it produce": Activity is the live or
 * last turn, Progress is the agent run when the task has one and the flow
 * overview otherwise, Subagents (tab id `team`) is every agent it called, and
 * Results is its run history.
 */
export type TaskPanelTab = "activity" | "progress" | "team" | "results";

export const TASK_PANEL_TABS: ReadonlyArray<{
  id: TaskPanelTab;
  label: string;
  /** One line for the empty panel, which lists what each tab will show. */
  description: string;
}> = [
  { id: "activity", get label() { return i18n.t("shell:rightRailPanels.activity"); }, get description() { return i18n.t("shell:rightRailPanels.theLiveTurnStepByStep"); } },
  { id: "progress", get label() { return i18n.t("shell:rightRailPanels.progress"); }, get description() { return i18n.t("shell:rightRailPanels.theRunSStagesOrTheTaskSFlow"); } },
  { id: "team", get label() { return i18n.t("shell:rightRailPanels.subagents"); }, get description() { return i18n.t("shell:rightRailPanels.everyAgentTheTaskCalled"); } },
  { id: "results", get label() { return i18n.t("shell:rightRailPanels.results"); }, get description() { return i18n.t("shell:rightRailPanels.eachRunSAnswerAndChangesToReview"); } },
];

export const DEFAULT_TASK_PANEL_TAB: TaskPanelTab = "activity";

export function isTaskPanelTab(value: unknown): value is TaskPanelTab {
  return TASK_PANEL_TABS.some((tab) => tab.id === value);
}

/** The layout patch that opens the Task panel on one of its tabs. */
export function taskPanelLayoutPatch(tab: TaskPanelTab) {
  return {
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "task",
    taskPanelTab: tab,
  } as const;
}
