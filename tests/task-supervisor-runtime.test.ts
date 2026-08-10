import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { createTaskSupervisorRuntime } from "../electron/host-service/task-supervisor-runtime";
import { TaskHeartbeatStore } from "../electron/persistence/task-heartbeat-store";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import {
  buildTaskHeartbeatIdempotencyKey,
  type TaskHeartbeatUpsertInput,
} from "@/lib/automation/task-supervisor";

function createInput(
  overrides: Partial<TaskHeartbeatUpsertInput> = {},
): TaskHeartbeatUpsertInput {
  return {
    workspaceId: "ws-1",
    taskId: "task-1",
    prompt: "Re-check CI and report only if something changed.",
    trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
    maxOccurrences: null,
    expiresAt: null,
    ...overrides,
  };
}

function createHarness(args?: { initialNow?: string }) {
  const store = new TaskHeartbeatStore(new Database(":memory:"));
  let currentNow = new Date(args?.initialNow ?? "2026-08-10T00:00:00.000Z");
  let intervalCallback: (() => void) | null = null;
  let turnCounter = 0;
  let runError: Error | null = null;
  const runCalls: Array<{
    workspaceId: string;
    taskId: string;
    prompt: string;
    retrievedContextParts?: unknown[];
  }> = [];
  const completedTurnIds: string[] = [];
  let snapshot: TaskSupervisionSnapshot = {
    workspaceId: "ws-1",
    taskId: "task-1",
    projectPath: "/tmp/project",
    exists: true,
    archived: false,
    providerId: "claude-code",
    model: "sonnet",
    activeTurnId: null,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
  };

  const runtime = createTaskSupervisorRuntime({
    persistence: {
      listTaskHeartbeats: () => store.list(),
      listActiveTaskHeartbeats: () => store.listActive(),
      listTaskHeartbeatsForWorkspace: (workspaceId) =>
        store.listForWorkspace(workspaceId),
      getTaskHeartbeat: (id) => store.get(id),
      getTaskHeartbeatByTaskId: (taskId) => store.getByTaskId(taskId),
      upsertTaskHeartbeat: (heartbeat) => store.upsert(heartbeat),
      removeTaskHeartbeat: (id) => store.remove(id),
      recordTaskHeartbeatOccurrence: (occurrence) =>
        store.recordOccurrence(occurrence),
      attachTaskHeartbeatOccurrenceTurn: (attachArgs) =>
        store.attachOccurrenceTurn(attachArgs),
      listTaskHeartbeatOccurrences: (listArgs) => store.listOccurrences(listArgs),
      pruneTaskHeartbeatOccurrences: (pruneArgs) =>
        store.pruneOccurrences(pruneArgs),
      completeInterruptedTurn: ({ id }) => {
        completedTurnIds.push(id);
        return true;
      },
    },
    getTaskSupervisionSnapshot: async () => snapshot,
    runHeartbeatTurn: async (runArgs) => {
      runCalls.push(runArgs);
      if (runError) {
        throw runError;
      }
      turnCounter += 1;
      return { turnId: `turn-${turnCounter}` };
    },
    now: () => new Date(currentNow),
    setInterval: ((callback: () => void) => {
      intervalCallback = callback;
      return 1;
    }) as unknown as typeof globalThis.setInterval,
    clearInterval: (() => {
      intervalCallback = null;
    }) as typeof globalThis.clearInterval,
  });

  return {
    runtime,
    store,
    getRunCalls: () => runCalls,
    getCompletedTurnIds: () => completedTurnIds,
    setNow: (value: string) => {
      currentNow = new Date(value);
    },
    setSnapshot: (patch: Partial<TaskSupervisionSnapshot>) => {
      snapshot = { ...snapshot, ...patch };
    },
    setRunError: (error: Error | null) => {
      runError = error;
    },
    /** Awaiting any enqueued method drains the serialized operation chain. */
    drain: async () => {
      await runtime.list();
    },
    tick: async () => {
      intervalCallback?.();
      await runtime.list();
    },
  };
}

describe("task supervisor runtime", () => {
  test("wakes the existing task when the instant comes due", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    const calls = harness.getRunCalls();
    expect(calls.length).toBe(1);
    expect(calls[0]).toMatchObject({
      workspaceId: "ws-1",
      taskId: "task-1",
      prompt: "Re-check CI and report only if something changed.",
    });
    // The woken model is told it was woken, so it does not ask a question
    // nobody is present to answer.
    expect(JSON.stringify(calls[0]?.retrievedContextParts)).toContain(
      "stave:task-heartbeat",
    );

    const stored = harness.store.get(heartbeat.id);
    expect(stored?.occurrenceCount).toBe(1);
    expect(stored?.nextRunAt).toBe("2026-08-10T02:00:00.000Z");
    const occurrences = harness.store.listOccurrences({
      heartbeatId: heartbeat.id,
    });
    expect(occurrences.length).toBe(1);
    expect(occurrences[0]).toMatchObject({
      outcome: "fired",
      scheduledFor: "2026-08-10T01:00:00.000Z",
      turnId: "turn-1",
    });
  });

  test("does not wake the task before the instant is due", async () => {
    const harness = createHarness();
    await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T00:59:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
  });

  test("defers to the user's turn, then fires that same instant once free", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    harness.setSnapshot({ activeTurnId: "user-turn-1" });
    await harness.tick();
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    // Repeated deferrals of one instant collapse into a single record.
    const deferred = harness.store
      .listOccurrences({ heartbeatId: heartbeat.id })
      .filter((occurrence) => occurrence.outcome === "deferred");
    expect(deferred.length).toBe(1);
    expect(harness.store.get(heartbeat.id)?.nextRunAt).toBe(
      "2026-08-10T01:00:00.000Z",
    );

    harness.setSnapshot({ activeTurnId: null });
    harness.setNow("2026-08-10T01:02:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(1);
    expect(
      harness.store
        .listOccurrences({ heartbeatId: heartbeat.id })
        .find((occurrence) => occurrence.outcome === "fired")?.scheduledFor,
    ).toBe("2026-08-10T01:00:00.000Z");
  });

  test("pauses while an approval is pending and resumes itself once answered", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    harness.setSnapshot({ pendingApprovalCount: 1 });
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "awaiting-approval",
      reasonDetail: "The task is waiting on an approval.",
    });

    harness.setSnapshot({ pendingApprovalCount: 0 });
    harness.setNow("2026-08-10T01:10:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "scheduled",
      pauseReason: null,
      // Rescheduled from the resume, not fired as a backlog.
      nextRunAt: "2026-08-10T02:10:00.000Z",
    });
    expect(harness.getRunCalls().length).toBe(0);
  });

  test("pauses when the task's provider runtime changed, until an update re-accepts it", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    harness.setSnapshot({ providerId: "codex", model: "gpt-5" });
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "runtime-changed",
    });

    // It must not clear itself: the user has to agree to the new runtime.
    await harness.tick();
    expect(harness.store.get(heartbeat.id)?.state).toBe("paused");

    await harness.runtime.update({ id: heartbeat.id, input: createInput() });
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "scheduled",
      pauseReason: null,
      fingerprint: { providerId: "codex", model: "gpt-5" },
    });
  });

  test("stops with a reason when the task is archived, and never wakes again", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    harness.setSnapshot({ archived: true });
    await harness.tick();

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "stopped",
      stopReason: "task-unavailable",
      nextRunAt: null,
    });

    harness.setSnapshot({ archived: false });
    harness.setNow("2026-08-10T05:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    expect(harness.store.get(heartbeat.id)?.state).toBe("stopped");
  });

  test("stops once the occurrence cap is reached", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(
      createInput({ maxOccurrences: 1 }),
    );
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();
    harness.setNow("2026-08-10T02:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(1);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "stopped",
      stopReason: "occurrence-cap-reached",
    });
  });

  test("a restart catches up exactly once: latest instant fires, earlier ones are skipped", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());

    // Stave was closed from 00:00 to 04:30. Four instants came due.
    harness.setNow("2026-08-10T04:30:00.000Z");
    harness.runtime.start();
    await harness.drain();

    expect(harness.getRunCalls().length).toBe(1);
    const occurrences = harness.store.listOccurrences({
      heartbeatId: heartbeat.id,
    });
    expect(
      occurrences.filter((occurrence) => occurrence.outcome === "fired"),
    ).toMatchObject([{ scheduledFor: "2026-08-10T04:00:00.000Z" }]);
    expect(
      occurrences
        .filter((occurrence) => occurrence.outcome === "skipped")
        .map((occurrence) => occurrence.scheduledFor)
        .sort(),
    ).toEqual([
      "2026-08-10T01:00:00.000Z",
      "2026-08-10T02:00:00.000Z",
      "2026-08-10T03:00:00.000Z",
    ]);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      occurrenceCount: 1,
      skippedCount: 3,
      nextRunAt: "2026-08-10T05:00:00.000Z",
    });
  });

  test("a duplicate delivery of one instant starts only one turn", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    // Simulate the same instant already having been delivered and recorded.
    harness.store.recordOccurrence({
      id: randomUUID(),
      heartbeatId: heartbeat.id,
      idempotencyKey: buildTaskHeartbeatIdempotencyKey({
        heartbeatId: heartbeat.id,
        outcome: "fired",
        scheduledFor: "2026-08-10T01:00:00.000Z",
      }),
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: "turn-earlier",
      outcome: "fired",
      reason: null,
      scheduledFor: "2026-08-10T01:00:00.000Z",
      recordedAt: "2026-08-10T01:00:00.000Z",
    });

    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    // The schedule still advances, so the duplicate cannot wedge the heartbeat,
    // but it must not consume a slot of the occurrence cap either.
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      nextRunAt: "2026-08-10T02:00:00.000Z",
      occurrenceCount: 0,
    });
  });

  test("a workspace that momentarily fails to load pauses instead of stopping", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setNow("2026-08-10T01:00:00.000Z");
    harness.setSnapshot({ exists: false, projectPath: null });
    await harness.tick();

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "task-identity-changed",
    });

    // Recoverable: once the workspace reads again it resumes on its own.
    harness.setSnapshot({ exists: true, projectPath: "/tmp/project" });
    harness.setNow("2026-08-10T01:05:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "scheduled",
      pauseReason: null,
    });
  });

  test("an approval arriving during a manual pause does not later auto-resume it", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    await harness.runtime.pause({ id: heartbeat.id });
    harness.setSnapshot({ pendingApprovalCount: 1 });
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)?.pauseReason).toBe("paused-by-user");

    harness.setSnapshot({ pendingApprovalCount: 0 });
    harness.setNow("2026-08-10T02:00:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "paused-by-user",
    });
    expect(harness.getRunCalls().length).toBe(0);
  });

  test("a failed start is recorded but does not stop the heartbeat", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    harness.setRunError(new Error("Task already has an active turn: task-1"));
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)?.state).toBe("scheduled");
    expect(
      harness.store
        .listOccurrences({ heartbeatId: heartbeat.id })
        .find((occurrence) => occurrence.outcome === "skipped")?.reason,
    ).toContain("active turn");

    harness.setRunError(null);
    harness.setNow("2026-08-10T02:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(2);
  });

  test("closes a turn interrupted by a restart so the heartbeat is not stuck deferring", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    harness.runtime.stop();
    harness.runtime.start();
    await harness.drain();

    expect(harness.getCompletedTurnIds()).toContain("turn-1");
    expect(harness.store.get(heartbeat.id)?.state).toBe("scheduled");
  });

  test("refuses a second heartbeat on the same task", async () => {
    const harness = createHarness();
    await harness.runtime.create(createInput());

    await expect(harness.runtime.create(createInput())).rejects.toThrow(
      "already has a heartbeat",
    );
  });

  test("refuses to move a heartbeat to another task", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());

    await expect(
      harness.runtime.update({
        id: heartbeat.id,
        input: createInput({ taskId: "task-2" }),
      }),
    ).rejects.toThrow("cannot be moved");
  });

  test("refuses a completion trigger until its executor exists", async () => {
    const harness = createHarness();

    await expect(
      harness.runtime.create(createInput({ trigger: { kind: "completion" } })),
    ).rejects.toThrow("not implemented yet");
  });

  test("refuses to create a heartbeat for a task that does not exist", async () => {
    const harness = createHarness();
    harness.setSnapshot({ exists: false });

    await expect(harness.runtime.create(createInput())).rejects.toThrow(
      "Task not found",
    );
  });

  test("a manual pause survives ticks and only a manual resume clears it", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();

    await harness.runtime.pause({ id: heartbeat.id });
    harness.setNow("2026-08-10T02:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls().length).toBe(0);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "paused-by-user",
    });

    await harness.runtime.resume({ id: heartbeat.id });
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "scheduled",
      nextRunAt: "2026-08-10T03:00:00.000Z",
    });
  });

  test("refuses to resume a heartbeat that stopped for good", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(
      createInput({ maxOccurrences: 1 }),
    );
    harness.runtime.start();
    await harness.drain();
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    await expect(harness.runtime.resume({ id: heartbeat.id })).rejects.toThrow(
      "stopped for good",
    );
  });

  test("removing a heartbeat clears its occurrence history", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    await harness.runtime.remove({ id: heartbeat.id });

    expect(harness.store.get(heartbeat.id)).toBeNull();
    expect(
      harness.store.listOccurrences({ heartbeatId: heartbeat.id }),
    ).toEqual([]);
  });
});

describe("task heartbeat store", () => {
  test("records an instant once, however many times it is delivered", () => {
    const store = new TaskHeartbeatStore(new Database(":memory:"));
    const occurrence = {
      id: randomUUID(),
      heartbeatId: "hb-1",
      idempotencyKey: buildTaskHeartbeatIdempotencyKey({
        heartbeatId: "hb-1",
        outcome: "fired" as const,
        scheduledFor: "2026-08-10T01:00:00.000Z",
      }),
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: null,
      outcome: "fired" as const,
      reason: null,
      scheduledFor: "2026-08-10T01:00:00.000Z",
      recordedAt: "2026-08-10T01:00:00.000Z",
    };

    expect(store.recordOccurrence(occurrence)).toBe(true);
    expect(store.recordOccurrence({ ...occurrence, id: randomUUID() })).toBe(
      false,
    );
    expect(store.listOccurrences({ heartbeatId: "hb-1" }).length).toBe(1);
  });
});
