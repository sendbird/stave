import type { RecentRepositoryState } from "@/store/repository.utils";

/** More names than the start screen lists, so its "+N more" shows; one is long enough to be cut on a phone. */
const NAMES = ["web", "billing-service", "design-system", "mobile-app", "infrastructure-and-deployment-pipelines", "docs"] as const;

/** UI-only fixture: registered repositories for the start screen (`?start=true`). */
export function buildTarsStartRepositoryFixtures(now: string): RecentRepositoryState[] {
  return NAMES.map((repositoryName) => ({
    repositoryPath: `/tmp/preview-repositories/${repositoryName}`, repositoryName, lastOpenedAt: now, defaultBranch: "main", workspaces: [], activeWorkspaceId: "",
    workspaceBranchById: {}, workspacePathById: {}, workspaceDefaultById: {},
  }));
}
