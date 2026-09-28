import { describe, expect, test } from "bun:test";
import { IntakeError, runIntake, type IntakePorts, type IntakeRequest } from "../electron/host-service/supervision/intake";

function harness(overrides: Partial<IntakePorts> = {}) {
  const calls: string[] = [];
  const ports: IntakePorts = {
    createWorktree: async ({ name }) => {
      calls.push(`worktree:${name}`);
      return { workspaceId: "ws-1" };
    },
    createIdleTask: async ({ workspaceId, provider }) => {
      calls.push(`task:${workspaceId}:${provider}`);
      return { taskId: "task-1" };
    },
    startMission: async (input) => {
      calls.push(`mission:${input.workspaceId}:${input.leadTaskId}`);
      return { missionId: "mission-1" };
    },
    ...overrides,
  };
  return { calls, ports };
}

const worktreeRequest: IntakeRequest = {
  workspace: { mode: "new-worktree", repositoryPath: "/tmp/repo", branch: "agent-fix-save", label: "Fix save" },
  task: { title: "Fix save", provider: "claude-code" },
};

describe("intake", () => {
  test("creates the worktree, then the task, and reports each before the next step", async () => {
    const { calls, ports } = harness();
    const result = await runIntake(worktreeRequest, ports, {
      workspaceReady: (id) => calls.push(`kept-workspace:${id}`),
      taskReady: (id) => calls.push(`kept-task:${id}`),
    });
    expect(result).toEqual({ workspaceId: "ws-1", taskId: "task-1", missionId: null });
    expect(calls).toEqual(["worktree:agent-fix-save", "kept-workspace:ws-1", "task:ws-1:claude-code", "kept-task:task-1"]);
  });

  test("starts a mission on the task it created, never on another", async () => {
    const { calls, ports } = harness();
    const result = await runIntake(
      {
        ...worktreeRequest,
        mission: {
          playbook: {} as never,
          assignment: "Fix save",
          consent: { checkIns: "plan-and-publishing", permissionMode: "auto", authorizedEffectStageIds: [] },
        },
      },
      ports,
    );
    expect(result.missionId).toBe("mission-1");
    expect(calls.at(-1)).toBe("mission:ws-1:task-1");
  });

  test("the current workspace is used as is, with no worktree created", async () => {
    const { calls, ports } = harness();
    const result = await runIntake(
      { workspace: { mode: "same-workspace", workspaceId: "ws-current" }, task: { title: "Review", provider: "codex" } },
      ports,
    );
    expect(result.workspaceId).toBe("ws-current");
    expect(calls).toEqual(["task:ws-current:codex"]);
  });

  test("a branch that already has a workspace is refused before a task exists", async () => {
    const { calls, ports } = harness({ createWorktree: async () => ({ workspaceId: "ws-old", existed: true }) });
    const error = await runIntake(worktreeRequest, ports).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IntakeError);
    expect(error).toMatchObject({ step: "workspace" });
    expect((error as Error).message).toContain("already exists");
    expect(calls).toEqual([]);
  });

  test("a failure names the step it happened in and keeps what was already reported", async () => {
    const kept: string[] = [];
    const { ports } = harness({
      createIdleTask: async () => {
        throw new Error("disk full");
      },
    });
    const error = await runIntake(worktreeRequest, ports, { workspaceReady: (id) => kept.push(id) }).catch(
      (caught: unknown) => caught,
    );
    expect(error).toMatchObject({ step: "task", message: "disk full" });
    expect(kept).toEqual(["ws-1"]);
  });

  test("a mission request without a mission port is refused before anything is created", async () => {
    const { calls, ports } = harness({ startMission: undefined });
    const error = await runIntake(
      { ...worktreeRequest, mission: { playbook: {} as never, assignment: "x", consent: {} as never } },
      ports,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ step: "mission" });
    expect(calls).toEqual([]);
  });
});
