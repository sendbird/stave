import { i18n } from "@/i18n";
import type { AutomationEnvironmentInput, AutomationRun } from "@/lib/automations";
import type {
  AutomationEnvironmentOption,
  AutomationWorkspaceOption,
} from "./automation-center.utils";

/**
 * Where a schedule runs, as the window can tell it:
 * - `default`: the repository's Default workspace (its root);
 * - `workspace`: another existing workspace of the repository;
 * - `missing`: the repository is open here but the workspace is gone, so runs
 *   fail until the schedule names another;
 * - `unknown`: the repository is not registered in this window, so only what
 *   the schedule stored can be shown.
 */
export type AutomationLocationState = "default" | "workspace" | "missing" | "unknown";

export interface AutomationLocationView {
  state: AutomationLocationState;
  repository: AutomationEnvironmentOption | null;
  workspace: AutomationWorkspaceOption | null;
  /** The workspace's name as stored or registered; empty for the Default workspace. */
  workspaceName: string;
  path: string;
  branch: string | null;
}

export function resolveAutomationLocation(
  environment: AutomationEnvironmentInput,
  options: readonly AutomationEnvironmentOption[],
): AutomationLocationView {
  const repository =
    options.find((option) => option.repositoryPath === environment.repositoryPath) ?? null;
  const stored = {
    workspaceName: environment.workspace?.name ?? "",
    path: environment.path,
    branch: environment.workspace?.branch ?? null,
  };
  if (!repository) {
    return { state: "unknown", repository: null, workspace: null, ...stored };
  }
  const workspace =
    repository.workspaces.find((candidate) => candidate.workspaceId === environment.workspaceId) ?? null;
  if (!workspace) {
    return { state: "missing", repository, workspace: null, ...stored };
  }
  return {
    state: workspace.isDefault ? "default" : "workspace",
    repository,
    workspace,
    workspaceName: workspace.isDefault ? "" : workspace.name,
    path: workspace.path,
    branch: workspace.branch,
  };
}

/** The stored location for a workspace: the Default workspace carries no descriptor. */
export function environmentForWorkspace(
  repository: AutomationEnvironmentOption,
  workspace: AutomationWorkspaceOption,
): AutomationEnvironmentInput {
  const base = {
    kind: "repository" as const,
    workspaceId: workspace.workspaceId,
    path: workspace.isDefault ? repository.repositoryPath : workspace.path,
    repositoryPath: repository.repositoryPath,
    label: repository.label,
  };
  return workspace.isDefault
    ? base
    : {
        ...base,
        workspace: {
          name: workspace.name,
          ...(workspace.branch ? { branch: workspace.branch } : {}),
        },
      };
}

/** The repository's Default workspace as a location. */
export function defaultEnvironmentFor(repository: AutomationEnvironmentOption) {
  const workspace = repository.workspaces.find((candidate) => candidate.isDefault);
  return workspace ? environmentForWorkspace(repository, workspace) : null;
}

/** The workspace's name in a sentence or a field: "Default workspace" for the root. */
export function describeAutomationWorkspace(location: AutomationLocationView) {
  if (location.state === "default" || (location.state === "unknown" && !location.workspaceName)) {
    return i18n.t("automation:location.defaultWorkspace");
  }
  return location.workspaceName || i18n.t("automation:location.unnamedWorkspace");
}

/** A run's failure in the window's words when it has a known cause. */
export function describeAutomationRunError(run: Pick<AutomationRun, "error" | "errorCode">) {
  if (run.errorCode === "workspace-missing") {
    return i18n.t("automation:location.runWorkspaceMissing");
  }
  return run.error;
}
