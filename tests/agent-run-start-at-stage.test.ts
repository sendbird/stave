import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { createAgentRunRuntime } from "../electron/host-service/supervision/agent-run-runtime";
import { AgentRunStore } from "../electron/persistence/agent-run-store";
import {
  createAgentRun,
  listExternalEffectStages,
  AgentRunStartInputSchema,
  type AgentRunStartInput,
} from "../src/lib/agent-runs/domain";
import { applyAgentRunDecision, decideAgentRunAction } from "../src/lib/agent-runs/policy";
import { buildAgentRunReport } from "../src/lib/agent-runs/report";
import { AGENT_RUN_NOW, observe, starterWorkflow } from "./fixtures/agent-run-fixtures";

const workflow = starterWorkflow("request-to-pr");
const indexOf = (id: string) => workflow.stages.findIndex((stage) => stage.id === id);
const consent = {
  checkIns: "plan-and-publishing" as const,
  permissionMode: "guided" as const,
  authorizedEffectStageIds: listExternalEffectStages(workflow).map((stage) => stage.id),
};

function buildStartAtStageInput(args: {
  assignment: string;
  consent: typeof consent;
  startStageIndex: number;
}): AgentRunStartInput {
  return {
    workspaceId: "ws-1",
    leadTaskId: "task-1",
    workflow,
    assignment: args.assignment,
    consent: args.consent,
    ...(args.startStageIndex ? { startStageIndex: args.startStageIndex } : {}),
  };
}

function input(startStageIndex: number) {
  return buildStartAtStageInput({ assignment: "Verify the fix.", consent, startStageIndex });
}

describe("starting a run at a later stage", () => {
  test("earlier stages are recorded as skipped and the run starts where the user chose", () => {
    const change = createAgentRun({
      id: "agent-run-1",
      input: input(indexOf("verify")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: AGENT_RUN_NOW,
    });
    expect(change.agentRun.currentStageIndex).toBe(indexOf("verify"));
    // Starting signs the chosen stage off, as its sign-off card would.
    expect(change.upserts.map((record) => [record.stageId, record.status])).toEqual([
      ["understand", "skipped"],
      ["build", "skipped"],
      ["verify", "running"],
    ]);
    expect(change.upserts[0]!.detail).toBe("Not run: the run started at Verify.");
    expect(change.events[0]!.detail).toMatchObject({ startStageId: "verify" });

    // The report says why the first stages never ran.
    const report = buildAgentRunReport({
      aggregate: { agentRun: { ...change.agentRun, state: "cancelled" }, stages: change.upserts },
      workspace: { branch: null, branchPushed: false, openPullRequest: null },
      endedAt: AGENT_RUN_NOW,
    });
    expect(report.stages.slice(0, 2).map((stage) => stage.status)).toEqual(["skipped", "skipped"]);
  });

  test("a start outside the workflow is refused", () => {
    expect(AgentRunStartInputSchema.safeParse(input(workflow.stages.length)).success).toBe(false);
    // Starting at the first stage sends nothing extra.
    expect("startStageIndex" in input(0)).toBe(false);
  });

  test("the run does not ask again at the stage it starts at", () => {
    // Build follows the plan stage, so plan-and-publishing asks before it.
    const change = createAgentRun({
      id: "agent-run-1",
      input: input(indexOf("build")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: AGENT_RUN_NOW,
    });
    const aggregate = { agentRun: change.agentRun, stages: change.upserts };
    expect(decideAgentRunAction({ aggregate, observation: observe(), now: AGENT_RUN_NOW })).toEqual({
      action: "start-stage-turn",
      stageIndex: indexOf("build"),
      attempt: 1,
      reason: "stage-start",
    });

    // An action stage signed off at start runs, and gets its start time then.
    const atOpenPr = createAgentRun({
      id: "agent-run-2",
      input: input(indexOf("open-draft-pr")),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: AGENT_RUN_NOW,
    });
    const openPr = { agentRun: atOpenPr.agentRun, stages: atOpenPr.upserts };
    const decision = decideAgentRunAction({ aggregate: openPr, observation: observe(), now: AGENT_RUN_NOW });
    expect(decision).toEqual({ action: "execute-action", stageIndex: indexOf("open-draft-pr") });
    const started = applyAgentRunDecision({ aggregate: openPr, decision, now: AGENT_RUN_NOW });
    expect(started.upserts[0]).toMatchObject({ stageId: "open-draft-pr", status: "running", startedAt: AGENT_RUN_NOW.toISOString() });
  });

  test("a start stage that writes outside the workspace without consent still asks", () => {
    const withheld = { ...consent, authorizedEffectStageIds: consent.authorizedEffectStageIds.filter((id) => id !== "open-draft-pr") };
    const change = createAgentRun({
      id: "agent-run-1",
      input: buildStartAtStageInput({
        assignment: "Open the PR.",
        consent: withheld,
        startStageIndex: indexOf("open-draft-pr"),
      }),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: AGENT_RUN_NOW,
    });
    expect(change.upserts.at(-1)).toMatchObject({ stageId: "open-draft-pr", status: "pending" });
    const aggregate = { agentRun: change.agentRun, stages: change.upserts };
    expect(decideAgentRunAction({ aggregate, observation: observe(), now: AGENT_RUN_NOW })).toEqual({
      action: "request-sign-off",
    });
  });

  test("the runtime runs the chosen stage first", async () => {
    const store = new AgentRunStore(new Database(":memory:"));
    const prompts: string[] = [];
    const runtime = createAgentRunRuntime({
      store,
      getTaskSupervisionSnapshot: async () => ({
        workspaceId: "ws-1",
        taskId: "task-1",
        repositoryPath: "/tmp/repo",
        exists: true,
        archived: false,
        providerId: "claude-code",
        model: "sonnet",
        activeTurnId: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
      }),
      listRecentTurns: () => [],
      runSupervisedTurn: async (args) => {
        prompts.push(args.agentRunStage?.stageId ?? "none");
        return { turnId: `turn-${prompts.length}` };
      },
      completeInterruptedTurn: () => true,
      countActiveDelegatedTasks: () => 0,
      isReportingAvailable: async () => true,
      resolveAgentRunGrant: () => null,
      resolveWorkspacePath: async () => "/tmp/repo",
      readHeadSha: async () => "abc",
      collectStageFacts: async () => ({ diff: null, commands: [], toolCalls: [], action: null }),
      now: () => AGENT_RUN_NOW,
      setInterval: (() => 0) as unknown as typeof globalThis.setInterval,
      clearInterval: () => {},
    });
    await runtime.startAgentRun(input(indexOf("verify")));
    await runtime.requestTick();
    expect(prompts).toEqual(["verify"]);
  });
});
