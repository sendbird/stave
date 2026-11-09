import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "@/i18n";
import type { TarsBridgeApi, TarsSnapshot } from "@/lib/tars/types";
import { publishTarsSnapshot, readTarsSnapshot, useTarsSnapshotStore } from "@/store/tars-snapshot-store";

/** Reads and commands share a queue: an older read cannot overwrite a command's result. */
export function createTarsRequestQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T,>(operation: () => Promise<T>): Promise<T> => {
    const next = tail.then(operation);
    tail = next.catch(() => undefined);
    return next;
  };
}

/**
 * The Tars view's snapshot is the shared one, which the app-wide subscription
 * keeps current from change notifications; this hook only adds its own reads
 * (on mount, focus and visibility) and commands.
 */
export function useTars(bridge: TarsBridgeApi | undefined) {
  const snapshot = useTarsSnapshotStore((state) => state.snapshot);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const reading = useRef(false);
  const queue = useRef(createTarsRequestQueue());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const settle = useCallback(async (operation: () => Promise<unknown>) => {
    try {
      await queue.current(operation);
      if (mounted.current) setError(null);
      return true;
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : i18n.t("shell:tars.failed"));
      return false;
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!bridge || reading.current) return;
    reading.current = true;
    // A queued read starts after earlier commands, so its ticket outranks their results.
    try { await settle(() => readTarsSnapshot(bridge, { fresh: true })); } finally { reading.current = false; }
  }, [bridge, settle]);
  const command = useCallback(async (operation: (api: TarsBridgeApi) => Promise<TarsSnapshot>) => {
    if (!bridge) return false;
    setBusy(true);
    try {
      // Other surfaces (Fleet, a task's run line) read ownership from the same snapshot.
      return await settle(async () => publishTarsSnapshot(await operation(bridge)));
    } finally { if (mounted.current) setBusy(false); }
  }, [bridge, settle]);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, [refresh]);
  return { snapshot, error, busy, command, refresh };
}
