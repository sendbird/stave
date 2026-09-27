import { useEffect } from "react";
import { useAppStore } from "@/store/app.store";
import { useProposalsStore } from "@/store/proposals-store";

/**
 * Keeps the host's copy of the saved playbooks current, so a project's
 * coordinator can start missions with them and their start conditions
 * propose missions. Settings live in the renderer; the host only reads this
 * copy, and the main process hands it again to a host that restarts. Pull
 * request observations wait for the copy the host accepted.
 */
export function usePlaybookSync() {
  const playbooks = useAppStore((state) => state.settings.playbooks);
  useEffect(() => {
    const sync = typeof window === "undefined" ? undefined : window.api?.projects?.syncPlaybooks;
    if (!sync) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void sync({ playbooks })
        .then((result) => {
          if (current && result.ok) useProposalsStore.getState().notePlaybooksSynced(playbooks);
        })
        .catch(() => undefined);
    }, 300);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [playbooks]);
}
