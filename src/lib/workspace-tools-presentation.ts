import { i18n } from "@/i18n/runtime";
import { Blocks, type LucideIcon } from "lucide-react";
import { WORKSPACE_TOOLS_LABEL_KEY } from "@/lib/workspace-scripts/constants";

/**
 * Shared presentation metadata for the workspace execution toolkit.
 * Blocks distinguishes the mixed command/process/trigger surface from Terminal.
 */
export const WORKSPACE_TOOLS_PRESENTATION: {
  icon: LucideIcon;
  label: string;
} = {
  icon: Blocks,
  get label() { return i18n.t(WORKSPACE_TOOLS_LABEL_KEY); },
};

/**
 * User-facing views inside Workspace Tools.
 * Processes lead because the common case is a long-running server left up
 * while developing; commands, triggers, and run history stay one click away.
 * Keep these aligned with executable concepts instead of storage terms such
 * as "catalog" or adjacent product concepts such as Automation.
 */
export const WORKSPACE_TOOLS_VIEWS = [
  { id: "processes", get label() { return i18n.t("scripts:workspaceToolsPresentation.processes"); }, get description() { return i18n.t("scripts:workspaceToolsPresentation.startADevServerOrOtherLong"); } },
  { id: "commands", get label() { return i18n.t("scripts:workspaceToolsPresentation.commands"); }, get description() { return i18n.t("scripts:workspaceToolsPresentation.runASavedCheckBuildOrRepository"); } },
  { id: "triggers", get label() { return i18n.t("scripts:workspaceToolsPresentation.triggers"); }, get description() { return i18n.t("scripts:workspaceToolsPresentation.chooseWhichCommandsRunWhenWorkStarts"); } },
  { id: "runs", get label() { return i18n.t("scripts:workspaceToolsPresentation.runs"); }, get description() { return i18n.t("scripts:workspaceToolsPresentation.reviewRecentOutputAndFailuresFromCommands"); } },
] as const;

export type WorkspaceToolsViewId = (typeof WORKSPACE_TOOLS_VIEWS)[number]["id"];

export const DEFAULT_WORKSPACE_TOOLS_VIEW: WorkspaceToolsViewId = "processes";

export function workspaceToolsRunningLabel(runningCount: number) {
  if (runningCount <= 0) {
    return WORKSPACE_TOOLS_PRESENTATION.label;
  }
  return runningCount === 1
    ? i18n.t("scripts:workspaceToolsPresentation.value1ProcessRunning", { value1: WORKSPACE_TOOLS_PRESENTATION.label })
    : i18n.t("scripts:workspaceToolsPresentation.valueValueProcessesRunning", { value1: WORKSPACE_TOOLS_PRESENTATION.label, runningCount: runningCount });
}
