import type { IDockviewPanelProps } from "dockview-react";
import { useEffect, useRef, useState } from "react";
import { sx } from "@/components/ads/utils/stylex";
import { reviewStyles } from "@/components/review/review.styles";
import { TaskReviewSurface } from "@/components/review/TaskReviewSurface";
import { TaskSurfaceModeBar } from "@/components/review/TaskSurfaceModeBar";
import { ChatArea } from "@/components/session/ChatArea";
import { parsePanePanelId } from "@/lib/panes/types";
import { useTaskReviewModeStore } from "@/store/task-review-mode-store";

/**
 * Dockview panel wrapper rendering a task surface: its conversation, or Review
 * of its work. The conversation stays mounted under Review, so switching back
 * keeps its scroll position, stream and composer.
 */
export function TaskSurfacePanel(props: IDockviewPanelProps) {
  const surface = parsePanePanelId(props.api.id);
  const taskId = surface?.kind === "task" ? surface.taskId : "";
  const mode = useTaskReviewModeStore((state) => state.byTask[taskId]?.mode ?? "conversation");
  const [scrollActivationKey, setScrollActivationKey] = useState(0);
  const activationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let wasVisible = props.api.isVisible;
    let wasActive = props.api.isActive;
    const requestLatestMessage = () => {
      if (activationFrameRef.current !== null) {
        return;
      }
      activationFrameRef.current = window.requestAnimationFrame(() => {
        activationFrameRef.current = null;
        setScrollActivationKey((current) => current + 1);
      });
    };
    const visibilityDisposable = props.api.onDidVisibilityChange((event) => {
      if (event.isVisible && !wasVisible) {
        requestLatestMessage();
      }
      wasVisible = event.isVisible;
    });
    const activeDisposable = props.api.onDidActiveChange((event) => {
      if (event.isActive && !wasActive) {
        requestLatestMessage();
      }
      wasActive = event.isActive;
    });
    return () => {
      visibilityDisposable.dispose();
      activeDisposable.dispose();
      if (activationFrameRef.current !== null) {
        window.cancelAnimationFrame(activationFrameRef.current);
        activationFrameRef.current = null;
      }
    };
  }, [props.api]);

  if (surface?.kind !== "task") {
    return null;
  }
  return (
    <div className={sx(reviewStyles.taskSurface)}>
      <TaskSurfaceModeBar taskId={surface.taskId} mode={mode} />
      <div className={sx(reviewStyles.modeBody, mode === "review" && reviewStyles.hidden)}>
        <ChatArea
          taskId={surface.taskId}
          scrollActivationKey={scrollActivationKey}
        />
      </div>
      {mode === "review" ? (
        <div className={sx(reviewStyles.modeBody)}>
          <TaskReviewSurface taskId={surface.taskId} />
        </div>
      ) : null}
    </div>
  );
}
