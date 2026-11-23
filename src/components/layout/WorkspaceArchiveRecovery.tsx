import { useState } from "react";
import { toast } from "@/lib/notifications/toast";
import type { WorkspaceCleanupTrashArgs } from "@/lib/workspace-cleanup-contract";
import { notifyWorkspaceCleanupChanged } from "./workspace-cleanup-events";
import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { cleanupStyles } from "./workspace-cleanup-center.styles";
import { workspaceCleanupReasonText } from "./workspace-cleanup-reasons";

const worktreeReasons = new Set([
  "changedFiles", "hiddenChanges", "gitOperationInProgress",
  "worktreeRemoveFailed", "savedChangesGitFailed", "savedChangesVerificationFailed",
  "sensitiveFilesBackupFailed", "sensitiveFilesBackupConflict",
  "savedChangesChangedDuringSave", "savedChangesSubmoduleUnsupported",
]);

export function WorkspaceArchiveRecovery({ reason, path, busy, retry, keep, trashTarget, onTrashed }: {
  reason: string;
  path?: string;
  busy: boolean;
  retry?: () => void;
  keep: () => void;
  trashTarget?: WorkspaceCleanupTrashArgs;
  onTrashed?: () => void;
}) {
  const { t } = useTranslation("workspace");
  // Archived already: Git removed the worktree but could not delete every file.
  const archived = reason === "worktreeLeftoverFiles";
  const canKeep = !archived && reason.split(",").every(code => worktreeReasons.has(code));
  const showInFinder = window.api?.shell?.showInFinder;
  return (
    <div className={sx(cleanupStyles.archiveRecovery)}>
      <p aria-live="polite" className={sx(cleanupStyles.status)}>
        {archived ? workspaceCleanupReasonText(reason) : t("cleanupCenter.archiveRefusedWithReason", { reason: workspaceCleanupReasonText(reason) })}
      </p>
      {!canKeep && !archived && <p className={sx(cleanupStyles.muted)}>{t("cleanupCenter.retryAfterResolving")}</p>}
      <div className={sx(cleanupStyles.actions)}>
        {(canKeep || archived) && path && showInFinder && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { void showInFinder({ path }); }}>
            {t("cleanupCenter.showWorktree")}
          </Button>
        )}
        {archived && trashTarget && <LeftoverWorktreeTrashButton target={trashTarget} disabled={busy} onTrashed={onTrashed} />}
        {canKeep && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={keep}>
            {t("cleanupCenter.keepWorktree")}
          </Button>
        )}
        {retry && !archived && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={retry}>
            {t("cleanupCenter.retryArchive")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function LeftoverWorktreeTrashButton({ target, disabled, onTrashed }: {
  target: WorkspaceCleanupTrashArgs;
  disabled: boolean;
  onTrashed?: () => void;
}) {
  const { t } = useTranslation("workspace");
  const [moving, setMoving] = useState(false);
  const trash = window.api?.workspaceCleanup?.trashLeftover;
  if (!trash) return null;
  const move = async () => {
    setMoving(true);
    try {
      const result = await trash(target);
      if (!result.ok) {
        toast.error(workspaceCleanupReasonText(result.reason ?? "leftoverTrashFailed"));
        return;
      }
      toast.success(t("cleanupCenter.leftoverTrashed"));
      notifyWorkspaceCleanupChanged();
      onTrashed?.();
    } catch { toast.error(workspaceCleanupReasonText("leftoverTrashFailed")); }
    finally { setMoving(false); }
  };
  return <Button type="button" size="sm" variant="outline" disabled={disabled || moving} onClick={() => void move()}>
    {t("cleanupCenter.moveLeftoverToTrash")}
  </Button>;
}
