import { afterEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { TrackerTasksStore } from "../electron/persistence/tracker-tasks-store";
import { TrackerKickoffLinks } from "../electron/main/tracker-tasks/kickoff-links";
import type { LocalMcpTaskTurnUpdate } from "../src/lib/local-mcp/task-turn-update";

const dbs: Database[] = [];
afterEach(() => {
  for (const db of dbs.splice(0)) db.close();
});
function harness() {
  const db = new Database(":memory:");
  dbs.push(db);
  const store = new TrackerTasksStore(db);
  store.upsertKickoff({
    id: "link",
    source: "jira",
    taskRef: "TASK-1",
    taskKey: "TASK-1",
    workspaceId: "ws",
    staveTaskId: "task",
    craneJobId: null,
    state: "staged",
    errorCode: null,
    createdAt: "2026-09-05T00:00:00Z",
    updatedAt: "2026-09-05T00:00:00Z",
  });
  const links = () =>
    new TrackerKickoffLinks({
      persistence: {
        listTrackerSourceTasks: () => [],
        listTrackerTaskKickoffs: () => store.listKickoffs(),
        upsertTrackerTaskKickoff: (link) => store.upsertKickoff(link),
        findTrackerTaskKickoffByCraneJobId: () => null,
        findTrackerTaskKickoffByStaveTask: () =>
          store.listKickoffs()[0] ?? null,
      },
      emitKickoffUpdated() {},
      now: () => new Date("2026-09-05T01:00:00Z"),
    });
  let projection = links();
  return {
    store,
    restart() {
      projection = links();
    },
    state: () => store.listKickoffs()[0],
    send(
      eventType: LocalMcpTaskTurnUpdate["eventType"],
      sequence: number,
      patch: Partial<LocalMcpTaskTurnUpdate> = {},
    ) {
      projection.noteTaskTurnUpdate({
        workspaceId: "ws",
        taskId: "task",
        turnId: "turn-1",
        providerId: "codex",
        model: "test",
        eventType,
        sequence,
        done: eventType === "done",
        ...patch,
      });
    },
  };
}
test("waiting, resumed work, completion and a follow-up retain durable ordering", () => {
  const h = harness();
  h.send("started", 0);
  h.send("user_input", 1);
  expect(h.state().state).toBe("needs_input");
  h.send("text", 2);
  expect(h.state().state).toBe("running");
  h.send("approval", 1);
  expect(h.state().state).toBe("running");
  h.send("done", 3);
  expect(h.state().state).toBe("completed");
  h.send("approval", 4);
  expect(h.state().state).toBe("completed");
  h.send("started", 0, { turnId: "turn-2" });
  expect(h.state().state).toBe("running");
  h.restart();
  h.send("done", 5);
  expect(h.state().state).toBe("running");
  h.send("approval", 1, { turnId: "turn-2" });
  expect(h.state().state).toBe("needs_input");
  h.send("text", 9, { workspaceId: "wrong", turnId: "turn-2" });
  expect(h.state().state).toBe("needs_input");
});
test("failure is not overwritten by the provider's trailing done", () => {
  const h = harness();
  h.send("started", 0);
  h.send("error", 1);
  h.restart();
  h.send("approval", 2);
  h.send("done", 3);
  expect(h.state().state).toBe("failed");
  expect(h.state().errorCode).toBe("provider_failed");
});
test("recoverable errors stay live and cancellation is not success", () => {
  const h = harness();
  h.send("started", 0);
  h.send("error", 1, {
    activityEvents: [{ type: "error", message: "retrying", recoverable: true }],
  });
  expect(h.state().state).toBe("running");
  h.send("done", 2, {
    activityEvents: [{ type: "done", stop_reason: "user_abort" }],
  });
  expect(h.state().state).toBe("cancelled");
});
test("an old database gains the cursor column without losing kickoff rows", () => {
  const db = new Database(":memory:");
  dbs.push(db);
  db.exec(`CREATE TABLE tracker_task_kickoffs (id TEXT PRIMARY KEY, source TEXT, task_ref TEXT, task_key TEXT, workspace_id TEXT, stave_task_id TEXT, crane_job_id TEXT, state TEXT, error_code TEXT, created_at TEXT, updated_at TEXT);
    INSERT INTO tracker_task_kickoffs VALUES ('old','jira','TASK-1','TASK-1','ws','task',NULL,'completed',NULL,'2026-09-05T00:00:00Z','2026-09-05T00:00:00Z');`);
  expect(new TrackerTasksStore(db).listKickoffs()[0].state).toBe("completed");
  expect(new TrackerTasksStore(db).listKickoffs()[0].localTurn).toBeUndefined();
});
