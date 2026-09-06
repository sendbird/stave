import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { createTaskSupervisorRuntime } from "../electron/host-service/task-supervisor-runtime";
import { TaskHeartbeatStore } from "../electron/persistence/task-heartbeat-store";
import type { TaskSupervisionSnapshot } from "../electron/host-service/local-mcp-runtime";
import {
  buildTaskCompletionSignalKey,
  buildTaskHeartbeatCompletionIdempotencyKey,
  buildTaskHeartbeatIdempotencyKey,
  TASK_HEARTBEAT_LIMITS,
  type TaskCompletionSignal,
  type TaskHeartbeatUpsertInput,
} from "@/lib/automation/task-supervisor";

function completionSignal(
  overrides: Partial<TaskCompletionSignal> = {},
): TaskCompletionSignal {
  return {
    runId: "child-task:task-1:review",
    stepId: "child-task:task-1:review:turn",
    childTaskId: "task-child-1",
    providerId: "claude-code",
    status: "completed",
    reason: null,
    // After the harness's default heartbeat creation instant (00:00): only
    // work that finishes after the heartbeat exists is signalable.
    completedAt: "2026-08-10T00:30:00.000Z",
    attempt: 1,
    ...overrides,
  };
}

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

test("unsupported automatic wake-up providers are rejected before saving a heartbeat", async () => {
  for (const providerId of ["cursor", "kiro"] as const) {
    const harness = createHarness();
    harness.setSnapshot({ providerId });
    await expect(harness.runtime.create(createInput())).rejects.toThrow("available for Claude and Codex");
    expect(harness.store.list()).toEqual([]);
    expect(harness.getRunCalls()).toEqual([]);
  }
});

function createHarness(args?: {
  initialNow?: string;
  /** Omit entirely to model a supervisor with no run-ledger reader wired. */
  completions?: TaskCompletionSignal[];
  omitCompletionReader?: boolean;
}) {
  const store = new TaskHeartbeatStore(new Database(":memory:"));
  let completions: TaskCompletionSignal[] = args?.completions ?? [];
  let completionError: Error | null = null;
  let completionReads = 0;
  let currentNow = new Date(args?.initialNow ?? "2026-08-10T00:00:00.000Z");
  let intervalCallback: (() => void) | null = null;
  let turnCounter = 0;
  let runError: Error | null = null;
  const runCalls: Array<{
    workspaceId: string;
    taskId: string;
    prompt: string;
    fingerprint?: { providerId: string; model: string };
    retrievedContextParts?: unknown[];
  }> = [];
  const wakeFailures: Array<{
    taskId: string;
    triggerKind: string;
    detail: string;
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
    ...(args?.omitCompletionReader
      ? {}
      : {
          listCompletedDelegatedRuns: async () => {
            completionReads += 1;
            if (completionError) {
              throw completionError;
            }
            return completions;
          },
        }),
    runHeartbeatTurn: async (runArgs) => {
      runCalls.push(runArgs);
      if (runError) {
        throw runError;
      }
      turnCounter += 1;
      return { turnId: `turn-${turnCounter}` };
    },
    notifyHeartbeatWakeFailed: (failure) => {
      wakeFailures.push({
        taskId: failure.taskId,
        triggerKind: failure.triggerKind,
        detail: failure.detail,
      });
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
    getWakeFailures: () => wakeFailures,
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
    setCompletions: (next: TaskCompletionSignal[]) => {
      completions = next;
    },
    setCompletionError: (error: Error | null) => {
      completionError = error;
    },
    getCompletionReads: () => completionReads,
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

  test("accepts a completion trigger and gives it no schedule to run on", async () => {
    const harness = createHarness();

    const heartbeat = await harness.runtime.create(
      createInput({ trigger: { kind: "completion" } }),
    );

    expect(heartbeat.trigger.kind).toBe("completion");
    expect(heartbeat.nextRunAt).toBeNull();
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

describe("task supervisor runtime — completion trigger", () => {
  const completionInput = (
    overrides: Partial<TaskHeartbeatUpsertInput> = {},
  ) =>
    createInput({
      trigger: { kind: "completion" },
      prompt: "Delegated work finished — fold the result into the plan.",
      ...overrides,
    });

  /** `start()` performs the first tick, exactly as the host service does. */
  async function arm(harness: ReturnType<typeof createHarness>) {
    harness.runtime.start();
    await harness.drain();
  }

  test("one finished delegated run produces exactly one follow-up turn", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    await harness.runtime.create(completionInput());

    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(1);
    expect(harness.getRunCalls()[0]).toMatchObject({
      workspaceId: "ws-1",
      taskId: "task-1",
      prompt: "Delegated work finished — fold the result into the plan.",
    });
    const stored = harness.store.getByTaskId("task-1")!;
    expect(stored.occurrenceCount).toBe(1);
    expect(stored.state).toBe("scheduled");
    // A completion heartbeat waits on the ledger, not on the clock.
    expect(stored.nextRunAt).toBeNull();
  });

  test("the same completion delivered again is a no-op", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());

    await arm(harness);
    await harness.tick();
    harness.setNow("2026-08-10T06:00:00.000Z");
    await harness.tick();

    // Three ticks, one durable completion, one turn. This is the guarantee.
    expect(harness.getRunCalls()).toHaveLength(1);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(1);
    const fired = harness.store
      .listOccurrences({ heartbeatId: heartbeat.id })
      .filter((occurrence) => occurrence.outcome === "fired");
    expect(fired).toHaveLength(1);
    expect(fired[0]?.turnId).toBe("turn-1");
    expect(fired[0]?.idempotencyKey).toBe(
      buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: heartbeat.id,
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(completionSignal()),
      }),
    );
  });

  test("a duplicate row already in the store cannot start a second turn", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    // A delivery recorded before this process started: the durable row exists,
    // so the completion is already spent.
    harness.store.recordOccurrence({
      id: randomUUID(),
      heartbeatId: heartbeat.id,
      idempotencyKey: buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: heartbeat.id,
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(completionSignal()),
      }),
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: "turn-from-a-previous-run",
      outcome: "fired",
      reason: null,
      scheduledFor: completionSignal().completedAt,
      recordedAt: "2026-08-09T23:59:30.000Z",
    });

    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(0);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(0);
  });

  test("several completions in one tick coalesce into a single turn", async () => {
    const harness = createHarness({
      completions: [
        completionSignal({
          runId: "child-task:task-1:a",
          stepId: "child-task:task-1:a:turn",
          childTaskId: "task-child-a",
          completedAt: "2026-08-10T00:10:00.000Z",
        }),
        completionSignal({
          runId: "child-task:task-1:b",
          stepId: "child-task:task-1:b:turn",
          childTaskId: "task-child-b",
          status: "failed",
          reason: "The child task ran out of attempts.",
          completedAt: "2026-08-10T00:20:00.000Z",
        }),
      ],
    });
    const heartbeat = await harness.runtime.create(completionInput());

    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(1);
    // One wake-up, but both completions are durably consumed so neither can
    // wake the task a second time.
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(1);
    const fired = harness.store
      .listOccurrences({ heartbeatId: heartbeat.id })
      .filter((occurrence) => occurrence.outcome === "fired");
    expect(fired).toHaveLength(2);
    expect(fired.every((occurrence) => occurrence.turnId === "turn-1")).toBe(true);

    const context = harness.getRunCalls()[0]?.retrievedContextParts?.[0] as {
      title: string;
      content: string;
    };
    expect(context.title).toBe("Delegated Work Finished");
    expect(context.content).toContain("task-child-a");
    expect(context.content).toContain("task-child-b");
    expect(context.content).toContain("failed");
    expect(context.content).toContain("The child task ran out of attempts.");
  });

  test("a completion that arrives later wakes the task again", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    await arm(harness);

    harness.setCompletions([
      completionSignal(),
      completionSignal({
        runId: "child-task:task-1:second",
        stepId: "child-task:task-1:second:turn",
        childTaskId: "task-child-2",
        completedAt: "2026-08-10T02:00:00.000Z",
      }),
    ]);
    harness.setNow("2026-08-10T02:00:05.000Z");
    await harness.tick();

    expect(harness.getRunCalls()).toHaveLength(2);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(2);
    // The already-consumed one did not ride along a second time.
    const second = harness.getRunCalls()[1]?.retrievedContextParts?.[0] as {
      content: string;
    };
    expect(second.content).toContain("task-child-2");
    expect(second.content).not.toContain("task-child-1");
  });

  test("both provider runtimes behave identically", async () => {
    const results: Array<{ runs: number; occurrences: number }> = [];
    for (const providerId of ["claude-code", "codex"] as const) {
      const harness = createHarness({
        completions: [
          completionSignal({ providerId }),
          completionSignal({
            runId: "child-task:task-1:second",
            stepId: "child-task:task-1:second:turn",
            providerId,
            completedAt: "2026-08-10T00:40:00.000Z",
          }),
        ],
      });
      harness.setSnapshot({ providerId, model: "any-model" });
      const heartbeat = await harness.runtime.create(completionInput());
      await arm(harness);
      await harness.tick();

      results.push({
        runs: harness.getRunCalls().length,
        occurrences: harness.store.get(heartbeat.id)!.occurrenceCount,
      });
    }

    // The completion signal is a run-ledger fact, so the provider must make no
    // difference at all. A divergence here means someone made it
    // provider-specific without saying so.
    expect(results[0]).toEqual(results[1]!);
    expect(results[0]).toEqual({ runs: 1, occurrences: 1 });
  });

  test("the user's turn wins: a completion defers and is not consumed", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    harness.setSnapshot({ activeTurnId: "user-turn-1" });

    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(0);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(0);
    expect(
      harness.store
        .listOccurrences({ heartbeatId: heartbeat.id })
        .map((occurrence) => occurrence.outcome),
    ).toEqual(["deferred"]);

    harness.setSnapshot({ activeTurnId: null });
    await harness.tick();

    // Deferring did not spend the completion, so it fires once the task frees.
    expect(harness.getRunCalls()).toHaveLength(1);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(1);
  });

  test("a pending approval pauses instead of piling a completion turn on", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    harness.setSnapshot({ pendingApprovalCount: 1 });

    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(0);
    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "paused",
      pauseReason: "awaiting-approval",
    });

    harness.setSnapshot({ pendingApprovalCount: 0 });
    await harness.tick();
    await harness.tick();

    // The pause resumed itself and the completion — still unconsumed — fired.
    expect(harness.getRunCalls()).toHaveLength(1);
  });

  test("the occurrence cap ends the wake chain with a stated reason", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(
      completionInput({ maxOccurrences: 1 }),
    );

    await arm(harness);

    expect(harness.store.get(heartbeat.id)).toMatchObject({
      state: "stopped",
      stopReason: "occurrence-cap-reached",
    });
    expect(harness.store.get(heartbeat.id)!.reasonDetail).toContain("limit of 1");

    // A stopped heartbeat never wakes again, however much work finishes.
    harness.setCompletions([
      completionSignal(),
      completionSignal({
        runId: "child-task:task-1:third",
        stepId: "child-task:task-1:third:turn",
        completedAt: "2026-08-10T03:00:00.000Z",
      }),
    ]);
    await harness.tick();
    expect(harness.getRunCalls()).toHaveLength(1);
  });

  test("an uncapped completion heartbeat is bounded anyway", async () => {
    const harness = createHarness();
    const heartbeat = await harness.runtime.create(
      completionInput({ maxOccurrences: null }),
    );

    expect(heartbeat.maxOccurrences).toBe(
      TASK_HEARTBEAT_LIMITS.defaultCompletionOccurrenceCap,
    );
  });

  test("an unobservable completion heartbeat is refused rather than left waiting", async () => {
    const harness = createHarness({ omitCompletionReader: true });

    await expect(harness.runtime.create(completionInput())).rejects.toThrow(
      /cannot observe/i,
    );
    expect(harness.store.getByTaskId("task-1")).toBeNull();
  });

  test("a heartbeat that loses observability stops with an explicit reason, not silence", async () => {
    const observable = createHarness({ completions: [completionSignal()] });
    const created = await observable.runtime.create(completionInput());

    // Re-open the same durable row on a supervisor with no ledger reader — the
    // shape a stale or partially wired host takes.
    const blind = createHarness({ omitCompletionReader: true });
    blind.store.upsert(created);
    await arm(blind);

    const stopped = blind.store.get(created.id)!;
    expect(stopped.state).toBe("stopped");
    expect(stopped.stopReason).toBe("completion-unobservable");
    expect(stopped.reasonDetail).toContain("cannot observe");
    expect(blind.getRunCalls()).toHaveLength(0);
  });

  test("a transient ledger read failure idles rather than stopping for good", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    harness.setCompletionError(new Error("database is locked"));

    await arm(harness);

    // Observability is about wiring, not about one failed read.
    expect(harness.store.get(heartbeat.id)!.state).toBe("scheduled");
    expect(harness.getRunCalls()).toHaveLength(0);

    harness.setCompletionError(null);
    await harness.tick();
    expect(harness.getRunCalls()).toHaveLength(1);
  });

  test("a failed completion turn records why and leaves the heartbeat live", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    harness.setRunError(new Error("The task started a turn just now."));

    await arm(harness);

    expect(harness.store.get(heartbeat.id)!.state).toBe("scheduled");
    const skipped = harness.store
      .listOccurrences({ heartbeatId: heartbeat.id })
      .find((occurrence) => occurrence.outcome === "skipped");
    expect(skipped?.reason).toBe("The task started a turn just now.");

    // The completion stays consumed: retrying it risks a second turn for work
    // that may already have been reported.
    harness.setRunError(null);
    await harness.tick();
    expect(harness.getRunCalls()).toHaveLength(1);
  });

  test("a consumed completion that never became a turn is reported, not swallowed", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    harness.setRunError(new Error("The task started a turn just now."));

    await arm(harness);

    // The receipt is spent, so the contract's other half applies: one turn OR
    // one terminal notification, never neither.
    expect(harness.getWakeFailures()).toHaveLength(1);
    expect(harness.getWakeFailures()[0]).toMatchObject({
      taskId: "task-1",
      triggerKind: "completion",
    });
    expect(harness.getWakeFailures()[0]?.detail).toContain(
      "The task started a turn just now.",
    );
    // Marked against the consumed row itself, which is how the boot sweep tells
    // a reported failure from a wake-up lost to a crash.
    const consumedKey = buildTaskHeartbeatCompletionIdempotencyKey({
      heartbeatId: heartbeat.id,
      outcome: "fired",
      signalKey: buildTaskCompletionSignalKey(completionSignal()),
    });
    expect(
      harness.store
        .listOccurrences({ heartbeatId: heartbeat.id })
        .map((occurrence) => occurrence.idempotencyKey),
    ).toContain(`${consumedKey}:error`);
  });

  test("a wake-up lost to a crash is reported once at the next boot", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(completionInput());
    // Exactly the crash window: the occurrence was written, then the process
    // died before `runHeartbeatTurn` could attach a turn to it.
    harness.store.recordOccurrence({
      id: randomUUID(),
      heartbeatId: heartbeat.id,
      idempotencyKey: buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: heartbeat.id,
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(completionSignal()),
      }),
      workspaceId: "ws-1",
      taskId: "task-1",
      turnId: null,
      outcome: "fired",
      reason: null,
      scheduledFor: "2026-08-09T23:59:00.000Z",
      recordedAt: "2026-08-09T23:59:01.000Z",
    });

    await arm(harness);

    expect(harness.getWakeFailures()).toHaveLength(1);
    expect(harness.getWakeFailures()[0]?.detail).toContain("Stave stopped");
    // The already-consumed completion does not also start a turn on this boot.
    expect(harness.getRunCalls()).toHaveLength(0);

    harness.runtime.stop();
    harness.runtime.start();
    await harness.drain();

    // Reported once, not once per restart.
    expect(harness.getWakeFailures()).toHaveLength(1);
  });

  test("the task is woken as itself, not as the caller's default provider", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    harness.setSnapshot({ providerId: "codex", model: "gpt-5-codex" });
    await harness.runtime.create(completionInput());

    await arm(harness);

    // A Codex task resumed under the Claude default would be a different agent
    // answering in the same conversation.
    expect(harness.getRunCalls()[0]?.fingerprint).toEqual({
      providerId: "codex",
      model: "gpt-5-codex",
    });
  });

  test("a schedule heartbeat never reads the ledger", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    await harness.runtime.create(createInput());

    await arm(harness);
    harness.setNow("2026-08-10T02:00:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls()).toHaveLength(1);
    expect(harness.getCompletionReads()).toBe(0);
  });

  test("a completion heartbeat still cannot be moved to another task", async () => {
    const harness = createHarness({ completions: [] });
    const heartbeat = await harness.runtime.create(completionInput());

    await expect(
      harness.runtime.update({
        id: heartbeat.id,
        input: completionInput({ taskId: "task-2" }),
      }),
    ).rejects.toThrow(/cannot be moved/i);
  });

  test("a retried delegation that fails again wakes the parent again", async () => {
    // Same run, same step — a retry bumps only the attempt. The first failure
    // is consumed; the second must not be deduped against it.
    const failure = (attempt: number, completedAt: string) =>
      completionSignal({
        status: "failed",
        reason: "boom",
        attempt,
        completedAt,
      });
    const harness = createHarness({
      completions: [failure(1, "2026-08-10T00:30:00.000Z")],
    });
    const heartbeat = await harness.runtime.create(completionInput());
    await arm(harness);

    expect(harness.getRunCalls()).toHaveLength(1);

    harness.setCompletions([failure(2, "2026-08-10T01:30:00.000Z")]);
    harness.setNow("2026-08-10T01:31:00.000Z");
    await harness.tick();

    expect(harness.getRunCalls()).toHaveLength(2);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(2);
    // Re-delivering the retried failure is still a no-op.
    await harness.tick();
    expect(harness.getRunCalls()).toHaveLength(2);
  });

  test("creating a completion heartbeat does not consume work that finished before it", async () => {
    const stale = completionSignal({
      completedAt: "2026-08-09T20:00:00.000Z",
    });
    const harness = createHarness({ completions: [stale] });
    const heartbeat = await harness.runtime.create(completionInput());
    await arm(harness);

    // The child finished before the heartbeat existed, so creation must not
    // trigger a burst of wake-ups for old receipts.
    expect(harness.getRunCalls()).toHaveLength(0);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(0);

    // Work finishing after the heartbeat exists still wakes it.
    harness.setCompletions([
      stale,
      completionSignal({
        runId: "child-task:task-1:fresh",
        stepId: "child-task:task-1:fresh:turn",
        childTaskId: "task-child-fresh",
        completedAt: "2026-08-10T01:00:00.000Z",
      }),
    ]);
    harness.setNow("2026-08-10T01:00:05.000Z");
    await harness.tick();

    expect(harness.getRunCalls()).toHaveLength(1);
    const context = harness.getRunCalls()[0]?.retrievedContextParts?.[0] as {
      content: string;
    };
    expect(context.content).toContain("task-child-fresh");
    expect(context.content).not.toContain("task-child-1");
  });

  test("a stopped heartbeat refuses an update instead of resurrecting", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(
      completionInput({ maxOccurrences: 1 }),
    );
    await arm(harness);

    expect(harness.store.get(heartbeat.id)!.state).toBe("stopped");
    await expect(
      harness.runtime.update({ id: heartbeat.id, input: completionInput() }),
    ).rejects.toThrow(/stopped for good/i);
    expect(harness.store.get(heartbeat.id)!.state).toBe("stopped");
  });

  test("switching trigger kinds resets the fired count against the new cap", async () => {
    const harness = createHarness({ completions: [] });
    const heartbeat = await harness.runtime.create(createInput());
    harness.runtime.start();
    await harness.drain();
    harness.setNow("2026-08-10T01:00:00.000Z");
    await harness.tick();

    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(1);

    // A schedule that already fired must not arrive at the completion
    // trigger's default cap partly spent.
    await harness.runtime.update({
      id: heartbeat.id,
      input: completionInput(),
    });
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(0);

    // Same-kind updates keep the count.
    await harness.runtime.update({
      id: heartbeat.id,
      input: completionInput(),
    });
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(0);
  });
});

describe("completion idempotency survives history pruning", () => {
  /** `start()` performs the first tick, exactly as the host service does. */
  async function arm(harness: ReturnType<typeof createHarness>) {
    harness.runtime.start();
    await harness.drain();
  }

  test("a burst of deferrals cannot evict the row that proves a completion was consumed", async () => {
    const harness = createHarness({ completions: [completionSignal()] });
    const heartbeat = await harness.runtime.create(
      createInput({
        trigger: { kind: "completion" },
        prompt: "Delegated work finished.",
      }),
    );

    await arm(harness);
    expect(harness.getRunCalls()).toHaveLength(1);

    // Flood the history with newer noise — more than the general retention cap.
    // Deferrals collapse by instant in real life, so this is written directly.
    for (let index = 0; index < 150; index += 1) {
      harness.store.recordOccurrence({
        id: randomUUID(),
        heartbeatId: heartbeat.id,
        idempotencyKey: `noise-${index}`,
        workspaceId: "ws-1",
        taskId: "task-1",
        turnId: null,
        outcome: "deferred",
        reason: "The task is mid-turn.",
        scheduledFor: "2026-08-10T00:00:00.000Z",
        recordedAt: new Date(
          Date.parse("2026-08-10T01:00:00.000Z") + index * 1000,
        ).toISOString(),
      });
    }
    harness.store.pruneOccurrences({ heartbeatId: heartbeat.id });

    harness.setNow("2026-08-10T05:00:00.000Z");
    await harness.tick();

    // The completion is still reported by the ledger. Without the fired-row
    // floor it would read as brand new and wake the task a second time.
    expect(harness.getRunCalls()).toHaveLength(1);
    expect(harness.store.get(heartbeat.id)!.occurrenceCount).toBe(1);
  });
});
