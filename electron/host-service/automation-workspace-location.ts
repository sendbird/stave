import { promises as fs } from "node:fs";
import path from "node:path";
import {
  resolveCurrentRepositoryDefaultWorkspaceId,
  type RecentRepositoryState,
} from "../../src/store/repository.utils";
import type { AutomationWorkspaceLocation } from "./automation-runtime";
import { findWorkspaceRegistration, loadNormalizedRepositories } from "./local-mcp-runtime";

/**
 * A registered workspace as a schedule location, or null when no repository
 * has it. A workspace other than the Default one runs only in a folder of its
 * own: without one, or with the repository root as its folder, the registry
 * lookup would fall back to the root, and the schedule would run in, and
 * change, the Default workspace's checkout. Such a workspace is no location.
 */
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
  const isDefault = workspaceId === defaultWorkspaceId;
  const ownPath = project.workspacePathById[workspaceId]?.trim() ?? "";
  if (!isDefault && (!ownPath || path.resolve(ownPath) === path.resolve(project.repositoryPath))) {
    return null;
  }
  return {
    workspaceId,
    name: registration.workspace.name,
    path: isDefault ? registration.workspacePath : ownPath,
    branch: registration.branch || null,
    repositoryPath: project.repositoryPath,
    isDefault,
  };
}

/** The directory's identity on disk, so a symlink or another spelling of the root is still the root. */
async function directoryIdentity(directoryPath: string) {
  try {
    const stat = await fs.stat(directoryPath);
    return stat.isDirectory() ? `${stat.dev}:${stat.ino}` : null;
  } catch {
    return null;
  }
}

/**
 * The schedule's workspace as it is now: registered and, for any workspace
 * but the Default one, with its own folder still on disk. Null otherwise, so
 * a run fails before a task starts anywhere.
 */
export async function findAutomationWorkspace(
  workspaceId: string,
  loadRepositories: () => Promise<RecentRepositoryState[]> = async () =>
    (await loadNormalizedRepositories()).repositories,
) {
  const location = resolveAutomationWorkspaceLocation(await loadRepositories(), workspaceId);
  if (!location || location.isDefault) {
    return location;
  }
  const [own, root] = await Promise.all([
    directoryIdentity(location.path),
    directoryIdentity(location.repositoryPath),
  ]);
  return own !== null && own !== root ? location : null;
}
