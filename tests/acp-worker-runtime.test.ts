import { afterEach, describe, expect, test } from "bun:test";

import {
  clearAcpWorkerGrantsForTest,
  registerAcpWorkerGrant,
  runAcpWorker,
} from "../electron/providers/acp/acp-worker-runtime";
import type { BridgeEvent } from "../electron/providers/types";
import {
  resolveWorkerProfile,
  type ResolvedWorkerProfile,
} from "../src/lib/providers/worker-mode";

function createProfile(): ResolvedWorkerProfile & { provider: "cursor" } {
  const resolution = resolveWorkerProfile({
    providerId: "cursor",
    primaryModel: "fixture-model",
    runtimeModels: ["fixture-model", "worker-model"],
    intent: {
      mode: "task-executor",
      presetId: "verified-patch",
      workerModel: "worker-model",
      workerEffort: "auto",
    },
  });
  if (resolution.status !== "ready") {
    throw new Error("Expected a ready Cursor Worker profile.");
  }
  return { ...resolution.profile, provider: "cursor" };
}

function createGrant(overrides: {
  runCursor: NonNullable<
    Parameters<typeof registerAcpWorkerGrant>[0]["runners"]
  >["runCursor"];
  emitted?: BridgeEvent[];
  responderCleanups?: { count: number };
  taskId?: string;
  profile?: ResolvedWorkerProfile & { provider: "cursor" };
  workerTimeoutMs?: number;
}) {
  const emitted = overrides.emitted ?? [];
  const responderCleanups = overrides.responderCleanups ?? { count: 0 };
  return registerAcpWorkerGrant({
    workerKey: "worker-key",
    turnId: "turn-1",
    taskId: overrides.taskId ?? "task-1",
    profile: overrides.profile ?? createProfile(),
    cwd: "/tmp/workspace",
    emit: (event) => emitted.push(event),
    pausePhase: () => {},
    resumePhase: () => {},
    addUsage: () => {},
    registerApprovalResponder: () => () => {
      responderCleanups.count += 1;
    },
    workerTimeoutMs: overrides.workerTimeoutMs,
    runners: {
      runCursor: overrides.runCursor,
      runKiro: async () => [],
    },
  });
}

afterEach(() => {
  clearAcpWorkerGrantsForTest();
});

describe("turn-scoped ACP Worker runtime", () => {
  test("runs a same-provider worker and records delegated cache usage", async () => {
    const emitted: BridgeEvent[] = [];
    const responderCleanups = { count: 0 };
    createGrant({
      emitted,
      responderCleanups,
      runCursor: async (args) => {
        args.registerAbort?.(() => {});
        args.registerApprovalResponder?.(() => ({ ok: true }));
        const approval: BridgeEvent = {
          type: "approval",
          requestId: `${args.requestIdScope}:permission-1`,
          toolName: "Bash",
          description: "Run tests",
          input: { command: "bun test" },
          supportsAllowAlways: true,
        };
        const events: BridgeEvent[] = [
          {
            type: "provider_session",
            providerId: "cursor",
            nativeSessionId: "worker-session",
          },
          approval,
          { type: "text", text: "Implemented and verified." },
          {
            type: "usage",
            inputTokens: 10,
            outputTokens: 5,
            cacheReadTokens: 7,
            cacheCreationTokens: 3,
          },
          { type: "done", stop_reason: "end_turn" },
        ];
        events.forEach((event) => args.onEvent?.(event));
        return events;
      },
    });

    const outcome = await runAcpWorker({
      workerKey: "worker-key",
      task: "Apply the patch and run tests.",
    });

    expect(outcome).toMatchObject({
      ok: true,
      result: "Implemented and verified.",
      providerId: "cursor",
      model: "worker-model",
    });
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "approval",
        description: "Worker · Run tests",
        // The worker lane is Manual by design, so a nested worker must never
        // offer to write a persistent allow rule into the user's provider
        // config on behalf of the turn that spawned it.
        supportsAllowAlways: false,
        workerExecution: expect.objectContaining({
          providerId: "cursor",
          workerModel: "worker-model",
        }),
      }),
    );
    expect(
      emitted.filter(
        (event) => event.type === "tool" && event.toolName === "Worker",
      ),
    ).toHaveLength(2);
    expect(responderCleanups.count).toBe(1);
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "delegated_usage",
        role: "worker",
        providerId: "cursor",
        model: "worker-model",
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 7,
        cacheCreationTokens: 3,
        sessionReused: false,
      }),
    );
  });

  test("does not publish a usage row when the provider session never starts", async () => {
    const emitted: BridgeEvent[] = [];
    createGrant({
      emitted,
      runCursor: async (args) => {
        const events: BridgeEvent[] = [
          {
            type: "error",
            message: "Login required.",
            recoverable: false,
          },
          { type: "done", stop_reason: "runtime_failure" },
        ];
        events.forEach((event) => args.onEvent?.(event));
        return events;
      },
    });

    await expect(
      runAcpWorker({ workerKey: "worker-key", task: "Try the worker." }),
    ).resolves.toMatchObject({ ok: false });
    expect(
      emitted.some((event) => event.type === "delegated_usage"),
    ).toBe(false);
  });

  test("resumes the same task and profile Worker lane", async () => {
    const resumeIds: Array<string | undefined> = [];
    let call = 0;
    const runCursor = async (
      args: Parameters<
        NonNullable<
          Parameters<typeof registerAcpWorkerGrant>[0]["runners"]
        >["runCursor"]
      >[0],
    ) => {
      resumeIds.push(args.resumeSessionId);
      call += 1;
      const events: BridgeEvent[] = [
        {
          type: "provider_session",
          providerId: "cursor",
          nativeSessionId: "worker-session",
        },
        { type: "text", text: `Completed ${call}` },
        { type: "done", stop_reason: "end_turn" },
      ];
      events.forEach((event) => args.onEvent?.(event));
      return events;
    };
    createGrant({
      runCursor,
    });

    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "First" }),
    ).toMatchObject({ ok: true });

    // A new turn mints a new grant, but the role lane remains task-scoped.
    createGrant({
      runCursor,
    });
    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "Follow up" }),
    ).toMatchObject({ ok: true });
    expect(resumeIds).toEqual([undefined, "worker-session"]);
  });

  test("does not resume a Worker lane in another task", async () => {
    const resumeIds: Array<string | undefined> = [];
    const runCursor: Parameters<typeof createGrant>[0]["runCursor"] = async (
      args,
    ) => {
      resumeIds.push(args.resumeSessionId);
      const events: BridgeEvent[] = [
        {
          type: "provider_session",
          providerId: "cursor",
          nativeSessionId: "worker-session",
        },
        { type: "text", text: "Completed" },
        { type: "done", stop_reason: "end_turn" },
      ];
      events.forEach((event) => args.onEvent?.(event));
      return events;
    };
    createGrant({ runCursor, taskId: "task-1" });

    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "First task" }),
    ).toMatchObject({ ok: true });
    createGrant({ runCursor, taskId: "task-2" });
    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "Second task" }),
    ).toMatchObject({ ok: true });
    expect(resumeIds).toEqual([undefined, undefined]);
  });

  test("starts a new Worker lane when execution bounds change", async () => {
    const resumeIds: Array<string | undefined> = [];
    const runCursor: Parameters<typeof createGrant>[0]["runCursor"] = async (
      args,
    ) => {
      resumeIds.push(args.resumeSessionId);
      const events: BridgeEvent[] = [
        {
          type: "provider_session",
          providerId: "cursor",
          nativeSessionId: "worker-session",
        },
        { type: "text", text: "Completed" },
        { type: "done", stop_reason: "end_turn" },
      ];
      events.forEach((event) => args.onEvent?.(event));
      return events;
    };
    const profile = createProfile();
    createGrant({ runCursor, profile });
    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "First" }),
    ).toMatchObject({ ok: true });

    createGrant({
      runCursor,
      profile: { ...profile, maxTurns: (profile.maxTurns ?? 1) + 1 },
    });
    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "Changed bounds" }),
    ).toMatchObject({ ok: true });
    expect(resumeIds).toEqual([undefined, undefined]);
  });

  test("claims the one-worker slot before the ACP adapter registers abort", async () => {
    let finish!: (events: BridgeEvent[]) => void;
    createGrant({
      runCursor: () =>
        new Promise<BridgeEvent[]>((resolve) => {
          finish = resolve;
        }),
    });

    const first = runAcpWorker({ workerKey: "worker-key", task: "First" });
    const second = await runAcpWorker({
      workerKey: "worker-key",
      task: "Second",
    });

    expect(second).toMatchObject({ ok: false, code: "worker-in-flight" });
    finish([
      { type: "text", text: "First complete" },
      { type: "done", stop_reason: "end_turn" },
    ]);
    expect(await first).toMatchObject({ ok: true, result: "First complete" });
  });

  test("revoking the parent turn aborts its in-flight worker", async () => {
    let finish!: (events: BridgeEvent[]) => void;
    let aborted = false;
    const handle = createGrant({
      runCursor: (args) =>
        new Promise<BridgeEvent[]>((resolve) => {
          finish = resolve;
          args.registerAbort?.(() => {
            aborted = true;
            resolve([{ type: "done", stop_reason: "user_abort" }]);
          });
        }),
    });

    const outcome = runAcpWorker({
      workerKey: "worker-key",
      task: "Long running work",
    });
    handle.revoke();

    expect(aborted).toBe(true);
    expect(await outcome).toMatchObject({
      ok: false,
      code: "worker-cancelled",
    });
    finish([]);
  });

  test("drops late events and responders after a Worker timeout", async () => {
    const emitted: BridgeEvent[] = [];
    let aborted = false;
    let lateResponderRegistered = false;
    createGrant({
      emitted,
      workerTimeoutMs: 10,
      runCursor: (args) =>
        new Promise<BridgeEvent[]>(() => {
          args.registerAbort?.(() => {
            aborted = true;
            setTimeout(() => {
              args.registerApprovalResponder?.(() => ({ ok: true }));
              lateResponderRegistered = true;
              args.onEvent?.({
                type: "approval",
                requestId: "late-approval",
                toolName: "Bash",
                description: "Late approval",
              });
              args.onEvent?.({
                type: "tool",
                toolName: "Bash",
                input: "late",
                state: "input-available",
              });
            }, 5);
          });
        }),
    });

    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "Timeout" }),
    ).toMatchObject({ ok: false, code: "worker-timeout" });
    await Bun.sleep(30);
    expect(aborted).toBe(true);
    expect(lateResponderRegistered).toBe(true);
    expect(
      emitted.some(
        (event) =>
          event.type === "approval" && event.requestId === "late-approval",
      ),
    ).toBe(false);
    expect(
      emitted.some(
        (event) => event.type === "tool" && event.input === "late",
      ),
    ).toBe(false);
  });

  test("rejects stale or fabricated worker keys", async () => {
    expect(
      await runAcpWorker({ workerKey: "missing", task: "Do work" }),
    ).toMatchObject({ ok: false, code: "unknown-worker-key" });
  });

  test("closes the Worker activity when the ACP runner throws", async () => {
    const emitted: BridgeEvent[] = [];
    createGrant({
      emitted,
      runCursor: async () => {
        throw new Error("fixture runner failed");
      },
    });

    expect(
      await runAcpWorker({ workerKey: "worker-key", task: "Fail safely" }),
    ).toMatchObject({ ok: false, code: "worker-failed" });
    expect(emitted).toContainEqual(
      expect.objectContaining({
        type: "tool",
        toolName: "Worker",
        state: "output-error",
        output: "fixture runner failed",
      }),
    );
  });
});
