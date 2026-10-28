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
  test("a new blocker episode is not hidden by the previous episode's snooze", () => {
    const old = atBuild("blocked", "episodes");
    const previous = collectFleetAgentRunAttentionItems([input(old)])[0]!;
    const next = structuredClone(old);
    next.stages.find((record) => record.stageId === "build")!.reportRevision += 1;
    const projection = buildFleetAttentionProjection({
      notifications: [], liveWorkspaces: [], prWorkspaces: [], agentRuns: [input(next)],
      snoozedAttentionIds: new Set([previous.id]),
    });
    expect(projection.blockingItems).toHaveLength(1);
    expect(projection.blockingItems[0]!.id).not.toBe(previous.id);
  });
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

  test("an agent run row waits from the event that stopped its stage", () => {
    const event = (kind: "stage-completed" | "stage-blocked", createdAt: string, sequence: number) => ({
      id: `event-${sequence}`,
      agentRunId: "m-wait",
      sequence,
      kind,
      idempotencyKey: null,
      detail: { stageId: kind === "stage-blocked" ? "build" : "understand", attempt: 1 },
      createdAt,
    });
    const signOff = atBuild("awaiting-sign-off", "m-wait");
    signOff.events = [event("stage-completed", "2026-07-26T00:10:00.000Z", 1)] as never;
    const blocked = atBuild("blocked", "m-wait");
    blocked.events = [
      event("stage-completed", "2026-07-26T00:10:00.000Z", 1),
      event("stage-blocked", "2026-07-26T00:20:00.000Z", 2),
    ] as never;
    const [waitingSignOff] = collectFleetAgentRunAttentionItems([input(signOff)]);
    const [waitingBlocked] = collectFleetAgentRunAttentionItems([input(blocked)]);
    expect(waitingSignOff!.waitingSince).toBe("2026-07-26T00:10:00.000Z");
    expect(waitingBlocked!.waitingSince).toBe("2026-07-26T00:20:00.000Z");
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

  test("a run halted at its turn limit asks for the user, like a stopped run did", () => {
    const halted = atBuild("running", "m-limit");
    expect(agentRunLanesByWorkspace([
      { ...halted, agentRun: { ...halted.agentRun, state: "paused", pauseReason: "limit-reached" } },
    ])).toEqual({ "ws-1": "action-required" });
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
