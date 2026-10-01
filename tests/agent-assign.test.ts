import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { createAssignRuntime, type AssignRuntimeDependencies } from "../electron/host-service/supervision/assign-runtime";
import type { AgentAssignment } from "@/lib/agents/assign";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { taskAgentRuntimeOptions } from "@/lib/agents/runtime-options";

function harness(overrides: Partial<AssignRuntimeDependencies> = {}) {
  const store = new AgentAssignmentStore(new Database(":memory:"));
  let ids = 0;
  const deps: AssignRuntimeDependencies = {
    store,
    now: () => new Date("2026-09-29T00:00:00.000Z"),
    newId: () => `assignment-${++ids}`,
    ...overrides,
  };
  return { store, runtime: createAssignRuntime(deps), deps };
}

describe("assignments", () => {
  test("a row an earlier build left preparing is marked interrupted, never replayed", () => {
    const { runtime, store } = harness();
    const preparing = {
      id: "legacy-1",
      requestId: "assign:legacy",
      requestHash: "h",
      agentConfigId: "implementer",
      agentName: "Implementer",
      agentContentHash: "c",
      agent: getBuiltinAgent("implementer")!,
      assignment: "Fix the save error",
      providerId: "claude-code",
      model: null,
      repositoryPath: "/tmp/repo",
      workspaceMode: "new-worktree",
      branch: null,
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: null,
      state: "preparing",
      detail: null,
      received: [],
      support: [],
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T00:00:00.000Z",
    } satisfies AgentAssignment;
    store.create(preparing);
    runtime.recover();
    expect(store.getByRequestId("assign:legacy")).toMatchObject({ state: "interrupted", taskId: "task-1" });
  });

  test("later turns of a recorded task run as the agent version it started with, on whatever provider they use", () => {
    const { runtime } = harness();
    runtime.recordTaskAgent({
      requestId: "kickoff:later",
      taskId: "task-later",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      agent: getBuiltinAgent("implementer")!,
      providerId: "claude-code",
      model: null,
      assignment: "Fix the save error",
    });
    const agent = runtime.agentForTask("task-later");
    expect(agent?.instructions).toBe(getBuiltinAgent("implementer")!.instructions);
    expect(runtime.agentForTask("some-other-task")).toBeNull();
    const onCodex = taskAgentRuntimeOptions({ agent: agent!, providerId: "codex" });
    expect(onCodex.agentInstructions).toContain("# Agent: Implementer");
    // A turn that already carries instructions gets nothing added twice.
    expect(taskAgentRuntimeOptions({ agent: agent!, providerId: "codex", base: { agentInstructions: "x" } })).toEqual({});
    // Archiving the agent later does not strip it from a task already running as it.
    expect(taskAgentRuntimeOptions({ agent: { ...agent!, archived: true }, providerId: "claude-code" }).agentInstructions).toBeDefined();
  });
});

describe("record-task", () => {
  test("the schema accepts a well-formed request and rejects extras", async () => {
    const { RecordTaskAgentInputSchema } = await import("@/lib/agents/assign");
    const valid = {
      requestId: "kickoff:abc-123",
      taskId: "task-1",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      agent: getBuiltinAgent("implementer")!,
      assignment: "Do the work.",
      providerId: "claude-code" as const,
      model: "claude-sonnet-5",
    };
    expect(RecordTaskAgentInputSchema.safeParse(valid).success).toBe(true);
    expect(RecordTaskAgentInputSchema.safeParse({ ...valid, sneaky: 1 }).success).toBe(false);
    expect(RecordTaskAgentInputSchema.safeParse({ ...valid, requestId: "" }).success).toBe(false);
    expect(RecordTaskAgentInputSchema.safeParse({ ...valid, providerId: "nope" }).success).toBe(false);
  });

  test("records the agent for a task Kickoff created, idempotent by request id", () => {
    const { runtime } = harness();
    const args = {
      requestId: "kickoff:1",
      taskId: "task-42",
      workspaceId: "ws-9",
      repositoryPath: "/tmp/repo",
      agent: getBuiltinAgent("implementer")!,
      providerId: "claude-code" as const,
      model: "claude-sonnet-5",
      assignment: "Do the work.",
      standards: "Follow the house style.",
    };
    const row = runtime.recordTaskAgent(args);
    expect(row).toMatchObject({
      state: "started",
      taskId: "task-42",
      workspaceId: "ws-9",
      agentConfigId: "implementer",
      standards: "Follow the house style.",
    });
    // No worktree, task, or first turn is created: the task already exists.
    // The later-turn resolver runs it as the agent it was recorded with.
    const later = runtime.taskAgent("task-42");
    expect(later?.agent.instructions).toBe(getBuiltinAgent("implementer")!.instructions);
    expect(later?.standards).toBe("Follow the house style.");
    // A repeat with the same request id returns the same row.
    const again = runtime.recordTaskAgent({ ...args, assignment: "different" });
    expect(again.id).toBe(row.id);
    expect(again.assignment).toBe("Do the work.");
  });

  test("a later record switches the task's agent; releasing it returns the task to its own settings", () => {
    const { runtime } = harness();
    const base = {
      taskId: "task-7",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      providerId: "claude-code" as const,
      model: null,
      assignment: "Fix the flaky test.",
    };
    runtime.recordTaskAgent({ ...base, requestId: "composer:1", agent: getBuiltinAgent("implementer")! });
    // Same timestamp on purpose: the newest row still wins.
    runtime.recordTaskAgent({ ...base, requestId: "composer:2", agent: getBuiltinAgent("researcher")! });
    expect(runtime.taskAgent("task-7")?.agent.id).toBe("researcher");
    expect(runtime.agentForTask("task-7")?.permission).toBe("read-only");

    const ended = runtime.releaseTaskAgent("task-7");
    expect(ended?.endedAt).toBeTruthy();
    expect(runtime.taskAgent("task-7")).toBeNull();
    expect(runtime.agentForTask("task-7")).toBeNull();
    // History keeps both rows.
    expect(runtime.list().filter((row) => row.taskId === "task-7")).toHaveLength(2);
    // Releasing again is a no-op.
    expect(runtime.releaseTaskAgent("task-7")).toBeNull();
  });

  test("a prompt-channel provider receives a recorded agent's instructions once", () => {
    const { runtime } = harness();
    runtime.recordTaskAgent({
      requestId: "kickoff:kiro",
      taskId: "task-kiro",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      agent: getBuiltinAgent("implementer")!,
      providerId: "kiro",
      model: null,
      assignment: "Do the work.",
    });
    const preamble = runtime.prepareTaskPreamble("task-kiro", "kiro");
    expect(preamble?.prefix).toContain(getBuiltinAgent("implementer")!.instructions.split("\n")[0]!);
    // A blocked/cancelled/failed start has not acknowledged execution.
    expect(runtime.prepareTaskPreamble("task-kiro", "kiro")?.prefix).toBe(preamble?.prefix);
    preamble?.acknowledge();
    expect(runtime.prepareTaskPreamble("task-kiro", "kiro")).toBeNull();
  });

  test("an instruction-channel provider acknowledges execution without a preamble", () => {
    const { runtime } = harness();
    runtime.recordTaskAgent({
      requestId: "kickoff:claude",
      taskId: "task-claude",
      workspaceId: "ws-1",
      repositoryPath: "/tmp/repo",
      agent: getBuiltinAgent("implementer")!,
      providerId: "claude-code",
      model: null,
      assignment: "Do the work.",
    });
    const prepared = runtime.prepareTaskPreamble("task-claude", "claude-code");
    expect(prepared?.prefix).toBeNull();
    prepared?.acknowledge();
    // Switching this task to Kiro later no longer owes a preamble for the old row.
    expect(runtime.prepareTaskPreamble("task-claude", "kiro")).toBeNull();
  });
  test("a delayed earlier turn cannot consume the new agent's instructions", () => {
    const { runtime } = harness();
    const task = {
      taskId: "task-reassigned", workspaceId: "ws-1", repositoryPath: "/tmp/repo",
      providerId: "kiro" as const, model: null, assignment: "Do the work.",
    };
    runtime.recordTaskAgent({ ...task, requestId: "old", agent: getBuiltinAgent("implementer")! });
    const old = runtime.prepareTaskPreamble(task.taskId, "kiro");
    runtime.recordTaskAgent({ ...task, requestId: "new", agent: getBuiltinAgent("researcher")! });
    old?.acknowledge();
    expect(runtime.prepareTaskPreamble(task.taskId, "kiro")?.prefix).toContain("Researcher");
  });

});
