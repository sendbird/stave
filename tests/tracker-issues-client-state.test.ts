import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  applyTrackerIssueDetail,
  applyTrackerIssueItems,
  applyTrackerIssueStaveLink,
  applyTrackerIssuesStatus,
  attachTrackerIssueStaveTask,
  fetchTrackerIssueDetail,
  getTrackerIssuesClientSnapshot,
  kickoffTrackerIssue,
  loadTrackerIssues,
  refreshTrackerIssues,
  resetTrackerIssuesClientState,
  setTrackerIssuesSurfaceVisible,
  trackerIssueKey,
} from "@/lib/tracker-issues/client-state";
import type {
  TrackerSourceId,
  TrackerSourceSyncStatus,
  TrackerIssueDetail,
  TrackerIssueListItem,
  TrackerIssueStaveLink,
} from "@/lib/tracker-issues/types";

/** Relative to the real clock: the store stamps every publish with `new Date()`. */
function isoDay(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function createItem(overrides: {
  source?: TrackerSourceId;
  ref: string;
  dueDate?: string | null;
  category?: "todo" | "in_progress" | "in_review" | "done" | "closed";
  updatedAt?: string;
  staveLinks?: TrackerIssueStaveLink[];
}): TrackerIssueListItem {
  const source = overrides.source ?? "crane";
  return {
    task: {
      source,
      ref: overrides.ref,
      key: overrides.ref.toUpperCase(),
      title: `Ticket ${overrides.ref}`,
      url: "https://tracker.example.com/x",
      status: { raw: "Open", category: overrides.category ?? "todo" },
      priority: { raw: null, level: "none" },
      assignee: null,
      labels: [],
      dueDate: overrides.dueDate ?? null,
      effort: null,
      project: null,
      team: null,
      parentKey: null,
      subtasks: null,
      issueType: null,
      links: [],
      createdAt: "2024-05-01T00:00:00.000Z",
      updatedAt: overrides.updatedAt ?? "2024-05-02T00:00:00.000Z",
      closedAt: null,
    },
    staveLinks: overrides.staveLinks ?? [],
  };
}

function createLink(overrides: {
  id: string;
  source?: TrackerSourceId;
  taskRef: string;
  state?: TrackerIssueStaveLink["state"];
  updatedAt?: string;
}): TrackerIssueStaveLink {
  return {
    id: overrides.id,
    source: overrides.source ?? "crane",
    taskRef: overrides.taskRef,
    taskKey: overrides.taskRef.toUpperCase(),
    workspaceId: "ws-1",
    staveTaskId: null,
    craneJobId: null,
    state: overrides.state ?? "running",
    errorCode: null,
    createdAt: "2024-05-02T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2024-05-02T00:00:00.000Z",
  };
}

function createSyncStatus(
  overrides: Partial<TrackerSourceSyncStatus> & { source: TrackerSourceId },
): TrackerSourceSyncStatus {
  return {
    availability: "ready",
    syncing: false,
    lastSyncedAt: "2024-05-10T11:00:00.000Z",
    lastErrorCode: null,
    taskCount: 0,
    truncated: false,
    ...overrides,
  };
}

function createDetail(ref: string, description: string): TrackerIssueDetail {
  return {
    ...createItem({ ref }).task,
    description,
  };
}

const originalWindow = globalThis.window;

function setTrackerIssuesApi(api: unknown) {
  (globalThis as { window?: unknown }).window = { api };
}

beforeEach(() => {
  setTrackerIssuesApi(undefined);
  resetTrackerIssuesClientState();
});

afterEach(() => {
  resetTrackerIssuesClientState();
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("tracker issues client state", () => {
  test("freezes the published snapshot", () => {
    applyTrackerIssueItems({ items: [createItem({ ref: "a" })] });
    const snapshot = getTrackerIssuesClientSnapshot();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.attention)).toBe(true);
    expect(Object.isFrozen(snapshot.itemsBySource)).toBe(true);
    expect(Object.isFrozen(snapshot.syncBySource)).toBe(true);
  });

  test("returns the same reference across a no-op items publish", () => {
    const items = [createItem({ ref: "a" }), createItem({ ref: "b" })];
    applyTrackerIssueItems({ items });
    const first = getTrackerIssuesClientSnapshot();

    // A poll that found nothing new must not invalidate the snapshot, or every
    // subscriber re-renders on the polling interval.
    applyTrackerIssueItems({
      items: [createItem({ ref: "a" }), createItem({ ref: "b" })],
    });

    expect(getTrackerIssuesClientSnapshot()).toBe(first);
  });

  test("returns the same reference across a no-op status publish", () => {
    const status = { sources: [createSyncStatus({ source: "crane" })] };
    applyTrackerIssuesStatus(status);
    const first = getTrackerIssuesClientSnapshot();

    applyTrackerIssuesStatus({
      sources: [createSyncStatus({ source: "crane" })],
    });

    expect(getTrackerIssuesClientSnapshot()).toBe(first);
  });

  test("publishes when a row actually changed", () => {
    applyTrackerIssueItems({ items: [createItem({ ref: "a" })] });
    const first = getTrackerIssuesClientSnapshot();

    applyTrackerIssueItems({
      items: [createItem({ ref: "a", updatedAt: "2024-05-09T00:00:00.000Z" })],
    });

    expect(getTrackerIssuesClientSnapshot()).not.toBe(first);
  });

  test("handles the status push channel", () => {
    applyTrackerIssuesStatus({
      sources: [
        createSyncStatus({ source: "crane", taskCount: 3 }),
        createSyncStatus({
          source: "jira",
          availability: "not_configured",
          lastSyncedAt: null,
        }),
      ],
    });

    const snapshot = getTrackerIssuesClientSnapshot();
    expect(snapshot.syncBySource.crane?.taskCount).toBe(3);
    expect(snapshot.syncBySource.jira?.availability).toBe("not_configured");
  });

  test("handles the cache push channel per source", () => {
    applyTrackerIssueItems({
      items: [
        createItem({ ref: "a" }),
        createItem({ source: "jira", ref: "j-1" }),
      ],
    });
    applyTrackerIssueItems({
      source: "crane",
      items: [createItem({ ref: "a" }), createItem({ ref: "b" })],
    });

    const snapshot = getTrackerIssuesClientSnapshot();
    expect(snapshot.itemsBySource.crane).toHaveLength(2);
    expect(snapshot.itemsBySource.jira).toHaveLength(1);
    expect(snapshot.allItems).toHaveLength(3);
    expect(snapshot.itemByKey[trackerIssueKey("jira", "j-1")]).toBeDefined();
  });

  test("empties a source that dropped out of a full list reply", () => {
    applyTrackerIssueItems({
      items: [
        createItem({ ref: "a" }),
        createItem({ source: "jira", ref: "j-1" }),
      ],
    });
    applyTrackerIssueItems({ items: [createItem({ ref: "a" })] });

    expect(getTrackerIssuesClientSnapshot().itemsBySource.jira).toHaveLength(0);
  });

  test("handles the kickoff push channel", () => {
    applyTrackerIssueItems({ items: [createItem({ ref: "a" })] });
    applyTrackerIssueStaveLink(createLink({ id: "k1", taskRef: "a" }));

    const key = trackerIssueKey("crane", "a");
    expect(getTrackerIssuesClientSnapshot().linksByKey[key]).toHaveLength(1);

    const before = getTrackerIssuesClientSnapshot();
    applyTrackerIssueStaveLink(createLink({ id: "k1", taskRef: "a" }));
    expect(getTrackerIssuesClientSnapshot()).toBe(before);

    applyTrackerIssueStaveLink(
      createLink({ id: "k1", taskRef: "a", state: "completed" }),
    );
    expect(getTrackerIssuesClientSnapshot().linksByKey[key]?.[0]?.state).toBe(
      "completed",
    );
  });

  test("keeps a pushed link for a ticket the cache has not seen", () => {
    applyTrackerIssueStaveLink(createLink({ id: "k9", taskRef: "ghost" }));

    expect(
      getTrackerIssuesClientSnapshot().linksByKey[
        trackerIssueKey("crane", "ghost")
      ],
    ).toHaveLength(1);
  });

  test("looks up links per row without touching other rows", () => {
    applyTrackerIssueItems({
      items: [createItem({ ref: "a" }), createItem({ ref: "b" })],
    });
    const before = getTrackerIssuesClientSnapshot();
    const untouchedKey = trackerIssueKey("crane", "b");
    const untouchedLinks = before.linksByKey[untouchedKey];

    applyTrackerIssueStaveLink(createLink({ id: "k1", taskRef: "a" }));

    const after = getTrackerIssuesClientSnapshot();
    expect(after).not.toBe(before);
    // The row that did not change keeps its identity, so React bails out of
    // re-rendering it.
    expect(after.linksByKey[untouchedKey]).toBe(untouchedLinks);
  });

  test("counts overdue and due-today open tickets only", () => {
    applyTrackerIssueItems({
      items: [
        createItem({ ref: "overdue-1", dueDate: isoDay(-3) }),
        createItem({ ref: "overdue-2", dueDate: isoDay(-1) }),
        createItem({ ref: "today-1", dueDate: isoDay(0) }),
        createItem({ ref: "soon", dueDate: isoDay(2) }),
        createItem({ ref: "none" }),
        createItem({
          ref: "done",
          dueDate: isoDay(-5),
          category: "done",
        }),
      ],
    });

    const attention = getTrackerIssuesClientSnapshot().attention;
    expect(attention).toEqual({ overdue: 2, dueToday: 1 });

    // A push that does not move the counts must keep the badge's object
    // identity, or the top bar re-renders on every poll.
    applyTrackerIssueStaveLink(createLink({ id: "k1", taskRef: "soon" }));
    expect(getTrackerIssuesClientSnapshot().attention).toBe(attention);
  });

  test("de-duplicates in-flight detail fetches", async () => {
    let calls = 0;
    let resolveDetail: ((value: unknown) => void) | null = null;
    setTrackerIssuesApi({
      trackerIssues: {
        getDetail: () => {
          calls += 1;
          return new Promise((resolve) => {
            resolveDetail = resolve;
          });
        },
      },
    });

    const first = fetchTrackerIssueDetail("crane", "a");
    const second = fetchTrackerIssueDetail("crane", "a");
    expect(first).toBe(second);
    expect(calls).toBe(1);

    resolveDetail?.({ ok: true, detail: createDetail("a", "Body") });
    await first;

    expect(
      getTrackerIssuesClientSnapshot().detailByKey[trackerIssueKey("crane", "a")]
        ?.description,
    ).toBe("Body");

    // The cached result is republished only when it actually differs.
    const cached = getTrackerIssuesClientSnapshot();
    applyTrackerIssueDetail(createDetail("a", "Body"));
    expect(getTrackerIssuesClientSnapshot()).toBe(cached);
  });

  test("no-ops on the web build where window.api is absent", async () => {
    setTrackerIssuesApi(undefined);

    await expect(fetchTrackerIssueDetail("crane", "a")).resolves.toBeNull();
    await expect(loadTrackerIssues()).resolves.toBeUndefined();
    await expect(refreshTrackerIssues()).resolves.toEqual({
      ok: false,
      message: "Tracker issues are unavailable.",
    });
    expect(() => setTrackerIssuesSurfaceVisible(true)).not.toThrow();

    const kickoff = await kickoffTrackerIssue({
      source: "crane",
      taskRef: "a",
      repositoryPath: "/tmp/project",
      workspace: { mode: "new" },
      runtime: { provider: "claude-code" },
      instruction: "Fix it",
      startMode: "run",
      craneWriteBack: false,
    } as never);
    expect(kickoff.ok).toBe(false);

    const attached = await attachTrackerIssueStaveTask({
      kickoffId: "k1",
      taskId: "t1",
    });
    expect(attached).toEqual({
      ok: false,
      link: null,
      message: "Tracker issues are unavailable.",
    });

    expect(getTrackerIssuesClientSnapshot().ready).toBe(false);
  });
});
