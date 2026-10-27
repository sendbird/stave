import { i18n, useTranslation } from "@/i18n";
import { useEffect, useRef, useState } from "react";
import { VisuallyHidden } from "@/components/ads/components/VisuallyHidden";
import {
  advanceTaskAnnouncement,
  selectTaskAnnouncementState,
  TASK_ANNOUNCEMENT_KEYS,
  type TaskAnnouncementBaseline,
} from "@/lib/task-status-announcement";
import { useAppStore } from "@/store/app.store";

/**
 * The one polite live region for the open task: "Working", "Needs your
 * input", "Needs approval", "Done", "Failed" or "Stopped", once per change.
 * Opening or switching tasks is silent. It subscribes to a single derived
 * state string, so it re-renders on a state change, never on streamed text,
 * and nothing else re-renders with it.
 */
export function TaskStatusAnnouncer() {
  useTranslation();
  const taskId = useAppStore((state) => state.activeTaskId);
  const archived = useAppStore((state) =>
    Boolean(taskId && state.tasks.find((task) => task.id === taskId)?.archivedAt),
  );
  const taskState = useAppStore((state) =>
    taskId
      ? selectTaskAnnouncementState({
          messages: state.messagesByTask[taskId],
          activeTurnId: state.activeTurnIdsByTask[taskId],
          archived,
          loading: state.taskMessagesLoadingByTask[taskId] === true,
        })
      : null,
  );
  const baselineRef = useRef<TaskAnnouncementBaseline | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const previous = baselineRef.current;
    const { baseline, announce } = advanceTaskAnnouncement(previous, {
      taskId,
      state: taskState,
    });
    baselineRef.current = baseline;
    if (announce && announce !== "idle") {
      setMessage(i18n.t(TASK_ANNOUNCEMENT_KEYS[announce]));
    } else if (previous?.taskId !== taskId) {
      // A different task's last news must not linger in the region.
      setMessage("");
    }
  }, [taskId, taskState]);

  return (
    <VisuallyHidden role="status" aria-live="polite" aria-atomic="true">
      {message}
    </VisuallyHidden>
  );
}
