import {
  Activity,
  FolderTree,
  GitBranch,
  Info,
  SearchCheck,
  FileCheck2,
  Users,
  type LucideIcon,
} from "lucide-react";
import { WORKSPACE_TOOLS_PRESENTATION } from "@/lib/workspace-tools-presentation";

export type RightRailPanelId =
  | "explorer"
  | "changes"
  | "information"
  | "skills"
  | "scripts"
  | "activity"
  | "results"
  | "collaboration";

/** Panels the right rail actually renders as sidebar overlays. */
export const RIGHT_RAIL_PANEL_IDS: readonly RightRailPanelId[] = [
  "explorer",
  "changes",
  "information",
  "skills",
  "scripts",
  "activity",
  "results",
  "collaboration",
];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  skills: "Skills",
  scripts: WORKSPACE_TOOLS_PRESENTATION.label,
  activity: "Turn Activity",
  results: "Task Results",
  collaboration: "Task Collaboration",
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  skills: SearchCheck,
  scripts: WORKSPACE_TOOLS_PRESENTATION.icon,
  activity: Activity,
  results: FileCheck2,
  collaboration: Users,
};
