/**
 * Workspace folders Stave knows about, read from the saved repository
 * registry. Lets the main process accept a workspace root from the renderer
 * only when it is one of these, and find a workspace's folder by id.
 *
 * Used by: `electron/main/ipc/filesystem.ts` (`fs:list-scratch`) and
 * `electron/main/browser/browser-tools.ts` (Lens screenshots).
 */
import path from "node:path";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";

type RegistryEntry = Pick<
  PersistenceRepositoryRegistryEntry,
  "repositoryPath" | "workspaces" | "workspacePathById"
>;

/** A workspace's folder; the default workspace has no entry and uses the repository's. */
export function findWorkspaceRootInRegistry(
  registry: readonly RegistryEntry[],
  workspaceId: string,
): string | null {
  for (const repository of registry) {
    const explicit = repository.workspacePathById?.[workspaceId];
    if (explicit) return explicit;
    if (repository.workspaces?.some((workspace) => workspace.id === workspaceId)) {
      return repository.repositoryPath || null;
    }
  }
  return null;
}

/** Whether `rootPath` is a registered repository or workspace folder. */
export function isWorkspaceRootInRegistry(
  registry: readonly RegistryEntry[],
  rootPath: string,
): boolean {
  if (!path.isAbsolute(rootPath)) return false;
  const target = path.resolve(rootPath);
  for (const repository of registry) {
    if (repository.repositoryPath && path.resolve(repository.repositoryPath) === target) return true;
    for (const workspacePath of Object.values(repository.workspacePathById ?? {})) {
      if (workspacePath && path.resolve(workspacePath) === target) return true;
    }
  }
  return false;
}

/*
 * Loaded on demand: the persistence store pulls in the whole main-process
 * state, which modules that only need these lookups must not load eagerly.
 */
async function loadRegistry(): Promise<RegistryEntry[]> {
  const { ensurePersistenceReady } = await import("./state");
  return (await ensurePersistenceReady()).loadRepositoryRegistry();
}

export async function resolveKnownWorkspaceRoot(workspaceId: string): Promise<string | null> {
  return findWorkspaceRootInRegistry(await loadRegistry(), workspaceId);
}

export async function isKnownWorkspaceRoot(rootPath: string): Promise<boolean> {
  return isWorkspaceRootInRegistry(await loadRegistry(), rootPath);
}
