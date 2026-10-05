import { describe, expect, test } from "bun:test";
import {
  AGENT_RUN_DEFAULT_DONE_WHEN,
  agentRunEndCause,
  buildAgentRunWorkflow,
  buildAgentRunStartInput,
  hasAgentOrigin,
  planAgentPromptSend,
} from "../src/lib/agent-runs/agent-run";
import { compileAgentRunStagePrompt } from "../src/lib/agent-runs/briefing";
import { createAgentRun, AGENT_RUN_LIMITS, AgentRunStartInputSchema } from "../src/lib/agent-runs/domain";
import { decideAgentRunAction, type AgentRunObservation } from "../src/lib/agent-runs/policy";
import { WorkflowSchema } from "../src/lib/workflows/schema";

const NOW = new Date("2026-10-01T09:00:00.000Z");
const AGENT = { name: "Implementer" };

describe("agent run: implicit workflow", () => {
  test("is one AI stage, Work, that only checks in when stuck", () => {
    const workflow = WorkflowSchema.parse(buildAgentRunWorkflow({ agent: AGENT, now: NOW }));
    expect(workflow.name).toBe("Implementer");
    expect(workflow.checkIns).toBe("when-stuck");
    expect(workflow.stages).toHaveLength(1);
    const [stage] = workflow.stages;
    expect(stage).toMatchObject({ id: "work", title: "Work", kind: "ai", doneWhen: AGENT_RUN_DEFAULT_DONE_WHEN });
    expect(stage?.kind === "ai" && stage.role).toBeFalsy();
    if (stage?.kind !== "ai") throw new Error("expected an AI stage");
    expect(stage.instruction).toContain("TodoWrite or update_plan");
    expect(stage.instruction).toContain("verify");
  });

  test("uses the assignment's own criteria as Done when, clipped to the limit", () => {
    const custom = buildAgentRunWorkflow({ agent: AGENT, doneWhen: "  The export downloads a CSV.  ", now: NOW });
    expect(custom.stages[0]).toMatchObject({ doneWhen: "The export downloads a CSV." });
    const long = buildAgentRunWorkflow({ agent: AGENT, doneWhen: "x".repeat(900), now: NOW });
    expect(WorkflowSchema.safeParse(long).success).toBe(true);
    const blank = buildAgentRunWorkflow({ agent: AGENT, doneWhen: "   ", now: NOW });
    expect(blank.stages[0]).toMatchObject({ doneWhen: AGENT_RUN_DEFAULT_DONE_WHEN });
  });

  test("the start input is an agent run on the user's settings with the default turn cap", () => {
    const input = AgentRunStartInputSchema.parse(
      buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent: AGENT, assignment: " Add CSV export. ", now: NOW }),
    );
    expect(input).toMatchObject({
      leadTaskId: "task-1",
      assignment: "Add CSV export.",
      origin: "agent",
      maxTurns: AGENT_RUN_LIMITS.defaultMaxTurns,
      consent: { checkIns: "when-stuck", permissionMode: "manual", authorizedEffectStageIds: [] },
    });
  });

  test("the stage prompt carries the assignment and the reporting contract, not the agent's instructions", () => {
    const change = createAgentRun({
      id: "m-1",
      input: buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent: AGENT, assignment: "Add CSV export.", now: NOW }),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: NOW,
    });
    expect(hasAgentOrigin(change.agentRun)).toBe(true);
    expect(change.events[0]?.detail).toMatchObject({ origin: "agent" });
    const prompt = compileAgentRunStagePrompt({ agentRun: change.agentRun, stages: change.upserts });
    expect(prompt).toContain("Add CSV export.");
    expect(prompt).toContain("stave_report_stage");
    expect(prompt).toContain("stave_block_stage");
    expect(prompt).not.toContain("Instructions");
  });

  test("an agent with a workflow runs its stages and check-ins", () => {
    const workflow = [
      { id: "plan", title: "Plan", kind: "ai" as const, instruction: "Plan it.", doneWhen: "A plan exists." },
      { id: "build", title: "Build", kind: "ai" as const, instruction: "Build it.", doneWhen: "It builds." },
      { id: "open-draft-pr", title: "Open draft PR", kind: "action" as const, action: { type: "open-draft-pr" as const } },
    ];
    const quiet = buildAgentRunStartInput({
      workspaceId: "ws-1",
      taskId: "task-1",
      agent: { name: "Shipper", workflow },
      assignment: "Ship it.",
      doneWhen: "Ignored with a workflow.",
      now: NOW,
    });
    expect(WorkflowSchema.parse(quiet.workflow).stages.map((stage) => stage.id)).toEqual(["plan", "build", "open-draft-pr"]);
    // Only when stuck: assigning the work authorizes the workflow's publishing stages.
    expect(quiet.consent).toEqual({ checkIns: "when-stuck", permissionMode: "manual", authorizedEffectStageIds: ["open-draft-pr"] });
    const careful = buildAgentRunStartInput({
      workspaceId: "ws-1",
      taskId: "task-1",
      agent: { name: "Shipper", workflow, checkIns: "plan-and-publishing" },
      assignment: "Ship it.",
      now: NOW,
    });
    expect(careful.consent).toMatchObject({ checkIns: "plan-and-publishing", authorizedEffectStageIds: [] });
    expect(careful.workflow.checkIns).toBe("plan-and-publishing");
  });

  test("a legacy run is not an agent run", () => {
    expect(hasAgentOrigin({})).toBe(false);
    expect(hasAgentOrigin(null)).toBe(false);
  });
});

describe("agent run: send branching", () => {
  const base = {
    taskRunsAsAgent: true,
    runActive: false,
    turnActive: false,
    queued: false,
    turnOrigin: "conversation" as const,
    providerId: "claude-code",
    prompt: "Add CSV export.",
    hasAttachments: false,
  };

  test("Chat stays a plain turn", () => {
    expect(planAgentPromptSend({ ...base, taskRunsAsAgent: false })).toEqual({ kind: "plain-turn", reason: "chat" });
  });

  test("Agent without an active run starts a run", () => {
    expect(planAgentPromptSend(base)).toEqual({ kind: "start-run" });
    expect(planAgentPromptSend({ ...base, providerId: "codex" })).toEqual({ kind: "start-run" });
  });

  test("Agent with an active run is a plain user turn that steers it", () => {
    expect(planAgentPromptSend({ ...base, runActive: true })).toEqual({ kind: "plain-turn", reason: "run-active" });
  });

  test("the composer's own queue, steer and utility paths stay in charge", () => {
    expect(planAgentPromptSend({ ...base, turnActive: true }).kind).toBe("plain-turn");
    expect(planAgentPromptSend({ ...base, queued: true }).kind).toBe("plain-turn");
    expect(planAgentPromptSend({ ...base, turnOrigin: "utility" }).kind).toBe("plain-turn");
    expect(planAgentPromptSend({ ...base, prompt: "   " }).kind).toBe("plain-turn");
  });

  test("what a run cannot carry goes as a single turn", () => {
    expect(planAgentPromptSend({ ...base, providerId: "cursor" })).toEqual({ kind: "plain-turn", reason: "provider" });
    expect(planAgentPromptSend({ ...base, hasAttachments: true })).toEqual({ kind: "plain-turn", reason: "attachments" });
    expect(planAgentPromptSend({ ...base, prompt: "x".repeat(AGENT_RUN_LIMITS.maxAssignmentChars + 1) })).toEqual({
      kind: "plain-turn",
      reason: "too-long",
    });
  });
});

describe("agent run: ending without a report", () => {
  const ended = { startedBy: "agentRun" as const };

  test("ends when the task no longer runs as an agent", () => {
    expect(agentRunEndCause({ taskRunsAsAgent: false, lastEndedTurn: null, lastTurnEnding: null, turnActive: true })).toBe(
      "released",
    );
  });

  test("ends when the user stopped the run's own turn", () => {
    expect(agentRunEndCause({ taskRunsAsAgent: true, lastEndedTurn: ended, lastTurnEnding: "stopped", turnActive: false })).toBe(
      "stopped",
    );
  });

  test("goes on after a completed turn, a restart interruption, a user turn or while a turn runs", () => {
    const go = (args: Partial<Parameters<typeof agentRunEndCause>[0]>) =>
      agentRunEndCause({ taskRunsAsAgent: true, lastEndedTurn: ended, lastTurnEnding: "stopped", turnActive: false, ...args });
    expect(go({ lastTurnEnding: "completed" })).toBeNull();
    expect(go({ lastEndedTurn: { ...ended, interrupted: true } })).toBeNull();
    expect(go({ lastEndedTurn: { startedBy: "user" } })).toBeNull();
    expect(go({ turnActive: true })).toBeNull();
    expect(go({ lastEndedTurn: null })).toBeNull();
  });
});

describe("agent run: the run policy", () => {
  test("a routed model on the lead task is not runtime drift", () => {
    const change = createAgentRun({
      id: "m-1",
      input: buildAgentRunStartInput({ workspaceId: "ws-1", taskId: "task-1", agent: AGENT, assignment: "Add CSV export.", now: NOW }),
      repositoryPath: "/tmp/repo",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: NOW,
    });
    const observation: AgentRunObservation = {
      leadTask: {
        workspaceAvailable: true,
        taskExists: true,
        taskArchived: false,
        identity: { ok: true },
        fingerprint: { providerId: "codex", model: "gpt-5.5" },
        activeTurn: null,
        pendingApprovalCount: 0,
        pendingUserInputCount: 0,
        activeDelegatedTaskCount: 0,
      },
      reportingAvailable: true,
      lastEndedTurn: null,
      userTurnIntent: null,
      actionOutcome: null,
    };
    const aggregate = { agentRun: change.agentRun, stages: change.upserts };
    expect(decideAgentRunAction({ aggregate, observation, now: NOW }).action).toBe("start-stage-turn");
    const legacyRun = { agentRun: { ...change.agentRun, origin: undefined }, stages: change.upserts };
    expect(decideAgentRunAction({ aggregate: legacyRun, observation, now: NOW })).toMatchObject({
      action: "pause",
      reason: "runtime-changed",
    });
  });
});
