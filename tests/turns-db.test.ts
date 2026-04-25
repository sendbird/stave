import { afterEach, describe, expect, test } from "bun:test";
import {
  listActiveWorkspaceTurns,
  listLatestWorkspaceTurns,
  listTaskTurns,
} from "@/lib/db/turns.db";

const originalWindow = globalThis.window;

function setWindowApi(api: unknown) {
  (globalThis as { window: unknown }).window = { api } as unknown;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("turn summary data access", () => {
  test("lists recent task turns", async () => {
    setWindowApi({
      persistence: {
        listTaskTurns: async () => ({
          ok: true,
          turns: [{
            id: "turn-1",
            workspaceId: "ws-1",
            taskId: "task-1",
            providerId: "codex",
            createdAt: "2026-03-09T00:00:00.000Z",
            completedAt: "2026-03-09T00:00:02.000Z",
          }],
        }),
      },
    });

    const turns = await listTaskTurns({
      workspaceId: "ws-1",
      taskId: "task-1",
    });

    expect(turns).toHaveLength(1);
    expect(turns[0]?.id).toBe("turn-1");
  });

  test("lists the latest turn for each task in a workspace", async () => {
    setWindowApi({
      persistence: {
        listLatestWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: "turn-task-2",
              workspaceId: "ws-1",
              taskId: "task-2",
              providerId: "claude-code",
              createdAt: "2026-03-10T00:00:03.000Z",
              completedAt: null,
            },
            {
              id: "turn-task-1",
              workspaceId: "ws-1",
              taskId: "task-1",
              providerId: "codex",
              createdAt: "2026-03-10T00:00:01.000Z",
              completedAt: "2026-03-10T00:00:02.000Z",
            },
          ],
        }),
      },
    });

    const turns = await listLatestWorkspaceTurns({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.taskId)).toEqual(["task-2", "task-1"]);
    expect(turns[0]?.completedAt).toBeNull();
  });

  test("lists active workspace turns from the dedicated bridge when available", async () => {
    setWindowApi({
      persistence: {
        listActiveWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: "turn-task-1-active",
              workspaceId: "ws-1",
              taskId: "task-1",
              providerId: "codex",
              createdAt: "2026-03-10T00:00:00.000Z",
              completedAt: null,
            },
          ],
        }),
        listLatestWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: "turn-task-1-completed",
              workspaceId: "ws-1",
              taskId: "task-1",
              providerId: "codex",
              createdAt: "2026-03-10T00:00:01.000Z",
              completedAt: "2026-03-10T00:00:02.000Z",
            },
          ],
        }),
      },
    });

    const turns = await listActiveWorkspaceTurns({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.id)).toEqual(["turn-task-1-active"]);
    expect(turns[0]?.completedAt).toBeNull();
  });

  test("falls back to filtering latest turns when the active-turn bridge is unavailable", async () => {
    setWindowApi({
      persistence: {
        listLatestWorkspaceTurns: async () => ({
          ok: true,
          turns: [
            {
              id: "turn-task-1-active",
              workspaceId: "ws-1",
              taskId: "task-1",
              providerId: "codex",
              createdAt: "2026-03-10T00:00:00.000Z",
              completedAt: null,
            },
            {
              id: "turn-task-2-done",
              workspaceId: "ws-1",
              taskId: "task-2",
              providerId: "claude-code",
              createdAt: "2026-03-10T00:00:01.000Z",
              completedAt: "2026-03-10T00:00:02.000Z",
            },
          ],
        }),
      },
    });

    const turns = await listActiveWorkspaceTurns({ workspaceId: "ws-1" });

    expect(turns.map((turn) => turn.id)).toEqual(["turn-task-1-active"]);
  });
});
