import { describe, expect, test } from "bun:test";
import {
  resolveRepositoryMemorySourceTasks,
  type RepositoryMemorySourceTaskSource,
} from "../electron/persistence/repository-memory-source-tasks";
import type {
  PersistenceRepositoryRegistryEntry,
  PersistenceTaskRow,
} from "../electron/persistence/types";

const REPOSITORY_P = "/tmp/stave-memory/project-p";
const REPOSITORY_Q = "/tmp/stave-memory/project-q";

function repository(repositoryPath: string, workspaceIds: string[]): PersistenceRepositoryRegistryEntry {
  return {
    repositoryPath,
    repositoryName: repositoryPath.split("/").pop()!,
    lastOpenedAt: "2026-09-01T00:00:00.000Z",
    defaultBranch: "main",
    workspaces: workspaceIds.map((id) => ({ id, name: id, updatedAt: "2026-09-01T00:00:00.000Z" })),
    activeWorkspaceId: workspaceIds[0]!,
    workspaceBranchById: {},
    workspacePathById: {},
    workspaceDefaultById: {},
  };
}

function task(id: string, archivedAt: string | null = null): PersistenceTaskRow {
  return {
    id,
    title: `Task ${id}`,
    provider: "claude-code",
    updatedAt: "2026-09-01T00:00:00.000Z",
    unread: false,
    archivedAt,
  };
}

function source(tasksByWorkspace: Record<string, PersistenceTaskRow[]>) {
  const reads: string[] = [];
  const value: RepositoryMemorySourceTaskSource = {
    loadRepositoryRegistry: () => [
      repository(REPOSITORY_P, ["ws-default", "ws-feature"]),
      repository(REPOSITORY_Q, ["ws-other"]),
    ],
    listWorkspaceTasks: ({ workspaceId }) => {
      reads.push(workspaceId);
      return tasksByWorkspace[workspaceId] ?? [];
    },
  };
  return { value, reads };
}

describe("memory source tasks", () => {
  test("finds each memory's task in whichever workspace of the repository holds it", () => {
    const { value } = source({
      "ws-default": [task("t-1")],
      "ws-feature": [task("t-2"), task("t-unrelated")],
    });
    expect(
      resolveRepositoryMemorySourceTasks(value, {
        repositoryPath: REPOSITORY_P,
        memories: [{ sourceTaskId: "t-2" }, { sourceTaskId: "t-1" }, { sourceTaskId: "t-1" }, { sourceTaskId: null }],
      }),
    ).toEqual([
      { taskId: "t-1", workspaceId: "ws-default", title: "Task t-1" },
      { taskId: "t-2", workspaceId: "ws-feature", title: "Task t-2" },
    ]);
  });

  test("leaves out archived tasks, missing tasks and another repository's tasks", () => {
    const { value } = source({
      "ws-default": [task("t-archived", "2026-09-02T00:00:00.000Z")],
      "ws-other": [task("t-foreign")],
    });
    expect(
      resolveRepositoryMemorySourceTasks(value, {
        repositoryPath: REPOSITORY_P,
        memories: [{ sourceTaskId: "t-archived" }, { sourceTaskId: "t-foreign" }, { sourceTaskId: "t-gone" }],
      }),
    ).toEqual([]);
    expect(
      resolveRepositoryMemorySourceTasks(value, {
        repositoryPath: "/tmp/stave-memory/unregistered",
        memories: [{ sourceTaskId: "t-foreign" }],
      }),
    ).toEqual([]);
  });

  test("reads nothing when no memory names a task, and stops once every task is found", () => {
    const empty = source({});
    expect(
      resolveRepositoryMemorySourceTasks(empty.value, {
        repositoryPath: REPOSITORY_P,
        memories: [{ sourceTaskId: null }],
      }),
    ).toEqual([]);
    expect(empty.reads).toEqual([]);

    const early = source({ "ws-default": [task("t-1")], "ws-feature": [task("t-2")] });
    resolveRepositoryMemorySourceTasks(early.value, {
      repositoryPath: REPOSITORY_P,
      memories: [{ sourceTaskId: "t-1" }],
    });
    expect(early.reads).toEqual(["ws-default"]);
  });
});
