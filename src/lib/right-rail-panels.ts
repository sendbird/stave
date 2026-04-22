import { FolderTree, GitBranch, Globe, Info, SearchCheck, Sparkles, type LucideIcon } from "lucide-react";

export const RIGHT_RAIL_PANEL_IDS = [
  "explorer",
  "changes",
  "information",
  "skills",
  "scripts",
  "lens",
] as const;

export type RightRailPanelId = typeof RIGHT_RAIL_PANEL_IDS[number];

export const RIGHT_RAIL_PANEL_TITLES: Record<RightRailPanelId, string> = {
  explorer: "Explorer",
  changes: "Source Control",
  information: "Information",
  skills: "Skills",
  scripts: "Scripts",
  lens: "Lens",
};

export const RIGHT_RAIL_PANEL_ICONS: Record<RightRailPanelId, LucideIcon> = {
  explorer: FolderTree,
  changes: GitBranch,
  information: Info,
  skills: SearchCheck,
  scripts: Sparkles,
  lens: Globe,
};
