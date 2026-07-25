import { Blocks, type LucideIcon } from "lucide-react";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";

/**
 * Shared presentation metadata for the workspace execution toolkit.
 * Blocks distinguishes the mixed command/process/trigger surface from Terminal.
 */
export const WORKSPACE_TOOLS_PRESENTATION: {
  icon: LucideIcon;
  label: string;
} = {
  icon: Blocks,
  label: WORKSPACE_TOOLS_LABEL,
};

/**
 * User-facing views inside Workspace Tools.
 * Keep these aligned with executable concepts instead of storage terms such
 * as "catalog" or adjacent product concepts such as Automation.
 */
export const WORKSPACE_TOOLS_VIEWS = [
  { id: "commands", label: "Commands" },
  { id: "processes", label: "Processes" },
  { id: "triggers", label: "Triggers" },
  { id: "runs", label: "Runs" },
] as const;

export type WorkspaceToolsViewId = (typeof WORKSPACE_TOOLS_VIEWS)[number]["id"];
