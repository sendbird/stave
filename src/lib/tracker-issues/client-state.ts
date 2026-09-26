import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  EMPTY_TRACKER_ISSUE_LINKS,
  applyTrackerIssueDetail,
  applyTrackerIssueItems,
  applyTrackerIssueStaveLink,
  applyTrackerIssuesStatus,
  getTrackerIssuesClientSnapshot,
  parseTrackerIssueKey,
  resetTrackerIssuesClientStore,
  subscribeTrackerIssuesClient,
  type TrackerIssuesAttention,
  type TrackerIssuesClientSnapshot,
} from "@/lib/tracker-issues/client-store";
import {
  TRACKER_SOURCE_IDS,
  type TrackerSourceId,
  type TrackerIssueAttachStaveTaskArgs,
  type TrackerIssueDetail,
  type TrackerIssueKickoffArgs,
  type TrackerIssueKickoffResult,
  type TrackerIssueStaveLink,
} from "@/lib/tracker-issues/types";

export {
  applyTrackerIssueDetail,
  applyTrackerIssueItems,
  applyTrackerIssueStaveLink,
  applyTrackerIssuesStatus,
  getTrackerIssuesClientSnapshot,
  trackerIssueKey,
} from "@/lib/tracker-issues/client-store";
export type {
  TrackerIssuesAttention,
  TrackerIssuesClientSnapshot,
} from "@/lib/tracker-issues/client-store";

/** Whole-mirror subscription. Only the view shell should need this much. */
export function useTrackerIssuesClientState(): TrackerIssuesClientSnapshot {
  return useSyncExternalStore(
    subscribeTrackerIssuesClient,
    getTrackerIssuesClientSnapshot,
    getTrackerIssuesClientSnapshot,
  );
}

/**
 * The badge counts.
 *
 * The store keeps one frozen `attention` object per publish, so this returns a
 * stable reference rather than allocating `{ overdue, dueToday }` inside a
 * selector, which would defeat the identity bail-out on every unrelated push.
 */
export function useTrackerIssuesAttention(): TrackerIssuesAttention {
  const read = useCallback(() => getTrackerIssuesClientSnapshot().attention, []);
  return useSyncExternalStore(subscribeTrackerIssuesClient, read, read);
}

/**
 * Just the per-source sync statuses.
 *
 * Narrower than the whole mirror on purpose: Settings and the top bar care only
 * about connection state, and reading the full snapshot would re-render them on
 * every cache push that changed a row they do not show. The store rebuilds this
 * record once per publish, so the identity is stable between publishes.
 */
export function useTrackerSourceStatuses() {
  const read = useCallback(
    () => getTrackerIssuesClientSnapshot().syncBySource,
    [],
  );
  return useSyncExternalStore(subscribeTrackerIssuesClient, read, read);
}

/**
 * Whether any source can actually produce rows right now.
 *
 * A boolean, not the status record: the top bar mounts for the whole session
 * and must not re-render on every cache push just to decide whether to show an
 * icon.
 */
export function useTrackerIssuesHasReadySource(): boolean {
  const read = useCallback(() => {
    const { syncBySource } = getTrackerIssuesClientSnapshot();
    return TRACKER_SOURCE_IDS.some(
      (source) => syncBySource[source]?.availability === "ready",
    );
  }, []);
  return useSyncExternalStore(subscribeTrackerIssuesClient, read, read);
}

/**
 * Row-local link subscription.
 *
 * Every row reads only its own slice, so a push that touches one ticket leaves
 * the other rows' values referentially identical and React skips re-rendering
 * them. A parent subscription would re-render all of them instead.
 */
export function useTrackerIssueLinks(key: string): TrackerIssueStaveLink[] {
  const read = useCallback(
    () =>
      getTrackerIssuesClientSnapshot().linksByKey[key] ??
      EMPTY_TRACKER_ISSUE_LINKS,
    [key],
  );
  return useSyncExternalStore(subscribeTrackerIssuesClient, read, read);
}

const detailRequests = new Map<string, Promise<TrackerIssueDetail | null>>();
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
export function fetchTrackerIssueDetail(
  source: TrackerSourceId,
  taskRef: string,
): Promise<TrackerIssueDetail | null> {
  const key = `${source}:${taskRef}`;
  const inFlight = detailRequests.get(key);
  if (inFlight) {
    return inFlight;
  }
  const getDetail = window.api?.trackerIssues?.getDetail;
  if (!getDetail) {
    return Promise.resolve(null);
  }
  pendingDetailKeys.add(key);
  notifyPending();
  const request = getDetail({ source, taskRef })
    .then((result) => {
      if (result?.ok && result.detail) {
        applyTrackerIssueDetail(result.detail);
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
export function useTrackerIssueDetail(
  key: string | null,
): TrackerIssueDetail | null {
  const read = useCallback(
    () =>
      key ? (getTrackerIssuesClientSnapshot().detailByKey[key] ?? null) : null,
    [key],
  );
  const detail = useSyncExternalStore(subscribeTrackerIssuesClient, read, read);

  useEffect(() => {
    if (!key || detail) {
      return;
    }
    const parsed = parseTrackerIssueKey(key);
    if (!parsed) {
      return;
    }
    void fetchTrackerIssueDetail(parsed.source, parsed.taskRef);
  }, [key, detail]);

  return detail;
}

export function useTrackerIssueDetailPending(key: string | null): boolean {
  const read = useCallback(
    () => (key ? pendingDetailKeys.has(key) : false),
    [key],
  );
  return useSyncExternalStore(subscribePendingDetails, read, read);
}

/** Pull the cached rows for one source, or for every source when omitted. */
export async function loadTrackerIssues(source?: TrackerSourceId) {
  const list = window.api?.trackerIssues?.list;
  if (!list) {
    return;
  }
  const result = await list(source ? { source } : undefined);
  if (!result?.ok) {
    return;
  }
  applyTrackerIssueItems({ source, items: result.items ?? [] });
}

export async function loadTrackerIssuesStatus() {
  const getStatus = window.api?.trackerIssues?.getStatus;
  if (!getStatus) {
    return;
  }
  const result = await getStatus();
  if (result?.ok && result.status) {
    applyTrackerIssuesStatus(result.status);
  }
}

/**
 * Ask main to re-poll, then re-read the cache.
 *
 * The refresh reply carries the sync status but not the rows, so the follow-up
 * `list` is what actually repaints the surface.
 */
export async function refreshTrackerIssues(
  source?: TrackerSourceId,
): Promise<{ ok: boolean; message?: string }> {
  const refresh = window.api?.trackerIssues?.refresh;
  if (!refresh) {
    return { ok: false, message: "Tracker issues are unavailable." };
  }
  const result = await refresh(source ? { source } : undefined);
  if (result?.status) {
    applyTrackerIssuesStatus(result.status);
  }
  await loadTrackerIssues(source);
  return { ok: Boolean(result?.ok), message: result?.message };
}

/**
 * Tell main whether the surface is on screen. Background polling is only worth
 * its round trips while somebody is looking at the list.
 */
export function setTrackerIssuesSurfaceVisible(visible: boolean) {
  const setVisible = window.api?.trackerIssues?.setSurfaceVisible;
  if (!setVisible) {
    return;
  }
  void Promise.resolve(setVisible({ visible })).catch(() => undefined);
}

export async function kickoffTrackerIssue(
  args: TrackerIssueKickoffArgs,
): Promise<{
  ok: boolean;
  result?: TrackerIssueKickoffResult;
  message?: string;
}> {
  const kickoff = window.api?.trackerIssues?.kickoff;
  if (!kickoff) {
    return { ok: false, message: "Tracker issues are unavailable." };
  }
  const reply = await kickoff(args);
  return {
    ok: Boolean(reply?.ok),
    result: reply?.result,
    message: reply?.message,
  };
}

export async function attachTrackerIssueStaveTask(
  args: TrackerIssueAttachStaveTaskArgs,
): Promise<{
  ok: boolean;
  link: TrackerIssueStaveLink | null;
  message?: string;
}> {
  const attach = window.api?.trackerIssues?.attachStaveTask;
  if (!attach) {
    return { ok: false, link: null, message: "Tracker issues are unavailable." };
  }
  const reply = await attach(args);
  if (reply?.ok && reply.link) {
    applyTrackerIssueStaveLink(reply.link);
  }
  return {
    ok: Boolean(reply?.ok),
    link: reply?.link ?? null,
    message: reply?.message,
  };
}

/** Test-only reset; the app never tears the mirror down. */
export function resetTrackerIssuesClientState() {
  detailRequests.clear();
  pendingDetailKeys.clear();
  notifyPending();
  resetTrackerIssuesClientStore();
}
