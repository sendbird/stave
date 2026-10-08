import { describe, expect, test } from "bun:test";
import { buildSidebarWorkQueueEntries } from "@/components/layout/RepositoryWorkspaceSidebar.utils";
import { collectAgentsWithWork } from "@/lib/agents/agent-work";
import { orderAgentActivityRows, summarizeAgentActivity } from "@/lib/agents/agent-activity";
import type { AgentAssignment } from "@/lib/agents/assign";
import type { FleetAttentionItem, FleetAttentionKind } from "@/lib/fleet/attention-projection";
import { FLEET_ATTENTION_PRIORITY } from "@/lib/fleet/attention-projection";
import { orderFleetBoardWorkspaces } from "@/lib/fleet/fleet-board-order";
import { buildSidebarWorkQueueLanes } from "@/lib/fleet/sidebar-work-queue";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import {
  classifyWorkQueueLane,
  compareWorkAttention,
  orderByWorkAttention,
  rankWorkAttention,
  workQueueAttentionPriority,
} from "@/lib/fleet/work-attention-order";
import type { TaskAgent } from "@/store/agent-assignments-store";
import type { ChatMessage } from "@/types/chat";

interface Row {
  id: string;
  status: FleetTaskStatus;
  activityAt: string;
  attentionKind?: FleetAttentionKind;
}

const at = (day: number) => `2026-10-0${day}T00:00:00.000Z`;

/** One row per status, with recency chosen so recency alone would give a different order. */
const ROWS: Row[] = [
  { id: "idle-old", status: "idle", activityAt: at(4) },
  { id: "approval", status: "waiting-approval", activityAt: at(1) },
  { id: "running", status: "running", activityAt: at(3) },
  { id: "input", status: "waiting-input", activityAt: at(2) },
  { id: "failed", status: "error", activityAt: at(5) },
  { id: "idle-new", status: "idle", activityAt: at(6) },
];

/** Lane, then waiting before failed, then newest first. */
const EXPECTED = ["input", "approval", "failed", "running", "idle-new", "idle-old"];

function attentionItem(workspaceId: string, kind: FleetAttentionKind): FleetAttentionItem {
  return {
    id: `${kind}:${workspaceId}`,
    kind,
    priority: FLEET_ATTENTION_PRIORITY[kind],
    repositoryPath: `/tmp/${workspaceId}`,
    repositoryName: workspaceId,
    workspaceId,
    workspaceName: workspaceId,
    createdAt: at(1),
    source: "live",
  };
}

/** The sidebar Work queue, end to end: rank entries, then group them into lanes. */
function workQueueOrder(rows: readonly Row[], activeWorkspaceId = "") {
  const highest = Object.fromEntries(
    rows.flatMap((row) => (row.attentionKind ? [[row.id, attentionItem(row.id, row.attentionKind)]] : [])),
  ) as Record<string, FleetAttentionItem | undefined>;
  const entries = buildSidebarWorkQueueEntries({
    // One repository per workspace, so the queue's recency (a repository's
    // last-opened time) is each row's own activity time.
    repositories: rows.map((row) => ({
      repositoryPath: `/tmp/${row.id}`,
      repositoryName: row.id,
      isCurrent: row.id === activeWorkspaceId,
      workspaces: [{ id: row.id, name: row.id, isDefault: false }],
    })),
    recentRepositoryLastOpenedAtByPath: Object.fromEntries(rows.map((row) => [`/tmp/${row.id}`, row.activityAt])),
    statusByWorkspaceId: Object.fromEntries(rows.map((row) => [row.id, row.status])),
    attentionPriorityByWorkspaceId: Object.fromEntries(
      rows.map((row) => [row.id, workQueueAttentionPriority(row.attentionKind)]),
    ),
    activeWorkspaceId,
  });
  return buildSidebarWorkQueueLanes({
    entries,
    signalsByWorkspaceId: Object.fromEntries(
      rows.map((row) => [row.id, { status: row.status, attentionKind: highest[row.id]?.kind }]),
    ),
  }).flatMap((group) => group.entries.map((entry) => entry.workspaceId));
}

/** The Fleet board: one repository's cards, once every card has reported. */
function fleetBoardOrder(rows: readonly Row[], activeWorkspaceId = "") {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return orderFleetBoardWorkspaces({
    workspaces: rows.map((row) => ({ id: row.id })),
    isCurrentRepository: true,
    reportOf: (workspace) => {
      const row = byId.get(workspace.id)!;
      return { leadingStatus: row.status, activityAt: row.activityAt };
    },
    activeWorkspaceId,
    highestAttentionByWorkspaceId: Object.fromEntries(
      rows.flatMap((row) => (row.attentionKind ? [[row.id, attentionItem(row.id, row.attentionKind)]] : [])),
    ),
    agentRunLaneByWorkspaceId: {},
  }).map((workspace) => workspace.id);
}

/** The Agents surface's Work list for one agent. */
function agentActivityOrder(rows: readonly Row[]) {
  const assignments = rows.map((row) => ({ id: row.id, taskId: row.id, createdAt: row.activityAt }));
  return orderAgentActivityRows(
    assignments,
    Object.fromEntries(rows.map((row) => [row.id, row.status])),
  ).map((row) => row.id);
}

function messagesFor(status: FleetTaskStatus): ChatMessage[] {
  switch (status) {
    case "waiting-input":
      return [{ id: "m", role: "assistant", parts: [{ type: "user_input", requestId: "r", state: "input-requested", questions: [] }] } as unknown as ChatMessage];
    case "waiting-approval":
      return [{ id: "m", role: "assistant", parts: [{ type: "approval", toolName: "Bash", description: "run", requestId: "r", state: "approval-requested" }] } as unknown as ChatMessage];
    case "error":
      return [{ id: "m", role: "assistant", parts: [], terminalReceipt: { completedAt: at(1), outcome: "failed" } } as unknown as ChatMessage];
    case "running":
    case "idle":
      return [];
  }
}

/** The Agents entries in the sidebar: each row is one task of its own agent. */
function agentsWithWorkOrder(rows: readonly Row[]) {
  const byTaskId = Object.fromEntries(
    rows.map((row) => [row.id, { agentConfigId: row.id, agentName: row.id } as unknown as TaskAgent]),
  );
  return collectAgentsWithWork({
    byTaskId,
    tasks: rows.map((row) => ({ id: row.id, archivedAt: null, updatedAt: row.activityAt })),
    messagesByTask: Object.fromEntries(rows.map((row) => [row.id, messagesFor(row.status)])),
    activeTurnIdsByTask: Object.fromEntries(rows.flatMap((row) => (row.status === "running" ? [[row.id, "turn"]] : []))),
    providerTurnActivityByTask: {},
    limit: 10,
  }).agents.map((agent) => agent.agentConfigId);
}

describe("the shared work attention rule", () => {
  test("lanes come first: action required, in progress, in review, idle", () => {
    expect(classifyWorkQueueLane({ status: "error" })).toBe("action-required");
    expect(classifyWorkQueueLane({ status: "running", attentionKind: "result-ready" })).toBe("in-progress");
    expect(classifyWorkQueueLane({ status: "idle", attentionKind: "pr-ready-to-merge" })).toBe("in-review");
    expect(classifyWorkQueueLane({ status: "idle", agentRunLane: "action-required" })).toBe("action-required");
    expect(orderByWorkAttention(ROWS, (row) => rankWorkAttention(row)).map((row) => row.id)).toEqual(EXPECTED);
  });

  test("inside a lane: the active row, then the most urgent reason, then status, then recency", () => {
    const base = { lane: "action-required" as const, status: "waiting-input" as const, activityAt: at(1) };
    expect(compareWorkAttention({ ...base, isActive: true }, { ...base, activityAt: at(9) })).toBeLessThan(0);
    expect(compareWorkAttention({ ...base, attentionPriority: 0 }, { ...base, attentionPriority: 2, activityAt: at(9) })).toBeLessThan(0);
    expect(compareWorkAttention({ ...base, status: "error" }, base)).toBeGreaterThan(0);
    expect(compareWorkAttention(base, { ...base, activityAt: at(2) })).toBeGreaterThan(0);
    // No attention on either side compares equal rather than NaN, so recency still decides.
    expect(compareWorkAttention({ ...base, activityAt: at(3) }, base)).toBeLessThan(0);
  });

  test("a finished result does not pull a row up; a PR that cannot merge does", () => {
    expect(workQueueAttentionPriority("result-ready")).toBeUndefined();
    expect(workQueueAttentionPriority("pr-merge-conflict")).toBe(FLEET_ATTENTION_PRIORITY["pr-merge-conflict"]);
    expect(workQueueAttentionPriority(undefined)).toBeUndefined();
  });
});

describe("Work queue, Fleet board and Agents order the same work the same way", () => {
  test("the same rows come out in the same order on every surface", () => {
    expect(workQueueOrder(ROWS)).toEqual(EXPECTED);
    expect(fleetBoardOrder(ROWS)).toEqual(EXPECTED);
    expect(agentActivityOrder(ROWS)).toEqual(EXPECTED);
    // The sidebar's Agents rows list only work to do now: action required and in progress.
    expect(agentsWithWorkOrder(ROWS)).toEqual(EXPECTED.filter((id) => !id.startsWith("idle")));
  });

  test("attention items and the active workspace move rows identically in the Work queue and on the Fleet board", () => {
    const rows: Row[] = [
      { id: "plain", status: "idle", activityAt: at(9) },
      { id: "ready-pr", status: "idle", activityAt: at(1), attentionKind: "pr-ready-to-merge" },
      { id: "result", status: "idle", activityAt: at(2), attentionKind: "result-ready" },
      { id: "conflict", status: "idle", activityAt: at(3), attentionKind: "pr-merge-conflict" },
      { id: "asks", status: "waiting-input", activityAt: at(4), attentionKind: "user-input" },
      { id: "active-idle", status: "idle", activityAt: at(1) },
    ];
    const expected = ["asks", "conflict", "ready-pr", "result", "active-idle", "plain"];
    expect(workQueueOrder(rows, "active-idle")).toEqual(expected);
    expect(fleetBoardOrder(rows, "active-idle")).toEqual(expected);
  });

  test("the Fleet board keeps its stored order until every card has reported", () => {
    const order = orderFleetBoardWorkspaces({
      workspaces: [{ id: "a" }, { id: "b" }],
      isCurrentRepository: false,
      reportOf: (workspace) => (workspace.id === "b" ? { leadingStatus: "waiting-input", activityAt: at(1) } : undefined),
      activeWorkspaceId: "",
      highestAttentionByWorkspaceId: {},
      agentRunLaneByWorkspaceId: {},
    });
    expect(order.map((workspace) => workspace.id)).toEqual(["a", "b"]);
  });

  test("a failed task counts as needing you on the Agents surface, as it does in the Work queue", () => {
    const work = collectAgentsWithWork({
      byTaskId: { t1: { agentConfigId: "a", agentName: "A" } as unknown as TaskAgent },
      tasks: [{ id: "t1", archivedAt: null, updatedAt: at(1) }],
      messagesByTask: { t1: messagesFor("error") },
      activeTurnIdsByTask: {},
      providerTurnActivityByTask: {},
      limit: 5,
    });
    expect(work.agents[0]).toMatchObject({ agentConfigId: "a", needsYou: true, count: 1 });
    const summary = summarizeAgentActivity({
      assignments: [{ id: "x", taskId: "t1", state: "started", createdAt: at(1) } as unknown as AgentAssignment],
      statusByTaskId: { t1: "error" },
    });
    expect(summary.needsYou).toBe(1);
  });
});
