import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { cleanupStyles } from "./workspace-cleanup-center.styles";
import { workspaceCleanupReasonText } from "./workspace-cleanup-reasons";

const worktreeReasons = new Set([
  "changedFiles", "hiddenChanges", "gitOperationInProgress",
  "worktreeRemoveFailed", "savedChangesGitFailed", "savedChangesVerificationFailed",
  "savedChangesChangedDuringSave", "savedChangesSubmoduleUnsupported",
]);

export function WorkspaceArchiveRecovery({ reason, path, busy, retry, keep }: {
  reason: string;
  path?: string;
  busy: boolean;
  retry?: () => void;
  keep: () => void;
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
