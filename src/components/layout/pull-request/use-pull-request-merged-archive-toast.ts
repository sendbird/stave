import { useEffect } from "react";
import { openWorkspaceCleanup } from "@/components/layout/workspace-cleanup-events";
import { toast } from "@/components/ui";
import { i18n } from "@/i18n";
import type { WorkspacePrStatus } from "@/lib/pr-status";
import { createMergedArchiveToastTracker } from "./pull-request-manage-items";

// One memory for the app session: a workspace is offered the archive once.
const tracker = createMergedArchiveToastTracker();

/**
 * When the active workspace's pull request goes from open to merged while the
 * app is watching, offers once to archive that workspace. The action opens the
 * cleanup center on its row; nothing is archived without that confirmation.
 */
export function usePullRequestMergedArchiveToast(args: {
  workspaceId: string;
  status: WorkspacePrStatus;
  prNumber?: number;
}) {
  const { workspaceId, status, prNumber } = args;
  useEffect(() => {
    if (!tracker.observe(workspaceId, status)) return;
    toast.success(i18n.t("sourceControl:prManage.toast.merged", { number: prNumber ?? "" }), {
      id: `pr-merged-archive:${workspaceId}`,
      description: i18n.t("sourceControl:prManage.toast.mergedDescription"),
      duration: 12_000,
      action: {
        label: i18n.t("sourceControl:prManage.toast.mergedAction"),
        onClick: () => openWorkspaceCleanup({ workspaceId }),
      },
    });
  }, [workspaceId, status, prNumber]);
}
