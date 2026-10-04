import { describe, expect, test } from "bun:test";
import { buildAgentRunFixtures, AGENT_RUN_ASSIGNMENT } from "../src/dev/agent-run-preview/agent-run-fixtures";
import {
  agentRunFleetState,
  agentRunStoredPlan,
  describeAgentRunProgress,
  describeAgentRunResult,
  describeAgentRunStatus,
  describeDoneWhen,
  extractRunAssignment,
  formatRunDuration,
  resolveAgentRunFirstPrompt,
  resolveAgentRunPrompt,
} from "../src/lib/agent-runs/agent-run-status";
import { compileAgentRunStagePrompt, buildStageNudgePrompt } from "../src/lib/agent-runs/briefing";
import { describeAgentRunNotification } from "../src/lib/agent-runs/notifications";
import { selectAgentRunForTurn } from "../src/store/agent-runs-store";

const START = new Date("2026-10-01T09:00:00.000Z");
const runs = buildAgentRunFixtures(START);
const NOW = START.getTime() + 4 * 60_000;

describe("agent run state", () => {
  test("names the agent and one of five states", () => {
    expect(describeAgentRunStatus(runs.working)).toMatchObject({ agentName: "Implementer", state: "working", label: "Working", recovery: null });
    expect(describeAgentRunStatus(runs.ready)).toMatchObject({ state: "ready", label: "Ready", tone: "success" });
    expect(describeAgentRunStatus(runs.stopped)).toMatchObject({ state: "stopped", label: "Stopped" });
  });

  test("a blocked stage needs you, with what it waits on; a stuck one can be retried", () => {
    expect(describeAgentRunStatus(runs.needsYou)).toMatchObject({
      state: "needs-you",
      label: "Needs you",
      reason: "Which breakpoint should the table switch at: 640px or 768px?",
      recovery: null,
    });
    expect(describeAgentRunStatus(runs.stuck)).toMatchObject({ state: "needs-you", recovery: "retry-stage" });
  });

  test("a run that hit its limit failed, and a retry starts a new run", () => {
    expect(describeAgentRunStatus(runs.failed)).toMatchObject({
      state: "failed",
      label: "Failed",
      reason: "The run used all 30 turns before it finished.",
      recovery: "new-run",
    });
  });

  test("durations read in seconds, then minutes", () => {
    expect(formatRunDuration(12_000)).toBe("12s");
    expect(formatRunDuration(23 * 60_000)).toBe("23m");
  });
});

describe("agent run result", () => {
  test("Done when says what backs each line", () => {
    expect(describeDoneWhen(runs.ready).map((line) => [line.text, line.label])).toEqual([
      ["The table scrolls below 640px", "Met · agent reported"],
      ["bun run typecheck passes", "Met · agent reported"],
      ["The invoice table has the same fix", "Not verified"],
    ]);
  });

  test("no criterion claims Stave verified it; Stave's own checks are listed apart", () => {
    expect(describeDoneWhen(runs.ready).some((line) => line.label.includes("Stave"))).toBe(false);
    expect(describeAgentRunResult(runs.ready, NOW).staveChecks.length).toBeGreaterThan(0);
  });

  test("a run that reported no criteria shows the assignment's own line", () => {
    expect(describeDoneWhen(runs.working)).toEqual([
      { text: "The table scrolls below 640px and the checks pass.", status: "unverified", label: "Not verified" },
    ]);
  });

  test("collects the changes, the pull request, the summary and the duration", () => {
    const result = describeAgentRunResult(runs.ready, NOW);
    expect(result.duration).toBe("23m");
    expect(result.changes).toEqual({ files: 7, insertions: 184, deletions: 32 });
    expect(result.pullRequest).toEqual({ url: "https://github.com/acme/app/pull/612", number: 612 });
    expect(result.summary).toContain("scroll container");
    expect(result.spent).not.toBeNull();
  });

  test("a run with no diff or pull request reports neither", () => {
    const result = describeAgentRunResult(runs.failed, NOW);
    expect(result.changes).toBeNull();
    expect(result.pullRequest).toBeNull();
  });
});

describe("agent run prompt", () => {
  test("finds the user's own words in the compiled stage prompt, not in the reminder", () => {
    const aggregate = { agentRun: runs.working.agentRun, stages: runs.working.stages };
    const prompt = compileAgentRunStagePrompt(aggregate);
    expect(extractRunAssignment(prompt, AGENT_RUN_ASSIGNMENT)).toBe(AGENT_RUN_ASSIGNMENT);
    expect(extractRunAssignment(buildStageNudgePrompt(aggregate), AGENT_RUN_ASSIGNMENT)).toBeNull();
  });

  test("a row the host marked splits from its first frame, without the run loaded", () => {
    const prompt = compileAgentRunStagePrompt({ agentRun: runs.working.agentRun, stages: runs.working.stages });
    const provenance = { agentRunId: runs.working.agentRun.id, assignment: AGENT_RUN_ASSIGNMENT };
    expect(resolveAgentRunPrompt({ text: prompt, provenance })).toEqual({ assignment: AGENT_RUN_ASSIGNMENT, instructions: prompt });
    // The reminder to report carries no assignment: only the folded instructions.
    expect(resolveAgentRunPrompt({ text: "Report the stage.", provenance: { agentRunId: "run-1", assignment: null } })).toEqual({
      assignment: null,
      instructions: "Report the stage.",
    });
  });

  test("an older row without the mark is found through its run; a plain message is not a run prompt", () => {
    const prompt = compileAgentRunStagePrompt({ agentRun: runs.working.agentRun, stages: runs.working.stages });
    expect(resolveAgentRunPrompt({ text: prompt, runAssignment: AGENT_RUN_ASSIGNMENT })).toEqual({
      assignment: AGENT_RUN_ASSIGNMENT,
      instructions: prompt,
    });
    expect(resolveAgentRunPrompt({ text: "Hello" })).toBeNull();
    expect(resolveAgentRunPrompt({ text: "Hello", runAssignment: null })).toBeNull();
  });

  test("a send still waiting on its run draws the assignment, its instructions to come", () => {
    expect(resolveAgentRunPrompt({ text: " Add CSV export. ", pending: true })).toEqual({ assignment: "Add CSV export.", instructions: null });
  });
});

describe("agent run first prompt", () => {
  const agentRunId = runs.working.agentRun.id;
  const withLinkedTurn = (detail: typeof runs.working, state = detail.agentRun.state) => ({
    ...detail,
    agentRun: { ...detail.agentRun, state },
    events: [
      ...detail.events,
      { ...detail.events[0]!, kind: "turn-linked" as const, detail: { stageId: "work", attempt: 1, turnId: "turn-7" } },
    ],
  });
  const unlinked = (detail: typeof runs.working, state = detail.agentRun.state) => ({
    ...detail,
    agentRun: { ...detail.agentRun, state },
    events: detail.events.filter((event) => event.kind !== "turn-linked"),
  });

  test("lands when the transcript holds the row the run marked, or a row of its linked turn", () => {
    const marked = [{ role: "user" as const, agentRunPrompt: { agentRunId, assignment: AGENT_RUN_ASSIGNMENT } }];
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: marked, detail: undefined })).toBe("landed");
    expect(
      resolveAgentRunFirstPrompt({ agentRunId, messages: [{ role: "assistant", turnId: "turn-7" }], detail: withLinkedTurn(runs.working) }),
    ).toBe("landed");
  });

  test("stays pending while the run starts, is stuck before its first turn, or its linked row is loading", () => {
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: undefined })).toBe("pending");
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: unlinked(runs.working) })).toBe("pending");
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: unlinked(runs.stuck) })).toBe("pending");
    // The run linked its turn, so its row exists; it ended before the row loaded here.
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: withLinkedTurn(runs.working, "cancelled") })).toBe("pending");
  });

  test("ends when the run ended without writing one", () => {
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: unlinked(runs.working, "cancelled") })).toBe("ended");
    expect(resolveAgentRunFirstPrompt({ agentRunId, messages: [], detail: unlinked(runs.failed) })).toBe("ended");
  });
});

describe("agent run on a Fleet card", () => {
  test("a working run whose lead task waits on the user needs you; other states stand", () => {
    expect(agentRunFleetState("working", true)).toBe("needs-you");
    expect(agentRunFleetState("working", false)).toBe("working");
    expect(agentRunFleetState("needs-you", false)).toBe("needs-you");
  });
});

describe("agent run notifications", () => {
  const context = { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null };
  test("name the agent and state, never a run", () => {
    expect(describeAgentRunNotification(runs.ready, context)?.title).toBe("Ready — Implementer");
    expect(describeAgentRunNotification(runs.failed, context)?.title).toBe("Failed — Implementer");
    expect(describeAgentRunNotification(runs.needsYou, context)?.title).toBe("Needs you — Implementer");
    expect(describeAgentRunNotification(runs.stuck, context)?.title).toBe("Needs you — Implementer");
    expect(describeAgentRunNotification(runs.working, context)).toBeNull();
    expect(describeAgentRunNotification(runs.stopped, context)).toBeNull();
  });
});

describe("turns an agent run started", () => {
  const key = "preview-workspace:preview-task";
  const state = (origin: "agent" | "workflow") => {
    const detail = runs.working;
    return {
      agentRunIdsByTask: { [key]: [detail.agentRun.id] },
      dividersByAgentRun: { [detail.agentRun.id]: new Map([["turn-1", "Stage 1 · Work"]]) },
      details: { [detail.agentRun.id]: { ...detail, agentRun: { ...detail.agentRun, origin } } },
    };
  };
  test("an agent run's turn is found, with the stored run", () => {
    const found = selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", "turn-1");
    expect(found?.id).toBe(runs.working.agentRun.id);
  });
  test("a legacy run's turn, an unknown turn and no turn are not", () => {
    expect(selectAgentRunForTurn(state("workflow"), "preview-workspace", "preview-task", "turn-1")).toBeNull();
    expect(selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", "turn-9")).toBeNull();
    expect(selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", undefined)).toBeNull();
  });
});

describe("agent run plan and progress", () => {
  const plan = {
    turnId: "turn-3",
    items: [
      { content: "Reproduce on a narrow screen", status: "completed" as const },
      { content: "Fix the table", status: "in_progress" as const },
      { content: "Run the checks", status: "pending" as const },
    ],
  };
  const withPlan = {
    ...runs.working,
    stages: runs.working.stages.map((record) => ({
      ...record,
      facts: { diff: null, commands: [], toolCalls: [], action: null, plan },
    })),
  };

  test("a one-stage run shows its stored plan as its steps", () => {
    expect(agentRunStoredPlan(withPlan)).toEqual(plan);
    expect(describeAgentRunProgress(withPlan)).toBe("Plan 1/3 · Now: Fix the table");
    // No plan yet: nothing to show.
    expect(agentRunStoredPlan(runs.working)).toBeNull();
    expect(describeAgentRunProgress(runs.working)).toBeNull();
  });

  test("a run with a workflow shows its stage, not a plan", () => {
    expect(agentRunStoredPlan(runs.workflow)).toBeNull();
    const stages = runs.workflow.agentRun.workflow.stages;
    expect(describeAgentRunProgress(runs.workflow)).toBe(`${stages[1]!.title} 2/${stages.length}`);
  });
});
