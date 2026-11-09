import { useEffect, useMemo } from "react";
import { create } from "zustand";
import type { TarsBridgeApi, TarsResponsibility, TarsSnapshot } from "@/lib/tars/types";
import { findTarsResponsibility, toTarsOwner, type TarsOwner, type TarsOwnershipTarget } from "@/lib/tars/ownership";

/**
 * The last Tars snapshot any surface read: the app-wide subscription's reads
 * (`useTarsChangeSubscription`, which follows `tars:changed`), the Tars view's
 * own reads, a control's result, and the one read Fleet or a task makes when
 * it mounts. A control always reads ownership fresh first.
 */
export const useTarsSnapshotStore = create<{ snapshot: TarsSnapshot | null }>(() => ({ snapshot: null }));

const NO_RESPONSIBILITIES: readonly TarsResponsibility[] = [];
/**
 * Order of the snapshots the store may hold. A read takes its ticket when it
 * starts and a command result when it is published, so a read that started
 * before a newer read or command result landed can never overwrite it.
 */
let tickets = 0;
let publishedTicket = 0;
let reading: { bridge: TarsBridgeApi; promise: Promise<TarsSnapshot> } | null = null;

export function tarsBridge(): TarsBridgeApi | undefined {
  return typeof window !== "undefined" ? window.api?.tars : undefined;
}

/** Publishes a command's result; it is the newest known state. */
export function publishTarsSnapshot(snapshot: TarsSnapshot) {
  publishedTicket = ++tickets;
  useTarsSnapshotStore.setState({ snapshot });
}

/**
 * Reads the snapshot; concurrent callers share the read unless `fresh` asks
 * for one that starts now (after a change notification, a joined read may
 * predate the change). A read overtaken by a newer published snapshot is
 * returned to its caller but not kept.
 */
export function readTarsSnapshot(bridge: TarsBridgeApi, options: { fresh?: boolean } = {}): Promise<TarsSnapshot> {
  if (!options.fresh && reading?.bridge === bridge) return reading.promise;
  const ticket = ++tickets;
  const promise = bridge.get().then((snapshot) => {
    if (ticket > publishedTicket) {
      publishedTicket = ticket;
      useTarsSnapshotStore.setState({ snapshot });
    }
    return snapshot;
  }).finally(() => { if (reading?.promise === promise) reading = null; });
  reading = { bridge, promise };
  return promise;
}

/**
 * Runs `read` at most once at a time; calls during a read schedule one
 * trailing read, so a burst of changes costs at most two reads and the last
 * change is never missed. The returned promise settles with the current read.
 */
export function coalesceTarsReads(read: () => Promise<unknown>): () => Promise<void> {
  let current: Promise<void> | null = null;
  let again = false;
  const run = (): Promise<void> => {
    if (current) { again = true; return current; }
    current = read().then(() => undefined, () => undefined).finally(() => {
      current = null;
      if (again) { again = false; void run(); }
    });
    return current;
  };
  return run;
}

/** Reads once now and again on every `snapshot` change. Returns the unsubscribe. */
export function subscribeTarsSnapshot(bridge: TarsBridgeApi): () => void {
  let active = true;
  const refresh = coalesceTarsReads(() => active ? readTarsSnapshot(bridge, { fresh: true }) : Promise.resolve());
  // Subscribe before the first read so a change during it is not lost.
  const unsubscribe = bridge.onChanged?.((event) => { if (event.scope === "snapshot") void refresh(); });
  void refresh();
  return () => { active = false; unsubscribe?.(); };
}

/** Mounted once in `App`: keeps the shared snapshot current from Tars change notifications. */
export function useTarsChangeSubscription() {
  useEffect(() => {
    const bridge = tarsBridge();
    return bridge ? subscribeTarsSnapshot(bridge) : undefined;
  }, []);
}

/** Reads ownership once when a surface mounts, so its owner labels start current. */
export function useTarsSnapshotRefresh(enabled = true) {
  useEffect(() => {
    const bridge = tarsBridge();
    if (enabled && bridge) void readTarsSnapshot(bridge).catch(() => undefined);
  }, [enabled]);
}

/** The responsibilities as last read; a stable empty list before the first read. */
export function useTarsResponsibilities() {
  return useTarsSnapshotStore((state) => state.snapshot?.responsibilities ?? NO_RESPONSIBILITIES);
}

/** The active responsibility that owns this task or run, or null. */
export function useTarsOwner(target: TarsOwnershipTarget): TarsOwner | null {
  const { taskId, agentRunId, agentRunWorkflowId, workspaceId } = target;
  // The selector returns the snapshot's own row; the owner is derived outside it.
  const row = useTarsSnapshotStore((state) =>
    findTarsResponsibility(state.snapshot?.responsibilities, { taskId, agentRunId, agentRunWorkflowId, workspaceId }));
  return useMemo(() => toTarsOwner(row), [row]);
}
