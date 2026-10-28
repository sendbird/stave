import { describe, expect, test } from "bun:test";
import { createCodexWorkerActivityMapper } from "../electron/providers/codex-worker-activity";
import {
  buildRunProgress,
  formatRunProgressLabel,
  isBlockingWaitToolName,
  resolveRunIndicatorKind,
  resolveTurnWaitTarget,
  selectWorkspaceRunTask,
} from "@/lib/fleet/run-progress";
import type { NormalizedProviderEvent, ProviderId } from "@/lib/providers/provider.types";
import {
  applyProviderTurnActivityEvents,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";

const START = 1_000_000;

function snapshot(args: {
  providerId?: ProviderId;
  batches: { at: number; events: NormalizedProviderEvent[] }[];
}): ProviderTurnActivitySnapshot {
  let activityByTask: Record<string, ProviderTurnActivitySnapshot | undefined> = {};
  for (const batch of args.batches) {
    activityByTask = applyProviderTurnActivityEvents({
      activityByTask,
      taskId: "task-1",
      turnId: "turn-1",
      providerId: args.providerId ?? "claude-code",
      events: batch.events,
      now: batch.at,
    });
  }
  return activityByTask["task-1"]!;
}

function tool(
  toolUseId: string,
  toolName: string,
  extra: Partial<Extract<NormalizedProviderEvent, { type: "tool" }>> = {},
): NormalizedProviderEvent {
  return { type: "tool", toolUseId, toolName, input: "{}", state: "input-available", ...extra };
}

describe("run indicator precedence", () => {
  const base = { busy: false, running: true, stalled: false, waiting: false, pendingInteraction: false };

  test("system work wins over every agent state", () => {
    expect(resolveRunIndicatorKind({ ...base, busy: true, stalled: true, waiting: true })).toBe("busy");
    expect(resolveRunIndicatorKind({ ...base, busy: true, running: false })).toBe("busy");
  });

  test("a stalled turn stops reading as work, even while it waits on helpers", () => {
    expect(resolveRunIndicatorKind({ ...base, stalled: true, waiting: true })).toBe("stalled");
  });

  test("a blocked turn waits, an unblocked one works", () => {
    expect(resolveRunIndicatorKind({ ...base, waiting: true })).toBe("waiting");
    expect(resolveRunIndicatorKind(base)).toBe("working");
  });

  test("nothing running, or a turn waiting on a person, draws no run mark", () => {
    expect(resolveRunIndicatorKind({ ...base, running: false })).toBe("none");
    expect(resolveRunIndicatorKind({ ...base, pendingInteraction: true, stalled: true })).toBe("none");
  });
});

describe("blocking wait calls", () => {
  test("Claude's foreground subagent call and Codex's wait call block the main loop", () => {
    expect(isBlockingWaitToolName("Agent")).toBe(true);
    expect(isBlockingWaitToolName("Task")).toBe(true);
    expect(isBlockingWaitToolName("collaboration:wait")).toBe(true);
  });

  test("a Codex spawn returns at once, and namespaced tools that share a name are not waits", () => {
    expect(isBlockingWaitToolName("collaboration:spawn_agent")).toBe(false);
    expect(isBlockingWaitToolName("collaboration:send_input")).toBe(false);
    expect(isBlockingWaitToolName("mcp__tracker__task")).toBe(false);
    expect(isBlockingWaitToolName("mcp__timer__wait")).toBe(false);
    expect(isBlockingWaitToolName("Bash")).toBe(false);
    expect(isBlockingWaitToolName(undefined)).toBe(false);
  });
});

describe("waiting on helpers", () => {
  test("Claude: the parent waits while its subagent call runs, whatever the subagent itself runs", () => {
    const activity = snapshot({
      batches: [
        { at: START, events: [tool("agent-1", "Agent", { input: JSON.stringify({ description: "Search", prompt: "Find it", subagent_type: "Explore" }) })] },
        { at: START + 5_000, events: [tool("inner-1", "Grep", { parentToolUseId: "agent-1" })] },
      ],
    });
    expect(resolveTurnWaitTarget(activity)).toEqual({ helperCount: 1, since: START });
  });

  test("Claude: a parent running its own tool beside the subagent is working", () => {
    const activity = snapshot({
      batches: [
        { at: START, events: [tool("agent-1", "Agent", { input: JSON.stringify({ description: "Search", prompt: "Find it" }) })] },
        { at: START + 1_000, events: [tool("bash-1", "Bash")] },
      ],
    });
    expect(resolveTurnWaitTarget(activity)).toBeNull();
  });

  test("Codex: a spawned worker alone is not a wait; the explicit wait call is", () => {
    const spawn = tool("spawn-1", "collaboration:spawn_agent", {
      agentId: "thread-child",
      input: JSON.stringify({ task_name: "worker" }),
    });
    const spawned = snapshot({
      providerId: "codex",
      batches: [
        { at: START, events: [spawn] },
        { at: START + 500, events: [{ type: "tool_result", tool_use_id: "spawn-1", output: "{}", isPartial: true }] },
      ],
    });
    expect(resolveTurnWaitTarget(spawned)?.since ?? null).toBeNull();

    const waiting = snapshot({
      providerId: "codex",
      batches: [
        { at: START, events: [spawn] },
        { at: START + 2_000, events: [tool("wait-1", "collaboration:wait")] },
      ],
    });
    // The spawn stays open in the graph for the worker's lifetime; it is the
    // worker's work, so only the wait call decides.
    expect(resolveTurnWaitTarget(waiting)).toEqual({ helperCount: 1, since: START + 2_000 });

    const workingBeside = snapshot({
      providerId: "codex",
      batches: [
        { at: START, events: [spawn] },
        { at: START + 2_000, events: [tool("wait-1", "collaboration:wait"), tool("cmd-1", "bash")] },
      ],
    });
    expect(resolveTurnWaitTarget(workingBeside)).toBeNull();
  });

  describe("Codex: counts only the workers a wait names", () => {
    type CodexMapper = ReturnType<typeof createCodexWorkerActivityMapper>;
    const spawnWorker = (codex: CodexMapper, id: string, threadId: string) => {
      const item = { id, type: "collabAgentToolCall", tool: "spawnAgent", receiverThreadIds: [], prompt: `Worker ${threadId}` };
      return [
        ...codex.mapStarted(item).events,
        ...codex.mapCompleted({ ...item, receiverThreadIds: [threadId], status: "completed" }).events,
      ];
    };
    const waitOn = (codex: CodexMapper, id: string, receiverThreadIds: string[]) =>
      codex.mapStarted({ id, type: "collabAgentToolCall", tool: "wait", receiverThreadIds, status: "inProgress" }).events;
    const finish = (codex: CodexMapper, threadId: string) =>
      codex.mapForeignNotification({
        method: "item/completed",
        threadId,
        params: { item: { type: "agentMessage", phase: "final_answer", text: "Done." } },
      }).events;
    const run = (build: (codex: CodexMapper) => NormalizedProviderEvent[][]) => {
      const codex = createCodexWorkerActivityMapper({ inputMaxBytes: 10_000, outputMaxBytes: 10_000 });
      return resolveTurnWaitTarget(snapshot({
        providerId: "codex",
        batches: build(codex).map((events, index) => ({ at: START + index * 1_000, events })),
      }));
    };

    test("waiting on one of two workers waits on one", () => {
      expect(run((codex) => [
        spawnWorker(codex, "spawn-a", "thread-a"),
        spawnWorker(codex, "spawn-b", "thread-b"),
        waitOn(codex, "wait-1", ["thread-a"]),
      ])).toEqual({ helperCount: 1, since: START + 2_000 });
    });

    test("waiting on both workers waits on two", () => {
      expect(run((codex) => [
        spawnWorker(codex, "spawn-a", "thread-a"),
        spawnWorker(codex, "spawn-b", "thread-b"),
        waitOn(codex, "wait-1", ["thread-a", "thread-b"]),
      ])?.helperCount).toBe(2);
    });

    test("a worker that finishes during the wait stops counting", () => {
      expect(run((codex) => [
        spawnWorker(codex, "spawn-a", "thread-a"),
        spawnWorker(codex, "spawn-b", "thread-b"),
        waitOn(codex, "wait-1", ["thread-a", "thread-b"]),
        finish(codex, "thread-a"),
      ])?.helperCount).toBe(1);
    });

    test("two waits on the same worker count it once", () => {
      expect(run((codex) => [
        spawnWorker(codex, "spawn-a", "thread-a"),
        spawnWorker(codex, "spawn-b", "thread-b"),
        [...waitOn(codex, "wait-1", ["thread-a"]), ...waitOn(codex, "wait-2", ["thread-a"])],
      ])?.helperCount).toBe(1);
    });
  });

  test("Claude: two parallel subagent calls wait on two, and a returned one stops counting", () => {
    const calls = [
      tool("agent-1", "Agent", { input: JSON.stringify({ description: "Review", prompt: "Look" }) }),
      tool("agent-2", "Agent", { input: JSON.stringify({ description: "Test", prompt: "Run" }) }),
    ];
    expect(resolveTurnWaitTarget(snapshot({ batches: [{ at: START, events: calls }] }))?.helperCount).toBe(2);
    const oneReturned = snapshot({
      batches: [
        { at: START, events: calls },
        { at: START + 5_000, events: [{ type: "tool_result", tool_use_id: "agent-1", output: "Reviewed." }] },
      ],
    });
    expect(resolveTurnWaitTarget(oneReturned)?.helperCount).toBe(1);
  });

  test("a call the model is still writing is work, not a wait", () => {
    const activity = snapshot({
      batches: [{ at: START, events: [tool("agent-1", "Agent", { state: "input-streaming" })] }],
    });
    expect(resolveTurnWaitTarget(activity)).toBeNull();
  });

  test("a turn with nothing open on its main loop is not waiting", () => {
    const activity = snapshot({ batches: [{ at: START, events: [{ type: "text", text: "Thinking it over" }] }] });
    expect(resolveTurnWaitTarget(activity)).toBeNull();
  });
});

describe("run progress", () => {
  const working = () =>
    snapshot({
      batches: [
        { at: START, events: [tool("read-1", "Read", { input: JSON.stringify({ file_path: "src/a.ts" }) })] },
        { at: START + 30_000, events: [tool("edit-1", "Edit", { input: JSON.stringify({ file_path: "src/a.ts" }) })] },
      ],
    });

  test("working names the latest step, the to-do count and the run time", () => {
    const progress = buildRunProgress({
      activity: working(),
      activeTurnId: "turn-1",
      todo: { done: 2, total: 5 },
      now: START + 190_000,
    })!;
    expect(progress.kind).toBe("working");
    expect(progress.step).toBe("Edit file");
    expect(progress.durationMs).toBe(190_000);
    expect(formatRunProgressLabel(progress)).toBe("Edit file · 2/5 · 3m 10s");
  });

  test("working without a reported step or to-dos says it is working", () => {
    const activity = snapshot({ batches: [{ at: START, events: [{ type: "text", text: "Hi" }] }] });
    const progress = buildRunProgress({ activity, activeTurnId: "turn-1", todo: { done: 0, total: 0 }, now: START + 4_000 })!;
    expect(progress.todo).toBeNull();
    expect(formatRunProgressLabel(progress)).toBe("Working · 4s");
  });

  test("stalled measures the quiet time and drops the step", () => {
    const activity = { ...working(), stalledAt: START + 330_000 };
    const progress = buildRunProgress({ activity, activeTurnId: "turn-1", todo: { done: 1, total: 3 }, now: START + 390_000 })!;
    expect(progress.kind).toBe("stalled");
    expect(progress.durationMs).toBe(360_000);
    expect(formatRunProgressLabel(progress)).toBe("No output · 6m");
  });

  test("waiting measures from the blocking call and counts the helpers", () => {
    const activity = snapshot({
      batches: [
        { at: START + 10_000, events: [tool("agent-1", "Agent", { input: JSON.stringify({ description: "Review", prompt: "Look" }) })] },
        { at: START + 12_000, events: [tool("agent-2", "Task", { input: JSON.stringify({ description: "Test", prompt: "Run" }) })] },
      ],
    });
    const progress = buildRunProgress({ activity, activeTurnId: "turn-1", now: START + 70_000 })!;
    expect(progress.kind).toBe("waiting");
    expect(progress.helperCount).toBe(2);
    expect(formatRunProgressLabel(progress)).toBe("Waiting on 2 helpers · 1m");
    expect(formatRunProgressLabel({ ...progress, helperCount: 1 })).toBe("Waiting on 1 helper · 1m");
    expect(formatRunProgressLabel({ ...progress, helperCount: 0 })).toBe("Waiting on background work · 1m");
  });

  test("a stall outranks a wait", () => {
    const activity = snapshot({
      batches: [{ at: START, events: [tool("agent-1", "Agent", { input: JSON.stringify({ description: "Review", prompt: "Look" }) })] }],
    });
    const progress = buildRunProgress({
      activity: { ...activity, stalledAt: START + 300_000 },
      activeTurnId: "turn-1",
      now: START + 301_000,
    })!;
    expect(progress.kind).toBe("stalled");
  });

  test("no live turn, a stale snapshot, a person's turn or a failing turn shows no progress", () => {
    const activity = working();
    const now = START + 60_000;
    expect(buildRunProgress({ activity: null, activeTurnId: "turn-1", now })).toBeNull();
    expect(buildRunProgress({ activity, activeTurnId: null, now })).toBeNull();
    expect(buildRunProgress({ activity, activeTurnId: "turn-2", now })).toBeNull();
    expect(buildRunProgress({ activity: { ...activity, completedAt: now }, activeTurnId: "turn-1", now })).toBeNull();
    expect(buildRunProgress({ activity: { ...activity, pendingInteraction: "approval" }, activeTurnId: "turn-1", now })).toBeNull();
    expect(buildRunProgress({ activity: { ...activity, turnError: "boom" }, activeTurnId: "turn-1", now })).toBeNull();
  });
});

describe("which task a workspace row speaks for", () => {
  const live = (overrides: Partial<ProviderTurnActivitySnapshot>, turnId: string) => ({
    ...snapshot({ batches: [{ at: START, events: [{ type: "text", text: "Hi" }] }] }),
    turnId,
    ...overrides,
  });

  test("a quiet turn leads, then own work over a person's turn, then the newest", () => {
    const tasks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const activeTurnIdsByTask = { a: "ta", b: "tb", c: "tc", d: "td" };
    const activityByTask = {
      a: live({ startedAt: START + 1 }, "ta"),
      b: live({ startedAt: START + 9, pendingInteraction: "approval" }, "tb"),
      c: live({ startedAt: START + 5 }, "tc"),
      d: live({ startedAt: START, stalledAt: START + 300_000 }, "td"),
    };
    expect(selectWorkspaceRunTask({ tasks, activeTurnIdsByTask, activityByTask })?.taskId).toBe("d");
    const withoutStall = { a: activityByTask.a, b: activityByTask.b, c: activityByTask.c };
    expect(selectWorkspaceRunTask({ tasks, activeTurnIdsByTask, activityByTask: withoutStall })?.taskId).toBe("c");
    expect(
      selectWorkspaceRunTask({ tasks, activeTurnIdsByTask, activityByTask: { b: activityByTask.b } })?.taskId,
    ).toBe("b");
  });

  test("archived tasks, stale snapshots and finished turns are not live", () => {
    expect(
      selectWorkspaceRunTask({
        tasks: [{ id: "a" }, { id: "b" }, { id: "c", archivedAt: "2026-10-01T00:00:00.000Z" }],
        activeTurnIdsByTask: { a: "ta", b: "tb", c: "tc" },
        activityByTask: {
          a: live({}, "old-turn"),
          b: live({ completedAt: START + 1 }, "tb"),
          c: live({}, "tc"),
        },
      }),
    ).toBeNull();
  });
});
