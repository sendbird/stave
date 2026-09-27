import type { RecentRepositoryState } from "@/store/repository.utils";

function normalizeRepositoryPath(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function hasRepositoryPath(args: {
  repositories: RecentRepositoryState[];
  repositoryPath: string | null;
}) {
  if (!args.repositoryPath) {
    return false;
  }
  return args.repositories.some((repository) => repository.repositoryPath === args.repositoryPath);
}

/**
 * Resolves which repository should stay selected in Settings > Projects.
 */
export function resolveSettingsRepositorySelection(args: {
  repositories: RecentRepositoryState[];
  selectedRepositoryPath?: string | null;
  highlightedRepositoryPath?: string | null;
  currentRepositoryPath?: string | null;
  allowHighlightedOverride?: boolean;
}) {
  const selectedRepositoryPath = normalizeRepositoryPath(args.selectedRepositoryPath);
  const highlightedRepositoryPath = normalizeRepositoryPath(args.highlightedRepositoryPath);
  const currentRepositoryPath = normalizeRepositoryPath(args.currentRepositoryPath);

  if (args.repositories.length === 0) {
    return null;
  }

  if (hasRepositoryPath({ repositories: args.repositories, repositoryPath: selectedRepositoryPath })) {
    return selectedRepositoryPath;
  }

  if (
    args.allowHighlightedOverride !== false
    && hasRepositoryPath({ repositories: args.repositories, repositoryPath: highlightedRepositoryPath })
  ) {
    return highlightedRepositoryPath;
  }

  if (hasRepositoryPath({ repositories: args.repositories, repositoryPath: currentRepositoryPath })) {
    return currentRepositoryPath;
  }

  return args.repositories[0]?.repositoryPath ?? null;
}
