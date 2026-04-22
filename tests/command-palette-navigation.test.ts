import { describe, expect, test } from "bun:test";
import { resolveLatestCompletedTurnTarget } from "@/components/layout/command-palette-navigation";

describe("command palette navigation helpers", () => {
  test("picks the most recent completed turn across workspaces", () => {
    const target = resolveLatestCompletedTurnTarget({
      turnsByWorkspaceId: {
        "ws-1": [
          {
            id: "turn-1",
            workspaceId: "ws-1",
            taskId: "task-1",
            providerId: "codex",
            createdAt: "2026-04-05T09:00:00.000Z",
            completedAt: "2026-04-05T09:01:00.000Z",
            eventCount: 4,
          },
        ],
        "ws-2": [
          {
            id: "turn-2",
            workspaceId: "ws-2",
            taskId: "task-2",
            providerId: "claude-code",
            createdAt: "2026-04-05T10:00:00.000Z",
            completedAt: null,
            eventCount: 3,
          },
          {
            id: "turn-3",
            workspaceId: "ws-2",
            taskId: "task-3",
            providerId: "codex",
            createdAt: "2026-04-05T10:10:00.000Z",
            completedAt: "2026-04-05T10:12:00.000Z",
            eventCount: 6,
          },
        ],
      },
    });

    expect(target).toEqual({
      completedAt: "2026-04-05T10:12:00.000Z",
      taskId: "task-3",
      turnId: "turn-3",
      workspaceId: "ws-2",
    });
  });

  test("returns null when no completed turn exists", () => {
    const target = resolveLatestCompletedTurnTarget({
      turnsByWorkspaceId: {
        "ws-1": [{
          id: "turn-1",
          workspaceId: "ws-1",
          taskId: "task-1",
          providerId: "codex",
          createdAt: "2026-04-05T09:00:00.000Z",
          completedAt: null,
          eventCount: 1,
        }],
      },
    });

    expect(target).toBeNull();
  });
});
