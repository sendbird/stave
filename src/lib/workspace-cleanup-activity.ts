import type { WorkspaceCleanupActArgs, WorkspaceCleanupApi } from "./workspace-cleanup-contract";

const archiving = new Map<string, number>();
export const isWorkspaceArchiveInProgress = (id: string) => archiving.has(id);

export async function runWorkspaceCleanupAction(api: WorkspaceCleanupApi, args: WorkspaceCleanupActArgs) {
  if (args.action !== "archive") return api.act(args);
  archiving.set(args.workspaceId, (archiving.get(args.workspaceId) ?? 0) + 1);
  try { return await api.act(args); }
  finally {
    const remaining = (archiving.get(args.workspaceId) ?? 1) - 1;
    if (remaining) archiving.set(args.workspaceId, remaining);
    else archiving.delete(args.workspaceId);
  }
}
