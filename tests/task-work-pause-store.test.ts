import { afterEach, describe, expect, test } from "bun:test";
import { emptyRateLimitsSnapshot } from "../src/lib/providers/account-usage-block";

const originalWindow = globalThis.window;

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
}

type StreamListener = (payload: { streamId: string; event: unknown; done: boolean }) => void;

function installProviderHarness() {
  const startedPrompts: string[] = [];
  let streamListener: StreamListener | null = null;
  (globalThis as { window: unknown }).window = {
    localStorage: createMemoryStorage(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    api: {
      provider: {
        getRateLimitsSnapshot: async () => ({ ...emptyRateLimitsSnapshot(), codex: { source: "rpc" as const, buckets: [], error: null } }),
        startPushTurn: async (args: { prompt?: string }) => {
          const sequence = startedPrompts.length + 1;
          startedPrompts.push(args.prompt ?? "");
          return { ok: true, streamId: `stream-${sequence}`, turnId: `turn-${sequence}` };
        },
        subscribeStreamEvents: (listener: StreamListener) => {
          streamListener = listener;
          return () => {
            if (streamListener === listener) {
              streamListener = null;
            }
          };
        },
        abortTurn: async () => ({ ok: true, message: "aborted" }),
        cleanupTask: async () => ({ ok: true }),
      },
      fs: {
        readFile: async () => ({ ok: false, content: "", revision: "", stderr: "not found" }),
      },
    },
  } as unknown;
  return {
    startedPrompts,
    emit: (streamId: string, event: unknown, done = false) =>
      streamListener?.({ streamId, event, done }),
  };
}

async function seedStore(promptDraftByTask: Record<string, unknown> = {}) {
  const { useAppStore } = await import("../src/store/app.store");
  const initialState = useAppStore.getInitialState();
  useAppStore.setState({
    ...initialState,
    hasHydratedWorkspaces: true,
    workspaces: [{ id: "ws-main", name: "Main", updatedAt: "2026-04-09T00:00:00.000Z" }],
    activeWorkspaceId: "ws-main",
    activeTaskId: "task-main",
    repositoryPath: "/tmp/stave-project",
    workspacePathById: { "ws-main": "/tmp/stave-project" },
    workspaceBranchById: { "ws-main": "main" },
    workspaceDefaultById: { "ws-main": true },
    draftProvider: "codex",
    tasks: [
      {
        id: "task-main",
        title: "Main Task",
        provider: "codex",
        updatedAt: "2026-04-09T00:00:00.000Z",
        unread: false,
        archivedAt: null,
      },
    ],
    messagesByTask: { "task-main": [] },
    activeTurnIdsByTask: {},
    promptDraftByTask: promptDraftByTask as never,
    nativeSessionReadyByTask: {},
    providerSessionByTask: {},
  });
  return useAppStore;
}

afterEach(() => {
  (globalThis as { window: unknown }).window = originalWindow;
});

describe("usage-limit pause", () => {
  test("a turn the limit stops holds the queue until the user resumes it", async () => {
    const harness = installProviderHarness();
    const useAppStore = await seedStore();

    await useAppStore.getState().sendUserMessage({ taskId: "task-main", content: "First prompt", turnOrigin: "conversation" });
    await useAppStore.getState().sendUserMessage({ taskId: "task-main", content: "Second prompt", turnOrigin: "conversation" });
    expect(useAppStore.getState().promptDraftByTask["task-main"]?.queuedTurns).toHaveLength(1);

    harness.emit("stream-1", { type: "text", text: "Working on it." });
    harness.emit("stream-1", {
      type: "error",
      message: "Codex usage limit reached. Wait for the limit to reset or check account limits.",
      recoverable: false,
    });
    harness.emit("stream-1", { type: "done", stop_reason: "failed" }, true);
    await Bun.sleep(25);

    const paused = useAppStore.getState();
    // The queued prompt did not go to the account that just ran out.
    expect(harness.startedPrompts).toEqual(["First prompt"]);
    expect(paused.promptDraftByTask["task-main"]?.queuedTurns?.map((item) => item.content)).toEqual([
      "Second prompt",
    ]);
    expect(paused.usageLimitPauseByTask["task-main"]).toMatchObject({
      workspaceId: "ws-main",
      providerId: "codex",
      accountProfileId: "system-default",
      stoppedTurn: true,
      resetsAt: null,
    });

    await useAppStore.getState().resumePausedTaskWork({ taskId: "task-main" });
    await Bun.sleep(25);

    // Resume continues the stopped turn first; the queue follows it.
    expect(harness.startedPrompts).toHaveLength(2);
    expect(harness.startedPrompts[1]).toContain("reached its usage limit");
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]).toBeUndefined();
    expect(
      useAppStore.getState().promptDraftByTask["task-main"]?.queuedTurns?.map((item) => item.content),
    ).toEqual(["Second prompt"]);

    harness.emit("stream-2", { type: "text", text: "Picked up where it stopped." });
    harness.emit("stream-2", { type: "done" }, true);
    await Bun.sleep(25);
    expect(harness.startedPrompts.at(-1)).toBe("Second prompt");
  });

  test("arming waits for a known reset; dismissing forgets the pause", async () => {
    installProviderHarness();
    const useAppStore = await seedStore();
    const resetsAt = Date.now() + 30 * 60_000;
    useAppStore.getState().pauseTaskForUsageLimit({
      taskId: "task-main",
      workspaceId: "ws-main",
      providerId: "claude-code",
      accountProfileId: "system-default",
      stoppedTurn: true,
      usageLimit: { providerId: "claude-code", windowLabel: "Session", resetsAt },
    });
    useAppStore.getState().setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBe(
      resetsAt + 60_000,
    );
    useAppStore.getState().setUsageLimitAutoResume({ taskId: "task-main", enabled: false });
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBeUndefined();
    useAppStore.getState().dismissUsageLimitPause({ taskId: "task-main" });
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]).toBeUndefined();
  });
});

describe("automatic resume", () => {
  test("stands down when the user acts while usage is being read", async () => {
    const harness = installProviderHarness();
    const useAppStore = await seedStore();
    useAppStore.getState().pauseTaskForUsageLimit({
      taskId: "task-main",
      workspaceId: "ws-main",
      providerId: "codex",
      accountProfileId: "system-default",
      stoppedTurn: true,
      usageLimit: { providerId: "codex", windowLabel: "codex primary", resetsAt: Date.now() - 1_000 },
    });
    useAppStore.getState().setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    const resuming = useAppStore.getState().resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    useAppStore.getState().setUsageLimitAutoResume({ taskId: "task-main", enabled: false });
    await resuming;
    expect(harness.startedPrompts).toEqual([]);
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]).toMatchObject({ stoppedTurn: true });
  });

  test("a refusal right after an armed resume stays armed for the next reset", async () => {
    installProviderHarness();
    const useAppStore = await seedStore();
    useAppStore.getState().pauseTaskForUsageLimit({
      taskId: "task-main",
      workspaceId: "ws-main",
      providerId: "codex",
      accountProfileId: "system-default",
      stoppedTurn: false,
      usageLimit: { providerId: "codex", windowLabel: "codex primary", resetsAt: Date.now() - 1_000 },
    });
    useAppStore.getState().setUsageLimitAutoResume({ taskId: "task-main", enabled: true });
    await useAppStore.getState().resumePausedTaskWork({ taskId: "task-main", trigger: "auto" });
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]).toBeUndefined();

    const nextReset = Date.now() + 5 * 60 * 60_000;
    useAppStore.getState().pauseTaskForUsageLimit({
      taskId: "task-main",
      workspaceId: "ws-main",
      providerId: "codex",
      accountProfileId: "system-default",
      stoppedTurn: false,
      usageLimit: { providerId: "codex", windowLabel: "codex secondary", resetsAt: nextReset },
    });
    expect(useAppStore.getState().usageLimitPauseByTask["task-main"]?.autoResumeAt).toBe(nextReset + 60_000);
  });
});

describe("restored queue", () => {
  test("a queue restored from the previous run waits for Resume", async () => {
    const harness = installProviderHarness();
    const useAppStore = await seedStore({
      "task-main": {
        text: "",
        attachedFilePaths: [],
        attachments: [],
        queuedTurns: [
          {
            id: "restored-1",
            // Stamped by an earlier run of the app.
            queuedAt: "2026-01-01T00:00:00.000Z",
            content: "Restored prompt",
            attachedFilePaths: ["docs/notes.md"],
            attachments: [],
            providerId: "codex",
            model: "gpt-5.5",
          },
        ],
      },
    });

    await useAppStore.getState().sendUserMessage({ taskId: "task-main", content: "Fresh prompt", turnOrigin: "conversation" });
    harness.emit("stream-1", { type: "text", text: "Done." });
    harness.emit("stream-1", { type: "done" }, true);
    await Bun.sleep(25);

    // Finishing an unrelated turn no longer sends what was restored.
    expect(harness.startedPrompts).toEqual(["Fresh prompt"]);
    const restored = useAppStore.getState().promptDraftByTask["task-main"]?.queuedTurns ?? [];
    expect(restored.map((item) => [item.content, item.attachedFilePaths, item.model])).toEqual([
      ["Restored prompt", ["docs/notes.md"], "gpt-5.5"],
    ]);

    await useAppStore.getState().resumePausedTaskWork({ taskId: "task-main" });
    await Bun.sleep(25);
    expect(harness.startedPrompts).toHaveLength(2);
    expect(harness.startedPrompts[1]).toContain("Restored prompt");
    expect(useAppStore.getState().restoredQueueReleasedByTask["task-main"]).toBe(true);
  });
});
