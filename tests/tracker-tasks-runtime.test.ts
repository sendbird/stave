import { describe, expect, test } from "bun:test";

import {
  TrackerTasksRuntime,
  type TrackerTasksPersistence,
} from "../electron/main/tracker-tasks/runtime";
import type {
  TrackerSourceAdapter,
  TrackerSourceListResult,
} from "../src/lib/tracker-tasks/source";
import type { CraneDispatchJobUpdate } from "../src/lib/crane-connector/types";
import type {
  TrackerSourceAvailability,
  TrackerSourceId,
  TrackerTask,
  TrackerTaskDetail,
  TrackerTaskLinkState,
  TrackerTaskStaveLink,
  TrackerTasksPublicStatus,
} from "../src/lib/tracker-tasks/types";

const NOW = new Date("2026-08-01T00:00:00.000Z");

/** Let queued microtasks (the runtime's per-source queue) settle. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function makeTask(
  source: TrackerSourceId,
  ref: string,
  overrides: Partial<TrackerTask> = {},
): TrackerTask {
  return {
    source,
    ref,
    key: ref,
    title: `Ticket ${ref}`,
    url: `https://tracker.example.com/${ref}`,
    status: { raw: "In Progress", category: "in_progress" },
    priority: { raw: "High", level: "high" },
    assignee: null,
    labels: [],
    dueDate: null,
    effort: null,
    project: null,
    team: null,
    parentKey: null,
    subtasks: null,
    issueType: null,
    links: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    closedAt: null,
    ...overrides,
  };
}

interface FakeAdapterControls {
  adapter: TrackerSourceAdapter;
  availability: TrackerSourceAvailability;
  listCalls: number;
  result: TrackerSourceListResult;
  error: (Error & { retryAfterMs?: number; code?: string }) | null;
}

function makeAdapter(sourceId: TrackerSourceId): FakeAdapterControls {
  const controls: FakeAdapterControls = {
    availability: "ready",
    listCalls: 0,
    result: { tasks: [], truncated: false },
    error: null,
    adapter: {
      sourceId,
      capabilities: { kickoffWriteBack: sourceId === "crane", detail: true },
      availability: async () => controls.availability,
      listTasks: async (): Promise<TrackerSourceListResult> => {
        controls.listCalls += 1;
        if (controls.error) {
          throw controls.error;
        }
        return controls.result;
      },
      getTask: async ({ ref }): Promise<TrackerTaskDetail> => ({
        ...makeTask(sourceId, ref),
        description: "body",
      }),
    },
  };
  return controls;
}

interface TimerRecord {
  id: number;
  cb: () => void;
  delay: number;
  cleared: boolean;
  fired: boolean;
}

class TimerHarness {
  readonly records: TimerRecord[] = [];
  private nextId = 1;

  readonly set = (cb: () => void, delay: number): NodeJS.Timeout => {
    const record: TimerRecord = {
      id: this.nextId++,
      cb,
      delay,
      cleared: false,
      fired: false,
    };
    this.records.push(record);
    return record.id as unknown as NodeJS.Timeout;
  };

  readonly clear = (timer: NodeJS.Timeout): void => {
    const id = timer as unknown as number;
    const record = this.records.find((entry) => entry.id === id);
    if (record) {
      record.cleared = true;
    }
  };

  pending(): TimerRecord[] {
    return this.records.filter((entry) => !entry.cleared && !entry.fired);
  }

  async firePending(): Promise<void> {
    for (const record of this.pending()) {
      record.fired = true;
      record.cb();
    }
    await flush();
  }
}

function makeFakePersistence(): TrackerTasksPersistence & {
  tasksBySource: Map<TrackerSourceId, TrackerTask[]>;
  kickoffs: Map<string, TrackerTaskStaveLink>;
} {
  const tasksBySource = new Map<TrackerSourceId, TrackerTask[]>();
  const kickoffs = new Map<string, TrackerTaskStaveLink>();
  return {
    tasksBySource,
    kickoffs,
    replaceTrackerSourceTasks(source, tasks) {
      tasksBySource.set(source, [...tasks]);
    },
    listTrackerSourceTasks(source) {
      if (source) {
        return tasksBySource.get(source) ?? [];
      }
      return [...tasksBySource.values()].flat();
    },
    getTrackerTask(source, taskRef) {
      return (
        tasksBySource.get(source)?.find((task) => task.ref === taskRef) ?? null
      );
    },
    upsertTrackerTaskKickoff(link) {
      kickoffs.set(link.id, link);
    },
    listTrackerTaskKickoffs(args) {
      let rows = [...kickoffs.values()];
      if (args?.source) {
        rows = rows.filter((row) => row.source === args.source);
      }
      return rows;
    },
    findTrackerTaskKickoffByCraneJobId(craneJobId) {
      return (
        [...kickoffs.values()].find((row) => row.craneJobId === craneJobId) ??
        null
      );
    },
    findTrackerTaskKickoffByStaveTask(taskId) {
      return (
        [...kickoffs.values()].find((row) => row.staveTaskId === taskId) ?? null
      );
    },
    findLatestTrackerTaskKickoff(source, taskRef) {
      return (
        [...kickoffs.values()].find(
          (row) => row.source === source && row.taskRef === taskRef,
        ) ?? null
      );
    },
    pruneTrackerTaskKickoffs() {
      return 0;
    },
  };
}

function makeRuntime(options?: {
  crane?: FakeAdapterControls;
  jira?: FakeAdapterControls;
  random?: () => number;
}) {
  const crane = options?.crane ?? makeAdapter("crane");
  const jira = options?.jira ?? makeAdapter("jira");
  const persistence = makeFakePersistence();
  const timers = new TimerHarness();
  const clock = { value: NOW };
  const statuses: TrackerTasksPublicStatus[] = [];
  const cacheUpdates: Array<{ source: TrackerSourceId }> = [];
  const kickoffUpdates: TrackerTaskStaveLink[] = [];
  const runtime = new TrackerTasksRuntime({
    persistence,
    sources: [crane.adapter, jira.adapter],
    emitStatus: (status) => statuses.push(status),
    emitCacheUpdated: (payload) => cacheUpdates.push(payload),
    emitKickoffUpdated: (link) => kickoffUpdates.push(link),
    now: () => clock.value,
    random: options?.random ?? (() => 0.5),
    setTimer: timers.set,
    clearTimer: timers.clear,
  });
  return {
    runtime,
    crane,
    jira,
    persistence,
    timers,
    clock,
    statuses,
    cacheUpdates,
    kickoffUpdates,
  };
}

describe("TrackerTasksRuntime surface visibility", () => {
  test("does not poll while hidden and refreshes immediately once shown", async () => {
    const harness = makeRuntime();
    harness.crane.result = {
      tasks: [makeTask("crane", "CRN-1")],
      truncated: false,
    };

    // Prime source readiness and the cache, then forget the fetch counts.
    await harness.runtime.refresh({ reason: "prime" });
    harness.crane.listCalls = 0;
    harness.jira.listCalls = 0;

    // Hidden: nothing is scheduled and nothing polls.
    expect(harness.timers.pending().length).toBe(0);
    await harness.timers.firePending();
    expect(harness.crane.listCalls).toBe(0);

    // Let the cache age past the refresh interval so it counts as stale.
    harness.clock.value = new Date(NOW.getTime() + 10 * 60 * 1_000);

    // Shown with a stale cache: an immediate refresh is scheduled.
    harness.runtime.setSurfaceVisible(true);
    expect(harness.timers.pending().length).toBe(1);
    expect(harness.timers.pending()[0]?.delay).toBe(0);

    await harness.timers.firePending();
    expect(harness.crane.listCalls).toBe(1);
    expect(harness.jira.listCalls).toBe(1);

    // Hidden again: the reschedule is cancelled, so firing does nothing more.
    harness.runtime.setSurfaceVisible(false);
    const before = harness.crane.listCalls;
    await harness.timers.firePending();
    expect(harness.crane.listCalls).toBe(before);
  });
});

describe("TrackerTasksRuntime per-source isolation", () => {
  test("one source failing neither blocks nor clears the other", async () => {
    const harness = makeRuntime();
    harness.crane.result = {
      tasks: [makeTask("crane", "CRN-1")],
      truncated: false,
    };
    harness.jira.error = Object.assign(new Error("boom"), {
      code: "server_error",
    });

    await harness.runtime.refresh({ reason: "manual" });

    expect(harness.persistence.tasksBySource.get("crane")?.length).toBe(1);
    const status = harness.runtime.getStatus();
    const craneStatus = status.sources.find((s) => s.source === "crane");
    const jiraStatus = status.sources.find((s) => s.source === "jira");
    expect(craneStatus?.lastErrorCode).toBeNull();
    expect(craneStatus?.taskCount).toBe(1);
    expect(jiraStatus?.lastErrorCode).toBe("server_error");
    // The failing source never wrote a row, so the other source is untouched.
    expect(harness.persistence.tasksBySource.get("jira")).toBeUndefined();
  });
});

describe("TrackerTasksRuntime backoff", () => {
  test("grows the retry delay and honours retryAfterMs", async () => {
    const harness = makeRuntime({ random: () => 0.5 });
    harness.runtime.setSurfaceVisible(true);
    harness.crane.error = Object.assign(new Error("down"), {
      code: "unavailable",
    });
    harness.jira.availability = "disabled";

    const lastRetryDelay = () => {
      const craneRetries = harness.timers.records.filter(
        (record) => record.delay !== 0 && record.delay !== 300_000,
      );
      return craneRetries[craneRetries.length - 1]?.delay;
    };

    await harness.runtime.refresh({ source: "crane", reason: "manual" });
    const first = lastRetryDelay();
    await harness.runtime.refresh({ source: "crane", reason: "manual" });
    const second = lastRetryDelay();
    await harness.runtime.refresh({ source: "crane", reason: "manual" });
    const third = lastRetryDelay();

    expect(first).toBe(5_000);
    expect(second).toBe(10_000);
    expect(third).toBe(20_000);

    // A server-stated retry window wins over the computed curve.
    harness.crane.error = Object.assign(new Error("slow down"), {
      code: "rate_limited",
      retryAfterMs: 90_000,
    });
    await harness.runtime.refresh({ source: "crane", reason: "manual" });
    expect(lastRetryDelay()).toBe(90_000);
  });
});

describe("TrackerTasksRuntime availability", () => {
  test("a source flipping to ready gets an immediate refresh", async () => {
    const harness = makeRuntime();
    harness.crane.availability = "disabled";
    harness.jira.availability = "disabled";

    await harness.runtime.refreshAvailability();
    expect(harness.crane.listCalls).toBe(0);

    harness.crane.availability = "ready";
    harness.crane.result = {
      tasks: [makeTask("crane", "CRN-9")],
      truncated: false,
    };
    await harness.runtime.refreshAvailability();
    await flush();
    expect(harness.crane.listCalls).toBe(1);
  });
});

describe("TrackerTasksRuntime noteCraneJobUpdate", () => {
  const seedKickoff = (
    persistence: ReturnType<typeof makeFakePersistence>,
  ): TrackerTaskStaveLink => {
    const link: TrackerTaskStaveLink = {
      id: "kickoff-1",
      source: "crane",
      taskRef: "CRN-1",
      taskKey: "CRN-1",
      workspaceId: "ws-1",
      staveTaskId: "task-1",
      craneJobId: "job-1",
      state: "running",
      errorCode: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    persistence.upsertTrackerTaskKickoff(link);
    return link;
  };

  const cases: Array<[CraneDispatchJobUpdate["state"], TrackerTaskLinkState]> =
    [
      ["received", "running"],
      ["awaiting_local_approval", "running"],
      ["running", "running"],
      ["needs_local_input", "needs_input"],
      ["completed", "completed"],
      ["failed", "failed"],
      ["declined", "cancelled"],
      ["cancelled", "cancelled"],
    ];

  for (const [craneState, linkState] of cases) {
    test(`maps ${craneState} to ${linkState}`, () => {
      const harness = makeRuntime();
      seedKickoff(harness.persistence);
      const update: CraneDispatchJobUpdate = {
        jobId: "job-1",
        state: craneState,
        workspaceId: "ws-1",
        taskId: "task-1",
        errorCode: craneState === "failed" ? "provider_failed" : null,
      };
      harness.runtime.noteCraneJobUpdate(update);
      expect(harness.persistence.kickoffs.get("kickoff-1")?.state).toBe(
        linkState,
      );
      expect(harness.kickoffUpdates.at(-1)?.state).toBe(linkState);
    });
  }
});

describe("TrackerTasksRuntime listItems", () => {
  test("joins cached tasks with their kickoff rows", () => {
    const harness = makeRuntime();
    harness.persistence.replaceTrackerSourceTasks(
      "crane",
      [makeTask("crane", "CRN-1"), makeTask("crane", "CRN-2")],
      NOW.toISOString(),
    );
    harness.persistence.upsertTrackerTaskKickoff({
      id: "kickoff-1",
      source: "crane",
      taskRef: "CRN-1",
      taskKey: "CRN-1",
      workspaceId: "ws-1",
      staveTaskId: "task-1",
      craneJobId: null,
      state: "running",
      errorCode: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });

    const items = harness.runtime.listItems("crane");
    const first = items.find((item) => item.task.ref === "CRN-1");
    const second = items.find((item) => item.task.ref === "CRN-2");
    expect(first?.staveLinks.length).toBe(1);
    expect(first?.staveLinks[0]?.id).toBe("kickoff-1");
    expect(second?.staveLinks.length).toBe(0);
  });
});
