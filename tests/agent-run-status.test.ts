import { i18n } from "../src/i18n/runtime";
import { formatDateTime } from "../src/i18n/format";
import { describeAgentRunHeadline, describeAgentRunStatusLine } from "../src/lib/agent-runs/agent-run-view";
import { agentRunLanesByWorkspace, agentRunWorkQueueLane } from "../src/lib/agent-runs/lanes";
import { describe, expect, test } from "bun:test";
import { buildAgentRunFixtures, AGENT_RUN_ASSIGNMENT } from "../src/dev/agent-run-preview/agent-run-fixtures";
import {
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
const NOTIFICATION_CONTEXT = { repositoryPath: "/tmp/repo", repositoryName: "repo", workspaceName: "Billing", taskTitle: "CSV export" };

describe("agent run state", () => {
  test("names the agent and its badge", () => {
    expect(describeAgentRunStatus(runs.working)).toMatchObject({ agentName: "Implementer", badge: "running", label: "Running", recovery: null });
    expect(describeAgentRunStatus(runs.ready)).toMatchObject({ badge: "completed", label: "Completed", tone: "success" });
    expect(describeAgentRunStatus(runs.stopped)).toMatchObject({ badge: "stopped", label: "Stopped" });
  });

  test("a blocked stage halts, with what it waits on; a stuck one can be retried", () => {
    expect(describeAgentRunStatus(runs.blocked)).toMatchObject({
      badge: "halted",
      label: "Halted",
      subtitle: "Blocked",
      reason: "Which breakpoint should the table switch at: 640px or 768px?",
      recovery: null,
    });
    expect(describeAgentRunStatus(runs.stuck)).toMatchObject({ badge: "halted", subtitle: "Blocked", recovery: "retry-stage" });
  });

  test("a run Stave stopped at its limit is stopped, with the reason, and a retry starts a new run", () => {
    expect(describeAgentRunStatus(runs.failed)).toMatchObject({
      badge: "stopped",
      label: "Stopped",
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

describe("agent run notifications", () => {
  const context = { repositoryPath: null, repositoryName: null, workspaceName: null, taskTitle: null };
  test("name the agent and state, never a run", () => {
    expect(describeAgentRunNotification(runs.ready, context)?.title).toBe("Ready — Implementer");
    expect(describeAgentRunNotification(runs.failed, context)?.title).toBe("Failed — Implementer");
    expect(describeAgentRunNotification(runs.blocked, context)?.title).toBe("Needs you — Implementer");
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


test("usage wait is localized with its reset time, without Needs you or a blocked notification", async () => {
  const previous = i18n.language;
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      const status = describeAgentRunStatus(runs.waiting);
      expect(status).toMatchObject({ badge: "running", waiting: true, tone: "neutral", recovery: null });
      expect(status.label).toBe(language === "en" ? "Running" : "실행 중");
      expect(status.subtitle).toContain(formatDateTime(runs.waiting.agentRun.usageLimit!.resumeAt!));
      expect(status.reason).toContain(formatDateTime(runs.waiting.agentRun.usageLimit!.resetsAt!));
      expect(describeAgentRunHeadline(runs.waiting)).toMatchObject({ tone: "waiting", text: status.reason });
      expect(agentRunWorkQueueLane({ state: "paused", pauseReason: "usage-limit", currentStageStatus: "running", hasOpenPullRequestAwaitingReview: false, usageLimit: runs.waiting.agentRun.usageLimit })).toBe("in-progress");
      expect(agentRunLanesByWorkspace([runs.waiting])[runs.waiting.agentRun.workspaceId]).toBe("in-progress");
      expect(describeAgentRunNotification(runs.waiting, NOTIFICATION_CONTEXT)).toBeNull();
      // An unreadable usage window keeps waiting until its retry time; the reset stays unknown.
      const retrying = structuredClone(runs.waiting); retrying.agentRun.usageLimit!.resetsAt = null;
      expect(describeAgentRunStatus(retrying)).toMatchObject({ badge: "running", waiting: true, reason: expect.stringContaining(formatDateTime(retrying.agentRun.usageLimit!.resumeAt!)) });
      expect(describeAgentRunNotification(retrying, NOTIFICATION_CONTEXT)).toBeNull();
    }
  } finally { await i18n.changeLanguage(previous); }
});

test("an unknown usage reset halts, keeps Resume and notifies once per limited turn", async () => {
  const previous = i18n.language;
  try {
    for (const language of ["en", "ko"]) {
      await i18n.changeLanguage(language);
      const unknown = runs.usageUnknown;
      const status = describeAgentRunStatus(unknown);
      expect(status).toMatchObject({ badge: "halted", tone: "warning", recovery: null, reason: i18n.t("agentRuns:usageLimit.unknownReset") });
      expect([status.label, status.subtitle]).toEqual(language === "en" ? ["Halted", "Usage limit"] : ["멈춤", "사용량 한도"]);
      expect(describeAgentRunHeadline(unknown)).toMatchObject({ tone: "attention", text: status.reason });
      expect(describeAgentRunStatusLine(unknown)).toMatchObject({ detail: status.reason });
      expect(agentRunWorkQueueLane({ state: "paused", pauseReason: "usage-limit", currentStageStatus: "running", hasOpenPullRequestAwaitingReview: false, usageLimit: unknown.agentRun.usageLimit })).toBe("action-required");
      expect(agentRunWorkQueueLane({ state: "paused", pauseReason: "usage-limit", currentStageStatus: "running", hasOpenPullRequestAwaitingReview: false })).toBe("action-required");
      expect(agentRunLanesByWorkspace([unknown])[unknown.agentRun.workspaceId]).toBe("action-required");
      const notification = describeAgentRunNotification(unknown, NOTIFICATION_CONTEXT)!;
      expect(notification).toMatchObject({
        kind: "agent_run.blocked",
        title: i18n.t("agentRuns:notifications.title3", { value1: "Implementer" }),
        payload: { detail: status.reason },
        dedupeKey: `agent-run:${unknown.agentRun.id}:paused:usage-limit:${unknown.agentRun.usageLimit!.turnId}`,
      });
      // The same limited turn keeps its key, so it notifies once; a later limit is a new episode.
      expect(describeAgentRunNotification(structuredClone(unknown), NOTIFICATION_CONTEXT)!.dedupeKey).toBe(notification.dedupeKey);
      const later = structuredClone(unknown); later.agentRun.usageLimit!.turnId = "turn-9";
      expect(describeAgentRunNotification(later, NOTIFICATION_CONTEXT)!.dedupeKey).not.toBe(notification.dedupeKey);
    }
  } finally { await i18n.changeLanguage(previous); }
});
