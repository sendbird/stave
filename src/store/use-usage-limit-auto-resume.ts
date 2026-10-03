import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store/app.store";
import {
  listDueUsageLimitAutoResumes,
  resolveNextUsageLimitAutoResume,
} from "@/store/task-work-pause";

/**
 * Timers drift while the machine sleeps, and the reset is a wall-clock time,
 * so the wait is re-read at least this often instead of trusted in one go.
 */
const MAX_AUTO_RESUME_WAIT_MS = 60_000;

/**
 * Resumes tasks whose usage-limit pause was armed with "Resume at reset".
 * Mounted once at the app root; it runs only while Stave is open, which is
 * what the shelf line promises.
 */
export function useUsageLimitAutoResume() {
  const pauses = useAppStore((state) => state.usageLimitPauseByTask);
  const [wake, setWake] = useState(0);
  const resumingRef = useRef(new Set<string>());

  useEffect(() => {
    const next = resolveNextUsageLimitAutoResume(pauses);
    if (!next) {
      return;
    }
    const delay = Math.min(
      Math.max(next.at - Date.now(), 0),
      MAX_AUTO_RESUME_WAIT_MS,
    );
    const timer = window.setTimeout(() => {
      const state = useAppStore.getState();
      const due = listDueUsageLimitAutoResumes({
        pauses: state.usageLimitPauseByTask,
        now: Date.now(),
      });
      for (const taskId of due) {
        if (resumingRef.current.has(taskId)) {
          continue;
        }
        resumingRef.current.add(taskId);
        void state
          .resumePausedTaskWork({ taskId, trigger: "auto" })
          .finally(() => resumingRef.current.delete(taskId));
      }
      // Nothing may have changed (still waiting); look again either way.
      setWake((current) => current + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [pauses, wake]);
}
