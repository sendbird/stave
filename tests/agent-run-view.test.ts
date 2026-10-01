import { describe, expect, test } from "bun:test";
import { buildAgentRunFixtures, AGENT_RUN_ASSIGNMENT } from "../src/dev/mission-preview/agent-run-fixtures";
import {
  describeAgentRunResult,
  describeAgentRunStatus,
  describeDoneWhen,
  extractRunAssignment,
  formatRunDuration,
} from "../src/lib/missions/agent-run-view";
import { compileMissionStagePrompt, buildStageNudgePrompt } from "../src/lib/missions/briefing";
import { describeMissionNotification } from "../src/lib/missions/notifications";
import { selectAgentRunForTurn } from "../src/store/missions-store";

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
      reason: "The run used all 60 turns before it finished.",
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
      ["bun run typecheck passes", "Met · verified by Stave"],
      ["The invoice table has the same fix", "Not verified"],
    ]);
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
    const aggregate = { mission: runs.working.mission, stages: runs.working.stages };
    const prompt = compileMissionStagePrompt(aggregate);
    expect(extractRunAssignment(prompt, AGENT_RUN_ASSIGNMENT)).toBe(AGENT_RUN_ASSIGNMENT);
    expect(extractRunAssignment(buildStageNudgePrompt(aggregate), AGENT_RUN_ASSIGNMENT)).toBeNull();
  });
});

describe("agent run notifications", () => {
  const context = { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null };
  test("name the agent and state, never a mission", () => {
    expect(describeMissionNotification(runs.ready, context)?.title).toBe("Ready — Implementer");
    expect(describeMissionNotification(runs.failed, context)?.title).toBe("Failed — Implementer");
    expect(describeMissionNotification(runs.needsYou, context)?.title).toBe("Needs you — Implementer");
    expect(describeMissionNotification(runs.stuck, context)?.title).toBe("Needs you — Implementer");
    expect(describeMissionNotification(runs.working, context)).toBeNull();
    expect(describeMissionNotification(runs.stopped, context)).toBeNull();
  });
});

describe("turns an agent run started", () => {
  const key = "preview-workspace:preview-task";
  const state = (origin: "agent" | "playbook") => {
    const detail = runs.working;
    return {
      missionIdsByTask: { [key]: [detail.mission.id] },
      dividersByMission: { [detail.mission.id]: new Map([["turn-1", "Stage 1 · Work"]]) },
      details: { [detail.mission.id]: { ...detail, mission: { ...detail.mission, origin } } },
    };
  };
  test("an agent run's turn is found, with the stored mission", () => {
    const found = selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", "turn-1");
    expect(found?.id).toBe(runs.working.mission.id);
  });
  test("a playbook mission's turn, an unknown turn and no turn are not", () => {
    expect(selectAgentRunForTurn(state("playbook"), "preview-workspace", "preview-task", "turn-1")).toBeNull();
    expect(selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", "turn-9")).toBeNull();
    expect(selectAgentRunForTurn(state("agent"), "preview-workspace", "preview-task", undefined)).toBeNull();
  });
});
