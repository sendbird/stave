import { describe, expect, test } from "bun:test";
import {
  SIDEBAR_WORK_QUEUE_LANE_LABEL,
  SIDEBAR_WORK_QUEUE_LANE_ORDER,
  buildSidebarWorkQueueLanes,
  classifySidebarWorkQueueLane,
  type SidebarWorkQueueSignals,
} from "../src/lib/fleet/sidebar-work-queue";

function buildEntry(workspaceId: string) {
  return { workspaceId, workspaceName: workspaceId };
}

describe("Sidebar work queue lane classification", () => {
  test("blocking attention items land in action-required", () => {
    const blockingKinds = [
      "user-input",
      "approval",
      "run-failed",
      "pr-changes-requested",
      "pr-checks-failed",
      "pr-merge-conflict",
    ] as const;

    for (const attentionKind of blockingKinds) {
      expect(classifySidebarWorkQueueLane({ attentionKind, status: "idle" })).toBe(
        "action-required",
      );
    }
  });

  test("a waiting or errored task requires action even with no attention item", () => {
    // The user may have already read the notification; the agent is still
    // stalled, so the live status has to stand on its own.
    expect(classifySidebarWorkQueueLane({ status: "waiting-input" })).toBe(
      "action-required",
    );
    expect(classifySidebarWorkQueueLane({ status: "waiting-approval" })).toBe(
      "action-required",
    );
    expect(classifySidebarWorkQueueLane({ status: "error" })).toBe("action-required");
  });

  test("a blocking attention item outranks a running turn", () => {
    expect(
      classifySidebarWorkQueueLane({ attentionKind: "approval", status: "running" }),
    ).toBe("action-required");
  });

  test("a running turn outranks finished work waiting for review", () => {
    // Present tense wins: the workspace is working, not idle-and-reviewable.
    expect(
      classifySidebarWorkQueueLane({
        attentionKind: "result-ready",
        status: "running",
      }),
    ).toBe("in-progress");
  });

  test("review-tier attention items land in in-review", () => {
    for (const attentionKind of [
      "result-ready",
      "pr-ready-to-merge",
      "pr-behind-base",
    ] as const) {
      expect(classifySidebarWorkQueueLane({ attentionKind, status: "idle" })).toBe(
        "in-review",
      );
    }
  });

  test("no attention item and no activity falls through to idle", () => {
    expect(classifySidebarWorkQueueLane({})).toBe("idle");
    expect(classifySidebarWorkQueueLane({ status: "idle" })).toBe("idle");
  });

  test("a paused heartbeat is stalled work only a human can restart", () => {
    expect(classifySidebarWorkQueueLane({ heartbeatState: "paused" })).toBe(
      "action-required",
    );
    expect(
      classifySidebarWorkQueueLane({ status: "idle", heartbeatState: "paused" }),
    ).toBe("action-required");
  });

  test("a scheduled heartbeat keeps a between-occurrences workspace out of idle", () => {
    // Otherwise a supervised workspace would be indistinguishable from one
    // nobody has touched.
    expect(classifySidebarWorkQueueLane({ heartbeatState: "scheduled" })).toBe(
      "in-progress",
    );
    expect(
      classifySidebarWorkQueueLane({
        status: "idle",
        heartbeatState: "scheduled",
      }),
    ).toBe("in-progress");
  });

  test("a scheduled heartbeat never outranks a blocking signal or live work", () => {
    expect(
      classifySidebarWorkQueueLane({
        attentionKind: "approval",
        status: "idle",
        heartbeatState: "scheduled",
      }),
    ).toBe("action-required");
    expect(
      classifySidebarWorkQueueLane({
        status: "waiting-input",
        heartbeatState: "scheduled",
      }),
    ).toBe("action-required");
    // A running turn is the live fact; the heartbeat only describes the gap
    // between occurrences.
    expect(
      classifySidebarWorkQueueLane({
        status: "running",
        heartbeatState: "scheduled",
      }),
    ).toBe("in-progress");
    // Finished work waiting for a human still reads as review.
    expect(
      classifySidebarWorkQueueLane({
        attentionKind: "result-ready",
        status: "idle",
        heartbeatState: "scheduled",
      }),
    ).toBe("in-review");
  });

  test("a stopped heartbeat leaves the lane exactly as it would have been", () => {
    // It already ran its course; the reason lives in the execution summary.
    for (const signals of [
      {},
      { status: "idle" },
      { attentionKind: "result-ready", status: "idle" },
      { status: "running" },
      { attentionKind: "approval", status: "idle" },
    ] as const satisfies readonly SidebarWorkQueueSignals[]) {
      expect(
        classifySidebarWorkQueueLane({ ...signals, heartbeatState: "stopped" }),
      ).toBe(classifySidebarWorkQueueLane(signals));
    }
    expect(classifySidebarWorkQueueLane({ heartbeatState: "stopped" })).toBe(
      "idle",
    );
  });

  test("the last lane is labelled Idle because merged and untouched are indistinguishable here", () => {
    expect(SIDEBAR_WORK_QUEUE_LANE_LABEL.idle).toBe("Idle");
  });
});

describe("Sidebar work queue grouping", () => {
  const signals: Record<string, SidebarWorkQueueSignals> = {
    "ws-blocked": { attentionKind: "user-input", status: "waiting-input" },
    "ws-running": { status: "running" },
    "ws-review": { attentionKind: "result-ready", status: "idle" },
    "ws-idle": { status: "idle" },
  };

  test("groups lanes in fixed priority order", () => {
    const groups = buildSidebarWorkQueueLanes({
      entries: [
        buildEntry("ws-idle"),
        buildEntry("ws-review"),
        buildEntry("ws-running"),
        buildEntry("ws-blocked"),
      ],
      signalsByWorkspaceId: signals,
    });

    expect(groups.map((group) => group.lane)).toEqual([
      "action-required",
      "in-progress",
      "in-review",
      "idle",
    ]);
    expect(groups.map((group) => group.lane)).toEqual([
      ...SIDEBAR_WORK_QUEUE_LANE_ORDER,
    ]);
    expect(groups[0]?.entries.map((entry) => entry.workspaceId)).toEqual([
      "ws-blocked",
    ]);
  });

  test("preserves the caller's ranking inside a lane", () => {
    const groups = buildSidebarWorkQueueLanes({
      entries: [
        buildEntry("ws-a"),
        buildEntry("ws-b"),
        buildEntry("ws-c"),
      ],
      signalsByWorkspaceId: {
        "ws-a": { status: "running" },
        "ws-b": { status: "running" },
        "ws-c": { status: "running" },
      },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.entries.map((entry) => entry.workspaceId)).toEqual([
      "ws-a",
      "ws-b",
      "ws-c",
    ]);
  });

  test("a workspace appears in exactly one lane even when listed twice", () => {
    const groups = buildSidebarWorkQueueLanes({
      entries: [
        buildEntry("ws-blocked"),
        buildEntry("ws-blocked"),
        buildEntry("ws-running"),
      ],
      signalsByWorkspaceId: signals,
    });

    const rendered = groups.flatMap((group) =>
      group.entries.map((entry) => entry.workspaceId),
    );
    expect(rendered).toEqual(["ws-blocked", "ws-running"]);
    expect(new Set(rendered).size).toBe(rendered.length);
  });

  test("drops empty lanes so the sidebar never renders a bare header", () => {
    const groups = buildSidebarWorkQueueLanes({
      entries: [buildEntry("ws-running")],
      signalsByWorkspaceId: signals,
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ lane: "in-progress", label: "In progress" });
  });

  test("workspaces with no signals are still listed, in the idle lane", () => {
    const groups = buildSidebarWorkQueueLanes({
      entries: [buildEntry("ws-unknown")],
      signalsByWorkspaceId: {},
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.lane).toBe("idle");
    expect(groups[0]?.entries).toHaveLength(1);
  });

  test("returns nothing for an empty list", () => {
    expect(
      buildSidebarWorkQueueLanes({ entries: [], signalsByWorkspaceId: {} }),
    ).toEqual([]);
  });
});
