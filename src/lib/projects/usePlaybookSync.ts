import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";

/**
 * Keeps the host's copy of the saved playbooks current, so a project's
 * coordinator can start missions with them. Settings live in the renderer;
 * the host only reads this copy.
 */
export function usePlaybookSync() {
  const playbooks = useAppStore((state) => state.settings.playbooks);
  useEffect(() => {
    const sync = typeof window === "undefined" ? undefined : window.api?.projects?.syncPlaybooks;
    if (!sync) return;
    const timer = window.setTimeout(() => void sync({ playbooks }).catch(() => undefined), 300);
    return () => window.clearTimeout(timer);
  }, [playbooks]);
}
