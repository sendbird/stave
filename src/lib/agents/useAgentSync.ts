import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";

/**
 * Keeps main's and the host's copy of the saved custom agents current, so a
 * delegation, a project or a mission stage can name one. Settings live in the
 * renderer; main hands the copy again to a host that restarts.
 */
export function useAgentSync() {
  const customAgents = useAppStore((state) => state.settings.customAgents);
  useEffect(() => {
    const sync = typeof window === "undefined" ? undefined : window.api?.agents?.sync;
    if (!sync) return;
    const timer = window.setTimeout(() => {
      void sync({ customAgents }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customAgents]);
}
