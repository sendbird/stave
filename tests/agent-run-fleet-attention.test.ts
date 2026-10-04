import { describe, expect, test } from "bun:test";
import {
  buildFleetAttentionProjection,
  collectFleetAgentRunAttentionItems,
  type FleetAgentRunInput,
} from "../src/lib/fleet/attention-projection";
import type { AgentRunDetail } from "../src/lib/agent-runs/api";
import { agentRunLanesByWorkspace } from "../src/lib/agent-runs/lanes";
import { COMPLETE_REPORT, AGENT_RUN_NOW, agentRunDetail, agentRunFixture, patchCurrent } from "./fixtures/agent-run-fixtures";

const IDENTITY = {
  repositoryPath: "/tmp/repo",
  repositoryName: "repo",
  workspaceId: "ws-1",
  workspaceName: "feature",
};

/** Request → PR with Understand done and Build in `status`. */
function atBuild(status: "running" | "awaiting-sign-off" | "blocked" | "stuck", id = "agent-run-1"): AgentRunDetail {
  const aggregate = agentRunFixture({ id });
  const understand = aggregate.stages[0]!;
  const build = { ...understand, stageId: "build", status, report: null, reportRevision: 0, detail: status === "blocked" ? "Which plan?" : null };
  return agentRunDetail({
    agentRun: { ...aggregate.agentRun, currentStageIndex: 1 },
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

function input(detail: AgentRunDetail): FleetAgentRunInput {
  return { ...IDENTITY, detail, taskTitle: "Billing export" };
}

describe("run attention in Fleet", () => {
  test("a sign-off, a blocker and a stuck stage each become a blocking row", () => {
    const items = collectFleetAgentRunAttentionItems([
      input(atBuild("awaiting-sign-off", "m-sign")),
      input(atBuild("blocked", "m-block")),
      input(atBuild("stuck", "m-stuck")),
      input(atBuild("running", "m-run")),
    ]);
    expect(items.map((item) => item.kind)).toEqual(["agent-run-sign-off", "agent-run-blocked", "agent-run-stuck"]);
    expect(items[0]).toMatchObject({
      source: "agentRun",
      taskId: "task-1",
      taskTitle: "Billing export",
      agentRunStage: { agentRunId: "m-sign", stageId: "build", attempt: 1 },
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
        { ...IDENTITY, workspaceId: "ws-2", status: "checks_failed" as never, url: null, updatedAt: AGENT_RUN_NOW.toISOString() },
      ],
      agentRuns: [input(atBuild("awaiting-sign-off"))],
      knownWorkspaceIds: new Set(["ws-1", "ws-2"]),
    });
    expect(projection.items[0]!.kind).toBe("agent-run-sign-off");
    expect(projection.blockingItems.some((item) => item.kind === "agent-run-sign-off")).toBe(true);
  });

  test("runs of unknown workspaces are dropped", () => {
    const projection = buildFleetAttentionProjection({
      notifications: [],
      liveWorkspaces: [],
      prWorkspaces: [],
      agentRuns: [input(atBuild("awaiting-sign-off"))],
      knownWorkspaceIds: new Set(["ws-other"]),
    });
    expect(projection.items).toEqual([]);
  });

  test("each workspace takes its most urgent run lane", () => {
    const running = atBuild("running", "m-a");
    const waiting = atBuild("awaiting-sign-off", "m-b");
    const elsewhere = { ...running, agentRun: { ...running.agentRun, id: "m-c", workspaceId: "ws-2" } };
    const takenOver = patchCurrent(agentRunFixture({ id: "m-d" }), { status: "running" });
    expect(
      agentRunLanesByWorkspace([
        running,
        waiting,
        elsewhere,
        agentRunDetail({ ...takenOver, agentRun: { ...takenOver.agentRun, workspaceId: "ws-3", state: "paused", pauseReason: "taken-over" } }),
      ]),
    ).toEqual({ "ws-1": "action-required", "ws-2": "in-progress" });
  });

  test("a stopped run holds its workspace in Action required only until a newer run starts there", () => {
    const stopped = (id: string, createdAt: string) => {
      const detail = atBuild("running", id);
      return { ...detail, agentRun: { ...detail.agentRun, state: "stopped" as const, createdAt } };
    };
    const later = new Date(AGENT_RUN_NOW.getTime() + 60 * 60_000).toISOString();
    const old = stopped("m-old", AGENT_RUN_NOW.toISOString());
    expect(agentRunLanesByWorkspace([old])).toEqual({ "ws-1": "action-required" });

    const next = atBuild("running", "m-new");
    expect(agentRunLanesByWorkspace([old, { ...next, agentRun: { ...next.agentRun, createdAt: later } }])).toEqual({
      "ws-1": "in-progress",
    });
    // A stop newer than the running agent run beside it still asks for the user.
    expect(agentRunLanesByWorkspace([stopped("m-late", later), next])).toEqual({ "ws-1": "action-required" });
  });
});
