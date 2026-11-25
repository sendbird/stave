import { useEffect, useRef, useState } from "react";
import { useWorkspaceScratchStore } from "@/store/workspace-scratch-store";

type PollResult = { ok: true } | { ok: false; error: string };

/*
 * One request per workspace at a time, shared by the panel and the rail: a
 * slow listing is never stacked behind another one for the same folder.
 */
const inFlightByWorkspace = new Map<string, Promise<PollResult>>();

/** Lists a workspace's scratch folder once and stores it if it changed. */
export function pollWorkspaceScratch(workspaceId: string, rootPath: string): Promise<PollResult> {
  const pending = inFlightByWorkspace.get(workspaceId);
  if (pending) return pending;
  const listScratch = window.api?.fs?.listScratch;
  if (!listScratch) return Promise.resolve({ ok: false, error: "unavailable" });
  const request = listScratch({ rootPath })
    .then((result): PollResult => {
      if (!result.ok) return { ok: false, error: result.stderr };
      useWorkspaceScratchStore.getState().applyListing(workspaceId, {
        files: result.files,
        olderArtifacts: result.olderArtifacts,
        fileCount: result.fileCount,
        totalBytes: result.totalBytes,
        truncated: result.truncated,
      });
      return { ok: true };
    })
    .catch((error: unknown): PollResult => ({ ok: false, error: String(error) }))
    .finally(() => inFlightByWorkspace.delete(workspaceId));
  inFlightByWorkspace.set(workspaceId, request);
  return request;
}

function isDocumentVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Polls a workspace's scratch folder every `intervalMs` while `enabled` and
 * the window is visible, and once right away (and whenever the window comes
 * back). With `pollAfterDisable`, it checks one last time when `enabled`
 * turns off, so files written at the very end of a turn are not missed.
 * Returns the last failure, or null.
 */
export function useWorkspaceScratchPolling(args: {
  workspaceId: string;
  rootPath: string | undefined;
  intervalMs: number;
  enabled: boolean;
  pollAfterDisable?: boolean;
}) {
  const { workspaceId, rootPath, intervalMs, enabled, pollAfterDisable = false } = args;
  const [error, setError] = useState<string | null>(null);
  const wasEnabledRef = useRef(false);

  useEffect(() => {
    if (!workspaceId || !rootPath) return;
    const wasEnabled = wasEnabledRef.current;
    wasEnabledRef.current = enabled;
    let cancelled = false;
    const poll = () => {
      void pollWorkspaceScratch(workspaceId, rootPath).then((result) => {
        if (cancelled) return;
        const next = result.ok ? null : result.error;
        setError((current) => (current === next ? current : next));
      });
    };
    if (!enabled) {
      if (wasEnabled && pollAfterDisable) poll();
      return () => {
        cancelled = true;
      };
    }
    if (isDocumentVisible()) poll();
    const intervalId = window.setInterval(() => {
      if (isDocumentVisible()) poll();
    }, intervalMs);
    const onVisibilityChange = () => {
      if (isDocumentVisible()) poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [workspaceId, rootPath, intervalMs, enabled, pollAfterDisable]);

  return { error };
}
