import {
  resolveCurrentRepositoryDefaultWorkspaceId,
  type RecentRepositoryState,
} from "../../src/store/repository.utils";
import type { AutomationWorkspaceLocation } from "./automation-runtime";
import { findWorkspaceRegistration, loadNormalizedRepositories } from "./local-mcp-runtime";

/** A registered workspace as a schedule location, or null when no repository has it. */
export function resolveAutomationWorkspaceLocation(
  repositories: RecentRepositoryState[],
  workspaceId: string,
): AutomationWorkspaceLocation | null {
  const registration = findWorkspaceRegistration({ repositories, workspaceId });
  if (!registration) {
    return null;
  }
  const { project } = registration;
  const defaultWorkspaceId = resolveCurrentRepositoryDefaultWorkspaceId({
    repositoryPath: project.repositoryPath,
    workspaces: project.workspaces,
    workspaceDefaultById: project.workspaceDefaultById,
    workspacePathById: project.workspacePathById,
  });
  return {
    workspaceId,
    name: registration.workspace.name,
    path: registration.workspacePath,
    branch: registration.branch || null,
    repositoryPath: project.repositoryPath,
    isDefault: workspaceId === defaultWorkspaceId,
  };
}

export async function findAutomationWorkspace(workspaceId: string) {
  const { repositories } = await loadNormalizedRepositories();
  return resolveAutomationWorkspaceLocation(repositories, workspaceId);
}
