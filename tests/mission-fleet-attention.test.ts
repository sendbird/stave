import { describe, expect, test } from "bun:test";
import {
  buildFleetAttentionProjection,
  collectFleetMissionAttentionItems,
  type FleetMissionInput,
} from "../src/lib/fleet/attention-projection";
import type { MissionDetail } from "../src/lib/missions/api";
import { missionLanesByWorkspace } from "../src/lib/missions/lanes";
import { COMPLETE_REPORT, MISSION_NOW, missionDetail, missionFixture, patchCurrent } from "./fixtures/mission-fixtures";

const IDENTITY = {
  repositoryPath: "/tmp/repo",
  repositoryName: "repo",
  workspaceId: "ws-1",
  workspaceName: "feature",
};

/** Request → PR with Understand done and Build in `status`. */
function atBuild(status: "running" | "awaiting-sign-off" | "blocked" | "stuck", id = "mission-1"): MissionDetail {
  const aggregate = missionFixture({ id });
  const understand = aggregate.stages[0]!;
  const build = { ...understand, stageId: "build", status, report: null, reportRevision: 0, detail: status === "blocked" ? "Which plan?" : null };
  return missionDetail({
    mission: { ...aggregate.mission, currentStageIndex: 1 },
    stages: [
      {
        ...understand,
        status: "completed",
        report: COMPLETE_REPORT,
        reportRevision: 1,
        facts: { diff: { filesChanged: 4, insertions: 82, deletions: 17 }, commands: [], toolCalls: [], action: null },
      },
      build,
    ],
  });
}

function input(detail: MissionDetail): FleetMissionInput {
  return { ...IDENTITY, detail, taskTitle: "Billing export" };
}

describe("mission attention in Fleet", () => {
  test("a sign-off, a blocker and a stuck stage each become a blocking row", () => {
    const items = collectFleetMissionAttentionItems([
      input(atBuild("awaiting-sign-off", "m-sign")),
      input(atBuild("blocked", "m-block")),
      input(atBuild("stuck", "m-stuck")),
      input(atBuild("running", "m-run")),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["mission-sign-off", "mission-blocked", "mission-stuck"]);
    expect(items[0]).toMatchObject({
      source: "mission",
      taskId: "task-1",
      taskTitle: "Billing export",
      missionStage: { missionId: "m-sign", stageId: "build", attempt: 1 },
    });
    // The sign-off row carries the same summary as the task's card.
    expect(items[0]!.detail).toBe("Build next · Understand done · 4 files +82 −17");
    expect(items[1]!.detail).toBe("Build · Which plan?");
  });

  test("sign-offs sort with approvals, ahead of failed runs and PR states", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [],
      prWorkspaces: [
        { ...IDENTITY, workspaceId: "ws-2", status: "checks_failed" as never, url: null, updatedAt: MISSION_NOW.toISOString() },
      ],
      missions: [input(atBuild("awaiting-sign-off"))],
      knownWorkspaceIds: new Set(["ws-1", "ws-2"]),
    });
    expect(projection.items[0]!.kind).toBe("mission-sign-off");
    expect(projection.blockingItems.some((item) => item.kind === "mission-sign-off")).toBe(true);
  });

  test("missions of unknown workspaces are dropped", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [],
      prWorkspaces: [],
      missions: [input(atBuild("awaiting-sign-off"))],
      knownWorkspaceIds: new Set(["ws-other"]),
    });
    expect(projection.items).toEqual([]);
  });

  test("each workspace takes its most urgent mission lane", () => {
    const running = atBuild("running", "m-a");
    const waiting = atBuild("awaiting-sign-off", "m-b");
    const elsewhere = { ...running, mission: { ...running.mission, id: "m-c", workspaceId: "ws-2" } };
    const takenOver = patchCurrent(missionFixture({ id: "m-d" }), { status: "running" });
    expect(
      missionLanesByWorkspace([
        running,
        waiting,
        elsewhere,
        missionDetail({ ...takenOver, mission: { ...takenOver.mission, workspaceId: "ws-3", state: "paused", pauseReason: "taken-over" } }),
      ]),
    ).toEqual({ "ws-1": "action-required", "ws-2": "in-progress" });
  });
});
