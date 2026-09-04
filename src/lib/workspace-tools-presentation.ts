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
 * Processes lead because the common case is a long-running server left up
 * while developing; commands, triggers, and run history stay one click away.
 * Keep these aligned with executable concepts instead of storage terms such
 * as "catalog" or adjacent product concepts such as Automation.
 */
export const WORKSPACE_TOOLS_VIEWS = [
  { id: "processes", label: "Processes" },
  { id: "commands", label: "Commands" },
  { id: "triggers", label: "Triggers" },
  { id: "runs", label: "Runs" },
] as const;

export type WorkspaceToolsViewId = (typeof WORKSPACE_TOOLS_VIEWS)[number]["id"];

export const DEFAULT_WORKSPACE_TOOLS_VIEW: WorkspaceToolsViewId = "processes";

export function workspaceToolsRunningLabel(runningCount: number) {
  if (runningCount <= 0) {
    return WORKSPACE_TOOLS_PRESENTATION.label;
  }
  return runningCount === 1
    ? `${WORKSPACE_TOOLS_PRESENTATION.label}, 1 process running`
    : `${WORKSPACE_TOOLS_PRESENTATION.label}, ${runningCount} processes running`;
}
