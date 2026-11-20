import { Button } from "@/components/ui";
import { sx } from "@/components/aui/utils/stylex";
import { useTranslation } from "@/i18n";
import { cleanupStyles } from "./workspace-cleanup-center.styles";
import { workspaceCleanupReasonText } from "./workspace-cleanup-reasons";

const worktreeReasons = new Set([
  "changedFiles", "ignoredFiles", "hiddenChanges", "gitOperationInProgress",
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
  const canKeep = reason.split(",").every(code => worktreeReasons.has(code));
  const showInFinder = window.api?.shell?.showInFinder;
  return (
    <div className={sx(cleanupStyles.archiveRecovery)}>
      <p aria-live="polite" className={sx(cleanupStyles.status)}>
        {t("cleanupCenter.archiveRefusedWithReason", { reason: workspaceCleanupReasonText(reason) })}
      </p>
      {!canKeep && <p className={sx(cleanupStyles.muted)}>{t("cleanupCenter.retryAfterResolving")}</p>}
      <div className={sx(cleanupStyles.actions)}>
        {canKeep && path && showInFinder && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { void showInFinder({ path }); }}>
            {t("cleanupCenter.showWorktree")}
          </Button>
        )}
        {canKeep && (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={keep}>
            {t("cleanupCenter.keepWorktree")}
          </Button>
        )}
        {retry && (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={retry}>
            {t("cleanupCenter.retryArchive")}
          </Button>
        )}
      </div>
    </div>
  );
}
