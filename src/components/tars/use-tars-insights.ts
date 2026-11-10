import { useCallback, useEffect, useRef, useState } from "react";
import { i18n } from "@/i18n";
import { toast } from "@/components/ui";
import { failureMessage } from "@/components/layout/workspace-information/failure-message";
import type { RepositoryMemory, RepositoryMemorySourceTask, RepositoryMemoryUpdateArgs } from "@/lib/repository-memory";
import { REPOSITORY_MEMORY_CHANGED_EVENT } from "@/components/layout/RepositoryMemoryControls";
import { forgetMemoryWithUndo } from "@/components/layout/workspace-memory-forget";
import type { TarsBridgeApi } from "@/lib/tars/types";
import { tarsUsageWindows, type TarsUsageReport } from "@/lib/tars/usage";

export type TarsUsageState =
  | { status: "unavailable" | "loading" | "failed"; report: null }
  | { status: "ready"; report: TarsUsageReport; refreshing: boolean };

/**
 * Reads the usage report once each time the view opens and again on Refresh;
 * never on a timer. The period is computed here, in the window's local time.
 */
export function useTarsUsage(bridge: Pick<TarsBridgeApi, "getUsage"> | undefined, open: boolean) {
  const [state, setState] = useState<TarsUsageState>({ status: bridge?.getUsage ? "loading" : "unavailable", report: null });
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    if (!bridge?.getUsage) { setState({ status: "unavailable", report: null }); return; }
    // A refresh keeps the report on screen until the new one arrives.
    setState((current) => current.status === "ready" ? { ...current, refreshing: true } : { status: "loading", report: null });
    try {
      const report = await bridge.getUsage(tarsUsageWindows(new Date()));
      if (request === generation.current) setState({ status: "ready", report, refreshing: false });
    } catch {
      if (request === generation.current) setState({ status: "failed", report: null });
    }
  }, [bridge]);
  useEffect(() => {
    if (!open) return;
    void load();
    return () => { generation.current += 1; };
  }, [load, open]);
  return { state, reload: load };
}

export type TarsRepositoryMemoriesState =
  | { status: "idle" | "loading" | "unavailable" }
  | { status: "failed"; message: string }
  | { status: "ready"; items: RepositoryMemory[]; sourceTasks: ReadonlyMap<string, RepositoryMemorySourceTask>; useMemory: boolean;
    /** When this list was read: the one reference time its rows share for "stale" and "3 days ago". */
    readAt: number };

const memoryChanged = () => window.dispatchEvent(new Event(REPOSITORY_MEMORY_CHANGED_EVENT));

/**
 * One repository's memories through the existing repository-memory bridge:
 * read when `enabled` first turns true (its section was opened) and again
 * when any surface changes a memory. Saving and forgetting are the Memory
 * panel's own paths, so an Undo and the other surfaces behave the same.
 */
export function useTarsRepositoryMemories(repositoryPath: string, enabled: boolean) {
  const [state, setState] = useState<TarsRepositoryMemoriesState>({ status: "idle" });
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    const api = window.api?.repositoryMemory;
    if (!api?.list) { setState({ status: "unavailable" }); return; }
    setState((current) => current.status === "ready" ? current : { status: "loading" });
    try {
      const [list, settings] = await Promise.all([api.list({ repositoryPath }), api.getSettings?.({ repositoryPath })]);
      if (request !== generation.current) return;
      if (!list.ok) throw new Error(list.message ?? "");
      setState({ status: "ready", readAt: Date.now(), items: list.items, sourceTasks: new Map((list.sourceTasks ?? []).map((task) => [task.taskId, task])),
        // Unknown settings read as on: only a known "off" may say tasks receive nothing.
        useMemory: settings?.ok && settings.settings ? settings.settings.useMemory : true });
    } catch (error) {
      if (request === generation.current) setState({ status: "failed", message: error instanceof Error ? error.message : "" });
    }
  }, [repositoryPath]);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const listener = () => void load();
    window.addEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, listener);
    return () => { generation.current += 1; window.removeEventListener(REPOSITORY_MEMORY_CHANGED_EVENT, listener); };
  }, [enabled, load]);
  const save = useCallback(async (patch: RepositoryMemoryUpdateArgs) => {
    try {
      const result = await window.api?.repositoryMemory?.update?.(patch);
      if (!result?.ok || !result.memory) throw new Error(result?.message ?? "");
      memoryChanged();
      return true;
    } catch (error) {
      toast.error(failureMessage(i18n.t("workspace:memory.section.saveFailed"), error));
      return false;
    }
  }, []);
  const remove = useCallback((memory: RepositoryMemory) => forgetMemoryWithUndo(memory, { api: window.api?.repositoryMemory, onChanged: memoryChanged }), []);
  return { state, reload: load, save, remove };
}
