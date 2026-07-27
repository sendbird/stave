function normalizeWorkspaceIds(values: readonly string[]) {
  const normalized = new Set<string>();
  for (const value of values) {
    const workspaceId = value?.trim();
    if (workspaceId) {
      normalized.add(workspaceId);
    }
  }
  return normalized;
}

/**
 * Decides which workspaces referenced by notification rows no longer exist.
 *
 * This deliberately lives in the main process. The renderer only ever holds a
 * capped, per-project slice of the inventory (`MAX_RECENT_PROJECTS` remembered
 * projects plus the active project's workspaces), and a workspace the host
 * creates over MCP stays invisible to it until the next pull-based refresh.
 * Judging orphans from that snapshot deletes rows for workspaces that are
 * merely absent from it, which is unrecoverable.
 *
 * Both inputs are unioned rather than intersected: a workspace may have a shell
 * row before the registry catches up, or sit in the registry before its shell
 * is written. Either sighting is enough to keep its notifications.
 */
export function selectOrphanedNotificationWorkspaceIds(args: {
  notificationWorkspaceIds: readonly string[];
  workspaceRowIds: readonly string[];
  registryWorkspaceIds: readonly string[];
}): string[] {
  const knownWorkspaceIds = normalizeWorkspaceIds([
    ...args.workspaceRowIds,
    ...args.registryWorkspaceIds,
  ]);
  // An empty inventory cannot be told apart from a store that has not finished
  // initialising, and the cost of guessing wrong is deleting live requests.
  if (knownWorkspaceIds.size === 0) {
    return [];
  }
  return [...normalizeWorkspaceIds(args.notificationWorkspaceIds)].filter(
    (workspaceId) => !knownWorkspaceIds.has(workspaceId),
  );
}
