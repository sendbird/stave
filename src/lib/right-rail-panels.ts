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
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  skills: "Skills",
  scripts: WORKSPACE_TOOLS_PRESENTATION.label,
  task: "Task",
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
 * last turn, Progress is the mission when the task has one and the flow
 * overview otherwise, Subagents (tab id `team`) is every agent it called, and
 * Results is its run history.
 */
export type TaskPanelTab = "activity" | "progress" | "team" | "results";

export const TASK_PANEL_TABS: ReadonlyArray<{
  id: TaskPanelTab;
  label: string;
}> = [
  { id: "activity", label: "Activity" },
  { id: "progress", label: "Progress" },
  { id: "team", label: "Subagents" },
  { id: "results", label: "Results" },
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
