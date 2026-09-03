import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  EMPTY_TRACKER_TASK_LINKS,
  applyTrackerTaskDetail,
  applyTrackerTaskItems,
  applyTrackerTaskStaveLink,
  applyTrackerTasksStatus,
  getTrackerTasksClientSnapshot,
  parseTrackerTaskKey,
  resetTrackerTasksClientStore,
  subscribeTrackerTasksClient,
  type TrackerTasksAttention,
  type TrackerTasksClientSnapshot,
} from "@/lib/tracker-tasks/client-store";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
  type TrackerTaskAttachStaveTaskArgs,
  type TrackerTaskDetail,
  type TrackerTaskKickoffArgs,
  type TrackerTaskKickoffResult,
  type TrackerTaskStaveLink,
} from "@/lib/tracker-tasks/types";

export {
  applyTrackerTaskDetail,
  applyTrackerTaskItems,
  applyTrackerTaskStaveLink,
  applyTrackerTasksStatus,
  getTrackerTasksClientSnapshot,
  trackerTaskKey,
} from "@/lib/tracker-tasks/client-store";
export type {
  TrackerTasksAttention,
  TrackerTasksClientSnapshot,
} from "@/lib/tracker-tasks/client-store";

/** Whole-mirror subscription. Only the view shell should need this much. */
export function useTrackerTasksClientState(): TrackerTasksClientSnapshot {
  return useSyncExternalStore(
    subscribeTrackerTasksClient,
    getTrackerTasksClientSnapshot,
    getTrackerTasksClientSnapshot,
  );
}

/**
 * The badge counts.
 *
 * The store keeps one frozen `attention` object per publish, so this returns a
 * stable reference rather than allocating `{ overdue, dueToday }` inside a
 * selector, which would defeat the identity bail-out on every unrelated push.
 */
export function useTrackerTasksAttention(): TrackerTasksAttention {
  const read = useCallback(() => getTrackerTasksClientSnapshot().attention, []);
  return useSyncExternalStore(subscribeTrackerTasksClient, read, read);
}

/**
 * Whether any source can actually produce rows right now.
 *
 * A boolean, not the status record: the top bar mounts for the whole session
 * and must not re-render on every cache push just to decide whether to show an
 * icon.
 */
export function useTrackerTasksHasReadySource(): boolean {
  const read = useCallback(() => {
    const { syncBySource } = getTrackerTasksClientSnapshot();
    return TRACKER_SOURCE_IDS.some(
      (source) => syncBySource[source]?.availability === "ready",
    );
  }, []);
  return useSyncExternalStore(subscribeTrackerTasksClient, read, read);
}

/**
 * Row-local link subscription.
 *
 * Every row reads only its own slice, so a push that touches one ticket leaves
 * the other rows' values referentially identical and React skips re-rendering
 * them. A parent subscription would re-render all of them instead.
 */
export function useTrackerTaskLinks(key: string): TrackerTaskStaveLink[] {
  const read = useCallback(
    () =>
      getTrackerTasksClientSnapshot().linksByKey[key] ??
      EMPTY_TRACKER_TASK_LINKS,
    [key],
  );
  return useSyncExternalStore(subscribeTrackerTasksClient, read, read);
}

const detailRequests = new Map<string, Promise<TrackerTaskDetail | null>>();
const pendingDetailKeys = new Set<string>();
const pendingListeners = new Set<() => void>();

function notifyPending() {
  for (const listener of pendingListeners) {
    listener();
  }
}

function subscribePendingDetails(listener: () => void) {
  pendingListeners.add(listener);
  return () => {
    pendingListeners.delete(listener);
  };
}

/**
 * Fetch a description, at most once per key at a time.
 *
 * Opening a row and opening its kickoff dialog both want the detail, and the
 * list can remount mid-flight; without the in-flight map that is three round
 * trips to the tracker for one ticket.
 */
export function fetchTrackerTaskDetail(
  source: TrackerSourceId,
  taskRef: string,
): Promise<TrackerTaskDetail | null> {
  const key = `${source}:${taskRef}`;
  const inFlight = detailRequests.get(key);
  if (inFlight) {
    return inFlight;
  }
  const getDetail = window.api?.trackerTasks?.getDetail;
  if (!getDetail) {
    return Promise.resolve(null);
  }
  pendingDetailKeys.add(key);
  notifyPending();
  const request = getDetail({ source, taskRef })
    .then((result) => {
      if (result?.ok && result.detail) {
        applyTrackerTaskDetail(result.detail);
        return result.detail;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      detailRequests.delete(key);
      pendingDetailKeys.delete(key);
      notifyPending();
    });
  detailRequests.set(key, request);
  return request;
}

/** Cached detail for `key`, fetched lazily the first time something asks. */
export function useTrackerTaskDetail(
  key: string | null,
): TrackerTaskDetail | null {
  const read = useCallback(
    () =>
      key ? (getTrackerTasksClientSnapshot().detailByKey[key] ?? null) : null,
    [key],
  );
  const detail = useSyncExternalStore(subscribeTrackerTasksClient, read, read);

  useEffect(() => {
    if (!key || detail) {
      return;
    }
    const parsed = parseTrackerTaskKey(key);
    if (!parsed) {
      return;
    }
    void fetchTrackerTaskDetail(parsed.source, parsed.taskRef);
  }, [key, detail]);

  return detail;
}

export function useTrackerTaskDetailPending(key: string | null): boolean {
  const read = useCallback(
    () => (key ? pendingDetailKeys.has(key) : false),
    [key],
  );
  return useSyncExternalStore(subscribePendingDetails, read, read);
}

/** Pull the cached rows for one source, or for every source when omitted. */
export async function loadTrackerTasks(source?: TrackerSourceId) {
  const list = window.api?.trackerTasks?.list;
  if (!list) {
    return;
  }
  const result = await list(source ? { source } : undefined);
  if (!result?.ok) {
    return;
  }
  applyTrackerTaskItems({ source, items: result.items ?? [] });
}

export async function loadTrackerTasksStatus() {
  const getStatus = window.api?.trackerTasks?.getStatus;
  if (!getStatus) {
    return;
  }
  const result = await getStatus();
  if (result?.ok && result.status) {
    applyTrackerTasksStatus(result.status);
  }
}

/**
 * Ask main to re-poll, then re-read the cache.
 *
 * The refresh reply carries the sync status but not the rows, so the follow-up
 * `list` is what actually repaints the surface.
 */
export async function refreshTrackerTasks(
  source?: TrackerSourceId,
): Promise<{ ok: boolean; message?: string }> {
  const refresh = window.api?.trackerTasks?.refresh;
  if (!refresh) {
    return { ok: false, message: "Tracker tasks are unavailable." };
  }
  const result = await refresh(source ? { source } : undefined);
  if (result?.status) {
    applyTrackerTasksStatus(result.status);
  }
  await loadTrackerTasks(source);
  return { ok: Boolean(result?.ok), message: result?.message };
}

/**
 * Tell main whether the surface is on screen. Background polling is only worth
 * its round trips while somebody is looking at the list.
 */
export function setTrackerTasksSurfaceVisible(visible: boolean) {
  const setVisible = window.api?.trackerTasks?.setSurfaceVisible;
  if (!setVisible) {
    return;
  }
  void Promise.resolve(setVisible({ visible })).catch(() => undefined);
}

export async function kickoffTrackerTask(
  args: TrackerTaskKickoffArgs,
): Promise<{
  ok: boolean;
  result?: TrackerTaskKickoffResult;
  message?: string;
}> {
  const kickoff = window.api?.trackerTasks?.kickoff;
  if (!kickoff) {
    return { ok: false, message: "Tracker tasks are unavailable." };
  }
  const reply = await kickoff(args);
  return {
    ok: Boolean(reply?.ok),
    result: reply?.result,
    message: reply?.message,
  };
}

export async function attachTrackerTaskStaveTask(
  args: TrackerTaskAttachStaveTaskArgs,
): Promise<{
  ok: boolean;
  link: TrackerTaskStaveLink | null;
  message?: string;
}> {
  const attach = window.api?.trackerTasks?.attachStaveTask;
  if (!attach) {
    return { ok: false, link: null, message: "Tracker tasks are unavailable." };
  }
  const reply = await attach(args);
  if (reply?.ok && reply.link) {
    applyTrackerTaskStaveLink(reply.link);
  }
  return {
    ok: Boolean(reply?.ok),
    link: reply?.link ?? null,
    message: reply?.message,
  };
}

/** Test-only reset; the app never tears the mirror down. */
export function resetTrackerTasksClientState() {
  detailRequests.clear();
  pendingDetailKeys.clear();
  notifyPending();
  resetTrackerTasksClientStore();
}
