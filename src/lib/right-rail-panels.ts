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

/** The layout patch that opens the Task panel. */
export function taskPanelLayoutPatch() {
  return {
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "task",
  } as const;
}
