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

  test("a workspace check criterion reads as checked by Stave only on Stave's own passing check", () => {
    const revision = { status: "known" as const, revision: "r1" };
    const definition = { scriptId: "check", definitionHash: "a".repeat(64) };
    const run = structuredClone(runs.ready);
    const stage = run.agentRun.workflow.stages.findLast((candidate) => candidate.kind === "ai")!;
    if (stage.kind !== "ai") throw new Error("Expected an AI stage");
    stage.acceptanceCriteria = [{ text: "Workspace checks pass", required: true, verification: "stave-check", scriptIds: ["check"], scriptDefinitions: [definition] }];
    const record = run.stages.findLast((candidate) => candidate.stageId === stage.id)!;
    if (record.report?.outcome !== "complete") throw new Error("Expected a complete report");
    record.report = { ...record.report, workspaceRevision: revision, acceptanceCriteria: [...(record.report.acceptanceCriteria ?? []), { text: "Workspace checks pass", status: "met" }] };
    record.facts = { ...record.facts!, workspaceRevision: revision, workspaceScripts: [] };
    const label = () => describeDoneWhen(run).find((line) => line.text === "Workspace checks pass")?.label;
    // The agent's "met" alone does not count.
    expect(label()).toBe("Not verified");
    record.facts.workspaceScripts = [{ source: "stave", type: "run-script", scriptId: "check", definitionHash: definition.definitionHash,
      executedCommands: "env -u A sh -c \"bun run typecheck && bun test\"", exitCode: 0, durationMs: 10, outputTail: "", verification: { sourceRevision: revision, completedRevision: revision } }];
    expect(label()).toBe("Met · checked by Stave");
    expect(describeDoneWhen(run).filter((line) => line.status === "met-verified")).toHaveLength(1);
    // The check is named by its action, not by its long command line.
    expect(describeAgentRunResult(run, NOW).staveChecks).toContain("check");
    expect(describeAgentRunResult(run, NOW).staveChecks.some((name) => name.includes("bun run typecheck &&"))).toBe(false);
  });

  test("the latest stage decides: a later unmet report or an unchecked later stage is not shown as checked", () => {
    const revision = { status: "known" as const, revision: "r1" };
    const definition = { scriptId: "check", definitionHash: "a".repeat(64) };
    const criterion = { text: "Workspace checks pass", required: true, verification: "stave-check" as const, scriptIds: ["check"], scriptDefinitions: [definition] };
    const passed = { source: "stave" as const, type: "run-script" as const, scriptId: "check", definitionHash: definition.definitionHash, exitCode: 0, durationMs: 1, outputTail: "", verification: { sourceRevision: revision, completedRevision: revision } };
    // Two AI stages, Build then Final, each with a completed record.
    const run = structuredClone(runs.ready);
    const template = run.agentRun.workflow.stages.find((stage) => stage.kind === "ai")!;
    if (template.kind !== "ai") throw new Error("Expected an AI stage");
    const templateRecord = run.stages.findLast((record) => record.stageId === template.id)!;
    const firstStage = { ...template, id: "build", acceptanceCriteria: [criterion] };
    const lastStage: typeof template = { ...template, id: "final", acceptanceCriteria: [] };
    run.agentRun.workflow.stages = [firstStage, lastStage];
    run.agentRun.currentStageIndex = 1;
    const firstRecord = { ...structuredClone(templateRecord), stageId: "build" };
    const lastRecord = { ...structuredClone(templateRecord), stageId: "final" };
    run.stages = [firstRecord, lastRecord];
    firstRecord.facts = { ...firstRecord.facts!, workspaceRevision: revision, workspaceScripts: [passed] };
    if (firstRecord.report?.outcome !== "complete" || lastRecord.report?.outcome !== "complete") throw new Error("Expected complete reports");
    firstRecord.report = { ...firstRecord.report, workspaceRevision: revision, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
    expect(describeDoneWhen({ ...run, agentRun: { ...run.agentRun, currentStageIndex: 0 } }).find((line) => line.text === criterion.text)?.label).toBe("Met · checked by Stave");
    const label = () => describeDoneWhen(run).find((line) => line.text === criterion.text)?.label;
    // The final stage reports the inherited criterion unmet on the final work: the earlier check does not override it.
    lastRecord.report = { ...lastRecord.report, acceptanceCriteria: [{ text: criterion.text, status: "unmet" }] };
    expect(label()).toBe("Not met");
    // The same text checked again on the last stage, without a check there: not verified, whatever the first stage saw.
    lastStage.acceptanceCriteria = [criterion];
    lastRecord.facts = { ...lastRecord.facts!, workspaceRevision: revision, workspaceScripts: [] };
    lastRecord.report = { ...lastRecord.report, acceptanceCriteria: [{ text: criterion.text, status: "met" }] };
    expect(label()).toBe("Not verified");
    // A later Run script action with the same criterion decides by its own result.
    run.agentRun.workflow.stages = [firstStage, { id: "verify", title: "Verify", kind: "action", action: { type: "run-script", scriptId: "check" }, acceptanceCriteria: [{ text: criterion.text }] }];
    const actionRecord = { ...structuredClone(templateRecord), stageId: "verify", report: undefined };
    actionRecord.facts = { ...actionRecord.facts!, workspaceRevision: revision, action: { type: "run-script", scriptId: "check", exitCode: 1, outputTail: "failed", verification: { sourceRevision: revision, completedRevision: revision } } };
    run.stages = [firstRecord, actionRecord];
    expect(label()).toBe("Not verified");
    actionRecord.facts = { ...actionRecord.facts, action: { ...actionRecord.facts.action!, exitCode: 0 } as typeof actionRecord.facts.action };
    expect(label()).toBe("Met · checked by Stave");
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
    // A blank send keeps its own body instead of reading as Stave's follow-up.
    expect(resolveAgentRunPrompt({ text: "  ", pending: true })).toBeNull();
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
