import { useEffect, useState } from "react";
import { SCRATCH_PANEL_POLL_MS, SCRATCH_PANEL_SAFETY_POLL_MS } from "@/lib/workspace-scratch-view";
import { pollWorkspaceScratch } from "./useWorkspaceScratchPolling";

/** How the open panel learns about new files: change notices, or a timer when there are none. */
export type ScratchRefreshMode = "watch" | "poll";

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Keeps an open Scratch panel's listing current. While `enabled`, it asks
 * main to watch the folder (`window.api.fs.scratchLive`) and lists it again
 * on each change notice, plus a slow safety listing. When the folder cannot
 * be watched (no recursive watching on the platform, a failed watcher, a
 * removed folder) it lists every 1.5 s instead — never both at full rate.
 * A hidden window lists nothing and catches up when it is shown again.
 */
export function useWorkspaceScratchLive(args: {
  workspaceId: string;
  rootPath: string | undefined;
  enabled: boolean;
}) {
  const { workspaceId, rootPath, enabled } = args;
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScratchRefreshMode>("poll");

  useEffect(() => {
    if (!workspaceId || !rootPath || !enabled) return;
    let cancelled = false;
    let listing = false;
    let listAgain = false;
    let stale = false;

    // One listing at a time; a notice during one lists once more after it,
    // so a change written while the folder was being read is not missed.
    const list = async () => {
      if (cancelled) return;
      if (!isDocumentVisible()) {
        stale = true;
        return;
      }
      if (listing) {
        listAgain = true;
        return;
      }
      listing = true;
      try {
        do {
          listAgain = false;
          const result = await pollWorkspaceScratch(workspaceId, rootPath);
          if (cancelled) return;
          const next = result.ok ? null : result.error;
          setError((current) => (current === next ? current : next));
        } while (listAgain && !cancelled);
      } finally {
        listing = false;
      }
    };

    let timer: number | null = null;
    const setTimer = (intervalMs: number) => {
      if (timer !== null) window.clearInterval(timer);
      timer = window.setInterval(() => void list(), intervalMs);
    };

    void list();
    setTimer(SCRATCH_PANEL_POLL_MS);
    setMode("poll");
    const unsubscribe = window.api?.fs?.scratchLive?.subscribe(rootPath, (event) => {
      if (cancelled) return;
      setMode(event.watching ? "watch" : "poll");
      setTimer(event.watching ? SCRATCH_PANEL_SAFETY_POLL_MS : SCRATCH_PANEL_POLL_MS);
      void list();
    });

    const onVisibilityChange = () => {
      if (!isDocumentVisible() || !stale) return;
      stale = false;
      void list();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [workspaceId, rootPath, enabled]);

  return { error, mode };
}
