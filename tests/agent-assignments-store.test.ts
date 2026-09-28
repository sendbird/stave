import { describe, expect, test } from "bun:test";
import { indexAssignmentsByTask } from "../src/store/agent-assignments-store";
import type { AgentAssignment } from "@/lib/agents/assign";

function row(overrides: Partial<AgentAssignment>): AgentAssignment {
  return {
    id: "a",
    requestId: "r",
    requestHash: "h",
    agentConfigId: "implementer",
    agentName: "Implementer",
    agentContentHash: "c",
    agent: {} as never,
    assignment: "x",
    providerId: "claude-code",
    model: null,
    repositoryPath: "/tmp/repo",
    workspaceMode: "new-worktree",
    branch: null,
    workspaceId: "ws",
    taskId: "t1",
    turnId: null,
    state: "started",
    detail: null,
    received: [],
    support: [],
    createdAt: "2026-09-29T00:00:00.000Z",
    updatedAt: "2026-09-29T00:00:00.000Z",
    ...overrides,
  };
}

describe("agent assignments by task", () => {
  test("keeps the newest assignment per task and skips rows without a task", () => {
    const index = indexAssignmentsByTask([
      row({ id: "new", agentName: "Reviewer copy", agentConfigId: "reviewer-copy" }),
      row({ id: "old" }),
      row({ id: "no-task", taskId: null }),
    ]);
    expect(Object.keys(index)).toEqual(["t1"]);
    expect(index.t1).toEqual({ agentConfigId: "reviewer-copy", agentName: "Reviewer copy", assignmentId: "new", state: "started" });
  });
});
