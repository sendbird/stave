import { useEffect, useState } from "react";
import { useAppStore } from "@/store/app.store";
import { useTaskAgentRun } from "@/store/agent-runs-store";
import { useScopedTaskId } from "@/components/session/task-scope-context";

/** The agent run of the task this surface is scoped to, or undefined. */
export function useScopedTaskAgentRun() {
  const workspaceId = useAppStore((state) => state.activeWorkspaceId);
  const taskId = useScopedTaskId();
  return { workspaceId, taskId, detail: useTaskAgentRun(workspaceId, taskId) };
}

/**
 * A clock for ages ("6m", "2h"). Ticks only while `active`; a static surface,
 * such as a finished agent run, never re-renders on a timer.
 */
export function useNow(active: boolean, intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/** True when the user asked the system for less motion. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}
