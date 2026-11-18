/**
 * Signal emitted after the host service has saved a workspace it created, or a
 * task it added to one. It carries identity only: the renderer reads the saved
 * registry and task list again and trusts nothing else in the payload.
 */
export interface LocalMcpWorkspaceChange {
  workspaceId: string;
  repositoryPath: string;
}

/** The change a bridge payload carries, or null when it is not one. */
export function parseLocalMcpWorkspaceChange(payload: unknown): LocalMcpWorkspaceChange | null {
  if (typeof payload !== "object" || payload === null) return null;
  const { workspaceId, repositoryPath } = payload as Record<string, unknown>;
  if (typeof workspaceId !== "string" || !workspaceId || typeof repositoryPath !== "string" || !repositoryPath) return null;
  return { workspaceId, repositoryPath };
}
