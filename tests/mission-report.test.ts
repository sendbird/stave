import { describe, expect, test } from "bun:test";
import type { MissionAggregate, MissionStageRecord, StageFacts } from "../src/lib/missions/domain";
import { classifyStageEvidence } from "../src/lib/missions/evidence";
import { missionWorkQueueLane } from "../src/lib/missions/lanes";
import { buildMissionReport, type MissionWorkspaceState } from "../src/lib/missions/report";
import { COMPLETE_REPORT, MISSION_NOW, missionFixture } from "./fixtures/mission-fixtures";

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

const NO_WORKSPACE: MissionWorkspaceState = { branch: null, branchPushed: false, openPullRequest: null };

function record(stageId: string, patch: Partial<MissionStageRecord> = {}): MissionStageRecord {
  return {
    missionId: "mission-1",
    stageId,
    attempt: 1,
    status: "completed",
    nudged: false,
    blockReason: null,
    detail: null,
    feedback: null,
    startedAt: MISSION_NOW.toISOString(),
    endedAt: MISSION_NOW.toISOString(),
    startHeadSha: null,
    report: null,
    reportRevision: 0,
    facts: null,
    ...patch,
  };
}

function ended(state: "completed" | "cancelled" | "stopped", stages: MissionStageRecord[]): MissionAggregate {
  const aggregate = missionFixture();
  return {
    mission: {
      ...aggregate.mission,
      state,
      stopReason: state === "stopped" ? "turn-cap-reached" : null,
      reasonDetail: state === "stopped" ? "This mission reached its limit of 30 turns." : null,
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

describe("mission report", () => {
  test("a completed mission reports every stage, verified evidence, links and the latest criteria", () => {
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

    const report = buildMissionReport({ aggregate, workspace: NO_WORKSPACE, endedAt: MISSION_NOW });

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
    const report = buildMissionReport({
      aggregate: ended("cancelled", [record("understand", { status: "cancelled", detail: "The mission was cancelled." })]),
      workspace: {
        branch: "feat/csv-export",
        branchPushed: true,
        openPullRequest: { url: "https://github.com/o/r/pull/12", number: 12, isDraft: true },
      },
      endedAt: MISSION_NOW,
    });
    expect(report.outcome).toBe("cancelled");
    expect(report.stages[0]).toMatchObject({ status: "cancelled", detail: "The mission was cancelled." });
    expect(report.leftBehind).toEqual([
      "Branch feat/csv-export is pushed.",
      "Draft PR #12 is still open: https://github.com/o/r/pull/12",
    ]);

    const stopped = buildMissionReport({ aggregate: ended("stopped", []), workspace: NO_WORKSPACE, endedAt: MISSION_NOW });
    expect(stopped.reason).toBe("This mission reached its limit of 30 turns.");
  });

  test("a running mission has no report yet", () => {
    expect(() => buildMissionReport({ aggregate: missionFixture(), workspace: NO_WORKSPACE, endedAt: MISSION_NOW })).toThrow(
      "still running",
    );
  });
});

describe("mission lanes", () => {
  const base = { pauseReason: null, currentStageStatus: "running" as const, hasOpenPullRequestAwaitingReview: false };

  test("maps mission state to a work queue lane", () => {
    expect(missionWorkQueueLane({ ...base, state: "running" })).toBe("in-progress");
    for (const status of ["awaiting-sign-off", "blocked", "stuck"] as const) {
      expect(missionWorkQueueLane({ ...base, state: "running", currentStageStatus: status })).toBe("action-required");
    }
    expect(missionWorkQueueLane({ ...base, state: "paused", pauseReason: "runtime-changed" })).toBe("action-required");
    expect(missionWorkQueueLane({ ...base, state: "paused", pauseReason: "taken-over" })).toBeNull();
    expect(missionWorkQueueLane({ ...base, state: "stopped" })).toBe("action-required");
    expect(missionWorkQueueLane({ ...base, state: "completed", hasOpenPullRequestAwaitingReview: true })).toBe("in-review");
    expect(missionWorkQueueLane({ ...base, state: "completed" })).toBe("idle");
    expect(missionWorkQueueLane({ ...base, state: "cancelled" })).toBe("idle");
  });
});
