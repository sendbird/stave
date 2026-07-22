import { FolderTree, GitBranch, Info, SearchCheck, Sparkles, type LucideIcon } from "lucide-react";

export type RightRailPanelId =
  | "explorer"
  | "changes"
  | "information"
  | "skills"
  | "scripts";

/** Panels the right rail actually renders as sidebar overlays. */
export const RIGHT_RAIL_PANEL_IDS: readonly RightRailPanelId[] = [
  "explorer",
  "changes",
  "information",
  "skills",
  "scripts",
];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  skills: "Skills",
  scripts: "Scripts",
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  skills: SearchCheck,
  scripts: Sparkles,
};
