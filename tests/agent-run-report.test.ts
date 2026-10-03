import { describe, expect, test } from "bun:test";
import type { AgentRunAggregate, AgentRunStageRecord, StageFacts } from "../src/lib/agent-runs/domain";
import { classifyStageEvidence } from "../src/lib/agent-runs/evidence";
import { agentRunWorkQueueLane } from "../src/lib/agent-runs/lanes";
import { buildAgentRunReport, type AgentRunWorkspaceState } from "../src/lib/agent-runs/report";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunFixture } from "./fixtures/agent-run-fixtures";

const FACTS: StageFacts = {
  currentTurnId: "turn-1",
  workspaceRevision: { status: "known", revision: "revision-1" },
  diff: { filesChanged: 3, insertions: 40, deletions: 2 },
  commands: [
    { command: "bun run typecheck", exitCode: 0, toolCallId: "call-1", turnId: "turn-1", outcome: "succeeded", provenance: "provider-structured", sourceRevision: { status: "known", revision: "revision-1" } },
    { command: "bun test tests/export.test.ts", exitCode: 1, toolCallId: "call-2", turnId: "turn-1", outcome: "failed", provenance: "provider-structured" },
  ],
  toolCalls: [
    { toolCallId: "call-3", name: "stave_lens_screenshot", ok: true, turnId: "turn-1" },
    { toolCallId: "call-4", name: "stave_lens_snapshot", ok: false, turnId: "turn-1" },
  ],
  action: null,
};

const NO_WORKSPACE: AgentRunWorkspaceState = { branch: null, branchPushed: false, openPullRequest: null };

function record(stageId: string, patch: Partial<AgentRunStageRecord> = {}): AgentRunStageRecord {
  return {
    agentRunId: "agent-run-1",
    stageId,
    attempt: 1,
    status: "completed",
    nudged: false,
    blockReason: null,
    detail: null,
    feedback: null,
    startedAt: AGENT_RUN_NOW.toISOString(),
    endedAt: AGENT_RUN_NOW.toISOString(),
    startHeadSha: null,
    report: null,
    reportRevision: 0,
    facts: null,
    ...patch,
  };
}

function ended(state: "completed" | "cancelled" | "stopped", stages: AgentRunStageRecord[]): AgentRunAggregate {
  const aggregate = agentRunFixture();
  return {
    agentRun: {
      ...aggregate.agentRun,
      state,
      stopReason: state === "stopped" ? "turn-cap-reached" : null,
      reasonDetail: state === "stopped" ? "This run reached its limit of 30 turns." : null,
      currentStageIndex: 5,
      turnCount: 7,
    },
    stages,
  };
}

describe("evidence provenance", () => {
  test("a citation is verified only when Stave saw that call succeed in this stage", () => {
    const report = {
      ...COMPLETE_REPORT,
      evidence: [
        { label: "Typecheck passes", kind: "check" as const, command: "bun  run   typecheck" },
        { label: "Tests pass", kind: "check" as const, command: "bun test tests/export.test.ts" },
        { label: "Screenshot", kind: "artifact" as const, toolCallId: "call-3" },
        { label: "Snapshot", kind: "artifact" as const, toolCallId: "call-4" },
        { label: "Typecheck by call", kind: "check" as const, toolCallId: "call-1" },
        { label: "Looks right", kind: "observation" as const },
      ],
    };
    expect(classifyStageEvidence(report, FACTS).map((item) => [item.label, item.source])).toEqual([
      ["Typecheck passes", "stave"],
      ["Tests pass", "provider"],
      ["Screenshot", "provider"],
      ["Snapshot", "provider"],
      ["Typecheck by call", "stave"],
      ["Looks right", "agent"],
    ]);
    expect(classifyStageEvidence(report, null).every((item) => item.source === "agent")).toBe(true);
  });
});

describe("run report", () => {
  test("a completed run reports every stage, verified evidence, links and the latest criteria", () => {
    const aggregate = ended("completed", [
      record("understand", { report: COMPLETE_REPORT }),
      record("build", {
        report: {
          ...COMPLETE_REPORT,
          summary: "Added the export button.",
          decisions: [{ decision: "Reuse the download helper", reason: "It already streams CSV." }],
          evidence: [{ label: "Typecheck passes", kind: "check", command: "bun run typecheck" }],
          artifacts: [{ label: "Draft PR", url: "https://github.com/o/r/pull/12" }],
          acceptanceCriteria: [{ text: "Export button exists", status: "met" }],
        },
        facts: FACTS,
      }),
      record("verify", { attempt: 1, status: "cancelled" }),
      record("verify", { attempt: 2, report: { ...COMPLETE_REPORT, acceptanceCriteria: undefined } }),
      record("open-draft-pr", {
        facts: {
          ...FACTS,
          action: { type: "open-draft-pr", prUrl: "https://github.com/o/r/pull/12", prNumber: 12, created: true },
        },
      }),
      record("watch-checks", {
        facts: { ...FACTS, action: { type: "watch-checks", outcome: "passed", checks: [{ name: "ci", state: "SUCCESS" }] } },
      }),
    ]);

    const report = buildAgentRunReport({ aggregate, workspace: NO_WORKSPACE, endedAt: AGENT_RUN_NOW });

    expect(report.outcome).toBe("completed");
    expect(report.stages.map((stage) => [stage.stageId, stage.status, stage.attempts])).toEqual([
      ["understand", "completed", 1],
      ["build", "completed", 1],
      ["verify", "completed", 2],
      ["open-draft-pr", "completed", 1],
      ["watch-checks", "completed", 1],
      ["ready-for-review", "pending", 0],
    ]);
    expect(report.stages[1]?.evidence).toMatchObject([
      { label: "Typecheck passes", kind: "check", command: "bun run typecheck", source: "stave" },
    ]);
    expect(report.stages[3]?.evidence[0]).toMatchObject({ label: "Opened draft PR #12", source: "stave" });
    expect(report.stages[4]?.evidence[0]).toMatchObject({ label: "1 check passed", source: "stave" });
    expect(report.links).toEqual([
      { label: "Opened draft PR #12", url: "https://github.com/o/r/pull/12", source: "stave" },
    ]);
    expect(report.acceptanceCriteria).toEqual([{ text: "Export button exists", status: "met" }]);
    expect(report.leftBehind).toEqual([]);
  });

  test("a partial report lists what was left behind", () => {
    const report = buildAgentRunReport({
      aggregate: ended("cancelled", [record("understand", { status: "cancelled", detail: "The run was cancelled." })]),
      workspace: {
        branch: "feat/csv-export",
        branchPushed: true,
        openPullRequest: { url: "https://github.com/o/r/pull/12", number: 12, isDraft: true },
      },
      endedAt: AGENT_RUN_NOW,
    });
    expect(report.outcome).toBe("cancelled");
    expect(report.stages[0]).toMatchObject({ status: "cancelled", detail: "The run was cancelled." });
    expect(report.leftBehind).toEqual([
      "Branch feat/csv-export is pushed.",
      "Draft PR #12 is still open: https://github.com/o/r/pull/12",
    ]);

    const stopped = buildAgentRunReport({ aggregate: ended("stopped", []), workspace: NO_WORKSPACE, endedAt: AGENT_RUN_NOW });
    expect(stopped.reason).toBe("This run reached its limit of 30 turns.");
  });

  test("a running run has no report yet", () => {
    expect(() => buildAgentRunReport({ aggregate: agentRunFixture(), workspace: NO_WORKSPACE, endedAt: AGENT_RUN_NOW })).toThrow(
      "still running",
    );
  });
});

describe("run lanes", () => {
  const base = { pauseReason: null, currentStageStatus: "running" as const, hasOpenPullRequestAwaitingReview: false };

  test("maps run state to a work queue lane", () => {
    expect(agentRunWorkQueueLane({ ...base, state: "running" })).toBe("in-progress");
    for (const status of ["awaiting-sign-off", "blocked", "stuck"] as const) {
      expect(agentRunWorkQueueLane({ ...base, state: "running", currentStageStatus: status })).toBe("action-required");
    }
    expect(agentRunWorkQueueLane({ ...base, state: "paused", pauseReason: "runtime-changed" })).toBe("action-required");
    expect(agentRunWorkQueueLane({ ...base, state: "paused", pauseReason: "taken-over" })).toBeNull();
    expect(agentRunWorkQueueLane({ ...base, state: "stopped" })).toBe("action-required");
    expect(agentRunWorkQueueLane({ ...base, state: "completed", hasOpenPullRequestAwaitingReview: true })).toBe("in-review");
    expect(agentRunWorkQueueLane({ ...base, state: "completed" })).toBe("idle");
    expect(agentRunWorkQueueLane({ ...base, state: "cancelled" })).toBe("idle");
  });
});
