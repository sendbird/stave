import { describe, expect, test } from "bun:test";
import {
  applyTaskHeartbeatDecision,
  buildTaskCompletionSignalKey,
  buildTaskHeartbeatCompletionIdempotencyKey,
  buildTaskHeartbeatIdempotencyKey,
  buildTaskHeartbeatUnreportedKey,
  classifyTaskCompletionObservability,
  collectDueTaskHeartbeatOccurrences,
  createTaskHeartbeat,
  decideTaskHeartbeatAction,
  resolveTaskHeartbeatOccurrenceCap,
  summarizeTaskHeartbeat,
  TaskHeartbeatOccurrenceSchema,
  TaskHeartbeatUpsertInputSchema,
  TASK_HEARTBEAT_LIMITS,
  type TaskCompletionSignal,
  type TaskHeartbeat,
  type TaskHeartbeatObservation,
  type TaskHeartbeatUpsertInput,
} from "@/lib/automation/task-supervisor";

const NOW = new Date("2026-08-10T00:00:00.000Z");

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

function createHeartbeat(overrides: Partial<TaskHeartbeat> = {}): TaskHeartbeat {
  return {
    ...createTaskHeartbeat({
      id: "hb-1",
      input: createInput(),
      projectPath: "/tmp/project",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: NOW,
    }),
    ...overrides,
  };
}

function observe(
  overrides: Partial<TaskHeartbeatObservation> = {},
): TaskHeartbeatObservation {
  return {
    workspaceAvailable: true,
    taskExists: true,
    taskArchived: false,
    hasActiveTurn: false,
    pendingApprovalCount: 0,
    pendingUserInputCount: 0,
    fingerprint: { providerId: "claude-code", model: "sonnet" },
    identity: { ok: true },
    completionObservability: "stave_owned",
    completions: [],
    ...overrides,
  };
}

function completion(
  overrides: Partial<TaskCompletionSignal> = {},
): TaskCompletionSignal {
  return {
    runId: "child-task:task-1:review",
    stepId: "child-task:task-1:review:turn",
    childTaskId: "task-child-1",
    providerId: "claude-code",
    status: "completed",
    reason: null,
    completedAt: "2026-08-09T23:59:00.000Z",
    ...overrides,
  };
}

describe("task heartbeat definition", () => {
  test("a heartbeat never creates a task: its definition must target one", () => {
    const definitionKeys = Object.keys(TaskHeartbeatUpsertInputSchema.shape);

    expect(definitionKeys).toContain("taskId");
    expect(definitionKeys).toContain("workspaceId");
    // A "title" or "name" would mean it can mint a task, which is a routine.
    expect(
      definitionKeys.filter((key) => /^(name|title|environment)$/.test(key)),
    ).toEqual([]);
    expect(
      TaskHeartbeatUpsertInputSchema.safeParse({
        ...createInput(),
        taskId: "",
      }).success,
    ).toBe(false);
  });

  test("rejects unknown keys so a stale caller cannot smuggle a task title", () => {
    const parsed = TaskHeartbeatUpsertInputSchema.safeParse({
      ...createInput(),
      title: "Mint me a task",
    });

    expect(parsed.success).toBe(false);
  });

  test("a new heartbeat is scheduled with no reason attached", () => {
    const heartbeat = createHeartbeat();

    expect(heartbeat.state).toBe("scheduled");
    expect(heartbeat.pauseReason).toBeNull();
    expect(heartbeat.stopReason).toBeNull();
    expect(heartbeat.nextRunAt).toBe("2026-08-10T01:00:00.000Z");
    expect(heartbeat.occurrenceCount).toBe(0);
  });
});

describe("catch-up", () => {
  test("fires the latest missed instant only and records the earlier ones", () => {
    const due = collectDueTaskHeartbeatOccurrences({
      schedule: { every: 1, unit: "hours" },
      nextRunAt: "2026-08-10T01:00:00.000Z",
      now: new Date("2026-08-10T04:30:00.000Z"),
    });

    expect(due.dueAt).toBe("2026-08-10T04:00:00.000Z");
    expect(due.skippedAt).toEqual([
      "2026-08-10T01:00:00.000Z",
      "2026-08-10T02:00:00.000Z",
      "2026-08-10T03:00:00.000Z",
    ]);
    expect(due.truncated).toBe(false);
    expect(due.nextRunAt).toBe("2026-08-10T05:00:00.000Z");
  });

  test("reports nothing due before the scheduled instant", () => {
    const due = collectDueTaskHeartbeatOccurrences({
      schedule: { every: 1, unit: "hours" },
      nextRunAt: "2026-08-10T01:00:00.000Z",
      now: new Date("2026-08-10T00:59:59.000Z"),
    });

    expect(due.dueAt).toBeNull();
    expect(due.skippedAt).toEqual([]);
    expect(due.nextRunAt).toBe("2026-08-10T01:00:00.000Z");
  });

  test("bounds the recorded skips after a long outage instead of replaying them", () => {
    const due = collectDueTaskHeartbeatOccurrences({
      schedule: { every: 1, unit: "minutes" },
      nextRunAt: "2026-08-01T00:00:00.000Z",
      now: new Date("2026-08-10T00:00:00.000Z"),
    });

    expect(due.dueAt).toBe("2026-08-10T00:00:00.000Z");
    expect(due.truncated).toBe(true);
    expect(due.skippedAt.length).toBe(TASK_HEARTBEAT_LIMITS.maxRecordedSkips);
    // Still exactly one occurrence fires, no matter how long the gap was.
    expect(due.nextRunAt).toBe("2026-08-10T00:01:00.000Z");
  });
});

describe("decision priority", () => {
  test("fires when the task is free and the instant is due", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe(),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "fire",
      dueAt: "2026-08-10T01:00:00.000Z",
      nextRunAt: "2026-08-10T02:00:00.000Z",
    });
  });

  test("defers to a user turn instead of racing it", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe({ hasActiveTurn: true }),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "defer",
      dueAt: "2026-08-10T01:00:00.000Z",
    });
  });

  test("a deferred instant is not consumed: the same instant fires once free", () => {
    const heartbeat = createHeartbeat();
    const deferred = decideTaskHeartbeatAction({
      heartbeat,
      observation: observe({ hasActiveTurn: true }),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });
    const after = applyTaskHeartbeatDecision({
      heartbeat,
      decision: deferred,
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(after.nextRunAt).toBe(heartbeat.nextRunAt);
    expect(
      decideTaskHeartbeatAction({
        heartbeat: after,
        observation: observe(),
        now: new Date("2026-08-10T01:00:10.000Z"),
      }),
    ).toMatchObject({ action: "fire", dueAt: "2026-08-10T01:00:00.000Z" });
  });

  test("pauses while an approval is pending, even before the instant is due", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe({ pendingApprovalCount: 1 }),
      now: new Date("2026-08-10T00:30:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "pause",
      reason: "awaiting-approval",
    });
  });

  test("pauses while a question is pending", () => {
    expect(
      decideTaskHeartbeatAction({
        heartbeat: createHeartbeat(),
        observation: observe({ pendingUserInputCount: 2 }),
        now: new Date("2026-08-10T01:00:00.000Z"),
      }),
    ).toMatchObject({ action: "pause", reason: "awaiting-user-input" });
  });

  test("pauses when the provider runtime the heartbeat agreed to changed", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe({
        fingerprint: { providerId: "codex", model: "gpt-5" },
      }),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({ action: "pause", reason: "runtime-changed" });
    expect(decision).toHaveProperty("detail");
  });

  test("pauses when the fleet control plane rejects the task identity", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe({
        identity: { ok: false, reason: "This task moved or is no longer loaded." },
      }),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "pause",
      reason: "task-identity-changed",
      detail: "This task moved or is no longer loaded.",
    });
  });

  test("clears its own pause once the condition lifts, but not a manual one", () => {
    const auto = createHeartbeat({
      state: "paused",
      pauseReason: "awaiting-approval",
      reasonDetail: "The task is waiting on an approval.",
    });
    const manual = createHeartbeat({
      state: "paused",
      pauseReason: "paused-by-user",
      reasonDetail: "Paused by the user.",
    });
    const now = new Date("2026-08-10T01:00:00.000Z");

    expect(
      decideTaskHeartbeatAction({ heartbeat: auto, observation: observe(), now }),
    ).toEqual({ action: "resume" });
    expect(
      decideTaskHeartbeatAction({ heartbeat: manual, observation: observe(), now }),
    ).toEqual({ action: "idle" });
  });

  test("a resumed heartbeat schedules from now rather than firing a backlog", () => {
    const paused = createHeartbeat({
      state: "paused",
      pauseReason: "awaiting-approval",
      reasonDetail: "The task is waiting on an approval.",
    });
    const resumedAt = new Date("2026-08-10T05:30:00.000Z");

    const resumed = applyTaskHeartbeatDecision({
      heartbeat: paused,
      decision: { action: "resume" },
      now: resumedAt,
    });

    expect(resumed.state).toBe("scheduled");
    expect(resumed.pauseReason).toBeNull();
    expect(resumed.reasonDetail).toBeNull();
    expect(resumed.nextRunAt).toBe("2026-08-10T06:30:00.000Z");
  });

  test("stops when the task is gone or archived, ahead of any pause", () => {
    const blocked = observe({
      pendingApprovalCount: 1,
      hasActiveTurn: true,
    });
    const now = new Date("2026-08-10T01:00:00.000Z");

    expect(
      decideTaskHeartbeatAction({
        heartbeat: createHeartbeat(),
        observation: { ...blocked, taskExists: false },
        now,
      }),
    ).toMatchObject({ action: "stop", reason: "task-unavailable" });
    expect(
      decideTaskHeartbeatAction({
        heartbeat: createHeartbeat(),
        observation: { ...blocked, taskArchived: true },
        now,
      }),
    ).toMatchObject({ action: "stop", reason: "task-unavailable" });
  });

  test("pauses rather than stopping when the workspace itself is unreadable", () => {
    // A momentarily unresolvable workspace must stay recoverable. Stopping is
    // terminal and refuses to resume, so a transient read would destroy the
    // heartbeat with no way back.
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat(),
      observation: observe({ workspaceAvailable: false, taskExists: false }),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "pause",
      reason: "task-identity-changed",
    });
  });

  test("a manual pause is never overwritten by a condition that would auto-resume", () => {
    const manual = createHeartbeat({
      state: "paused",
      pauseReason: "paused-by-user",
      reasonDetail: "Paused by the user.",
    });

    // An approval arrives while the user has it switched off. If this became
    // `awaiting-approval`, answering the approval would silently resume it.
    expect(
      decideTaskHeartbeatAction({
        heartbeat: manual,
        observation: observe({ pendingApprovalCount: 1 }),
        now: new Date("2026-08-10T01:00:00.000Z"),
      }),
    ).toEqual({ action: "idle" });

    // A terminal condition still outranks it.
    expect(
      decideTaskHeartbeatAction({
        heartbeat: manual,
        observation: observe({ taskArchived: true }),
        now: new Date("2026-08-10T01:00:00.000Z"),
      }),
    ).toMatchObject({ action: "stop", reason: "task-unavailable" });
  });

  test("stops on expiry", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat({ expiresAt: "2026-08-10T00:30:00.000Z" }),
      observation: observe(),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({ action: "stop", reason: "expired" });
  });

  test("stops on the occurrence cap", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: createHeartbeat({ maxOccurrences: 2, occurrenceCount: 2 }),
      observation: observe(),
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "stop",
      reason: "occurrence-cap-reached",
    });
  });

  test("never fires a completion trigger, which has no executor yet", () => {
    const heartbeat = createHeartbeat({
      trigger: { kind: "completion" },
      nextRunAt: "2026-08-10T00:00:00.000Z",
    });

    expect(
      decideTaskHeartbeatAction({
        heartbeat,
        observation: observe(),
        now: new Date("2026-08-10T09:00:00.000Z"),
      }),
    ).toEqual({ action: "idle" });
  });
});

describe("transitions", () => {
  test("firing advances the schedule and counts the skipped instants", () => {
    const heartbeat = createHeartbeat();

    const fired = applyTaskHeartbeatDecision({
      heartbeat,
      decision: {
        action: "fire",
        dueAt: "2026-08-10T04:00:00.000Z",
        nextRunAt: "2026-08-10T05:00:00.000Z",
        skippedAt: ["2026-08-10T01:00:00.000Z", "2026-08-10T02:00:00.000Z"],
        truncated: false,
      },
      now: new Date("2026-08-10T04:00:00.000Z"),
    });

    expect(fired.occurrenceCount).toBe(1);
    expect(fired.skippedCount).toBe(2);
    expect(fired.lastOccurrenceAt).toBe("2026-08-10T04:00:00.000Z");
    expect(fired.nextRunAt).toBe("2026-08-10T05:00:00.000Z");
    expect(fired.state).toBe("scheduled");
  });

  test("the capped occurrence and its terminal reason land together", () => {
    const fired = applyTaskHeartbeatDecision({
      heartbeat: createHeartbeat({ maxOccurrences: 1 }),
      decision: {
        action: "fire",
        dueAt: "2026-08-10T01:00:00.000Z",
        nextRunAt: "2026-08-10T02:00:00.000Z",
        skippedAt: [],
        truncated: false,
      },
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(fired.occurrenceCount).toBe(1);
    expect(fired.state).toBe("stopped");
    expect(fired.stopReason).toBe("occurrence-cap-reached");
    expect(fired.nextRunAt).toBeNull();
    expect(fired.reasonDetail).toContain("1 occurrences");
  });

  test("stops rather than scheduling an instant past the expiry", () => {
    const fired = applyTaskHeartbeatDecision({
      heartbeat: createHeartbeat({ expiresAt: "2026-08-10T01:30:00.000Z" }),
      decision: {
        action: "fire",
        dueAt: "2026-08-10T01:00:00.000Z",
        nextRunAt: "2026-08-10T02:00:00.000Z",
        skippedAt: [],
        truncated: false,
      },
      now: new Date("2026-08-10T01:00:00.000Z"),
    });

    expect(fired.state).toBe("stopped");
    expect(fired.stopReason).toBe("expired");
    expect(fired.nextRunAt).toBeNull();
  });

  test("every non-running state carries a reason a person can read", () => {
    const stopped = applyTaskHeartbeatDecision({
      heartbeat: createHeartbeat(),
      decision: {
        action: "stop",
        reason: "task-unavailable",
        detail: "The task this heartbeat watches was archived.",
      },
      now: NOW,
    });

    expect(summarizeTaskHeartbeat(stopped)).toEqual({
      heartbeatId: "hb-1",
      taskId: "task-1",
      triggerKind: "schedule",
      state: "stopped",
      reason: "The task this heartbeat watches was archived.",
      nextRunAt: null,
      occurrenceCount: 0,
      skippedCount: 0,
    });
  });
});

describe("idempotency keys", () => {
  test("are stable per heartbeat, outcome, and instant", () => {
    const key = buildTaskHeartbeatIdempotencyKey({
      heartbeatId: "hb-1",
      outcome: "fired",
      scheduledFor: "2026-08-10T01:00:00.000Z",
    });

    expect(key).toBe(
      buildTaskHeartbeatIdempotencyKey({
        heartbeatId: "hb-1",
        outcome: "fired",
        scheduledFor: "2026-08-10T01:00:00.000Z",
      }),
    );
    // A deferral and a firing of the same instant are different records, so a
    // deferred instant can still fire later without colliding.
    expect(key).not.toBe(
      buildTaskHeartbeatIdempotencyKey({
        heartbeatId: "hb-1",
        outcome: "deferred",
        scheduledFor: "2026-08-10T01:00:00.000Z",
      }),
    );
  });
});

describe("completion observability", () => {
  test("both provider runtimes classify the same way: completion is a ledger fact", () => {
    // Symmetry is structural here. A child task's terminal state is a run-ledger
    // row, so neither runtime is the source and neither can be ahead of the
    // other. A divergence in this expectation means someone made completion
    // provider-specific without saying so.
    for (const providerId of ["claude-code", "codex"] as const) {
      expect(
        classifyTaskCompletionObservability({ providerId, ledgerReadable: true }),
      ).toBe("stave_owned");
      expect(
        classifyTaskCompletionObservability({ providerId, ledgerReadable: false }),
      ).toBe("unsupported");
    }
  });

  test("a task with no resolved provider cannot be observed", () => {
    expect(
      classifyTaskCompletionObservability({
        providerId: null,
        ledgerReadable: true,
      }),
    ).toBe("unsupported");
  });

  test("an unobservable completion heartbeat stops with a stated reason, never silence", () => {
    const heartbeat = createHeartbeat({
      trigger: { kind: "completion" },
      nextRunAt: null,
    });

    const decision = decideTaskHeartbeatAction({
      heartbeat,
      observation: observe({ completionObservability: "unsupported" }),
      now: NOW,
    });

    expect(decision.action).toBe("stop");
    expect(decision).toMatchObject({ reason: "completion-unobservable" });
    const stopped = applyTaskHeartbeatDecision({ heartbeat, decision, now: NOW });
    expect(stopped.state).toBe("stopped");
    // The failure this whole layer exists to prevent is a heartbeat that cannot
    // say why it is not running.
    expect(summarizeTaskHeartbeat(stopped).reason).toContain(
      "cannot observe",
    );
    expect(summarizeTaskHeartbeat(stopped).nextRunAt).toBeNull();
  });

  test("a schedule heartbeat ignores observability entirely", () => {
    const heartbeat = createHeartbeat({ nextRunAt: "2026-08-09T23:00:00.000Z" });

    const decision = decideTaskHeartbeatAction({
      heartbeat,
      observation: observe({ completionObservability: "unsupported" }),
      now: NOW,
    });

    expect(decision.action).toBe("fire");
  });
});

describe("completion trigger policy", () => {
  function completionHeartbeat(overrides: Partial<TaskHeartbeat> = {}) {
    return createHeartbeat({
      trigger: { kind: "completion" },
      nextRunAt: null,
      maxOccurrences: null,
      ...overrides,
    });
  }

  test("nothing finished means nothing happens", () => {
    expect(
      decideTaskHeartbeatAction({
        heartbeat: completionHeartbeat(),
        observation: observe(),
        now: NOW,
      }).action,
    ).toBe("idle");
  });

  test("finished delegated work wakes the task once", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({ completions: [completion()] }),
      now: NOW,
    });

    expect(decision.action).toBe("fire-completion");
    expect(decision).toMatchObject({ completions: [completion()] });
  });

  test("several completions coalesce into one wake-up, oldest first", () => {
    const older = completion({
      runId: "child-task:task-1:a",
      stepId: "child-task:task-1:a:turn",
      completedAt: "2026-08-09T22:00:00.000Z",
    });
    const newer = completion({
      runId: "child-task:task-1:b",
      stepId: "child-task:task-1:b:turn",
      status: "failed",
      reason: "The child task ran out of attempts.",
      completedAt: "2026-08-09T23:30:00.000Z",
    });

    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({ completions: [newer, older] }),
      now: NOW,
    });

    if (decision.action !== "fire-completion") {
      throw new Error(`expected fire-completion, got ${decision.action}`);
    }
    expect(decision.completions).toEqual([older, newer]);

    // Two children finishing must not become two unattended turns.
    const woken = applyTaskHeartbeatDecision({
      heartbeat: completionHeartbeat(),
      decision,
      now: NOW,
    });
    expect(woken.occurrenceCount).toBe(1);
    expect(woken.lastOccurrenceAt).toBe(newer.completedAt);
    expect(woken.nextRunAt).toBeNull();
  });

  test("the user's turn still wins: a completion defers without being consumed", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({
        hasActiveTurn: true,
        completions: [completion()],
      }),
      now: NOW,
    });

    expect(decision.action).toBe("defer");
    // Deferring changes nothing, so the same completion is still pending next
    // tick rather than being lost to the active turn.
    expect(
      applyTaskHeartbeatDecision({
        heartbeat: completionHeartbeat(),
        decision,
        now: NOW,
      }).occurrenceCount,
    ).toBe(0);
  });

  test("a pending approval pauses a completion heartbeat exactly as a scheduled one", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({
        pendingApprovalCount: 1,
        completions: [completion()],
      }),
      now: NOW,
    });

    expect(decision).toMatchObject({
      action: "pause",
      reason: "awaiting-approval",
    });
  });

  test("a drifted runtime pauses a completion heartbeat before it can fire", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({
        fingerprint: { providerId: "codex", model: "gpt-5" },
        completions: [completion()],
      }),
      now: NOW,
    });

    expect(decision).toMatchObject({
      action: "pause",
      reason: "runtime-changed",
    });
  });

  test("an archived task stops a completion heartbeat before observability is even asked", () => {
    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({
        taskArchived: true,
        completionObservability: "unsupported",
        completions: [completion()],
      }),
      now: NOW,
    });

    expect(decision).toMatchObject({
      action: "stop",
      reason: "task-unavailable",
    });
  });

  test("a completion batch larger than the coalescing bound consumes in order", () => {
    const many = Array.from(
      { length: TASK_HEARTBEAT_LIMITS.maxCoalescedCompletions + 3 },
      (_unused, index) =>
        completion({
          runId: `child-task:task-1:${index}`,
          stepId: `child-task:task-1:${index}:turn`,
          completedAt: new Date(
            Date.parse("2026-08-09T00:00:00.000Z") + index * 60_000,
          ).toISOString(),
        }),
    );

    const decision = decideTaskHeartbeatAction({
      heartbeat: completionHeartbeat(),
      observation: observe({ completions: many }),
      now: NOW,
    });

    if (decision.action !== "fire-completion") {
      throw new Error(`expected fire-completion, got ${decision.action}`);
    }
    expect(decision.completions).toHaveLength(
      TASK_HEARTBEAT_LIMITS.maxCoalescedCompletions,
    );
    expect(decision.completions[0]).toEqual(many[0]!);
  });
});

describe("completion recursion bound", () => {
  test("an uncapped completion heartbeat gets the default cap", () => {
    const created = createTaskHeartbeat({
      id: "hb-1",
      input: createInput({ trigger: { kind: "completion" }, maxOccurrences: null }),
      projectPath: "/tmp/project",
      fingerprint: { providerId: "claude-code", model: "sonnet" },
      now: NOW,
    });

    expect(created.maxOccurrences).toBe(
      TASK_HEARTBEAT_LIMITS.defaultCompletionOccurrenceCap,
    );
    expect(created.nextRunAt).toBeNull();
    // A schedule heartbeat is still allowed to run forever: the user chose a
    // cadence and can see it. Only the self-feeding trigger is bounded.
    expect(
      resolveTaskHeartbeatOccurrenceCap({
        trigger: { kind: "schedule", schedule: { every: 1, unit: "hours" } },
        maxOccurrences: null,
      }),
    ).toBeNull();
  });

  test("an explicit cap is respected", () => {
    expect(
      resolveTaskHeartbeatOccurrenceCap({
        trigger: { kind: "completion" },
        maxOccurrences: 3,
      }),
    ).toBe(3);
  });

  test("the wake chain always ends with a stated reason", () => {
    const heartbeat = createHeartbeat({
      trigger: { kind: "completion" },
      nextRunAt: null,
      maxOccurrences: 1,
      occurrenceCount: 0,
    });

    const decision = decideTaskHeartbeatAction({
      heartbeat,
      observation: observe({ completions: [completion()] }),
      now: NOW,
    });
    const woken = applyTaskHeartbeatDecision({ heartbeat, decision, now: NOW });

    expect(woken.state).toBe("stopped");
    expect(woken.stopReason).toBe("occurrence-cap-reached");
    expect(woken.reasonDetail).toContain("limit of 1");
  });
});

describe("completion idempotency keys", () => {
  test("keyed by the completion, not by an instant", () => {
    const first = completion({
      runId: "child-task:task-1:a",
      stepId: "child-task:task-1:a:turn",
      completedAt: "2026-08-09T23:00:00.000Z",
    });
    const second = completion({
      runId: "child-task:task-1:b",
      stepId: "child-task:task-1:b:turn",
      completedAt: "2026-08-09T23:00:00.000Z",
    });

    const key = (signal: TaskCompletionSignal) =>
      buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: "hb-1",
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey(signal),
      });

    // Two children can finish in the same millisecond. Keying by timestamp
    // would silently drop one of them.
    expect(key(first)).not.toBe(key(second));
    expect(key(first)).toBe(key({ ...first, reason: "anything" }));
    // A run that failed and a run that completed are different facts.
    expect(key(first)).not.toBe(key({ ...first, status: "failed" }));
  });

  test("the widest legal completion still produces a whole, unique key", () => {
    // Truncation is the failure mode here, not length: sibling steps of one run
    // share a derived prefix, so a clipped key would make one of them look like
    // the other's duplicate and drop that completion for good.
    const runId = `child-task:${"p".repeat(TASK_HEARTBEAT_LIMITS.maxLedgerIdChars - 11)}`;
    const key = (stepSuffix: string) =>
      buildTaskHeartbeatCompletionIdempotencyKey({
        heartbeatId: "h".repeat(TASK_HEARTBEAT_LIMITS.maxIdChars),
        outcome: "fired",
        signalKey: buildTaskCompletionSignalKey({
          runId,
          stepId: `${runId.slice(0, TASK_HEARTBEAT_LIMITS.maxLedgerIdChars - 2)}:${stepSuffix}`,
          status: "interrupted",
        }),
      });

    expect(key("a")).not.toBe(key("b"));
    // The occurrence row must accept it, or the write fails instead of colliding.
    expect(key("a").length).toBeLessThanOrEqual(
      TASK_HEARTBEAT_LIMITS.maxIdempotencyKeyChars,
    );
    expect(() =>
      TaskHeartbeatOccurrenceSchema.parse({
        id: "occ-1",
        heartbeatId: "hb-1",
        idempotencyKey: key("a"),
        workspaceId: "ws-1",
        taskId: "task-1",
        turnId: null,
        outcome: "fired",
        reason: null,
        scheduledFor: NOW.toISOString(),
        recordedAt: NOW.toISOString(),
      }),
    ).not.toThrow();
  });

  test("an unreported marker is derived from the key it marks", () => {
    const consumed = buildTaskHeartbeatCompletionIdempotencyKey({
      heartbeatId: "hb-1",
      outcome: "fired",
      signalKey: buildTaskCompletionSignalKey(completion({})),
    });

    // The boot sweep finds a lost wake-up by looking for the absence of this
    // row, so it has to be computable from the consumed row alone.
    expect(buildTaskHeartbeatUnreportedKey(consumed)).toBe(`${consumed}:error`);
    expect(buildTaskHeartbeatUnreportedKey(consumed)).not.toBe(consumed);
  });
});
