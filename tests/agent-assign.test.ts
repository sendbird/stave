import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { AgentAssignmentStore } from "../electron/persistence/agent-assignment-store";
import { createAssignRuntime, AssignError, type AssignRuntimeDependencies } from "../electron/host-service/supervision/assign-runtime";
import { assignmentBranchName, type AssignAgentInput } from "@/lib/agents/assign";
import { duplicateAgent } from "@/lib/agents/library";
import { getBuiltinAgent } from "@/lib/agents/starters";
import { taskAgentRuntimeOptions } from "@/lib/agents/runtime-options";

function harness(overrides: Partial<AssignRuntimeDependencies> = {}) {
  const store = new AgentAssignmentStore(new Database(":memory:"));
  const calls: string[] = [];
  const turns: Array<Parameters<AssignRuntimeDependencies["runFirstTurn"]>[0]> = [];
  let ids = 0;
  const deps: AssignRuntimeDependencies = {
    store,
    createWorktree: async ({ name }) => {
      calls.push(`worktree:${name}`);
      return { workspaceId: "ws-new" };
    },
    createIdleTask: async ({ workspaceId, provider, model }) => {
      calls.push(`task:${workspaceId}:${provider}:${model ?? "default"}`);
      return { taskId: `task-${workspaceId}` };
    },
    runFirstTurn: async (turn) => {
      turns.push(turn);
      calls.push(`turn:${turn.taskId}`);
      return { turnId: "turn-1" };
    },
    now: () => new Date("2026-09-29T00:00:00.000Z"),
    newId: () => `assignment-${++ids}`,
    ...overrides,
  };
  return { store, calls, turns, runtime: createAssignRuntime(deps), deps };
}

function input(overrides: Partial<AssignAgentInput> = {}): AssignAgentInput {
  return {
    requestId: "req-1",
    agent: getBuiltinAgent("implementer")!,
    assignment: "Fix the settings save error\nIt fails on the second save.",
    providerId: "claude-code",
    model: "claude-sonnet-5",
    repositoryPath: "/tmp/repo",
    ...overrides,
  };
}

describe("assign", () => {
  test("creates a worktree and a task, then starts the first turn with the agent's instructions", async () => {
    const { runtime, calls, turns } = harness();
    const row = await runtime.assign(input());
    expect(row).toMatchObject({
      state: "started",
      workspaceId: "ws-new",
      taskId: "task-ws-new",
      turnId: "turn-1",
      agentConfigId: "implementer",
      workspaceMode: "new-worktree",
      branch: assignmentBranchName({ agentConfigId: "implementer", assignment: input().assignment, assignmentId: "assignment-1" }),
    });
    expect(row.branch).toMatch(/^agent\/implementer-fix-the-settings-save-error-assignme/);
    expect(calls).toEqual([`worktree:${row.branch}`, "task:ws-new:claude-code:claude-sonnet-5", "turn:task-ws-new"]);
    expect(turns[0]!.runtimeOptions?.agentInstructions).toContain("# Agent: Implementer");
    expect(turns[0]!.prompt).toBe(input().assignment);
    expect(turns[0]!.fingerprint).toEqual({ providerId: "claude-code", model: "claude-sonnet-5" });
  });

  test("the same request id returns the same assignment and starts nothing again", async () => {
    const { runtime, calls } = harness();
    const first = await runtime.assign(input());
    const again = await runtime.assign(input());
    expect(again.id).toBe(first.id);
    expect(calls.filter((call) => call.startsWith("worktree:"))).toHaveLength(1);
  });

  test("a reused request id with different work is refused", async () => {
    const { runtime } = harness();
    await runtime.assign(input());
    const error = await runtime.assign(input({ assignment: "Something else" })).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AssignError);
    expect(error).toMatchObject({ code: "conflict" });
  });

  test("a current-workspace agent works where the user is and needs a workspace", async () => {
    const { runtime, calls } = harness();
    const researcher = getBuiltinAgent("researcher")!;
    await expect(runtime.assign(input({ agent: researcher }))).rejects.toMatchObject({ code: "refused" });
    const row = await runtime.assign(input({ requestId: "req-2", agent: researcher, currentWorkspaceId: "ws-here" }));
    expect(row).toMatchObject({ state: "started", workspaceId: "ws-here", branch: null });
    expect(calls.some((call) => call.startsWith("worktree:"))).toBe(false);
  });

  test("an agent not usable as a main agent is refused before anything is recorded", async () => {
    const { runtime, store } = harness();
    await expect(runtime.assign(input({ agent: getBuiltinAgent("reviewer")! }))).rejects.toMatchObject({ code: "refused" });
    expect(store.getByRequestId("req-1")).toBeNull();
  });

  test("Kiro gets the agent at the top of the first message instead of runtime options", async () => {
    const { runtime, turns } = harness();
    const agent = duplicateAgent(getBuiltinAgent("researcher")!, []);
    await runtime.assign(input({ agent, providerId: "kiro", model: null, currentWorkspaceId: "ws-here" }));
    expect(turns[0]!.runtimeOptions).toEqual({});
    expect(turns[0]!.prompt.startsWith("# Agent: Researcher (copy)")).toBe(true);
    expect(turns[0]!.fingerprint).toBeUndefined();
  });

  test("a failed step is recorded with what was already made", async () => {
    const { runtime } = harness({
      runFirstTurn: async () => {
        throw new Error("provider not signed in");
      },
    });
    const row = await runtime.assign(input());
    expect(row).toMatchObject({ state: "failed", taskId: "task-ws-new", detail: "provider not signed in" });
  });

  test("a start cut off by a restart is marked interrupted, never replayed", async () => {
    let release = () => {};
    const { runtime, store, deps, calls } = harness({
      runFirstTurn: () =>
        new Promise((resolve) => {
          release = () => resolve({ turnId: "late" });
        }),
    });
    void runtime.assign(input());
    for (let wait = 0; wait < 50 && !store.getByRequestId("req-1")?.taskId; wait += 1) await Bun.sleep(1);
    const relaunched = createAssignRuntime({ ...deps, runFirstTurn: async () => ({ turnId: "never" }) });
    relaunched.recover();
    expect(store.getByRequestId("req-1")).toMatchObject({ state: "interrupted", taskId: "task-ws-new" });
    const again = await relaunched.assign(input());
    expect(again.state).toBe("interrupted");
    expect(calls.filter((call) => call.startsWith("task:"))).toHaveLength(1);
    release();
  });

  test("later turns of the task run as the agent version it started with, on whatever provider they use", async () => {
    const { runtime } = harness();
    const row = await runtime.assign(input());
    const agent = runtime.agentForTask(row.taskId!);
    expect(agent?.instructions).toBe(getBuiltinAgent("implementer")!.instructions);
    expect(runtime.agentForTask("some-other-task")).toBeNull();
    const onCodex = taskAgentRuntimeOptions({ agent: agent!, providerId: "codex" });
    expect(onCodex.agentInstructions).toContain("# Agent: Implementer");
    // The first turn already carries instructions; nothing is added twice.
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
    const preamble = runtime.takeTaskPreamble("task-kiro", "kiro");
    expect(preamble).toContain(getBuiltinAgent("implementer")!.instructions.split("\n")[0]!);
    expect(runtime.takeTaskPreamble("task-kiro", "kiro")).toBeNull();
  });

  test("an instruction-channel provider consumes the flag without a preamble", () => {
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
    expect(runtime.takeTaskPreamble("task-claude", "claude-code")).toBeNull();
    // Switching this task to Kiro later no longer owes a preamble for the old row.
    expect(runtime.takeTaskPreamble("task-claude", "kiro")).toBeNull();
  });
});
