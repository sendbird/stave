import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { TrackerTasksStore } from "../electron/persistence/tracker-tasks-store";
import type {
  TrackerSourceId,
  TrackerTask,
  TrackerTaskStaveLink,
} from "../src/lib/tracker-tasks/types";

function task(patch: Partial<TrackerTask> = {}): TrackerTask {
  return {
    source: "crane",
    ref: "task-1",
    key: "CRANE-1",
    title: "Fix the dispatch",
    url: "https://tracker.example.com/task/CRANE-1",
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
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    closedAt: null,
    ...patch,
  };
}

function kickoff(
  patch: Partial<TrackerTaskStaveLink> = {},
): TrackerTaskStaveLink {
  return {
    id: "kickoff-1",
    source: "crane",
    taskRef: "task-1",
    taskKey: "CRANE-1",
    workspaceId: "workspace-1",
    staveTaskId: null,
    craneJobId: null,
    state: "running",
    errorCode: null,
    createdAt: "2026-07-26T00:01:00.000Z",
    updatedAt: "2026-07-26T00:01:00.000Z",
    ...patch,
  };
}

function tableNames(database: Database): string[] {
  return (
    database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((row) => row.name);
}

describe("TrackerTasksStore", () => {
  let root = "";
  let database: Database;
  let store: TrackerTasksStore;

  beforeEach(() => {
    root = path.join(
      tmpdir(),
      `stave-tracker-tasks-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    database = new Database(path.join(root, "tracker-tasks.sqlite"));
    store = new TrackerTasksStore(database);
  });

  afterEach(() => {
    database.close();
    rmSync(root, { recursive: true, force: true });
  });

  test("creates both tables and their lookup indexes on open", () => {
    expect(tableNames(database)).toContain("tracker_tasks_cache");
    expect(tableNames(database)).toContain("tracker_task_kickoffs");

    const indexes = (
      database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(indexes).toEqual(
      expect.arrayContaining([
        "idx_tracker_tasks_cache_recent",
        "idx_tracker_task_kickoffs_task",
        "idx_tracker_task_kickoffs_crane_job",
        "idx_tracker_task_kickoffs_stave_task",
      ]),
    );
  });

  test("never persists a credential or lease column", () => {
    const columns = (
      database.prepare("PRAGMA table_info(tracker_tasks_cache)").all() as {
        name: string;
      }[]
    ).map((row) => row.name);
    expect(columns).toEqual([
      "source",
      "task_ref",
      "task_key",
      "task_json",
      "task_updated_at",
      "fetched_at",
    ]);
  });

  test("replaces one source without touching another", () => {
    store.replaceSourceTasks("crane", [task()], "2026-07-26T00:05:00.000Z");
    store.replaceSourceTasks(
      "jira",
      [task({ source: "jira", ref: "jira-1", key: "JIRA-1" })],
      "2026-07-26T00:05:00.000Z",
    );

    store.replaceSourceTasks(
      "crane",
      [task({ ref: "task-2", key: "CRANE-2" })],
      "2026-07-26T00:06:00.000Z",
    );

    expect(store.listSourceTasks("crane").map((row) => row.ref)).toEqual([
      "task-2",
    ]);
    expect(store.listSourceTasks("jira").map((row) => row.ref)).toEqual([
      "jira-1",
    ]);
  });

  test("rolls back a replace that fails part-way through", () => {
    store.replaceSourceTasks("crane", [task()], "2026-07-26T00:05:00.000Z");

    expect(() =>
      store.replaceSourceTasks(
        "crane",
        [
          task({ ref: "task-2", key: "CRANE-2" }),
          task({ ref: "task-3", source: "jira" }),
        ],
        "2026-07-26T00:06:00.000Z",
      ),
    ).toThrow();

    expect(store.listSourceTasks("crane").map((row) => row.ref)).toEqual([
      "task-1",
    ]);
  });

  test("lists cached tasks newest updated first", () => {
    store.replaceSourceTasks(
      "crane",
      [
        task({
          ref: "old",
          key: "CRANE-1",
          updatedAt: "2026-07-01T00:00:00.000Z",
        }),
        task({
          ref: "new",
          key: "CRANE-3",
          updatedAt: "2026-07-30T00:00:00.000Z",
        }),
        task({
          ref: "mid",
          key: "CRANE-2",
          updatedAt: "2026-07-15T00:00:00.000Z",
        }),
      ],
      "2026-07-31T00:00:00.000Z",
    );

    expect(store.listSourceTasks("crane").map((row) => row.ref)).toEqual([
      "new",
      "mid",
      "old",
    ]);
    expect(store.listSourceTasks().map((row) => row.ref)).toEqual([
      "new",
      "mid",
      "old",
    ]);
  });

  test("skips an unreadable cached row instead of throwing", () => {
    const seen: string[] = [];
    const tolerantStore = new TrackerTasksStore(database, {
      onUnreadableTaskRow: ({ taskRef }) => seen.push(taskRef),
    });
    tolerantStore.replaceSourceTasks(
      "crane",
      [
        task({ ref: "good", key: "CRANE-1" }),
        task({ ref: "broken", key: "CRANE-2" }),
      ],
      "2026-07-26T00:05:00.000Z",
    );
    database
      .prepare(
        "UPDATE tracker_tasks_cache SET task_json = ? WHERE task_ref = 'broken'",
      )
      .run('{"source":"crane","ref":"broken"}');

    expect(
      tolerantStore.listSourceTasks("crane").map((row) => row.ref),
    ).toEqual(["good"]);
    expect(tolerantStore.getTask("crane", "broken")).toBeNull();
    expect(tolerantStore.getTask("crane", "good")?.key).toBe("CRANE-1");
    expect(seen).toEqual(["broken", "broken"]);
    expect(tolerantStore.getUnreadableTaskRowCount()).toBe(2);
  });

  test("upserts a kickoff and finds it by every handle", () => {
    store.upsertKickoff(kickoff());
    const attached = kickoff({
      staveTaskId: "stave-task-1",
      craneJobId: "job-1",
      state: "completed",
      updatedAt: "2026-07-26T00:09:00.000Z",
    });
    store.upsertKickoff(attached);

    expect(store.listKickoffs()).toEqual([attached]);
    expect(store.findKickoffByCraneJobId("job-1")).toEqual(attached);
    expect(store.findKickoffByStaveTask("stave-task-1")).toEqual(attached);
    expect(store.findLatestKickoffForTask("crane", "task-1")).toEqual(attached);
    expect(store.findKickoffByCraneJobId("job-missing")).toBeNull();
    expect(store.findKickoffByStaveTask("stave-task-missing")).toBeNull();
    expect(store.findLatestKickoffForTask("jira", "task-1")).toBeNull();
  });

  test("returns the newest kickoff for a retried ticket", () => {
    store.upsertKickoff(
      kickoff({
        id: "kickoff-old",
        state: "failed",
        createdAt: "2026-07-26T00:01:00.000Z",
        updatedAt: "2026-07-26T00:02:00.000Z",
      }),
    );
    store.upsertKickoff(
      kickoff({
        id: "kickoff-new",
        createdAt: "2026-07-26T00:03:00.000Z",
        updatedAt: "2026-07-26T00:03:00.000Z",
      }),
    );

    expect(store.findLatestKickoffForTask("crane", "task-1")?.id).toBe(
      "kickoff-new",
    );
    expect(
      store.listKickoffs({ source: "crane" }).map((row) => row.id),
    ).toEqual(["kickoff-new", "kickoff-old"]);
    expect(store.listKickoffs({ source: "jira" })).toEqual([]);
  });

  test(
    "chunks a taskRefs lookup well past the SQLite variable limit",
    () => {
      const refs: string[] = [];
      for (let index = 0; index < 1_500; index += 1) {
        const ref = `task-${String(index).padStart(4, "0")}`;
        refs.push(ref);
        store.upsertKickoff(
          kickoff({
            id: `kickoff-${ref}`,
            taskRef: ref,
            taskKey: `CRANE-${index}`,
            createdAt: `2026-07-26T00:00:${String(index % 60).padStart(2, "0")}.000Z`,
          }),
        );
      }

      const found = store.listKickoffs({ taskRefs: refs });
      expect(found).toHaveLength(1_500);
      const createdAts = found.map((row) => row.createdAt);
      expect(
        [...createdAts].sort((left, right) => right.localeCompare(left)),
      ).toEqual(createdAts);

      expect(
        store
          .listKickoffs({ source: "crane", taskRefs: [...refs, ...refs] })
          .map((row) => row.id),
      ).toHaveLength(1_500);
      expect(store.listKickoffs({ taskRefs: [] })).toEqual([]);
    },
    15_000,
  );

  test("prunes only terminal kickoffs older than the cutoff", () => {
    const stale = "2026-06-01T00:00:00.000Z";
    const states: TrackerTaskStaveLink["state"][] = [
      "staged",
      "running",
      "needs_input",
      "completed",
      "failed",
      "cancelled",
    ];
    for (const state of states) {
      store.upsertKickoff(
        kickoff({
          id: `kickoff-${state}`,
          taskRef: `task-${state}`,
          state,
          createdAt: stale,
          updatedAt: stale,
        }),
      );
    }
    store.upsertKickoff(
      kickoff({
        id: "kickoff-recent-completed",
        taskRef: "task-recent",
        state: "completed",
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      }),
    );

    expect(store.pruneKickoffsBefore("2026-07-01T00:00:00.000Z")).toBe(3);
    expect(
      store
        .listKickoffs()
        .map((row) => row.state)
        .sort(),
    ).toEqual(["completed", "needs_input", "running", "staged"]);
    expect(store.findKickoffByCraneJobId("job-1")).toBeNull();
  });

  test("keeps a source's rows readable after the database is reopened", () => {
    store.replaceSourceTasks("crane", [task()], "2026-07-26T00:05:00.000Z");
    store.upsertKickoff(kickoff());
    database.close();

    const reopened = new Database(path.join(root, "tracker-tasks.sqlite"));
    const reopenedStore = new TrackerTasksStore(reopened);
    expect(reopenedStore.listSourceTasks("crane")).toEqual([task()]);
    expect(reopenedStore.listKickoffs()).toEqual([kickoff()]);
    reopened.close();
    database = new Database(path.join(root, "tracker-tasks.sqlite"));
  });
});

describe("TrackerTasksStore source coverage", () => {
  test("accepts every declared tracker source id", () => {
    const database = new Database(":memory:");
    const store = new TrackerTasksStore(database);
    const sources: TrackerSourceId[] = ["crane", "jira"];
    for (const source of sources) {
      store.replaceSourceTasks(
        source,
        [task({ source, ref: `${source}-1`, key: `${source}-1` })],
        "2026-07-26T00:05:00.000Z",
      );
    }
    expect(
      store
        .listSourceTasks()
        .map((row) => row.source)
        .sort(),
    ).toEqual(["crane", "jira"]);
    database.close();
  });
});
