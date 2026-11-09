import path from "node:path";
import type { PersistenceRepositoryRegistryEntry } from "../persistence/types";

/** Resolve globally, rejecting duplicate identities even when the duplicate names the same repository. */
export function resolveTarsWorkspace(workspaceId: string, repositories: PersistenceRepositoryRegistryEntry[]) {
  const matches = repositories.flatMap((repository) => repository.workspaces
    .filter((workspace) => workspace.id === workspaceId).map(() => repository));
  if (matches.length !== 1) throw new Error("The target workspace is missing or ambiguous in the current registered repositories.");
  const repositoryPath = matches[0]!.repositoryPath;
  if (!path.isAbsolute(repositoryPath) || path.resolve(repositoryPath) === path.parse(repositoryPath).root)
    throw new Error("The target workspace must belong to a registered repository path.");
  return { workspaceId, repositoryPath };
}

export function assertTarsSource(scope: { workspaceId: string; repositoryPath: string }, repositories: PersistenceRepositoryRegistryEntry[]) {
  const target = resolveTarsWorkspace(scope.workspaceId, repositories);
  if (path.resolve(target.repositoryPath) !== path.resolve(scope.repositoryPath))
    throw new Error("The workspace does not belong to this registered repository.");
}
