import { describe, expect, test } from "bun:test";
import { indexAssignmentsByTask } from "../src/store/agent-assignments-store";
import type { AgentAssignment } from "@/lib/agents/assign";
import { getBuiltinAgent } from "@/lib/agents/starters";

function row(overrides: Partial<AgentAssignment>): AgentAssignment {
  return {
    id: "a",
    requestId: "r",
    requestHash: "h",
    agentConfigId: "implementer",
    agentName: "Implementer",
    agentContentHash: "c",
    agent: getBuiltinAgent("implementer")!,
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
    expect(index.t1).toMatchObject({ agentConfigId: "reviewer-copy", agentName: "Reviewer copy", assignmentId: "new", state: "started" });
  });

  test("carries the task class an auto-model agent routes as, and none for a fixed model", () => {
    const auto = indexAssignmentsByTask([row({})]);
    expect(auto.t1?.agentTaskClass).toBe("implement");
    const fixed = indexAssignmentsByTask([
      row({ agent: { ...getBuiltinAgent("implementer")!, model: { mode: "fixed", providerId: "codex", model: "gpt-6-sol" } } }),
    ]);
    expect(fixed.t1?.agentTaskClass).toBeNull();
  });
});
