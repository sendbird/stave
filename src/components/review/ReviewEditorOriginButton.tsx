import { i18n, useTranslation } from "@/i18n";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ads/components/Button";
import { openTaskReview } from "@/components/panes/task-surface-entry";
import { isTaskArchived } from "@/lib/tasks";
import { useAppStore } from "@/store/app.store";
import { editorOriginKey, useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * "Back to Review" on an editor diff opened with Review's "Comment in editor":
 * returns to that task's Review on the scope the diff came from. Absent on
 * every other editor tab, and once its task is gone or archived (an archived
 * task cannot be opened).
 */
export function ReviewEditorOriginButton(props: { editorTabId: string }) {
  useTranslation();
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const origin = useTaskReviewModeStore((state) => state.originByEditorTab[editorOriginKey(workspaceId, props.editorTabId)]);
  const taskOpen = useAppStore((state) => {
    if (!origin) return false;
    const task = state.tasks.find((candidate) => candidate.id === origin.taskId);
    return Boolean(task && !isTaskArchived(task));
  });
  if (!origin || !taskOpen) return null;
  return (
    <Button
      variant="quiet"
      size="xs"
      data-testid="editor-back-to-review"
      onClick={() => openTaskReview(origin.taskId, origin.scope)}
    >
      <ArrowLeft aria-hidden />
      {i18n.t("review:mode.backToReview")}
    </Button>
  );
}
