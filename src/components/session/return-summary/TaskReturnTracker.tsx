import { useEffect, useRef } from "react";
import { RETURN_AWAY_MS } from "@/lib/task-context/return-summary";
import { useAppStore } from "@/store/app.store";
import { useTaskReturnStore } from "@/store/task-return-store";

/** The task's loaded conversation, also when its workspace is no longer the active one. */
function loadedMessages(taskId: string) {
  const state = useAppStore.getState();
  const active = state.messagesByTask[taskId];
  if (active) return active;
  for (const session of Object.values(state.workspaceRuntimeCacheById)) {
    const cached = session?.messagesByTask[taskId];
    if (cached) return cached;
  }
  return undefined;
}

/**
 * Notes when you leave and come back to the active task, with what you had
 * seen of it: switching tasks, and the window losing focus for a while.
 * Renders nothing; mounted once in the shell.
 */
export function TaskReturnTracker() {
  const activeTaskId = useAppStore((state) => state.activeTaskId);
  const previousRef = useRef<string>("");
  useEffect(() => {
    const store = useTaskReturnStore.getState();
    const previous = previousRef.current;
    if (previous && previous !== activeTaskId) store.noteLeft(previous, undefined, loadedMessages(previous));
    if (activeTaskId && activeTaskId !== previous) store.noteArrived(activeTaskId);
    previousRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    let blurredAt: number | null = null;
    const onBlur = () => {
      // Focus moving into an embedded page (Lens, a preview) is not leaving the app.
      const active = document.activeElement;
      if (active && (active.tagName === "IFRAME" || active.tagName === "WEBVIEW")) return;
      blurredAt = Date.now();
      const taskId = useAppStore.getState().activeTaskId;
      if (taskId) useTaskReturnStore.getState().noteLeft(taskId, new Date(blurredAt).toISOString(), loadedMessages(taskId));
    };
    const onFocus = () => {
      const away = blurredAt === null ? 0 : Date.now() - blurredAt;
      blurredAt = null;
      const taskId = useAppStore.getState().activeTaskId;
      // A glance at another window is not a return.
      if (taskId && away >= RETURN_AWAY_MS) useTaskReturnStore.getState().noteArrived(taskId);
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return null;
}
