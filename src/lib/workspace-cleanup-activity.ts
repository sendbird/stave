import { i18n } from "@/i18n";
import { toast } from "@/lib/notifications/toast";
import { workspaceCleanupReasonText } from "@/components/layout/workspace-cleanup-reasons";
import type { WorkspaceCleanupActArgs, WorkspaceCleanupApi } from "./workspace-cleanup-contract";

const archiving = new Map<string, number>();
export const isWorkspaceArchiveInProgress = (id: string) => archiving.has(id);

export async function runWorkspaceCleanupAction(api: WorkspaceCleanupApi, args: WorkspaceCleanupActArgs) {
  if (args.action !== "archive") {
    const result = await api.act(args);
    if (args.action === "restore" && result.ok && result.reason) toast.warning(workspaceCleanupReasonText(result.reason));
    return result;
  }
  archiving.set(args.workspaceId, (archiving.get(args.workspaceId) ?? 0) + 1);
  try {
    const result = await api.act(args);
    if (result.ok && result.sensitiveFilesSkipped) toast.warning(i18n.t("workspace:cleanupCenter.sensitiveFilesSkipped", { count: result.sensitiveFilesSkipped }));
    return result;
  }
  finally {
    const remaining = (archiving.get(args.workspaceId) ?? 1) - 1;
    if (remaining) archiving.set(args.workspaceId, remaining);
    else archiving.delete(args.workspaceId);
  }
}
